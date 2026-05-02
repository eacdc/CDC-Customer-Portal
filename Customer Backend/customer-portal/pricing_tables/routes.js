import { getPricingTableDoc, upsertPricingTableData, invalidatePricingTableData } from "../lib/pricingTablesStore.js";
import { createRequire } from "module";
import { deriveTuckValueTableFromMaster, mergeTuckValueTableIntoMaster } from "../pck_est/tuckFromMaster.js";

const require = createRequire(import.meta.url);
const masterTableFallback = require("../pck_est/data/masterTable.json");
const commOptionsFallback = require("../comm_est/data/optionsData.json");
const commCalcFallback = require("../comm_est/data/calculateSheetData.json");
const commMasterFallback = {
  ...commOptionsFallback,
  ...commCalcFallback,
};

function is2DArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((row) => Array.isArray(row));
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isCommMasterObject(value) {
  if (!isPlainObject(value)) return false;
  const requiredArrayKeys = ["costarr", "opsTable", "opsTable1", "opsTable2", "mainTable", "inputTable", "displayTable"];
  return requiredArrayKeys.every((k) => Array.isArray(value[k]));
}

function normalizeCommMasterData(value) {
  return {
    ...commMasterFallback,
    ...(isPlainObject(value) ? value : {}),
  };
}

function buildTableConfig() {
  return {
    "master-table": { id: "masterTable", fallback: masterTableFallback, validator: is2DArray },
    "comm-master": { id: "comm_masterTable", fallback: commMasterFallback, validator: isCommMasterObject },
  };
}

export default async function pricingTablesPlugin(fastify) {
  const tableConfig = buildTableConfig();

  fastify.get("/pricing-tables/:tableKey", async (req, reply) => {
    if (req.params.tableKey === "tuck-table") {
      const doc = await getPricingTableDoc("masterTable", masterTableFallback);
      const data = deriveTuckValueTableFromMaster(doc.data);
      return reply.send({
        success: true,
        data,
        meta: {
          source: doc.source,
          derivedFrom: "masterTable",
          updatedAt: doc.updatedAt,
          updatedBy: doc.updatedBy,
        },
      });
    }
    if (req.params.tableKey === "comm-master") {
      const doc = await getPricingTableDoc("comm_masterTable", commMasterFallback);
      return reply.send({
        success: true,
        data: normalizeCommMasterData(doc.data),
        meta: { source: doc.source, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy },
      });
    }
    const cfg = tableConfig[req.params.tableKey];
    if (!cfg) {
      return reply.code(404).send({ success: false, error: "Unknown table key" });
    }
    const doc = await getPricingTableDoc(cfg.id, cfg.fallback);
    return reply.send({ success: true, data: doc.data, meta: { source: doc.source, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy } });
  });

  fastify.put("/pricing-tables/:tableKey", async (req, reply) => {
    if (req.params.tableKey === "tuck-table") {
      const data = req.body && req.body.data;
      if (!is2DArray(data)) {
        return reply.code(400).send({ success: false, error: "Invalid payload shape for table update" });
      }
      const doc = await getPricingTableDoc("masterTable", masterTableFallback);
      const merged = mergeTuckValueTableIntoMaster(doc.data, data);
      await upsertPricingTableData("masterTable", merged, "local");
      invalidatePricingTableData("masterTable");
      const saved = await getPricingTableDoc("masterTable", masterTableFallback);
      return reply.send({
        success: true,
        message: "Tuck values saved on master table",
        data: deriveTuckValueTableFromMaster(saved.data),
        meta: {
          source: saved.source,
          derivedFrom: "masterTable",
          updatedAt: saved.updatedAt,
          updatedBy: saved.updatedBy,
        },
      });
    }
    if (req.params.tableKey === "comm-master") {
      const data = req.body && req.body.data;
      if (!isCommMasterObject(data)) {
        return reply.code(400).send({ success: false, error: "Invalid payload shape for table update" });
      }
      const normalized = normalizeCommMasterData(data);
      await upsertPricingTableData("comm_masterTable", normalized, "local");
      invalidatePricingTableData("comm_masterTable");
      const doc = await getPricingTableDoc("comm_masterTable", commMasterFallback);
      return reply.send({
        success: true,
        message: "Commercial master table updated",
        meta: { source: doc.source, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy },
      });
    }
    const cfg = tableConfig[req.params.tableKey];
    if (!cfg) {
      return reply.code(404).send({ success: false, error: "Unknown table key" });
    }
    const data = req.body && req.body.data;
    if (!cfg.validator(data)) {
      return reply.code(400).send({ success: false, error: "Invalid payload shape for table update" });
    }
    await upsertPricingTableData(cfg.id, data, "local");
    const doc = await getPricingTableDoc(cfg.id, cfg.fallback);
    return reply.send({
      success: true,
      message: "Table updated",
      meta: { source: doc.source, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy },
    });
  });
}

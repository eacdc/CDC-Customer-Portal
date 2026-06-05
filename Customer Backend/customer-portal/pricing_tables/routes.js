import {
  getPricingTableDoc,
  upsertPricingTableData,
  invalidatePricingTableData,
  MissingPricingTableError,
} from "../lib/pricingTablesStore.js";
import {
  deriveTuckValueTableFromMaster,
  mergeTuckValueTableIntoMaster,
} from "../pck_est/tuckFromMaster.js";

/**
 * GET/PUT /api/pricing-tables/:tableKey — Mongo-only.
 *
 * The pricing tables (master + commercial master) live exclusively in MongoDB.
 * There is no JSON fallback. When a document is missing, GET returns 404 and
 * PUT requires a full, validated payload.
 *
 * tableKey aliases:
 *   master-table  -> _id="masterTable"        (2D array)
 *   comm-master   -> _id="comm_masterTable"   (object with required arrays)
 *   tuck-table    -> derived from masterTable rows 1-3, cols 36-37/39-40
 */

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

const TABLE_CONFIG = {
  "master-table": { id: "masterTable", validator: is2DArray },
  "comm-master": { id: "comm_masterTable", validator: isCommMasterObject },
};

function sendMissing(reply, tableKey, err) {
  return reply.code(404).send({
    success: false,
    error: `Pricing table "${tableKey}" not found in MongoDB`,
    details: err?.message || String(err),
  });
}

export default async function pricingTablesPlugin(fastify) {
  fastify.get("/pricing-tables/:tableKey", async (req, reply) => {
    const { tableKey } = req.params;

    if (tableKey === "tuck-table") {
      try {
        const doc = await getPricingTableDoc("masterTable");
        return reply.send({
          success: true,
          data: deriveTuckValueTableFromMaster(doc.data),
          meta: {
            source: doc.source,
            derivedFrom: "masterTable",
            updatedAt: doc.updatedAt,
            updatedBy: doc.updatedBy,
          },
        });
      } catch (err) {
        if (err instanceof MissingPricingTableError) return sendMissing(reply, tableKey, err);
        throw err;
      }
    }

    const cfg = TABLE_CONFIG[tableKey];
    if (!cfg) {
      return reply.code(404).send({ success: false, error: "Unknown table key" });
    }

    try {
      const doc = await getPricingTableDoc(cfg.id);
      return reply.send({
        success: true,
        data: doc.data,
        meta: { source: doc.source, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy },
      });
    } catch (err) {
      if (err instanceof MissingPricingTableError) return sendMissing(reply, tableKey, err);
      throw err;
    }
  });

  fastify.put("/pricing-tables/:tableKey", async (req, reply) => {
    const { tableKey } = req.params;

    if (tableKey === "tuck-table") {
      const data = req.body && req.body.data;
      if (!is2DArray(data)) {
        return reply.code(400).send({ success: false, error: "Invalid payload shape for table update" });
      }
      try {
        const doc = await getPricingTableDoc("masterTable");
        const merged = mergeTuckValueTableIntoMaster(doc.data, data);
        await upsertPricingTableData("masterTable", merged, "local");
        invalidatePricingTableData("masterTable");
        const saved = await getPricingTableDoc("masterTable");
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
      } catch (err) {
        if (err instanceof MissingPricingTableError) return sendMissing(reply, "master-table", err);
        throw err;
      }
    }

    const cfg = TABLE_CONFIG[tableKey];
    if (!cfg) {
      return reply.code(404).send({ success: false, error: "Unknown table key" });
    }

    const data = req.body && req.body.data;
    if (!cfg.validator(data)) {
      return reply.code(400).send({ success: false, error: "Invalid payload shape for table update" });
    }
    await upsertPricingTableData(cfg.id, data, "local");
    invalidatePricingTableData(cfg.id);
    const doc = await getPricingTableDoc(cfg.id);
    return reply.send({
      success: true,
      message: "Table updated",
      meta: { source: doc.source, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy },
    });
  });
}

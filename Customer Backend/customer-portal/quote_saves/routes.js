// quote_saves/routes.js — persist calculator snapshots (authorized usernames: Sales Executives from LedgerMaster)
import { ObjectId } from "mongodb";
import { getDb } from "../lib/mongo.js";
import {
  assertSalesExecutiveUsername,
  normalizeDatabaseKey
} from "../lib/salesExecutives.js";
import { allocateEstimationNumber } from "../lib/estimationNumber.js";

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

/** Mongo may store calculator fields as Number or String — match both. */
function flexNumericQuery(value) {
  const n = parseOptionalNumber(value);
  if (n == null) return null;
  const variants = new Set([n, String(n)]);
  const intVal = parseInt(String(n), 10);
  if (!isNaN(intVal) && Number(n) === intVal) variants.add(intVal);
  return { $in: [...variants] };
}

/** Demo login may differ in casing from legacy saved docs — match case-insensitively. */
function usernameFilter(usernameRaw) {
  const u = String(usernameRaw || "").trim();
  if (!u) return {};
  return {
    username: { $regex: "^" + escapeRegex(u) + "$", $options: "i" }
  };
}

function parseObjectId(id) {
  try {
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}

/** Legacy docs had no `database` field — treat as Ahmedabad (ahm). */
function databaseMatchClause(dbKey) {
  if (dbKey === "ahm") {
    return { $or: [{ database: "ahm" }, { database: { $exists: false } }] };
  }
  return { database: "kol" };
}

function filterUserAndDatabase(usernameRaw, dbKey) {
  return Object.assign({}, usernameFilter(usernameRaw), databaseMatchClause(dbKey));
}

export default async function quoteSavesPlugin(fastify) {
  fastify.post("/quote-saves/commercial", async (req, reply) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const usernameRaw = await assertSalesExecutiveUsername(body, reply, req);
    if (!usernameRaw) return;
    const dbKey = normalizeDatabaseKey(body.database);

    const inputs = body.inputs;
    const components = body.components;
    const product = body.product;
    if (!inputs || typeof inputs !== "object") {
      return reply.code(400).send({ success: false, error: "Missing inputs" });
    }
    if (!Array.isArray(components)) {
      return reply.code(400).send({ success: false, error: "Missing components array" });
    }
    if (!product || typeof product !== "object") {
      return reply.code(400).send({ success: false, error: "Missing product summary" });
    }

    const segmentRaw = String(body.segment || "commercial").trim().toLowerCase();
    const segment = segmentRaw === "packaging" ? "packaging" : "commercial";

    const now = new Date();
    const db = await getDb();
    const estimation = await allocateEstimationNumber(db, dbKey, now);
    const doc = {
      database: dbKey,
      username: usernameRaw,
      segment,
      savedAt: now,
      createdAt: now,
      updatedAt: now,
      inputs,
      components,
      product,
      price_per_unit: body.price_per_unit != null ? Number(body.price_per_unit) : null,
      currency: body.currency != null ? String(body.currency) : null,
      price_per_unit_foreign:
        body.price_per_unit_foreign != null ? Number(body.price_per_unit_foreign) : null,
      exchange_rate_inr_per_fc:
        body.exchange_rate_inr_per_fc != null ? Number(body.exchange_rate_inr_per_fc) : null,
      estimation_number: estimation.estimation_number,
      estimation_seq: estimation.estimation_seq,
      estimation_fiscal_year: estimation.estimation_fiscal_year
    };

    const r = await db.collection("commercial_quote_saves").insertOne(doc);
    return reply.send({
      success: true,
      id: String(r.insertedId),
      estimation_number: estimation.estimation_number
    });
  });

  fastify.post("/quote-saves/packaging", async (req, reply) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const usernameRaw = await assertSalesExecutiveUsername(body, reply, req);
    if (!usernameRaw) return;
    const dbKey = normalizeDatabaseKey(body.database);

    const inputs = body.inputs;
    const product = body.product;
    if (!inputs || typeof inputs !== "object") {
      return reply.code(400).send({ success: false, error: "Missing inputs" });
    }
    if (!product || typeof product !== "object") {
      return reply.code(400).send({ success: false, error: "Missing product summary" });
    }

    const ppu =
      body.price_per_unit != null && !isNaN(Number(body.price_per_unit))
        ? Number(body.price_per_unit)
        : product.pricing && product.pricing.price_per_unit_In != null
          ? Number(product.pricing.price_per_unit_In)
          : null;

    const now = new Date();
    const db = await getDb();
    const estimation = await allocateEstimationNumber(db, dbKey, now);
    const doc = {
      database: dbKey,
      username: usernameRaw,
      segment: "packaging",
      savedAt: now,
      createdAt: now,
      updatedAt: now,
      inputs,
      components: [],
      product,
      price_per_unit: ppu,
      currency: body.currency != null ? String(body.currency) : null,
      price_per_unit_foreign:
        body.price_per_unit_foreign != null ? Number(body.price_per_unit_foreign) : null,
      exchange_rate_inr_per_fc:
        body.exchange_rate_inr_per_fc != null ? Number(body.exchange_rate_inr_per_fc) : null,
      estimation_number: estimation.estimation_number,
      estimation_seq: estimation.estimation_seq,
      estimation_fiscal_year: estimation.estimation_fiscal_year
    };

    const r = await db.collection("packaging_quote_saves").insertOne(doc);
    return reply.send({
      success: true,
      id: String(r.insertedId),
      estimation_number: estimation.estimation_number
    });
  });

  fastify.post("/quote-saves/packaging/update", async (req, reply) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const usernameRaw = await assertSalesExecutiveUsername(body, reply, req);
    if (!usernameRaw) return;
    const dbKey = normalizeDatabaseKey(body.database);

    const oid = parseObjectId(body.id);
    if (!oid) {
      return reply.code(400).send({ success: false, error: "Invalid quote id" });
    }

    const inputs = body.inputs;
    const product = body.product;
    if (!inputs || typeof inputs !== "object") {
      return reply.code(400).send({ success: false, error: "Missing inputs" });
    }
    if (!product || typeof product !== "object") {
      return reply.code(400).send({ success: false, error: "Missing product summary" });
    }

    const ppu =
      body.price_per_unit != null && !isNaN(Number(body.price_per_unit))
        ? Number(body.price_per_unit)
        : product.pricing && product.pricing.price_per_unit_In != null
          ? Number(product.pricing.price_per_unit_In)
          : null;

    const db = await getDb();
    const col = db.collection("packaging_quote_saves");
    const existing = await col.findOne(Object.assign({ _id: oid }, filterUserAndDatabase(usernameRaw, dbKey)));
    if (!existing) {
      return reply.code(404).send({ success: false, error: "Quote not found" });
    }

    const updatedAt = new Date();
    const patch = {
      inputs,
      product,
      components: [],
      price_per_unit: ppu,
      currency: body.currency != null ? String(body.currency) : null,
      price_per_unit_foreign:
        body.price_per_unit_foreign != null ? Number(body.price_per_unit_foreign) : null,
      exchange_rate_inr_per_fc:
        body.exchange_rate_inr_per_fc != null ? Number(body.exchange_rate_inr_per_fc) : null,
      updatedAt
    };
    if (!existing.createdAt) {
      patch.createdAt = existing.savedAt || updatedAt;
    }

    await col.updateOne({ _id: oid }, { $set: patch });
    return reply.send({ success: true, id: String(oid), updatedAt });
  });

  fastify.post("/quote-saves/commercial/update", async (req, reply) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const usernameRaw = await assertSalesExecutiveUsername(body, reply, req);
    if (!usernameRaw) return;
    const dbKey = normalizeDatabaseKey(body.database);

    const oid = parseObjectId(body.id);
    if (!oid) {
      return reply.code(400).send({ success: false, error: "Invalid quote id" });
    }

    const inputs = body.inputs;
    const components = body.components;
    const product = body.product;
    if (!inputs || typeof inputs !== "object") {
      return reply.code(400).send({ success: false, error: "Missing inputs" });
    }
    if (!Array.isArray(components)) {
      return reply.code(400).send({ success: false, error: "Missing components array" });
    }
    if (!product || typeof product !== "object") {
      return reply.code(400).send({ success: false, error: "Missing product summary" });
    }

    const db = await getDb();
    const col = db.collection("commercial_quote_saves");
    const existing = await col.findOne(Object.assign({ _id: oid }, filterUserAndDatabase(usernameRaw, dbKey)));
    if (!existing) {
      return reply.code(404).send({ success: false, error: "Quote not found" });
    }

    const updatedAt = new Date();
    const patch = {
      inputs,
      components,
      product,
      price_per_unit: body.price_per_unit != null ? Number(body.price_per_unit) : null,
      currency: body.currency != null ? String(body.currency) : null,
      price_per_unit_foreign:
        body.price_per_unit_foreign != null ? Number(body.price_per_unit_foreign) : null,
      exchange_rate_inr_per_fc:
        body.exchange_rate_inr_per_fc != null ? Number(body.exchange_rate_inr_per_fc) : null,
      updatedAt
    };
    if (!existing.createdAt) {
      patch.createdAt = existing.savedAt || updatedAt;
    }

    await col.updateOne({ _id: oid }, { $set: patch });
    return reply.send({ success: true, id: String(oid), updatedAt });
  });

  fastify.post("/quote-saves/search", async (req, reply) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const usernameRaw = await assertSalesExecutiveUsername(body, reply, req);
    if (!usernameRaw) return;
    const dbKey = normalizeDatabaseKey(body.database);

    const segment = String(body.segment || "")
      .trim()
      .toLowerCase();
    if (segment !== "packaging" && segment !== "commercial") {
      return reply.code(400).send({
        success: false,
        error: "segment must be packaging or commercial"
      });
    }

    const collectionName =
      segment === "packaging" ? "packaging_quote_saves" : "commercial_quote_saves";

    const filter = filterUserAndDatabase(usernameRaw, dbKey);

    const clientName = String(body.client_name || "").trim();
    if (clientName) {
      filter["inputs.client_name"] = {
        $regex: escapeRegex(clientName),
        $options: "i"
      };
    }
    const skuName = String(body.sku_name || "").trim();
    if (skuName) {
      filter["inputs.sku_name"] = {
        $regex: escapeRegex(skuName),
        $options: "i"
      };
    }

    const qty = parseOptionalNumber(body.qty);
    if (qty != null) {
      const qFlex = flexNumericQuery(qty);
      if (qFlex) {
        if (segment === "packaging") {
          filter["inputs.qty"] = qFlex;
        } else {
          filter["inputs.Qty"] = qFlex;
        }
      }
    }

    const len = parseOptionalNumber(body.len);
    if (len != null) {
      const lenFlex = flexNumericQuery(len);
      if (lenFlex) filter["inputs.len"] = lenFlex;
    }
    const brd = parseOptionalNumber(body.brd);
    if (brd != null) {
      const brdFlex = flexNumericQuery(brd);
      if (brdFlex) filter["inputs.brd"] = brdFlex;
    }
    const height = parseOptionalNumber(body.height);
    if (height != null && segment === "packaging") {
      const hFlex = flexNumericQuery(height);
      if (hFlex) filter["inputs.height"] = hFlex;
    }

    const limitRaw = Number(body.limit);
    const limit =
      !isNaN(limitRaw) && limitRaw > 0 && limitRaw <= 100 ? Math.floor(limitRaw) : 50;

    const db = await getDb();
    const cursor = db
      .collection(collectionName)
      .find(filter)
      .sort({ savedAt: -1 })
      .limit(limit)
      .project({
        savedAt: 1,
        createdAt: 1,
        updatedAt: 1,
        price_per_unit: 1,
        price_per_unit_foreign: 1,
        exchange_rate_inr_per_fc: 1,
        currency: 1,
        components: 1,
        segment: 1,
        inputs: 1,
        product: 1,
        estimation_number: 1,
        estimation_seq: 1,
        estimation_fiscal_year: 1
      });

    const rows = await cursor.toArray();
    const results = rows.map((doc) => ({
      id: doc._id ? String(doc._id) : "",
      savedAt: doc.savedAt || null,
      createdAt: doc.createdAt || null,
      updatedAt: doc.updatedAt || null,
      price_per_unit: doc.price_per_unit != null ? doc.price_per_unit : null,
      price_per_unit_foreign:
        doc.price_per_unit_foreign != null ? doc.price_per_unit_foreign : null,
      currency: doc.currency != null ? doc.currency : null,
      components: Array.isArray(doc.components) ? doc.components : [],
      client_name: doc.inputs && doc.inputs.client_name != null ? doc.inputs.client_name : "",
      sku_name: doc.inputs && doc.inputs.sku_name != null ? doc.inputs.sku_name : "",
      qty:
        doc.inputs && doc.inputs.qty != null
          ? doc.inputs.qty
          : doc.inputs && doc.inputs.Qty != null
            ? doc.inputs.Qty
            : null,
      len: doc.inputs && doc.inputs.len != null ? doc.inputs.len : null,
      brd: doc.inputs && doc.inputs.brd != null ? doc.inputs.brd : null,
      height: doc.inputs && doc.inputs.height != null ? doc.inputs.height : null,
      estimation_number:
        doc.estimation_number != null ? String(doc.estimation_number) : "",
      inputs: doc.inputs || {},
      product: doc.product || {}
    }));

    return reply.send({
      success: true,
      segment,
      count: results.length,
      results
    });
  });

  fastify.post("/quote-saves/delete", async (req, reply) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const usernameRaw = await assertSalesExecutiveUsername(body, reply, req);
    if (!usernameRaw) return;
    const dbKey = normalizeDatabaseKey(body.database);

    const segment = String(body.segment || "")
      .trim()
      .toLowerCase();
    if (segment !== "packaging" && segment !== "commercial") {
      return reply.code(400).send({
        success: false,
        error: "segment must be packaging or commercial"
      });
    }

    const oid = parseObjectId(body.id);
    if (!oid) {
      return reply.code(400).send({ success: false, error: "Invalid quote id" });
    }

    const collectionName =
      segment === "packaging" ? "packaging_quote_saves" : "commercial_quote_saves";

    const db = await getDb();
    const col = db.collection(collectionName);
    const existing = await col.findOne(
      Object.assign({ _id: oid }, filterUserAndDatabase(usernameRaw, dbKey))
    );
    if (!existing) {
      return reply.code(404).send({ success: false, error: "Quote not found" });
    }

    await col.deleteOne({ _id: oid });
    return reply.send({
      success: true,
      id: String(oid),
      estimation_number: existing.estimation_number != null ? String(existing.estimation_number) : ""
    });
  });
}

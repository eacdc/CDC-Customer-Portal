import { getDb } from "./mongo.js";

/**
 * Mongo-only store for pricing tables (master table for packaging and
 * commercial master table). No JSON fallback — if the doc is missing the
 * caller will get a `MissingPricingTableError` and should fail the request.
 *
 * Mongo collection: `pricing_tables`
 * Document shape:
 *   { _id: "masterTable" | "comm_masterTable", data: <table>, updatedAt, updatedBy }
 */
const COLLECTION_NAME = "pricing_tables";
const cache = new Map();

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function now() {
  return new Date();
}

export class MissingPricingTableError extends Error {
  constructor(tableId) {
    super(
      `Pricing table "${tableId}" not found in MongoDB (${COLLECTION_NAME}). ` +
      `Insert/upsert the document before calling this code path.`
    );
    this.name = "MissingPricingTableError";
    this.tableId = tableId;
  }
}

/**
 * Read a pricing table from Mongo. Throws `MissingPricingTableError` if no
 * document exists for `tableId` — there is no JSON fallback.
 */
export async function getPricingTableData(tableId) {
  if (cache.has(tableId)) {
    return cloneData(cache.get(tableId));
  }
  const db = await getDb();
  const doc = await db.collection(COLLECTION_NAME).findOne({ _id: tableId });
  if (!doc || doc.data === undefined) {
    throw new MissingPricingTableError(tableId);
  }
  cache.set(tableId, cloneData(doc.data));
  return cloneData(doc.data);
}

export async function upsertPricingTableData(tableId, data, updatedBy = "local") {
  const db = await getDb();
  await db.collection(COLLECTION_NAME).updateOne(
    { _id: tableId },
    {
      $set: {
        data,
        updatedAt: now(),
        updatedBy: updatedBy || "local",
      },
    },
    { upsert: true }
  );
  cache.set(tableId, cloneData(data));
  return { ok: true };
}

export function invalidatePricingTableData(tableId) {
  if (tableId) {
    cache.delete(tableId);
    return;
  }
  cache.clear();
}

/**
 * Read the full Mongo document (incl. updatedAt / updatedBy metadata).
 * Throws `MissingPricingTableError` when the doc is missing. `source` on
 * the returned object is always `"mongo"` — no fallback path.
 */
export async function getPricingTableDoc(tableId) {
  const db = await getDb();
  const doc = await db.collection(COLLECTION_NAME).findOne({ _id: tableId });
  if (!doc || doc.data === undefined) {
    throw new MissingPricingTableError(tableId);
  }
  return {
    _id: doc._id,
    data: doc.data,
    updatedAt: doc.updatedAt || null,
    updatedBy: doc.updatedBy || null,
    source: "mongo",
  };
}

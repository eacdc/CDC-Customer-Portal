import { getDb } from "./mongo.js";

const COLLECTION_NAME = "pricing_tables";
const cache = new Map();

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function now() {
  return new Date();
}

export async function getPricingTableData(tableId, fallbackData) {
  if (cache.has(tableId)) {
    return cloneData(cache.get(tableId));
  }

  const db = await getDb();
  const doc = await db.collection(COLLECTION_NAME).findOne({ _id: tableId });
  const hasMongoData = doc && doc.data !== undefined;
  const hasFallbackData = fallbackData !== undefined;
  if (!hasMongoData && !hasFallbackData) {
    throw new Error(`Pricing table "${tableId}" not found in MongoDB`);
  }
  const data = hasMongoData ? doc.data : fallbackData;
  cache.set(tableId, cloneData(data));
  return cloneData(data);
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

export async function getPricingTableDoc(tableId, fallbackData) {
  const db = await getDb();
  const doc = await db.collection(COLLECTION_NAME).findOne({ _id: tableId });
  if (doc && doc.data !== undefined) {
    return {
      _id: doc._id,
      data: doc.data,
      updatedAt: doc.updatedAt || null,
      updatedBy: doc.updatedBy || null,
      source: "mongo",
    };
  }
  return {
    _id: tableId,
    data: fallbackData,
    updatedAt: null,
    updatedBy: null,
    source: "fallback",
  };
}

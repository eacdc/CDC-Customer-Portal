/**
 * Backfill estimation_number on saved packaging/commercial quotes that lack one.
 *
 * Usage (from customer-portal directory):
 *   node backfill-estimation-numbers.js
 *   node backfill-estimation-numbers.js --dry-run
 */
import "dotenv/config";
import { getDb, closeMongo } from "./lib/mongo.js";
import {
  formatEstimationNumber,
  getFiscalYearCode,
  parseEstimationNumber,
  syncCounterToMax
} from "./lib/estimationNumber.js";

const COLLECTIONS = ["packaging_quote_saves", "commercial_quote_saves"];
const dryRun = process.argv.includes("--dry-run");

function resolveDbKey(doc) {
  const k = doc && doc.database != null ? String(doc.database).trim().toLowerCase() : "";
  return k === "kol" ? "kol" : "ahm";
}

function resolveSavedAt(doc) {
  const d = doc.savedAt || doc.createdAt || doc.updatedAt;
  const dt = d ? new Date(d) : new Date();
  return isNaN(dt.getTime()) ? new Date() : dt;
}

function hasEstimationNumber(doc) {
  return doc.estimation_number != null && String(doc.estimation_number).trim() !== "";
}

async function loadAllDocs(db) {
  const out = [];
  for (const name of COLLECTIONS) {
    const rows = await db.collection(name).find({}).toArray();
    rows.forEach((doc) => {
      out.push({ collection: name, doc });
    });
  }
  return out;
}

function buildMaxSeqMap(allDocs) {
  const maxByKey = new Map();
  for (const { doc } of allDocs) {
    if (!hasEstimationNumber(doc)) continue;
    const parsed = parseEstimationNumber(doc.estimation_number);
    if (!parsed) continue;
    const dbKey = resolveDbKey(doc);
    const key = `${dbKey}:${parsed.fiscalYear}`;
    const prev = maxByKey.get(key) || 0;
    if (parsed.seq > prev) maxByKey.set(key, parsed.seq);
  }
  return maxByKey;
}

async function run() {
  const db = await getDb();
  const allDocs = await loadAllDocs(db);
  const maxByKey = buildMaxSeqMap(allDocs);

  const pending = allDocs
    .filter(({ doc }) => !hasEstimationNumber(doc))
    .map(({ collection, doc }) => {
      const savedAt = resolveSavedAt(doc);
      const dbKey = resolveDbKey(doc);
      const fiscalYear = getFiscalYearCode(savedAt);
      return { collection, doc, savedAt, dbKey, fiscalYear };
    })
    .sort((a, b) => {
      if (a.dbKey !== b.dbKey) return a.dbKey.localeCompare(b.dbKey);
      if (a.fiscalYear !== b.fiscalYear) return a.fiscalYear.localeCompare(b.fiscalYear);
      return a.savedAt - b.savedAt;
    });

  console.log(`Found ${pending.length} quote(s) without estimation_number (${dryRun ? "dry run" : "live"}).`);

  const nextSeqByKey = new Map(maxByKey);
  let updated = 0;

  for (const item of pending) {
    const key = `${item.dbKey}:${item.fiscalYear}`;
    const next = (nextSeqByKey.get(key) || 0) + 1;
    nextSeqByKey.set(key, next);
    const estimation_number = formatEstimationNumber(next, item.fiscalYear);
    const patch = {
      estimation_number,
      estimation_seq: next,
      estimation_fiscal_year: item.fiscalYear
    };

    console.log(
      `[${item.collection}] ${String(item.doc._id)} -> ${estimation_number} (saved ${item.savedAt.toISOString()})`
    );

    if (!dryRun) {
      await db.collection(item.collection).updateOne({ _id: item.doc._id }, { $set: patch });
    }
    updated++;
  }

  if (!dryRun) {
    for (const [key, maxSeq] of nextSeqByKey.entries()) {
      const [dbKey, fiscalYear] = key.split(":");
      await syncCounterToMax(db, dbKey, fiscalYear, maxSeq);
    }
  }

  console.log(`${dryRun ? "Would update" : "Updated"} ${updated} document(s).`);
  await closeMongo();
}

run().catch(async (err) => {
  console.error(err);
  try {
    await closeMongo();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});

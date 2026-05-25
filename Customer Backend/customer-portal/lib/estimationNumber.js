/**
 * Indian fiscal year (Apr–Mar) estimation numbers: {seq}/CDC/{YYYY}
 * e.g. 3451/CDC/2526 for FY 2025–26
 */

export function getFiscalYearCode(date = new Date()) {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date(date);
  const month = d.getMonth();
  const year = d.getFullYear();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  return String(startYear).slice(-2) + String(endYear).slice(-2);
}

export function formatEstimationNumber(seq, fiscalYearCode) {
  const n = Number(seq);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error("Estimation sequence must be a positive number");
  }
  return `${Math.floor(n)}/CDC/${fiscalYearCode}`;
}

export function parseEstimationNumber(value) {
  const m = String(value || "").trim().match(/^(\d+)\/CDC\/(\d{4})$/i);
  if (!m) return null;
  return { seq: Number(m[1]), fiscalYear: m[2] };
}

function counterId(dbKey, fiscalYear) {
  return `${String(dbKey || "ahm")}:${fiscalYear}`;
}

/**
 * Atomically allocate the next estimation number for a database + fiscal year.
 */
export async function allocateEstimationNumber(db, dbKey, referenceDate = new Date()) {
  const fiscalYear = getFiscalYearCode(referenceDate);
  const id = counterId(dbKey, fiscalYear);
  const col = db.collection("quote_estimation_counters");
  const result = await col.findOneAndUpdate(
    { _id: id },
    {
      $inc: { seq: 1 },
      $setOnInsert: {
        database: dbKey,
        fiscalYear,
        createdAt: new Date()
      },
      $set: { updatedAt: new Date() }
    },
    { upsert: true, returnDocument: "after" }
  );
  const doc = result && result.value != null ? result.value : result;
  const seq = doc && doc.seq != null ? doc.seq : null;
  if (seq == null) {
    throw new Error("Failed to allocate estimation sequence");
  }
  return {
    estimation_number: formatEstimationNumber(seq, fiscalYear),
    estimation_seq: seq,
    estimation_fiscal_year: fiscalYear
  };
}

/**
 * Reserve the next N sequences without going through findOneAndUpdate N times (backfill helper).
 */
export async function reserveEstimationSequence(db, dbKey, fiscalYear, count) {
  if (!count || count < 1) return { start: 0, end: 0 };
  const id = counterId(dbKey, fiscalYear);
  const col = db.collection("quote_estimation_counters");
  const result = await col.findOneAndUpdate(
    { _id: id },
    {
      $inc: { seq: count },
      $setOnInsert: {
        database: dbKey,
        fiscalYear,
        createdAt: new Date()
      },
      $set: { updatedAt: new Date() }
    },
    { upsert: true, returnDocument: "after" }
  );
  const doc = result && result.value != null ? result.value : result;
  const end = doc.seq;
  return { start: end - count + 1, end };
}

export async function syncCounterToMax(db, dbKey, fiscalYear, maxSeq) {
  if (!maxSeq || maxSeq < 1) return;
  const id = counterId(dbKey, fiscalYear);
  const col = db.collection("quote_estimation_counters");
  await col.updateOne(
    { _id: id },
    {
      $max: { seq: maxSeq },
      $setOnInsert: {
        database: dbKey,
        fiscalYear,
        createdAt: new Date()
      },
      $set: { updatedAt: new Date() }
    },
    { upsert: true }
  );
}

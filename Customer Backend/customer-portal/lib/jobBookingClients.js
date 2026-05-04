import { db1 } from "./db1.js";
import { db2 } from "./db2.js";
import { normalizeDatabaseKey } from "./salesExecutives.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

const SQL_JOB_BOOKING_CLIENTS = `
SELECT DISTINCT
  j.LedgerID,
  lm.LedgerName AS LedgerName
FROM JobBookingJobCard j
LEFT JOIN LedgerMaster lm ON j.LedgerID = lm.LedgerID
ORDER BY lm.LedgerName
`;

/** @type {Map<string, { at: number; clients: { ledgerId: unknown; ledgerName: string }[] }>} */
const cacheByDb = new Map();

async function getPoolForSite(site) {
  return site === "kol" ? db1() : db2();
}

function rowLedgerName(row) {
  const v = row.LedgerName != null ? row.LedgerName : row.ledgerName;
  return String(v == null ? "" : v).trim();
}

function rowLedgerId(row) {
  if (row.LedgerID != null) return row.LedgerID;
  if (row.LedgerId != null) return row.LedgerId;
  return row.ledgerID != null ? row.ledgerID : row.ledgerId;
}

/**
 * Distinct clients (ledger) that appear on job cards, for calculator client dropdowns.
 * @param {'ahm'|'kol'} databaseKey
 * @returns {Promise<{ ledgerId: unknown; ledgerName: string }[]>}
 */
export async function listJobBookingClients(databaseKey) {
  const key = normalizeDatabaseKey(databaseKey);
  if (!key) throw new Error("Invalid database key");

  const now = Date.now();
  const cached = cacheByDb.get(key);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.clients;
  }

  const pool = await getPoolForSite(key);
  const result = await pool.request().query(SQL_JOB_BOOKING_CLIENTS);
  const recordset = result.recordset || [];

  const clients = recordset
    .map((r) => {
      const ledgerName = rowLedgerName(r);
      if (!ledgerName) return null;
      return { ledgerId: rowLedgerId(r), ledgerName };
    })
    .filter(Boolean);

  cacheByDb.set(key, { at: now, clients });
  return clients;
}

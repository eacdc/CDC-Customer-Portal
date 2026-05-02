import sql from "mssql";
import { db1 } from "./db1.js";
import { db2 } from "./db2.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

/** Matches LedgerMaster listing for cost-calculator login and quote save authorization. */
const SQL_SALES_EXECUTIVES = `
SELECT LedgerName, LedgerID
FROM LedgerMaster
WHERE Designation = @designation
ORDER BY LedgerName
`;

/** @typedef {{ at: number; names: Set<string>; rows: { ledgerId: unknown; ledgerName: string }[] }} SiteCache */

/** @type {Map<string, SiteCache>} key: 'ahm' | 'kol' */
const cacheByDb = new Map();

export function normalizeLedgerUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/**
 * Cost-calculator site key: Ahmedabad → DB1, Kolkata → DB2.
 * @param {unknown} value
 * @returns {'ahm'|'kol'|null}
 */
export function normalizeDatabaseKey(value) {
  const s = String(value || "")
    .trim()
    .toLowerCase();
  if (s === "ahm" || s === "kol") return s;
  return null;
}

async function getPoolForSite(site) {
  return site === "kol" ? db2() : db1();
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
 * Sales executives for login dropdown; refreshes cache when stale per site.
 * @param {'ahm'|'kol'} databaseKey
 * @returns {Promise<{ ledgerId: unknown; ledgerName: string }[]>}
 */
export async function listSalesExecutives(databaseKey) {
  const key = normalizeDatabaseKey(databaseKey);
  if (!key) throw new Error("Invalid database key");

  const now = Date.now();
  const cached = cacheByDb.get(key);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.rows;
  }

  const pool = await getPoolForSite(key);
  const request = pool.request();
  request.input("designation", sql.NVarChar(100), "Sales Executive");
  const result = await request.query(SQL_SALES_EXECUTIVES);
  const recordset = result.recordset || [];

  const rows = recordset
    .map((r) => {
      const ledgerName = rowLedgerName(r);
      if (!ledgerName) return null;
      return { ledgerId: rowLedgerId(r), ledgerName };
    })
    .filter(Boolean);

  const names = new Set(rows.map((r) => normalizeLedgerUsername(r.ledgerName)));
  cacheByDb.set(key, { at: now, names, rows });
  return rows;
}

/**
 * Authorize quote-save requests: username must match a Sales Executive LedgerName for the given site DB.
 * @returns {Promise<string|null>} trimmed LedgerName or null after reply sent
 */
export async function assertSalesExecutiveUsername(body, reply, req) {
  const dbKey = normalizeDatabaseKey(body.database);
  if (!dbKey) {
    reply.code(400).send({
      success: false,
      error: "Missing or invalid database. Use 'ahm' or 'kol'."
    });
    return null;
  }

  const usernameRaw = String(body.username || "").trim();
  const unameKey = normalizeLedgerUsername(usernameRaw);
  if (!unameKey) {
    reply.code(403).send({ success: false, error: "Username required." });
    return null;
  }
  try {
    await listSalesExecutives(dbKey);
    const cached = cacheByDb.get(dbKey);
    if (!cached || !cached.names.has(unameKey)) {
      reply.code(403).send({
        success: false,
        error: "Pick a sales executive from the login list for this database."
      });
      return null;
    }
  } catch (e) {
    if (req && req.log) req.log.error(e);
    reply.code(503).send({
      success: false,
      error: "Could not verify username. Try again later."
    });
    return null;
  }
  return usernameRaw;
}

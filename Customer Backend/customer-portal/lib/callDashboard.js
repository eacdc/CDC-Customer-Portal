// lib/callDashboard.js
import sql from "mssql";

/**
 * Call dbo.portal_dashboard for one MSSQL database.
 *
 * @param {sql.ConnectionPool | Promise<sql.ConnectionPool>} poolOrPromise
 * @param {number[]} ledgerIds
 */
export async function callDashboard(poolOrPromise, ledgerIds) {
  // 🔹 This is the key fix:
  const pool = await poolOrPromise; // works for both pool and Promise<pool>

  if (!Array.isArray(ledgerIds) || ledgerIds.length === 0) {
    return {
      kpis: [],
      monthlyOrders: [],
      recentOrders: [],
      otifSummary: {
        PlannedDeliveries: 0,
        CompletedOnTime: 0,
        CompletedWithDelay: 0,
        YetUndelivered: 0,
      },
      pendingApprovals: [],
      pendingFiles: [],
    };
  }

  // Build TVP for dbo.IdList
  const tvp = new sql.Table();
  tvp.columns.add("Id", sql.Int);
  ledgerIds.forEach((id) => tvp.rows.add(id));

  const result = await pool
    .request()
    .input("LedgerIds", tvp)
    .execute("portal_dashboard");

  const rs = result.recordsets || [];

  const kpis             = rs[0] || [];
  const monthlyOrders    = rs[1] || [];
  const recentOrders     = rs[2] || [];
  const otifRows         = rs[3] || [];
  const pendingApprovals = rs[4] || [];
  const pendingFiles     = rs[5] || [];

  const otifSummary =
    otifRows[0] || {
      PlannedDeliveries: 0,
      CompletedOnTime: 0,
      CompletedWithDelay: 0,
      YetUndelivered: 0,
    };

  return {
    kpis,
    monthlyOrders,
    recentOrders,
    otifSummary,
    pendingApprovals,
    pendingFiles,
  };
}
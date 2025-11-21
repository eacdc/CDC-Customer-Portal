// portalapi.js
import { callDashboard } from "./lib/callDashboard.js";
import sql from "mssql";
import { getDb } from "./lib/mongo.js";
import { db1 } from "./lib/db1.js";
import { db2 } from "./lib/db2.js";


// --- helpers
function parseRange(range) {
  const now = new Date();
  const y = now.getFullYear();
  const startOfYear = new Date(y, 0, 1);
  const endOfYear = new Date(y, 11, 31);
  const lastYearStart = new Date(y - 1, 0, 1);
  const lastYearEnd = new Date(y - 1, 11, 31);

  const map = { "1m": 30, "3m": 90, "6m": 180, "12m": 365 };
  if (range in map) {
    const d = new Date(now);
    d.setDate(d.getDate() - map[range]);
    return { from: d, to: now };
  }
  if (range === "thisyear") return { from: startOfYear, to: endOfYear };
  if (range === "lastyear") return { from: lastYearStart, to: lastYearEnd };
  const d = new Date(now);
  d.setDate(d.getDate() - 90);
  return { from: d, to: now };
}

function toIdListTVP(ids) {
  const t = new sql.Table("dbo.IdList");
  t.columns.add("Id", sql.Int, { nullable: false });
  (ids || []).forEach((id) => t.rows.add(id));
  return t;
}

async function callOrders(
  pool,
  ledgerIds,
  { from, to, status, q, cursor, limit, sourceTag },
  logger = console
) {
  // Helper to safely log - handles both Pino and console loggers
  const log = (message, ...args) => {
    if (logger && typeof logger.info === 'function') {
      logger.info(message, ...args);
    } else if (logger && typeof logger.log === 'function') {
      logger.log(message, ...args);
    } else {
      console.log(message, ...args);
    }
  };
  
  // Log even if ledgerIds is empty
  log(`[ORDERS API] callOrders called for source: ${sourceTag}`);
  log(`[ORDERS API] LedgerIds:`, ledgerIds);
  
  if (!ledgerIds || ledgerIds.length === 0) {
    log(`[ORDERS API] No ledgerIds for ${sourceTag}, returning empty array`);
    return [];
  }
  
  const r = (await pool).request();
  
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  const afterDate = cursor?.date || null;
  const afterJobId = cursor?.id || null;
  const searchValue = q || "";
  const statusValue = status;
  const limitValue = Number(limit) + 5;
  
  r.input("LedgerIds", toIdListTVP(ledgerIds));
  r.input("FromDate", sql.Date, fromDate);
  r.input("ToDate", sql.Date, toDate);
  r.input("Status", sql.VarChar(12), statusValue);
  r.input("Search", sql.NVarChar(100), searchValue);
  r.input("AfterDate", sql.DateTime2, afterDate);
  r.input("AfterJobId", sql.Int, afterJobId);
  r.input("Limit", sql.Int, limitValue);
  
  // Log the procedure call with parameters
  log(`[ORDERS API] Calling stored procedure: dbo.portal_orders_list`);
  log(`[ORDERS API] Source: ${sourceTag}`);
  log(`[ORDERS API] Parameters:`, {
    LedgerIds: ledgerIds,
    FromDate: fromDate ? fromDate.toISOString() : null,
    ToDate: toDate ? toDate.toISOString() : null,
    Status: statusValue,
    Search: searchValue,
    AfterDate: afterDate ? new Date(afterDate).toISOString() : null,
    AfterJobId: afterJobId,
    Limit: limitValue
  });
  
  const rs = await r.execute("dbo.portal_orders_list");
  const rows = rs.recordset || [];
  
  log(`[ORDERS API] Procedure returned ${rows.length} rows from ${sourceTag}`);
  
  rows.forEach((r) => (r._source = sourceTag)); // 👈 tag
  return rows;
}

export default async function portalApiPlugin(fastify, opts) {

  // GET /dashboard
fastify.get("/dashboard", async (req, reply) => {
  try {
    const mongo = await getDb();
    const tenant = await mongo
      .collection("tenants")
      .findOne({ email: req.user.email });

    if (!tenant) {
      return reply.code(400).send({ error: "Tenant binding missing" });
    }

    const ids1 = tenant.ledgerIds_db1 || [];
    const ids2 = tenant.ledgerIds_db2 || [];

    // Call dashboard on both DBs
    const [res1, res2] = await Promise.all([
      callDashboard(db1(), ids1),
      callDashboard(db2(), ids2),
    ]);

    /* ======================================================
       1. Merge KPIs 
    ====================================================== */
    const kpiMap = new Map();
    const addKpis = (list) => {
      list.forEach((k) => {
        const key = k.RangeDays;
        if (!kpiMap.has(key)) {
          kpiMap.set(key, {
            RangeDays: key,
            RangeLabel: k.RangeLabel,
            CurrOrderQty: Number(k.CurrOrderQty || 0),
            CurrOrderValue: Number(k.CurrOrderValue || 0),
            PrevOrderQty: Number(k.PrevOrderQty || 0),
            PrevOrderValue: Number(k.PrevOrderValue || 0)
          });
        } else {
          const agg = kpiMap.get(key);
          agg.CurrOrderQty   += Number(k.CurrOrderQty || 0);
          agg.CurrOrderValue += Number(k.CurrOrderValue || 0);
          agg.PrevOrderQty   += Number(k.PrevOrderQty || 0);
          agg.PrevOrderValue += Number(k.PrevOrderValue || 0);
        }
      });
    };

    addKpis(res1.kpis);
    addKpis(res2.kpis);

    const mergedKpis = Array.from(kpiMap.values())
      .sort((a, b) => a.RangeDays - b.RangeDays)
      .map((k) => {
        const prev = k.PrevOrderValue || 0;
        const curr = k.CurrOrderValue || 0;
        return {
          ...k,
          OrderValueChangePct:
            prev === 0 ? null : ((curr - prev) * 100.0) / prev
        };
      });

    /* ======================================================
       2. Merge monthly orders
    ====================================================== */
    const monthMap = new Map();
    const addMonths = (list) => {
      list.forEach((m) => {
        const key = m.YearMonth;
        if (!key) return;

        if (!monthMap.has(key)) {
          monthMap.set(key, {
            YearMonth: key,
            MonthStart: m.MonthStart,
            TotalQty: Number(m.TotalQty || 0),
            TotalValue: Number(m.TotalValue || 0)
          });
        } else {
          const agg = monthMap.get(key);
          agg.TotalQty += Number(m.TotalQty || 0);
          agg.TotalValue += Number(m.TotalValue || 0);
        }
      });
    };

    addMonths(res1.monthlyOrders);
    addMonths(res2.monthlyOrders);

    const mergedMonthlyOrders = [...monthMap.values()].sort(
      (a, b) => new Date(a.MonthStart) - new Date(b.MonthStart)
    );

    /* ======================================================
       3. Merge recent orders (top 5)
    ====================================================== */
    const mergedRecent = [...res1.recentOrders, ...res2.recentOrders]
      .sort((a, b) => {
        const da = new Date(a.OrderDate).getTime();
        const dbb = new Date(b.OrderDate).getTime();
        if (dbb !== da) return dbb - da;
        return (
          Number(b.OrderBookingID || 0) -
          Number(a.OrderBookingID || 0)
        );
      })
      .slice(0, 5);

    /* ======================================================
       4. Merge OTIF summary
    ====================================================== */
    const otifSummary = {
      plannedDeliveries:
        Number(res1.otifSummary.PlannedDeliveries || 0) +
        Number(res2.otifSummary.PlannedDeliveries || 0),

      completedOnTime:
        Number(res1.otifSummary.CompletedOnTime || 0) +
        Number(res2.otifSummary.CompletedOnTime || 0),

      completedWithDelay:
        Number(res1.otifSummary.CompletedWithDelay || 0) +
        Number(res2.otifSummary.CompletedWithDelay || 0),

      yetUndelivered:
        Number(res1.otifSummary.YetUndelivered || 0) +
        Number(res2.otifSummary.YetUndelivered || 0)
    };

    /* ======================================================
       5. Pending approvals + pending files
    ====================================================== */
    const mergedPendingApprovals = [
      ...res1.pendingApprovals,
      ...res2.pendingApprovals
    ].sort((a, b) => {
      const da = new Date(a.PODate).getTime();
      const dbb = new Date(b.PODate).getTime();
      return dbb - da;
    });

    const mergedPendingFiles = [
      ...res1.pendingFiles,
      ...res2.pendingFiles
    ].sort((a, b) => {
      const da = new Date(a.PODate).getTime();
      const dbb = new Date(b.PODate).getTime();
      return dbb - da;
    });

    /* ======================================================
       Final response
    ====================================================== */
    reply.send({
      kpis: mergedKpis,
      monthlyOrders: mergedMonthlyOrders,
      recentOrders: mergedRecent,
      otifSummary,
      pendingApprovals: mergedPendingApprovals,
      pendingFiles: mergedPendingFiles
    });

  } catch (err) {
    fastify.log.error(err, "Error in GET /dashboard");
    reply.code(500).send({
      error: "Failed to load dashboard",
      details: err.message
    });
  }
});
  // GET /api/orders
  fastify.get("/orders", async (req, reply) => {
    req.log.info("[ORDERS API] /api/orders endpoint called");
    
    const {
      tab = "all",
      range = "3m",
      q = "",
      limit = "25",
      cursor,
    } = req.query || {};
    
    req.log.info("[ORDERS API] Query parameters:", { tab, range, q, limit, cursor: cursor ? "present" : "none" });
    
    const status = ["all", "pending", "completed"].includes(
      String(tab).toLowerCase()
    )
      ? String(tab).toLowerCase()
      : "all";
    const win = parseRange(String(range));

    let cur = null;
    if (cursor) {
      try {
        const [d, id] = Buffer.from(String(cursor), "base64")
          .toString("utf8")
          .split("|");
        cur = { date: new Date(d), id: Number(id) };
      } catch {}
    }

    const mongo = await getDb();
    const tenant = await mongo
      .collection("tenants")
      .findOne({ email: req.user.email });
    if (!tenant) {
      req.log.warn("[ORDERS API] Tenant binding missing for email:", req.user.email);
      return reply.code(400).send({ error: "Tenant binding missing" });
    }

    req.log.info("[ORDERS API] Tenant found:", { 
      email: req.user.email,
      ledgerIds_db1: tenant.ledgerIds_db1?.length || 0,
      ledgerIds_db2: tenant.ledgerIds_db2?.length || 0
    });

    const ids1 = tenant.ledgerIds_db1 || [];
    const ids2 = tenant.ledgerIds_db2 || [];

    req.log.info("[ORDERS API] Calling callOrders for both databases");
    const [rows1, rows2] = await Promise.all([
      callOrders(db1(), ids1, {
        from: win.from,
        to: win.to,
        status,
        q,
        cursor: cur,
        limit,
        sourceTag: "db1",
      }, req.log),
      callOrders(db2(), ids2, {
        from: win.from,
        to: win.to,
        status,
        q,
        cursor: cur,
        limit,
        sourceTag: "db2",
      }, req.log),
    ]);

    req.log.info("[ORDERS API] Results:", {
      db1_rows: rows1.length,
      db2_rows: rows2.length
    });

    const merged = [...rows1, ...rows2].sort((a, b) => {
      const da = new Date(a._cursorDate).getTime();
      const dbb = new Date(b._cursorDate).getTime();
      if (da !== dbb) return dbb - da;
      return (b._cursorId || 0) - (a._cursorId || 0);
    });

    const page = merged.slice(0, Number(limit));
    const last = page[page.length - 1];
    const nextCursor = last
      ? Buffer.from(`${last._cursorDate}|${last._cursorId}`, "utf8").toString(
          "base64"
        )
      : null;

    page.forEach((r) => {
      // Optional: normalize field names (e.g., keep DB-cased names)
      delete r._cursorDate;
      delete r._cursorId;
    });

    return { items: page, nextCursor };
  });

  // GET /api/orders/:jobId/processes?source=db1|db2
  fastify.get("/orders/:jobId/processes", async (req, reply) => {
    const { jobId } = req.params;
    const { source } = req.query || {};

    const mongo = await getDb();
    const tenant = await mongo
      .collection("tenants")
      .findOne({ email: req.user.email });
    if (!tenant)
      return reply.code(400).send({ error: "Tenant binding missing" });

    const tvp = (ids) => {
      const t = new sql.Table("dbo.IdList");
      t.columns.add("Id", sql.Int, { nullable: false });
      (ids || []).forEach((id) => t.rows.add(id));
      return t;
    };

    const execOne = async (pool, ids) => {
      const r = (await pool).request();
      r.input("JobBookingID", sql.Int, Number(jobId));
      r.input("LedgerIds", tvp(ids));
      const rs = await r.execute("dbo.portal_order_processes");
      return rs.recordset || [];
    };

    if (source === "db1") return execOne(db1(), tenant.ledgerIds_db1 || []);
    if (source === "db2") return execOne(db2(), tenant.ledgerIds_db2 || []);

    // try both, return the non-empty one (click-through volume is low)
    const [a, b] = await Promise.allSettled([
      execOne(db1(), tenant.ledgerIds_db1 || []),
      execOne(db2(), tenant.ledgerIds_db2 || []),
    ]);
    const rows =
      a.status === "fulfilled" && a.value.length
        ? a.value
        : b.status === "fulfilled" && b.value.length
        ? b.value
        : [];
    if (!rows.length)
      return reply.code(404).send({ error: "No processes found" });
    return rows;
  });

  // GET /api/orders/:jobId/deliveries?source=db1|db2&limit=50&cursor=base64(ts|id)
  fastify.get("/orders/:jobId/deliveries", async (req, reply) => {
    const { jobId } = req.params;
    const { source, limit = "50", cursor } = req.query || {};

    let after = null;
    if (cursor) {
      try {
        const [ts, id] = Buffer.from(String(cursor), "base64")
          .toString("utf8")
          .split("|");
        after = { ts: new Date(ts), id: Number(id) };
      } catch {}
    }

    const mongo = await getDb();
    const tenant = await mongo
      .collection("tenants")
      .findOne({ email: req.user.email });
    if (!tenant)
      return reply.code(400).send({ error: "Tenant binding missing" });

    const tvp = (ids) => {
      const t = new sql.Table("dbo.IdList");
      t.columns.add("Id", sql.Int, { nullable: false });
      (ids || []).forEach((id) => t.rows.add(id));
      return t;
    };

    const execProc = async (pool, ids) => {
      const r = (await pool).request();
      r.input("JobBookingID", sql.Int, Number(jobId));
      r.input("LedgerIds", tvp(ids));
      r.input("AfterTs", sql.DateTime2, after?.ts || null);
      r.input("AfterId", sql.BigInt, after?.id || null);
      r.input("Limit", sql.Int, Number(limit));
      const rs = await r.execute("dbo.portal_order_deliveries");
      const rows = rs.recordset || [];
      const last = rows[rows.length - 1];
      const nextCursor = last
        ? Buffer.from(`${last.DeliveryTs}|${last.DeliveryId}`, "utf8").toString(
            "base64"
          )
        : null;
      return { items: rows, nextCursor };
    };

    if (source === "db1") return execProc(db1(), tenant.ledgerIds_db1 || []);
    if (source === "db2") return execProc(db2(), tenant.ledgerIds_db2 || []);

    // try both; prefer the one that returns rows
    const [a, b] = await Promise.allSettled([
      execProc(db1(), tenant.ledgerIds_db1 || []),
      execProc(db2(), tenant.ledgerIds_db2 || []),
    ]);
    const chosen =
      a.status === "fulfilled" && a.value.items.length
        ? a.value
        : b.status === "fulfilled" && b.value.items.length
        ? b.value
        : a.status === "fulfilled"
        ? a.value
        : b.status === "fulfilled"
        ? b.value
        : null;
    if (!chosen) return reply.code(404).send({ error: "No deliveries found" });
    return chosen;
  });

  // GET /api/approvals?tab=all|pending_approval|pending_files&range=3m&q=&limit=25&cursor=base64(date|id)&source=db1|db2
  fastify.get("/approvals", async (req, reply) => {
    const {
      tab = "all",
      range = "3m",
      q = "",
      limit = "25",
      cursor,
      source,
    } = req.query || {};

    // normalize tab
    const status = ["all", "pending_approval", "pending_files"].includes(
      String(tab).toLowerCase()
    )
      ? String(tab).toLowerCase()
      : "all";

    // date window (same helper you already have)
    const win = parseRange(String(range));

    // decode keyset cursor
    let after = null;
    if (cursor) {
      try {
        const [d, id] = Buffer.from(String(cursor), "base64")
          .toString("utf8")
          .split("|");
        after = { date: new Date(d), id: Number(id) };
      } catch {
        // ignore bad cursor
      }
    }

    // tenant → ledger binding
    const mongo = await getDb();
    const tenant = await mongo
      .collection("tenants")
      .findOne({ email: req.user.email });
    if (!tenant)
      return reply.code(400).send({ error: "Tenant binding missing" });

    // helper: TVP builder
    const tvp = (ids) => {
      const t = new sql.Table("dbo.IdList");
      t.columns.add("Id", sql.Int, { nullable: false });
      (ids || []).forEach((i) => t.rows.add(i));
      return t;
    };

    // calls the proc on one DB
    const execOne = async (pool, ids, tag) => {
      if (!ids || !ids.length) return [];
      const r = (await pool).request();
      r.input("LedgerIds", tvp(ids));
      r.input("FromDate", sql.Date, win.from || null);
      r.input("ToDate", sql.Date, win.to || null);
      r.input("Status", sql.VarChar(20), status);
      r.input("Search", sql.NVarChar(100), q || "");
      r.input("AfterDate", sql.DateTime2, after?.date || null);
      r.input("AfterId", sql.Int, after?.id || null);
      r.input("Limit", sql.Int, Number(limit) + 5);

      const rs = await r.execute("dbo.portal_approvals_list");
      const rows = rs.recordset || [];
      rows.forEach((row) => (row._source = tag));
      return rows;
    };

    // choose source
    const ids1 = tenant.ledgerIds_db1 || [];
    const ids2 = tenant.ledgerIds_db2 || [];

    let merged;
    if (source === "db1") {
      merged = await execOne(db1(), ids1, "db1");
    } else if (source === "db2") {
      merged = await execOne(db2(), ids2, "db2");
    } else {
      const [a, b] = await Promise.allSettled([
        execOne(db1(), ids1, "db1"),
        execOne(db2(), ids2, "db2"),
      ]);
      const rows1 = a.status === "fulfilled" ? a.value : [];
      const rows2 = b.status === "fulfilled" ? b.value : [];
      merged = [...rows1, ...rows2];
    }

    // global sort by cursor keys (desc)
    merged.sort((a, b) => {
      const da = new Date(a._cursorDate || 0).getTime();
      const db = new Date(b._cursorDate || 0).getTime();
      if (da !== db) return db - da;
      return (b._cursorId || 0) - (a._cursorId || 0);
    });

    // page trim + nextCursor
    const page = merged.slice(0, Number(limit));
    const last = page[page.length - 1];
    const nextCursor = last
      ? Buffer.from(`${last._cursorDate}|${last._cursorId}`, "utf8").toString(
          "base64"
        )
      : null;

    // cleanup internal fields
    page.forEach((r) => {
      delete r._cursorDate;
      delete r._cursorId;
    });

    return { items: page, nextCursor };
  });

  // GET /api/dispatches?range=3m&q=&limit=50&cursor=base64(date|id)&source=db1|db2
  // Also supports: /api/dispatches?from=YYYY-MM-DD&to=YYYY-MM-DD for custom date ranges
  fastify.get("/dispatches", async (req, reply) => {
    const { range = "3m", q = "", limit = "50", cursor, source, from, to } = req.query || {};

    req.log.info({
      msg: "[DISPATCHES] Request received",
      range,
      from,
      to,
      q,
      limit,
      cursor: cursor ? "present" : "none",
      source,
      email: req.user?.email
    });

    // Support custom date range with from/to parameters
    // DispatchDate values are returned in IST (UTC+5:30), so we parse dates in IST
    let win;
    if (from && to) {
      try {
        // Parse dates as IST dates (UTC+5:30)
        // For a date like 2025-11-06:
        // - Start: Nov 6 00:00:00 IST = Nov 5 18:30:00 UTC
        // - End: Nov 6 23:59:59.999 IST = Nov 6 18:29:59.999 UTC
        const parseDateStringIST = (dateStr, isEndOfDay = false) => {
          // Parse YYYY-MM-DD format
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
            const day = parseInt(parts[2], 10);
            
            if (isEndOfDay) {
              // End of day in IST: 23:59:59.999 IST = 18:29:59.999 UTC (same day)
              return new Date(Date.UTC(year, month, day, 18, 29, 59, 999));
            } else {
              // Start of day in IST: 00:00:00 IST = 18:30:00 UTC (previous day)
              // So for Nov 6 IST, we use Nov 5 18:30:00 UTC
              const utcDate = new Date(Date.UTC(year, month, day, 18, 30, 0, 0));
              // Subtract 1 day to get the previous day's 18:30 UTC
              utcDate.setUTCDate(utcDate.getUTCDate() - 1);
              return utcDate;
            }
          }
          // Fallback to regular parsing
          return new Date(dateStr);
        };
        
        const fromDate = parseDateStringIST(from, false); // Start of day IST
        const toDate = parseDateStringIST(to, true); // End of day IST
        
        win = { from: fromDate, to: toDate };
        req.log.info({
          msg: "[DISPATCHES] Custom date range parsed in IST",
          fromParam: from,
          toParam: to,
          fromDate: win.from.toISOString(),
          toDate: win.to.toISOString(),
          fromDateIST: `${win.from.getUTCFullYear()}-${String(win.from.getUTCMonth() + 1).padStart(2, '0')}-${String(win.from.getUTCDate()).padStart(2, '0')} ${String(win.from.getUTCHours()).padStart(2, '0')}:${String(win.from.getUTCMinutes()).padStart(2, '0')}:${String(win.from.getUTCSeconds()).padStart(2, '0')} IST`,
          toDateIST: `${win.to.getUTCFullYear()}-${String(win.to.getUTCMonth() + 1).padStart(2, '0')}-${String(win.to.getUTCDate()).padStart(2, '0')} ${String(win.to.getUTCHours()).padStart(2, '0')}:${String(win.to.getUTCMinutes()).padStart(2, '0')}:${String(win.to.getUTCSeconds()).padStart(2, '0')} IST`
        });
      } catch (err) {
        req.log.warn({
          msg: "[DISPATCHES] Failed to parse custom dates, falling back to range",
          error: err.message
        });
        win = parseRange(String(range));
      }
    } else {
      win = parseRange(String(range));
      req.log.info({
        msg: "[DISPATCHES] Predefined range parsed",
        range,
        fromDate: win.from?.toISOString(),
        toDate: win.to?.toISOString(),
        fromDateLocal: win.from?.toString(),
        toDateLocal: win.to?.toString()
      });
    }

    // decode cursor: base64("isoDate|id")
    let after = null;
    if (cursor) {
      try {
        const [d, id] = Buffer.from(String(cursor), "base64")
          .toString("utf8")
          .split("|");
        after = { date: new Date(d), id: Number(id) };
      } catch {
        // ignore bad cursor
      }
    }

    const mongo = await getDb();
    const tenant = await mongo
      .collection("tenants")
      .findOne({ email: req.user.email });
    if (!tenant)
      return reply.code(400).send({ error: "Tenant binding missing" });

    const ids1 = tenant.ledgerIds_db1 || [];
    const ids2 = tenant.ledgerIds_db2 || [];

    const tvp = (ids) => {
      const t = new sql.Table("dbo.IdList");
      t.columns.add("Id", sql.Int, { nullable: false });
      (ids || []).forEach((id) => t.rows.add(id));
      return t;
    };

    const execOne = async (pool, ids, tag) => {
      if (!ids || !ids.length) return [];
      const r = (await pool).request();
      
      // For sql.Date, extract the date part from IST dates
      // Since DispatchDate is returned in IST, we extract the IST date components
      // and pass them to the stored procedure
      let fromDateParam = null;
      let toDateParam = null;
      
      if (win.from) {
        // win.from represents start of day in IST
        // Extract the date components and create a date for SQL Server
        // We'll pass the date part, and SQL Server will compare against DispatchDate
        const fromYear = win.from.getUTCFullYear();
        const fromMonth = win.from.getUTCMonth();
        const fromDay = win.from.getUTCDate();
        // For Nov 6 IST start (which is Nov 5 18:30 UTC), we want to query from Nov 5
        // So use the UTC date components
        fromDateParam = new Date(Date.UTC(fromYear, fromMonth, fromDay, 0, 0, 0, 0));
      }
      
      if (win.to) {
        // win.to represents end of day in IST
        const toYear = win.to.getUTCFullYear();
        const toMonth = win.to.getUTCMonth();
        const toDay = win.to.getUTCDate();
        // For Nov 6 IST end (which is Nov 6 18:29 UTC), we want to query to Nov 6
        toDateParam = new Date(Date.UTC(toYear, toMonth, toDay, 23, 59, 59, 999));
      }
      
      req.log.info({
        msg: `[DISPATCHES] Executing stored procedure for ${tag}`,
        ledgerIdsCount: ids.length,
        originalFromDate: win.from ? win.from.toISOString() : null,
        originalToDate: win.to ? win.to.toISOString() : null,
        fromDateParam: fromDateParam ? fromDateParam.toISOString() : null,
        toDateParam: toDateParam ? toDateParam.toISOString() : null,
        fromDateLocal: fromDateParam ? fromDateParam.toString() : null,
        toDateLocal: toDateParam ? toDateParam.toString() : null,
        fromDateSQL: fromDateParam ? `${fromDateParam.getFullYear()}-${String(fromDateParam.getMonth() + 1).padStart(2, '0')}-${String(fromDateParam.getDate()).padStart(2, '0')}` : null,
        toDateSQL: toDateParam ? `${toDateParam.getFullYear()}-${String(toDateParam.getMonth() + 1).padStart(2, '0')}-${String(toDateParam.getDate()).padStart(2, '0')}` : null,
        search: q || "",
        afterDate: after?.date ? after.date.toISOString() : null,
        afterId: after?.id || null,
        limit: Number(limit) + 5
      });
      
      r.input("LedgerIds", tvp(ids));
      r.input("FromDate", sql.Date, fromDateParam);
      r.input("ToDate", sql.Date, toDateParam);
      r.input("Search", sql.NVarChar(100), q || "");
      r.input("AfterDate", sql.DateTime2, after?.date || null);
      r.input("AfterId", sql.BigInt, after?.id || null);
      r.input("Limit", sql.Int, Number(limit) + 5);

      const rs = await r.execute("dbo.portal_dispatches_list");
      const rows = rs.recordset || [];
      
      req.log.info({
        msg: `[DISPATCHES] Stored procedure result for ${tag}`,
        rowCount: rows.length,
        sampleDates: rows.slice(0, 5).map(row => ({
          DispatchDate: row.DispatchDate,
          DispatchDateISO: row.DispatchDate ? new Date(row.DispatchDate).toISOString() : null,
          DispatchDateLocal: row.DispatchDate ? new Date(row.DispatchDate).toString() : null,
          PODate: row.PODate,
          DispatchId: row.DispatchId,
          JobNum: row.JobNum
        }))
      });
      
      rows.forEach((row) => (row._source = tag));
      return rows;
    };

    let merged = [];
    if (source === "db1") {
      merged = await execOne(db1(), ids1, "db1");
    } else if (source === "db2") {
      merged = await execOne(db2(), ids2, "db2");
    } else {
      const [a, b] = await Promise.allSettled([
        execOne(db1(), ids1, "db1"),
        execOne(db2(), ids2, "db2"),
      ]);
      const rows1 = a.status === "fulfilled" ? a.value : [];
      const rows2 = b.status === "fulfilled" ? b.value : [];
      merged = [...rows1, ...rows2];
    }

    // Filter results to match the actual IST date range (if custom dates were used)
    // DispatchDate values are in IST, so we compare IST dates
    let filteredMerged = merged;
    if (from && to && win.from && win.to) {
      // Use the original input dates (from/to) as target dates since they're already in YYYY-MM-DD format
      // These represent the IST dates the user selected
      const targetFromDate = from; // e.g., "2025-11-06"
      const targetToDate = to;     // e.g., "2025-11-06"
      
      filteredMerged = merged.filter(item => {
        if (!item.DispatchDate) return false;
        const dispatchDate = new Date(item.DispatchDate);
        // DispatchDate comes as UTC ISO string but represents IST time
        // To get IST date: add 5:30 hours to UTC time, then extract date
        const istTime = new Date(dispatchDate.getTime() + (5 * 60 + 30) * 60 * 1000);
        const dispatchDateISTStr = `${istTime.getUTCFullYear()}-${String(istTime.getUTCMonth() + 1).padStart(2, '0')}-${String(istTime.getUTCDate()).padStart(2, '0')}`;
        
        // Compare IST date strings (YYYY-MM-DD format)
        return dispatchDateISTStr >= targetFromDate && dispatchDateISTStr <= targetToDate;
      });
      
      req.log.info({
        msg: "[DISPATCHES] Filtered results for IST date range",
        beforeFilter: merged.length,
        afterFilter: filteredMerged.length,
        targetFromDate,
        targetToDate
      });
    }

    // global sort and keyset trim
    filteredMerged.sort((a, b) => {
      const da = new Date(a._cursorDate || 0).getTime();
      const dbb = new Date(b._cursorDate || 0).getTime();
      if (da !== dbb) return dbb - da;
      return (b._cursorId || 0) - (a._cursorId || 0);
    });

    req.log.info({
      msg: "[DISPATCHES] After merge and sort",
      totalMerged: filteredMerged.length,
      dateRange: {
        from: win.from?.toISOString(),
        to: win.to?.toISOString(),
        fromLocal: win.from?.toString(),
        toLocal: win.to?.toString()
      },
      allDispatchDates: filteredMerged.slice(0, 10).map(item => {
        const dispatchDate = item.DispatchDate ? new Date(item.DispatchDate) : null;
        const inRange = dispatchDate ? 
          (dispatchDate >= win.from && dispatchDate <= win.to) : 
          false;
        return {
          DispatchDate: item.DispatchDate,
          DispatchDateISO: dispatchDate?.toISOString() || null,
          DispatchDateLocal: dispatchDate?.toString() || null,
          inRange: inRange,
          comparison: dispatchDate ? {
            greaterThanOrEqualFrom: dispatchDate >= win.from,
            lessThanOrEqualTo: dispatchDate <= win.to
          } : null
        };
      })
    });

    const page = filteredMerged.slice(0, Number(limit));
    const last = page[page.length - 1];
    const nextCursor = last
      ? Buffer.from(`${last._cursorDate}|${last._cursorId}`, "utf8").toString(
          "base64"
        )
      : null;

    page.forEach((r) => {
      delete r._cursorDate;
      delete r._cursorId;
    });

    req.log.info({
      msg: "[DISPATCHES] Final response",
      itemCount: page.length,
      hasNextCursor: !!nextCursor,
      dateWindow: {
        from: win.from?.toISOString(),
        to: win.to?.toISOString(),
        fromLocal: win.from?.toString(),
        toLocal: win.to?.toString()
      },
      firstItem: page[0] ? {
        DispatchDate: page[0].DispatchDate,
        DispatchDateISO: page[0].DispatchDate ? new Date(page[0].DispatchDate).toISOString() : null,
        PODate: page[0].PODate,
        DispatchId: page[0].DispatchId
      } : null
    });

    return { items: page, nextCursor };
  });

  // GET /api/otif?range=3m&q=&limit=50&cursor=base64(date|id)&source=db1|db2
  // Also supports: /api/otif?from=YYYY-MM-DD&to=YYYY-MM-DD for custom date ranges
  fastify.get("/otif", async (req, reply) => {
    const { range = "3m", q = "", limit = "50", cursor, source, from, to } = req.query || {};

    req.log.info({
      msg: "[OTIF] Request received",
      range,
      from,
      to,
      q,
      limit,
      cursor: cursor ? "present" : "none",
      source,
      email: req.user?.email
    });

    // Support custom date range with from/to parameters
    // OTIF data dates are returned in IST (UTC+5:30), so we parse dates in IST
    let win;
    if (from && to) {
      try {
        // Parse dates as IST dates (UTC+5:30)
        // For a date like 2025-11-06:
        // - Start: Nov 6 00:00:00 IST = Nov 5 18:30:00 UTC
        // - End: Nov 6 23:59:59.999 IST = Nov 6 18:29:59.999 UTC
        const parseDateStringIST = (dateStr, isEndOfDay = false) => {
          // Parse YYYY-MM-DD format
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
            const day = parseInt(parts[2], 10);
            
            if (isEndOfDay) {
              // End of day in IST: 23:59:59.999 IST = 18:29:59.999 UTC (same day)
              return new Date(Date.UTC(year, month, day, 18, 29, 59, 999));
            } else {
              // Start of day in IST: 00:00:00 IST = 18:30:00 UTC (previous day)
              // So for Nov 6 IST, we use Nov 5 18:30:00 UTC
              const utcDate = new Date(Date.UTC(year, month, day, 18, 30, 0, 0));
              // Subtract 1 day to get the previous day's 18:30 UTC
              utcDate.setUTCDate(utcDate.getUTCDate() - 1);
              return utcDate;
            }
          }
          // Fallback to regular parsing
          return new Date(dateStr);
        };
        
        const fromDate = parseDateStringIST(from, false); // Start of day IST
        const toDate = parseDateStringIST(to, true); // End of day IST
        
        win = { from: fromDate, to: toDate };
        req.log.info({
          msg: "[OTIF] Custom date range parsed in IST",
          fromParam: from,
          toParam: to,
          fromDate: win.from.toISOString(),
          toDate: win.to.toISOString(),
          fromDateIST: `${win.from.getUTCFullYear()}-${String(win.from.getUTCMonth() + 1).padStart(2, '0')}-${String(win.from.getUTCDate()).padStart(2, '0')} ${String(win.from.getUTCHours()).padStart(2, '0')}:${String(win.from.getUTCMinutes()).padStart(2, '0')}:${String(win.from.getUTCSeconds()).padStart(2, '0')} IST`,
          toDateIST: `${win.to.getUTCFullYear()}-${String(win.to.getUTCMonth() + 1).padStart(2, '0')}-${String(win.to.getUTCDate()).padStart(2, '0')} ${String(win.to.getUTCHours()).padStart(2, '0')}:${String(win.to.getUTCMinutes()).padStart(2, '0')}:${String(win.to.getUTCSeconds()).padStart(2, '0')} IST`
        });
      } catch (err) {
        req.log.warn({
          msg: "[OTIF] Failed to parse custom dates, falling back to range",
          error: err.message
        });
        win = parseRange(String(range));
      }
    } else {
      win = parseRange(String(range));
      req.log.info({
        msg: "[OTIF] Predefined range parsed",
        range,
        fromDate: win.from?.toISOString(),
        toDate: win.to?.toISOString(),
        fromDateLocal: win.from?.toString(),
        toDateLocal: win.to?.toString()
      });
    }

    // decode cursor: base64("isoDate|id")
    let after = null;
    if (cursor) {
      try {
        const [d, id] = Buffer.from(String(cursor), "base64")
          .toString("utf8")
          .split("|");
        after = { date: new Date(d), id: Number(id) };
      } catch {
        // ignore bad cursor
      }
    }

    const mongo = await getDb();
    const tenant = await mongo
      .collection("tenants")
      .findOne({ email: req.user.email });
    if (!tenant)
      return reply.code(400).send({ error: "Tenant binding missing" });

    const ids1 = tenant.ledgerIds_db1 || [];
    const ids2 = tenant.ledgerIds_db2 || [];

    const tvp = (ids) => {
      const t = new sql.Table("dbo.IdList");
      t.columns.add("Id", sql.Int, { nullable: false });
      (ids || []).forEach((id) => t.rows.add(id));
      return t;
    };

    const execOne = async (pool, ids, tag) => {
      if (!ids || !ids.length) return [];
      const r = (await pool).request();
      
      // For sql.Date, extract the date part from IST dates
      // Since OTIF data dates are returned in IST, we extract the IST date components
      let fromDateParam = null;
      let toDateParam = null;
      
      if (win.from) {
        // win.from represents start of day in IST
        // Extract the date components and create a date for SQL Server
        const fromYear = win.from.getUTCFullYear();
        const fromMonth = win.from.getUTCMonth();
        const fromDay = win.from.getUTCDate();
        // For Nov 6 IST start (which is Nov 5 18:30 UTC), we want to query from Nov 5
        fromDateParam = new Date(Date.UTC(fromYear, fromMonth, fromDay, 0, 0, 0, 0));
      }
      
      if (win.to) {
        // win.to represents end of day in IST
        const toYear = win.to.getUTCFullYear();
        const toMonth = win.to.getUTCMonth();
        const toDay = win.to.getUTCDate();
        // For Nov 6 IST end (which is Nov 6 18:29 UTC), we want to query to Nov 6
        toDateParam = new Date(Date.UTC(toYear, toMonth, toDay, 23, 59, 59, 999));
      }
      
      req.log.info({
        msg: `[OTIF] Executing stored procedure for ${tag}`,
        ledgerIdsCount: ids.length,
        originalFromDate: win.from ? win.from.toISOString() : null,
        originalToDate: win.to ? win.to.toISOString() : null,
        fromDateParam: fromDateParam ? fromDateParam.toISOString() : null,
        toDateParam: toDateParam ? toDateParam.toISOString() : null,
        fromDateLocal: fromDateParam ? fromDateParam.toString() : null,
        toDateLocal: toDateParam ? toDateParam.toString() : null,
        fromDateSQL: fromDateParam ? `${fromDateParam.getFullYear()}-${String(fromDateParam.getMonth() + 1).padStart(2, '0')}-${String(fromDateParam.getDate()).padStart(2, '0')}` : null,
        toDateSQL: toDateParam ? `${toDateParam.getFullYear()}-${String(toDateParam.getMonth() + 1).padStart(2, '0')}-${String(toDateParam.getDate()).padStart(2, '0')}` : null,
        search: q || "",
        afterDate: after?.date ? after.date.toISOString() : null,
        afterId: after?.id || null,
        limit: Number(limit) + 5
      });
      
      r.input("LedgerIds", tvp(ids));
      r.input("FromDate", sql.Date, fromDateParam);
      r.input("ToDate", sql.Date, toDateParam);
      r.input("Search", sql.NVarChar(100), q || "");
      r.input("AfterDate", sql.DateTime2, after?.date || null);
      r.input("AfterId", sql.Int, after?.id || null);
      r.input("Limit", sql.Int, Number(limit) + 5);

      const rs = await r.execute("dbo.portal_otif_list");
      const rows = rs.recordset || [];
      
      req.log.info({
        msg: `[OTIF] Stored procedure result for ${tag}`,
        rowCount: rows.length,
        sampleDates: rows.slice(0, 5).map(row => ({
          PODate: row.PODate,
          ApprovalDate: row.ApprovalDate,
          CommittedDeliveryDate: row.CommittedDeliveryDate,
          LastDeliveryDate: row.LastDeliveryDate,
          PONumber: row.PONumber,
          JobCardNumber: row.JobCardNumber
        }))
      });
      
      rows.forEach((row) => (row._source = tag));
      return rows;
    };

    let merged = [];
    if (source === "db1") {
      merged = await execOne(db1(), ids1, "db1");
    } else if (source === "db2") {
      merged = await execOne(db2(), ids2, "db2");
    } else {
      const [a, b] = await Promise.allSettled([
        execOne(db1(), ids1, "db1"),
        execOne(db2(), ids2, "db2"),
      ]);
      const rows1 = a.status === "fulfilled" ? a.value : [];
      const rows2 = b.status === "fulfilled" ? b.value : [];
      merged = [...rows1, ...rows2];
    }

    // Filter results to match the actual IST date range (if custom dates were used)
    // OTIF data dates are in IST, so we compare IST dates
    let filteredMerged = merged;
    if (from && to && win.from && win.to) {
      // Use the original input dates (from/to) as target dates since they're already in YYYY-MM-DD format
      // These represent the IST dates the user selected
      const targetFromDate = from; // e.g., "2025-11-06"
      const targetToDate = to;     // e.g., "2025-11-06"
      
      filteredMerged = merged.filter(item => {
        // Filter by PODate (primary date field for OTIF)
        if (!item.PODate) return false;
        const poDate = new Date(item.PODate);
        // PODate comes as UTC ISO string but represents IST time
        // To get IST date: add 5:30 hours to UTC time, then extract date
        const istTime = new Date(poDate.getTime() + (5 * 60 + 30) * 60 * 1000);
        const poDateISTStr = `${istTime.getUTCFullYear()}-${String(istTime.getUTCMonth() + 1).padStart(2, '0')}-${String(istTime.getUTCDate()).padStart(2, '0')}`;
        
        // Compare IST date strings (YYYY-MM-DD format)
        return poDateISTStr >= targetFromDate && poDateISTStr <= targetToDate;
      });
      
      req.log.info({
        msg: "[OTIF] Filtered results for IST date range",
        beforeFilter: merged.length,
        afterFilter: filteredMerged.length,
        targetFromDate,
        targetToDate
      });
    }

    // global sort + page trim
    filteredMerged.sort((a, b) => {
      const da = new Date(a._cursorDate || 0).getTime();
      const dbb = new Date(b._cursorDate || 0).getTime();
      if (da !== dbb) return dbb - da;
      return (b._cursorId || 0) - (a._cursorId || 0);
    });

    const page = filteredMerged.slice(0, Number(limit));
    const last = page[page.length - 1];
    const nextCursor = last
      ? Buffer.from(`${last._cursorDate}|${last._cursorId}`, "utf8").toString(
          "base64"
        )
      : null;

    page.forEach((r) => {
      delete r._cursorDate;
      delete r._cursorId;
    });

    req.log.info({
      msg: "[OTIF] Final response",
      itemCount: page.length,
      hasNextCursor: !!nextCursor,
      dateWindow: {
        from: win.from?.toISOString(),
        to: win.to?.toISOString(),
        fromLocal: win.from?.toString(),
        toLocal: win.to?.toString()
      },
      firstItem: page[0] ? {
        PONumber: page[0].PONumber,
        PODate: page[0].PODate,
        PODateISO: page[0].PODate ? new Date(page[0].PODate).toISOString() : null,
        JobCardNumber: page[0].JobCardNumber,
        OrderStatus: page[0].OrderStatus
      } : null
    });

    return { items: page, nextCursor };
  });

  // POST /api/telemetry/page (client-side SPA page views)
  fastify.post("/telemetry/page", async (req, reply) => {
    try {
      const db = await getDb();
      const { path, title } = req.body || {};
      const ip = (
        req.headers["x-forwarded-for"]?.split(",")[0] ||
        req.ip ||
        ""
      ).trim();
      const ua = req.headers["user-agent"] || "";
      const email = req.user?.email || null;
      const sessionId = req.headers["x-session-id"] || null;

      await db.collection("events").insertOne({
        type: "page",
        email,
        sessionId,
        path: String(path || ""),
        title: title || null,
        ts: new Date(),
        ip,
        userAgent: ua,
      });

      if (sessionId) {
        await db
          .collection("sessions")
          .updateOne({ sessionId }, { $set: { lastActive: new Date() } });
      }

      return { ok: true };
    } catch (e) {
      req.log.error(e);
      return reply.code(500).send({ error: "telemetry failed" });
    }
  });
}

// server.js
import "dotenv/config";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import sql from "mssql";
import { getDb, getTenantByCustomerKey, closeMongo } from "./lib/mongo.js";
import { db1 } from "./lib/db1.js";
import { db2 } from "./lib/db2.js";
import { resolveRange } from "./lib/dateRange.js";
import { encodeCursor, decodeCursor } from "./lib/cursor.js";
import { mergeSorted } from "./lib/merge.js";

const app = Fastify({ logger: true });
const JWT_SECRET = process.env.JWT_SECRET;

// public
app.get("/api/health", async () => ({
  ok: true,
  ts: new Date().toISOString(),
}));

function clientInfo(req) {
  const ip = (
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.ip ||
    ""
  ).trim();
  const ua = req.headers["user-agent"] || "";
  return { ip, ua };
}

async function tryValidate(poolFactory, email, key) {
  try {
    const pool = await poolFactory();
    if (!pool)
      return { ok: false, ledgers: [], csv: "", message: "DB not configured" };
    return await validateEmailKey(pool, email, key);
  } catch (e) {
    return {
      ok: false,
      ledgers: [],
      csv: "",
      message: e.message || "DB error",
    };
  }
}

async function validateEmailKey(pool, email, key) {
  const r = pool.request();
  r.input("Email", sql.NVarChar(320), email.trim().toLowerCase());
  r.input("CustomerKey", sql.NVarChar(50), key);
  r.output("IsSuccess", sql.Bit);
  r.output("LedgerIDsCsv", sql.NVarChar(sql.MAX));
  r.output("Message", sql.NVarChar(200));
  const rs = await r.execute("dbo.portal_validate_email_key");
  return {
    ok: !!rs.output.IsSuccess,
    csv: rs.output.LedgerIDsCsv || "",
    message: rs.output.Message || "",
    ledgers: rs.recordset?.map((x) => x.LedgerID) || [],
  };
}
app.post("/api/auth/register-email", async (req, reply) => {
  try {
    const { email, password, customer_key } = req.body || {};
    const emailNorm = String(email || "")
      .trim()
      .toLowerCase();

    if (!emailNorm || !emailNorm.includes("@"))
      return reply.code(400).send({ error: "Valid email is required" });
    if (!password || String(password).length < 6)
      return reply
        .code(400)
        .send({ error: "Password must be at least 6 chars" });
    if (!customer_key)
      return reply.code(400).send({ error: "customer_key is required" });

    const mongo = await getDb();
    if (await mongo.collection("users").findOne({ email: emailNorm })) {
      return reply
        .code(409)
        .send({ error: "This email is already registered" });
    }

    // validate in both DBs, but succeed if either is ok
    const [v1, v2] = await Promise.all([
      tryValidate(db1, emailNorm, customer_key),
      tryValidate(db2, emailNorm, customer_key),
    ]);

    const ok1 = v1.ok && v1.ledgers?.length > 0;
    const ok2 = v2.ok && v2.ledgers?.length > 0;

    if (!ok1 && !ok2) {
      const msg = [
        v1.message && `DB1: ${v1.message}`,
        v2.message && `DB2: ${v2.message}`,
      ]
        .filter(Boolean)
        .join(" | ");
      return reply.code(400).send({ error: msg || "Validation failed" });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const now = new Date();

    await mongo
      .collection("users")
      .insertOne({ email: emailNorm, password_hash, createdAt: now });
    await mongo.collection("tenants").insertOne({
      email: emailNorm,
      customer_key,
      ledgerIds_db1: ok1 ? v1.ledgers : [],
      ledgerIds_db2: ok2 ? v2.ledgers : [],
      ledgerIds_db1_csv: ok1 ? v1.csv : "",
      ledgerIds_db2_csv: ok2 ? v2.csv : "",
      has_db1: !!ok1,
      has_db2: !!ok2,
      createdAt: now,
    });

    const token = jwt.sign({ email: emailNorm }, process.env.JWT_SECRET, {
      expiresIn: "2h",
    });
    return reply.code(201).send({
      ok: true,
      token,
      tenant: {
        email: emailNorm,
        customer_key,
        has_db1: !!ok1,
        has_db2: !!ok2,
        ledgerIds_db1: ok1 ? v1.ledgers : [],
        ledgerIds_db2: ok2 ? v2.ledgers : [],
      },
    });
  } catch (e) {
    req.log.error(e);
    return reply
      .code(500)
      .send({ error: "Registration failed", detail: e.message || String(e) });
  }
});

app.post("/api/auth/login-email", async (req, reply) => {
  const { email, password } = req.body || {};
  const emailNorm = String(email || "")
    .trim()
    .toLowerCase();
  if (!emailNorm || !password)
    return reply.code(400).send({ error: "Email and password required" });

  const db = await getDb();
  const u = await db.collection("users").findOne({ email: emailNorm });
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    return reply.code(401).send({ error: "Invalid email or password" });
  }

  const token = jwt.sign({ email: emailNorm }, JWT_SECRET, { expiresIn: "2h" });

  // create session doc
  const { ip, ua } = clientInfo(req);
  const sessionId = crypto.randomUUID(); // Node 22+
  const now = new Date();
  await db.collection("sessions").insertOne({
    sessionId,
    email: emailNorm,
    loginAt: now,
    lastActive: now,
    ip,
    userAgent: ua,
  });

  // Optional: add a login event
  await db.collection("events").insertOne({
    type: "login",
    email: emailNorm,
    sessionId,
    path: "/api/auth/login-email",
    method: "POST",
    ts: now,
    ip,
    userAgent: ua,
  });

  return { token, sessionId, user: { email: emailNorm } };
});

// auth guard
app.addHook("preHandler", async (req, reply) => {
  if (!req.url.startsWith("/api/")) return;
  if (req.url.startsWith("/api/health") || req.url.startsWith("/api/auth"))
    return;
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return reply.code(401).send({ error: "No token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    return reply.code(401).send({ error: "Invalid token" });
  }
});

// Track duration
app.addHook("onRequest", async (req, reply) => {
  req._start = Date.now();
});

// Log event after response
app.addHook("onResponse", async (req, reply) => {
  try {
    // Skip health
    if (req.url.startsWith("/api/health")) return;

    const db = await getDb();
    const { ip, ua } = clientInfo(req);
    const email = req.user?.email || null;
    const durationMs = req._start ? Date.now() - req._start : null;

    await db.collection("events").insertOne({
      type: "api", // or 'page' for client telemetry (below)
      email,
      sessionId: req.headers["x-session-id"] || null, // FE can pass it
      path: req.url.split("?")[0],
      method: req.method,
      status: reply.statusCode,
      durationMs,
      ts: new Date(),
      ip,
      userAgent: ua,
      // lightweight additional context (optional):
      q: Object.keys(req.query || {}).length ? req.query : undefined,
    });

    // Best-effort: bump lastActive if we have a session
    const sid = req.headers["x-session-id"];
    if (sid) {
      await db
        .collection("sessions")
        .updateOne({ sessionId: sid }, { $set: { lastActive: new Date() } });
    }
  } catch (_) {
    // Avoid throwing from analytics
  }
});

app.post("/api/telemetry/page", async (req, reply) => {
  try {
    const db = await getDb();
    const { path, title } = req.body || {};
    const { ip, ua } = clientInfo(req);
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

app.post("/api/auth/logout", async (req, reply) => {
  const db = await getDb();
  const { sessionId } = req.body || {};
  if (sessionId) {
    await db.collection("events").insertOne({
      type: "logout",
      email: req.user?.email || null,
      sessionId,
      path: "/api/auth/logout",
      method: "POST",
      ts: new Date(),
      ...clientInfo(req),
    });
    await db
      .collection("sessions")
      .updateOne(
        { sessionId },
        { $set: { lastActive: new Date(), logoutAt: new Date() } }
      );
  }
  return { ok: true };
});
function parseRange(range) {
  const now = new Date();
  const y = now.getFullYear();
  const startOfYear = new Date(y, 0, 1);
  const endOfYear = new Date(y, 11, 31);
  const lastYearStart = new Date(y - 1, 0, 1);
  const lastYearEnd = new Date(y - 1, 11, 31);

  const map = {
    "1m": 30,
    "3m": 90,
    "6m": 180,
    "12m": 365,
  };
  if (range in map) {
    const d = new Date(now);
    d.setDate(d.getDate() - map[range]);
    return { from: d, to: now };
  }
  if (range === "thisyear") return { from: startOfYear, to: endOfYear };
  if (range === "lastyear") return { from: lastYearStart, to: lastYearEnd };
  // default 3m
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
  { from, to, status, q, cursor, limit }
) {
  if (!ledgerIds || ledgerIds.length === 0) return [];
  const r = (await pool).request();
  r.input("LedgerIds", toIdListTVP(ledgerIds));
  r.input("FromDate", sql.Date, from ? new Date(from) : null);
  r.input("ToDate", sql.Date, to ? new Date(to) : null);
  r.input("Status", sql.VarChar(12), status);
  r.input("Search", sql.NVarChar(100), q || "");
  r.input("AfterDate", sql.DateTime2, cursor?.date || null);
  r.input("AfterJobId", sql.Int, cursor?.id || null);
  r.input("Limit", sql.Int, Number(limit) + 5); // fetch a few extra to merge
  const rs = await r.execute("dbo.portal_orders_list");
  return rs.recordset || [];
}

app.get("/api/orders", async (req, reply) => {
  const {
    tab = "all",
    range = "3m",
    q = "",
    limit = "25",
    cursor,
  } = req.query || {};
  const status = ["all", "pending", "completed"].includes(
    String(tab).toLowerCase()
  )
    ? String(tab).toLowerCase()
    : "all";
  const win = parseRange(String(range));

  // parse cursor if present: cursor=base64('date|id')
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
  if (!tenant) return reply.code(400).send({ error: "Tenant binding missing" });

  const ids1 = tenant.ledgerIds_db1 || [];
  const ids2 = tenant.ledgerIds_db2 || [];

  const [rows1, rows2] = await Promise.all([
    callOrders(db1(), ids1, {
      from: win.from,
      to: win.to,
      status,
      q,
      cursor: cur,
      limit,
    }),
    callOrders(db2(), ids2, {
      from: win.from,
      to: win.to,
      status,
      q,
      cursor: cur,
      limit,
    }),
  ]);

  // merge + sort (date desc, id desc)
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

  // Optional: strip internal fields
  page.forEach((r) => {
    delete r._cursorDate;
    delete r._cursorId;
  });

  return { items: page, nextCursor };
});

// start + graceful shutdown
const port = process.env.PORT || 8080;
app
  .listen({ port, host: "0.0.0.0" })
  .then(() => app.log.info(`API http://localhost:${port}`))
  .catch((e) => {
    app.log.error(e);
    process.exit(1);
  });
process.on("SIGINT", async () => {
  await closeMongo();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await closeMongo();
  process.exit(0);
});

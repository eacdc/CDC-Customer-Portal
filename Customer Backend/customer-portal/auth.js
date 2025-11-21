// auth.js
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import sql from "mssql";
import crypto from "node:crypto";
import { getDb } from "./lib/mongo.js";
import { db1 } from "./lib/db1.js";
import { db2 } from "./lib/db2.js";

// helper: pull client info from request
function clientInfo(req) {
  const ip = (
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.ip ||
    ""
  ).trim();
  const ua = req.headers["user-agent"] || "";
  return { ip, ua };
}

function extractLedgerData(recordset = []) {
  const unique = new Map();
  for (const row of recordset || []) {
    const id = Number(row?.LedgerID);
    if (!Number.isFinite(id)) continue;
    const nameValue =
      typeof row?.LedgerName === "string" && row.LedgerName.trim().length
        ? row.LedgerName.trim()
        : null;
    if (!unique.has(id)) {
      unique.set(id, nameValue);
    } else if (!unique.get(id) && nameValue) {
      unique.set(id, nameValue);
    }
  }
  return {
    ledgers: Array.from(unique.keys()),
    ledgerNames: Array.from(unique.values()).map((name) => name || null),
  };
}

async function validateEmailKey(pool, email, key) {
  const r = pool.request();
  r.input("Email", sql.NVarChar(320), email.trim().toLowerCase());
  r.input("CustomerKey", sql.NVarChar(50), key);
  r.output("IsSuccess", sql.Bit);
  r.output("LedgerIDsCsv", sql.NVarChar(sql.MAX));
  r.output("Message", sql.NVarChar(200));
  r.output("ContactName", sql.NVarChar(200));
  const rs = await r.execute("dbo.portal_validate_email_key");
  const ledgerData = extractLedgerData(rs.recordset);
  return {
    ok: !!rs.output.IsSuccess,
    csv: rs.output.LedgerIDsCsv || "",
    message: rs.output.Message || "",
    contactName: rs.output.ContactName || "",
    ledgers: ledgerData.ledgers,
    ledgerNames: ledgerData.ledgerNames,
  };
}

async function tryValidate(poolFactory, email, key) {
  try {
    const pool = await poolFactory();
    if (!pool)
      return { ok: false, ledgers: [], csv: "", message: "DB not configured", contactName: "" };
    return await validateEmailKey(pool, email, key);
  } catch (e) {
    return {
      ok: false,
      ledgers: [],
      csv: "",
      message: e.message || "DB error",
      contactName: "",
    };
  }
}

export default async function authPlugin(fastify, opts) {
  const JWT_SECRET = process.env.JWT_SECRET;

  // POST /api/auth/register-email
  fastify.post("/register-email", async (req, reply) => {
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

      // Get ContactName from the successful validation (prioritize v1 if both succeed)
      const contactName = (ok1 ? v1.contactName : v2.contactName) || "";

      const password_hash = await bcrypt.hash(password, 10);
      const now = new Date();

      await mongo
        .collection("users")
        .insertOne({ 
          email: emailNorm, 
          password_hash, 
          contactName,
          createdAt: now 
        });
      await mongo.collection("tenants").insertOne({
        email: emailNorm,
        customer_key,
        contactName,
        ledgerIds_db1: ok1 ? v1.ledgers : [],
        ledgerIds_db2: ok2 ? v2.ledgers : [],
        ledgerNames_db1: ok1 ? v1.ledgerNames : [],
        ledgerNames_db2: ok2 ? v2.ledgerNames : [],
        ledgerIds_db1_csv: ok1 ? v1.csv : "",
        ledgerIds_db2_csv: ok2 ? v2.csv : "",
        has_db1: !!ok1,
        has_db2: !!ok2,
        createdAt: now,
      });

      const token = jwt.sign({ email: emailNorm }, JWT_SECRET, {
        expiresIn: "2h",
      });
      return reply.code(201).send({
        ok: true,
        token,
        user: {
          email: emailNorm,
          contactName: contactName || emailNorm.split("@")[0],
        },
        tenant: {
          email: emailNorm,
          customer_key,
          contactName,
          has_db1: !!ok1,
          has_db2: !!ok2,
          ledgerIds_db1: ok1 ? v1.ledgers : [],
          ledgerIds_db2: ok2 ? v2.ledgers : [],
          ledgerNames_db1: ok1 ? v1.ledgerNames : [],
          ledgerNames_db2: ok2 ? v2.ledgerNames : [],
        },
      });
    } catch (e) {
      req.log.error(e);
      return reply
        .code(500)
        .send({ error: "Registration failed", detail: e.message || String(e) });
    }
  });

  // POST /api/auth/login-email

  fastify.post("/login-email", async (req, reply) => {
    const { email, password } = req.body || {};
    const emailNorm = String(email || "").trim().toLowerCase();

    if (!emailNorm || !password) {
      return reply.code(400).send({ error: "Email and password required" });
    }

    const db = await getDb();
    const u = await db.collection("users").findOne({ email: emailNorm });
    if (!u || !(await bcrypt.compare(password, u.password_hash))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    // 🔄 Refresh ledger IDs from MSSQL
    const [v1, v2] = await Promise.all([
      tryFetchLedgers(db1, emailNorm),
      tryFetchLedgers(db2, emailNorm),
    ]);

    const ok1 = v1.ok && v1.ledgers?.length > 0;
    const ok2 = v2.ok && v2.ledgers?.length > 0;

    const now = new Date();
    const { ip, ua } = clientInfo(req);
    const sessionId = crypto.randomUUID();

    // 📌 Update tenant with latest ledger IDs (keep existing customer_key)
    const tenant = await db.collection("tenants").findOne({ email: emailNorm });
    const contactName =
      (tenant?.contactName && String(tenant.contactName).trim()) ||
      (u.contactName && String(u.contactName).trim()) ||
      "";

    const tenantUpdate = {
      // do not overwrite customer_key here; preserve existing if present
      updatedAt: now,
      has_db1: !!ok1,
      has_db2: !!ok2,
      ledgerIds_db1: ok1 ? v1.ledgers : [],
      ledgerIds_db2: ok2 ? v2.ledgers : [],
      ledgerNames_db1: ok1 ? v1.ledgerNames : [],
      ledgerNames_db2: ok2 ? v2.ledgerNames : [],
      ledgerIds_db1_csv: ok1 ? v1.csv : "",
      ledgerIds_db2_csv: ok2 ? v2.csv : "",
    };

    if (contactName) {
      tenantUpdate.contactName = contactName;
    }

    if (tenant) {
      await db.collection("tenants").updateOne(
        { email: emailNorm },
        { $set: tenantUpdate }
      );
    } else {
      // Fallback: if somehow tenant is missing but user exists, recreate a minimal tenant
      await db.collection("tenants").insertOne({
        email: emailNorm,
        customer_key: null, // unknown at login; can be filled later if needed
        contactName: contactName || null,
        createdAt: now,
        ...tenantUpdate,
      });
    }

    // 🔐 JWT + session logging (same as before)
    const token = jwt.sign({ email: emailNorm }, JWT_SECRET, {
      expiresIn: "30d",
    });

    await db.collection("sessions").insertOne({
      sessionId,
      email: emailNorm,
      loginAt: now,
      lastActive: now,
      ip,
      userAgent: ua,
    });

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

    // build final tenant view to return
    const tenantFinal = {
      email: emailNorm,
      customer_key: tenant?.customer_key || null,
      has_db1: !!ok1,
      has_db2: !!ok2,
      ledgerIds_db1: ok1 ? v1.ledgers : [],
      ledgerIds_db2: ok2 ? v2.ledgers : [],
      ledgerNames_db1: ok1 ? v1.ledgerNames : [],
      ledgerNames_db2: ok2 ? v2.ledgerNames : [],
      contactName: contactName || null,
    };

    const friendlyName = contactName || emailNorm.split("@")[0];

    return {
      token,
      sessionId,
      user: { email: emailNorm, contactName: friendlyName },
      tenant: tenantFinal,
    };
  });

  // POST /api/auth/logout  (requires auth guard in server.js)
  fastify.post("/logout", async (req, reply) => {
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
}

async function fetchLedgersForEmail(pool, email) {
  const r = pool.request();
  r.input("Email", sql.NVarChar(320), email.trim().toLowerCase());
  r.output("IsSuccess", sql.Bit);
  r.output("LedgerIDsCsv", sql.NVarChar(sql.MAX));
  r.output("Message", sql.NVarChar(200));

  const rs = await r.execute("dbo.portal_get_ledgers_for_email");
  const ledgerData = extractLedgerData(rs.recordset);

  return {
    ok: !!rs.output.IsSuccess,
    csv: rs.output.LedgerIDsCsv || "",
    message: rs.output.Message || "",
    ledgers: ledgerData.ledgers,
    ledgerNames: ledgerData.ledgerNames,
  };
}

async function tryFetchLedgers(poolFactory, email) {
  try {
    const pool = await poolFactory();
    if (!pool) {
      return { ok: false, ledgers: [], csv: "", message: "DB not configured" };
    }
    return await fetchLedgersForEmail(pool, email);
  } catch (e) {
    return {
      ok: false,
      ledgers: [],
      csv: "",
      message: e.message || "DB error",
    };
  }
}


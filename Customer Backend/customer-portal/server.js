// server.js
import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "jsonwebtoken";
import { getDb, closeMongo } from "./lib/mongo.js";
import { clientInfo } from "./utils/clientInfo.js"; // optional tiny util; see note below
import authPlugin from "./auth.js";
import portalApiPlugin from "./portalapi.js";

const app = Fastify({ logger: true });
const JWT_SECRET = process.env.JWT_SECRET;

// --- CORS
const allowOrigin =
  process.env.CORS_ORIGIN === "*"
    ? true
    : process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : true;
await app.register(cors, {
  origin: allowOrigin,
  credentials: false,
});

// public
app.get("/api/health", async () => ({
  ok: true,
  ts: new Date().toISOString(),
}));

// --- Auth guard (applies to ALL non-auth API routes)
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

// --- Analytics: duration start
app.addHook("onRequest", async (req) => {
  req._start = Date.now();
});

// --- Analytics: log every API call to Mongo
app.addHook("onResponse", async (req, reply) => {
  try {
    if (!req.url.startsWith("/api/")) return; // only APIs
    if (req.url.startsWith("/api/health")) return;

    const db = await getDb();
    const { ip, ua } = clientInfo(req);
    const email = req.user?.email || null;
    const durationMs = req._start ? Date.now() - req._start : null;

    await db.collection("events").insertOne({
      type: "api",
      email,
      sessionId: req.headers["x-session-id"] || null,
      path: req.url.split("?")[0],
      method: req.method,
      status: reply.statusCode,
      durationMs,
      ts: new Date(),
      ip,
      userAgent: ua,
      q: Object.keys(req.query || {}).length ? req.query : undefined,
    });

    const sid = req.headers["x-session-id"];
    if (sid) {
      await db
        .collection("sessions")
        .updateOne({ sessionId: sid }, { $set: { lastActive: new Date() } });
    }
  } catch {
    // never block response due to analytics error
  }
});

// --- Mount route plugins
await app.register(authPlugin, { prefix: "/api/auth" });
await app.register(portalApiPlugin, { prefix: "/api" });

// --- start + graceful shutdown
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

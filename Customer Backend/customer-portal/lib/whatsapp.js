/**
 * WhatsApp helpers for the customer-portal backend.
 *
 * Provides:
 *   - getGupshupConfig() / assertGupshupConfigured()
 *   - sendGupshupMessage(toPhone, text)
 *   - extractInboundMessage(rawBody)            -> normalised inbound or null (non-message events)
 *   - markProcessedOrReturnDuplicate(gupshupMsgId) -> true if duplicate (idempotency guard)
 *   - getWhatsAppHistoryForAgent(phone, agentKey, limit)
 *   - getWhatsAppHistoryForClassifier(phone, limit)
 *   - appendWhatsAppMessages(phone, messages)
 *   - logWhatsAppInvocation(entry)
 *
 * MongoDB collections used (all created on first write):
 *   whatsapp_sessions       — one doc per phone, holding the rolling message array
 *   whatsapp_inbox          — dedupe ledger (Gupshup message ids, with TTL)
 *   whatsapp_logs           — one doc per processed inbound message (classifier choice + final agent + duration)
 */

import { getDb } from "./mongo.js";

/** Allowed agent keys the WhatsApp classifier may select.
 *  order-status is intentionally excluded until WhatsApp identity-lookup is wired up. */
export const WHATSAPP_ALLOWED_AGENT_KEYS = ["book-quote", "packaging-quote", "cdc-info"];

/** Fallback used when the classifier returns nothing usable. */
export const WHATSAPP_DEFAULT_AGENT_KEY = "cdc-info";

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export function getGupshupConfig() {
  return {
    apiKey: (process.env.GUPSHUP_API_KEY || "").trim(),
    appName: (process.env.GUPSHUP_APP_NAME || "").trim(),
    source: (process.env.GUPSHUP_SOURCE_NUMBER || "").trim(),
  };
}

export function assertGupshupConfigured() {
  const cfg = getGupshupConfig();
  const missing = [];
  if (!cfg.apiKey) missing.push("GUPSHUP_API_KEY");
  if (!cfg.appName) missing.push("GUPSHUP_APP_NAME");
  if (!cfg.source) missing.push("GUPSHUP_SOURCE_NUMBER");
  if (missing.length > 0) {
    const err = new Error(`Gupshup not configured: missing ${missing.join(", ")}`);
    err.code = "GUPSHUP_NOT_CONFIGURED";
    throw err;
  }
  return cfg;
}

// ---------------------------------------------------------------------------
// Outbound: send a text message via Gupshup
// ---------------------------------------------------------------------------

/**
 * Send a plain-text WhatsApp message via the Gupshup HTTP API.
 * @param {string} toPhone  destination number, digits only (e.g. "919XXXXXXXXX")
 * @param {string} text     message body
 * @returns {Promise<{ok: boolean, status: number, body: string}>}
 */
export async function sendGupshupMessage(toPhone, text) {
  const cfg = assertGupshupConfigured();
  if (!toPhone || !String(toPhone).trim()) {
    throw new Error("sendGupshupMessage: toPhone is required");
  }
  if (!text || !String(text).trim()) {
    throw new Error("sendGupshupMessage: text is required");
  }

  const params = new URLSearchParams();
  params.append("channel", "whatsapp");
  params.append("source", cfg.source);
  params.append("destination", String(toPhone).trim());
  params.append("src.name", cfg.appName);
  params.append("message", JSON.stringify({ type: "text", text: String(text) }));

  const res = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      apikey: cfg.apiKey,
    },
    body: params.toString(),
  });
  const body = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body };
}

// ---------------------------------------------------------------------------
// Inbound: normalise a Gupshup webhook payload
// ---------------------------------------------------------------------------

/**
 * Parse a Gupshup webhook body and return a normalised inbound message,
 * or null when the body is not an actionable inbound text message
 * (status updates, message-events, user-events, media-only messages …).
 *
 * @param {Object|string} raw raw body (object or JSON string)
 * @returns {{phone: string, text: string, messageId: string, type: string} | null}
 */
export function extractInboundMessage(raw) {
  let body = raw;
  if (typeof raw === "string") {
    try { body = JSON.parse(raw); } catch { return null; }
  }
  if (!body || typeof body !== "object") return null;

  // Gupshup wraps message events under { type: "message", payload: { ... } }.
  // Other events ("user-event", "message-event", "billing-event", …) are not user input.
  if (body.type !== "message" || !body.payload) return null;

  const p = body.payload;
  const phone = String(p?.sender?.phone || p?.source || "").trim();
  const messageId = String(p?.id || "").trim();
  const type = String(p?.type || "").trim();

  if (!phone || !messageId) return null;

  let text = "";
  let audioUrl = null;

  if (type === "text") {
    text = String(p?.payload?.text || "").trim();
  } else if (type === "audio" || type === "voice") {
    // Gupshup provides the media URL in payload.url for audio/voice messages.
    audioUrl = String(p?.payload?.url || p?.payload?.mediaUrl || "").trim() || null;
  } else {
    // Image, location, sticker, document, etc. — not handled.
    return { phone, text: "", messageId, type };
  }

  return { phone, text, messageId, type, audioUrl };
}

// ---------------------------------------------------------------------------
// Idempotency: Gupshup occasionally redelivers webhooks; never process a
// message twice. Uses a small collection with a TTL index on processedAt.
// ---------------------------------------------------------------------------

let _inboxIndexEnsured = false;
async function ensureInboxIndex(db) {
  if (_inboxIndexEnsured) return;
  try {
    await db.collection("whatsapp_inbox").createIndex(
      { messageId: 1 },
      { unique: true, name: "uniq_messageId" }
    );
    // Auto-expire after 7 days so the collection stays small.
    await db.collection("whatsapp_inbox").createIndex(
      { processedAt: 1 },
      { expireAfterSeconds: 7 * 24 * 60 * 60, name: "ttl_processedAt" }
    );
    _inboxIndexEnsured = true;
  } catch {
    // best effort — if index creation fails the dedupe still works,
    // it just won't auto-clean.
  }
}

/**
 * Returns true if this message was already processed (caller should skip).
 * Returns false on the first sighting (and records it).
 */
export async function markProcessedOrReturnDuplicate(messageId) {
  if (!messageId) return false;
  const db = await getDb();
  await ensureInboxIndex(db);
  try {
    await db.collection("whatsapp_inbox").insertOne({
      messageId: String(messageId),
      processedAt: new Date(),
    });
    return false;
  } catch (e) {
    // Duplicate key → already processed.
    if (e && (e.code === 11000 || e.codeName === "DuplicateKey")) return true;
    // Any other error: treat as not-duplicate to avoid losing real messages,
    // but the caller's per-message logging will surface the issue.
    return false;
  }
}

// ---------------------------------------------------------------------------
// Per-phone conversation storage (whatsapp_sessions)
//
// One doc per phone:
//   { phone, messages: [{ role, content, agentKey?, classifierChoice?, ts }], createdAt, updatedAt }
// ---------------------------------------------------------------------------

/**
 * Fetch the last `limit` messages for an agent on this phone, ordered oldest→newest.
 * Only user/assistant messages tied to `agentKey` are returned (so each specialist
 * sees a clean conversation as if it were the only agent ever talking to the user).
 */
export async function getWhatsAppHistoryForAgent(phone, agentKey, limit = 20) {
  const db = await getDb();
  const doc = await db.collection("whatsapp_sessions").findOne({ phone });
  if (!doc || !Array.isArray(doc.messages)) return [];
  const filtered = doc.messages.filter((m) => m && m.agentKey === agentKey);
  const slice = filtered.slice(-Math.max(1, Number(limit) || 20));
  return slice.map((m) => ({ role: m.role, content: m.content || "" }));
}

/**
 * Fetch the last `limit` messages (any agent) for the classifier so it sees
 * recent conversational context — useful for follow-up questions.
 */
export async function getWhatsAppHistoryForClassifier(phone, limit = 10) {
  const db = await getDb();
  const doc = await db.collection("whatsapp_sessions").findOne({ phone });
  if (!doc || !Array.isArray(doc.messages)) return [];
  const slice = doc.messages.slice(-Math.max(1, Number(limit) || 10));
  return slice.map((m) => ({ role: m.role, content: m.content || "" }));
}

/**
 * Append one or more {role, content, agentKey, classifierChoice?} entries to a phone's session.
 */
export async function appendWhatsAppMessages(phone, messages) {
  if (!phone) throw new Error("appendWhatsAppMessages: phone is required");
  if (!Array.isArray(messages) || messages.length === 0) return;
  const now = new Date();
  const toPush = messages.map((m) => ({
    role: m.role,
    content: String(m.content == null ? "" : m.content),
    agentKey: m.agentKey || null,
    classifierChoice: m.classifierChoice || null,
    ts: m.ts || now,
  }));
  const db = await getDb();
  await db.collection("whatsapp_sessions").updateOne(
    { phone },
    {
      $setOnInsert: { phone, createdAt: now },
      $set: { updatedAt: now },
      $push: { messages: { $each: toPush } },
    },
    { upsert: true }
  );
}

// ---------------------------------------------------------------------------
// Per-message invocation log (whatsapp_logs)
// ---------------------------------------------------------------------------

export async function logWhatsAppInvocation(entry) {
  try {
    const db = await getDb();
    await db.collection("whatsapp_logs").insertOne({
      ts: new Date(),
      phone: entry.phone || null,
      messageId: entry.messageId || null,
      messagePreview: (entry.messagePreview || "").slice(0, 200),
      classifierChoice: entry.classifierChoice || null,
      finalAgentKey: entry.finalAgentKey || null,
      finalAgentName: entry.finalAgentName || null,
      classifierModel: entry.classifierModel || null,
      agentModel: entry.agentModel || null,
      classifierMs: typeof entry.classifierMs === "number" ? entry.classifierMs : null,
      agentMs: typeof entry.agentMs === "number" ? entry.agentMs : null,
      ok: entry.ok !== false,
      error: entry.error || null,
    });
  } catch {
    // Never let logging break the response path.
  }
}

/** Fetch the most recent WhatsApp logs (for an admin UI). */
export async function getWhatsAppLogs(opts = {}) {
  const db = await getDb();
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const q = {};
  if (opts.phone) q.phone = String(opts.phone);
  if (opts.finalAgentKey) q.finalAgentKey = String(opts.finalAgentKey);
  return await db.collection("whatsapp_logs")
    .find(q)
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();
}

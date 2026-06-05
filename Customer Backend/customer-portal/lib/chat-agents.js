import { getDb } from "./mongo.js";

/**
 * Get a chat agent by its agent key
 * @param {string} agentKey - The unique key identifying the agent (e.g., "packaging-quote", "book-quote")
 * @returns {Promise<Object|null>} The chat agent object or null if not found
 */
export async function getChatAgentByKey(agentKey) {
  const db = await getDb();
  return await db.collection("chat_agents").findOne({ 
    agentKey,
    isActive: true 
  });
}

/**
 * Get a chat agent by button text
 * @param {string} buttonText - The button text that triggers the agent
 * @returns {Promise<Object|null>} The chat agent object or null if not found
 */
export async function getChatAgentByButtonText(buttonText) {
  const db = await getDb();
  return await db.collection("chat_agents").findOne({ 
    buttonText,
    isActive: true 
  });
}

/**
 * Get all active chat agents
 * @returns {Promise<Array>} Array of all active chat agents
 */
export async function getAllChatAgents() {
  const db = await getDb();
  return await db.collection("chat_agents")
    .find({ isActive: true })
    .sort({ createdAt: 1 })
    .toArray();
}

/**
 * Get every chat agent regardless of isActive (used by the admin UI).
 * @returns {Promise<Array>} Array of all chat agents
 */
export async function getAllChatAgentsAdmin() {
  const db = await getDb();
  return await db.collection("chat_agents")
    .find({})
    .sort({ createdAt: 1 })
    .toArray();
}

/**
 * Update a chat agent by agentKey. Only whitelisted fields are written.
 * @param {string} agentKey
 * @param {Object} patch - { systemPrompt, name, buttonText, description, initialMessage, isActive }
 * @returns {Promise<Object|null>} Updated agent document or null if not found
 */
export async function updateChatAgentByKey(agentKey, patch) {
  const db = await getDb();
  const allowed = [
    "systemPrompt",
    "name",
    "buttonText",
    "description",
    "initialMessage",
    "isActive",
  ];
  const set = {};
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch || {}, k)) {
      if (k === "isActive") set[k] = Boolean(patch[k]);
      else set[k] = patch[k] == null ? "" : String(patch[k]);
    }
  }
  if (Object.keys(set).length === 0) return null;
  set.updatedAt = new Date();
  await db.collection("chat_agents").updateOne(
    { agentKey },
    { $set: set }
  );
  return await db.collection("chat_agents").findOne({ agentKey });
}

/**
 * Read the global AI config singleton (key="default") from ai_config.
 * Falls back to env OPENAI_MODEL or "gpt-4o-mini" when no doc exists.
 * @returns {Promise<{model: string}>}
 */
export async function getAiConfig() {
  const db = await getDb();
  const doc = await db.collection("ai_config").findOne({ key: "default" });
  const envModel = (process.env.OPENAI_MODEL || "").trim();
  const model = (doc?.model && String(doc.model).trim()) || envModel || "gpt-4o-mini";
  return { model };
}

/**
 * Upsert the global AI config singleton.
 * @param {{model: string}} patch
 * @returns {Promise<{model: string}>}
 */
export async function updateAiConfig(patch) {
  const db = await getDb();
  const set = {};
  if (patch && typeof patch.model === "string" && patch.model.trim()) {
    set.model = patch.model.trim();
  }
  set.updatedAt = new Date();
  await db.collection("ai_config").updateOne(
    { key: "default" },
    { $set: { key: "default", ...set } },
    { upsert: true }
  );
  return await getAiConfig();
}

/**
 * Append an agent invocation log entry.
 * @param {{userId: string, agentKey: string, agentName: string, messagePreview: string, model?: string, durationMs?: number}} entry
 */
export async function logAgentInvocation(entry) {
  try {
    const db = await getDb();
    await db.collection("agent_logs").insertOne({
      ts: new Date(),
      userId: entry.userId || null,
      agentKey: entry.agentKey || null,
      agentName: entry.agentName || null,
      messagePreview: (entry.messagePreview || "").slice(0, 200),
      model: entry.model || null,
      durationMs: typeof entry.durationMs === "number" ? entry.durationMs : null,
    });
  } catch (e) {
    // Never break chat because of logging.
  }
}

/**
 * Fetch the last N agent_logs entries (most recent first).
 * @param {{limit?: number, agentKey?: string}} [opts]
 */
export async function getAgentLogs(opts = {}) {
  const db = await getDb();
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const q = {};
  if (opts.agentKey) q.agentKey = String(opts.agentKey);
  return await db.collection("agent_logs")
    .find(q)
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Get chat agent by ID
 * @param {string} agentId - MongoDB ObjectId as string
 * @returns {Promise<Object|null>} The chat agent object or null if not found
 */
export async function getChatAgentById(agentId) {
  const db = await getDb();
  const { ObjectId } = await import("mongodb");
  return await db.collection("chat_agents").findOne({ 
    _id: new ObjectId(agentId),
    isActive: true 
  });
}

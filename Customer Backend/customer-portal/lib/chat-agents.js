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

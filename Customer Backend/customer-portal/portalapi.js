// portalapi.js
import { callDashboard } from "./lib/callDashboard.js";
import sql from "mssql";
import { getDb } from "./lib/mongo.js";
import { db1 } from "./lib/db1.js";
import { db2 } from "./lib/db2.js";
import { getChatAgentByKey, getAllChatAgents } from "./lib/chat-agents.js";
import { calculatePricing } from "./pck_est/calculator.js";
import { calCulate } from "./comm_est/calculator.js";


// --- helpers
function parseRange(range) {
  const now = new Date();
  
  // Only support: 30d, 90d, 180d, 365d (last N days)
  const map = { 
    "30d": 30,   // Last 30 days
    "90d": 90,   // Last 90 days
    "180d": 180, // Last 180 days
    "365d": 365  // Last 365 days
  };
  
  if (range in map) {
    const d = new Date(now);
    d.setDate(d.getDate() - map[range]);
    return { from: d, to: now };
  }
  
  // Default to last 90 days if invalid range
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

// Builds a dbo.JobNoList table-valued parameter (single column: JobBookingNo).
// Used by dbo.GetJobFullDetails_Client to fetch production + shipment info
// for many jobs in one round-trip.
function toJobNoListTVP(jobBookingNos) {
  const t = new sql.Table("dbo.JobNoList");
  // 50 chars matches the schema we've seen on dbo.JobBookingJobCard.JobBookingNo.
  t.columns.add("JobBookingNo", sql.NVarChar(50), { nullable: false });
  (jobBookingNos || []).forEach((jn) => {
    if (jn === null || jn === undefined) return;
    const s = String(jn).trim();
    if (s) t.rows.add(s);
  });
  return t;
}

// CompanyID values passed to dbo.GetJobFullDetails_Client for each source DB.
// db1 = indusenterprise (KOL); db2 = indusenterprise2 (AHM).
// Both default to 2 (the value confirmed against the proc). Override at
// deploy time via env vars EXPORT_COMPANY_ID_DB1 / EXPORT_COMPANY_ID_DB2 if
// either DB needs a different ID.
const COMPANY_ID_BY_SOURCE = {
  db1: Number(process.env.EXPORT_COMPANY_ID_DB1 || 2),
  db2: Number(process.env.EXPORT_COMPANY_ID_DB2 || 2),
};

// CDC job numbers travel through the system in a few different formattings:
//   - dbo.JobBookingJobCard.JobBookingNo  ->  "J01885/26-27"  (slash + dash)
//   - portal_orders_list2 alias JobCardNo ->  "J01885_26_27"  (underscores; URL-friendly)
// The new export proc dbo.GetJobFullDetails_Client matches against the
// underlying SQL column, i.e. the slash-dash form. canonicalJobNo() collapses
// either variant into a single comparable key so we can match proc results
// back to whatever string the frontend originally sent us.
const canonicalJobNo = (s) =>
  String(s || "")
    .trim()
    .toUpperCase()
    .replace(/[\/\-_\\]+/g, "_");

// Convert a job number into the format dbo.GetJobFullDetails_Client expects
// to receive in its dbo.JobNoList TVP: "J<num>/<yy>-<yy>".  Inputs that
// don't have exactly three separator-delimited parts are returned trimmed
// but otherwise unchanged.
const toSpJobNoForm = (s) => {
  const trimmed = String(s || "").trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/[\/\-_\\]+/);
  if (parts.length === 3) {
    return `${parts[0]}/${parts[1]}-${parts[2]}`;
  }
  return trimmed;
};

const AI_NOT_CONFIGURED_MSG =
  "AI is not configured. Add OPENAI_API_KEY to enable replies.";

/** Tool definition for Order Status Agent: get pending and completed job/order details from orders API. */
const ORDER_STATUS_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_pending_job_details",
      description: "Retrieves pending and completed job/order details for the logged-in user. Always use this for any job status, order status, or pending jobs query. Data is dynamic—never rely on prior conversation. Returns an object with 'pending' (all pending jobs) and 'completed' (top 50 completed jobs sorted by FinishPlanDate newest first) arrays. Each job may include: JobCardNo or JobBookingId (Doc ID), Title (Description), OrderQty, QtyDelivered, QtyPacked, CommittedDeliveryDate, FinishPlanDate, FinalOrderStatus, PoNumber, PoDate, ApprovalDate, and other available columns.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Optional. Search term to filter by job number (Doc ID / JobCardNo) or job name (Description / Title). Leave empty or omit to get all jobs."
          },
          date_range: {
            type: "string",
            enum: ["30d", "90d", "180d", "365d"],
            description: "Optional. Date range for jobs. Default: 365d"
          }
        }
      }
    }
  }
];

/** Tool for Packaging Quote Agent: call pck-est to get estimated pricing. Call only after gathering all mandatory parameters and receiving user confirmation. */
const PACKAGING_QUOTE_TOOLS = [
  {
    type: "function",
    function: {
      name: "calculate_packaging_quote",
      description: "Calculates the estimated price in Rupees for a packaging box quote. Call this ONLY after you have gathered all mandatory parameters (product type, quantity, dimensions in mm, paper type, paper GSM, front color count, front surface finish) and the user has confirmed. For Top-Bottom Box use ptype 'Top-Bottom Box'; for outer box pricing include matBot, gsmBot, frontColBot, frontSur. Paper: FBB, CBB, Grey Back Board, White Back Board. Surface: Drip Off Coating, Aqueous Gloss/Matt, UV Gloss/Matt, Gloss/Matt Lamination, Soft Touch, Spot UV, Metpet, or None. Foil sq in: 0,4,15,25,50,75. Window sq in: 0,4,8,12,20,40. Corrugation: 0, 3, or 5 ply.",
      parameters: {
        type: "object",
        properties: {
          ptype: { type: "string", description: "Product type: RTI, Crash Lock, Haugland, Universal, Top-Bottom Box" },
          qty: { type: "integer", description: "Quantity" },
          len: { type: "number", description: "Length in mm" },
          brd: { type: "number", description: "Breadth in mm" },
          height: { type: "number", description: "Height in mm" },
          matin: { type: "string", description: "Paper type: FBB, CBB, Grey Back Board, White Back Board (or exact names from sheet)" },
          gsmTop: { type: "number", description: "Paper GSM for inner/top" },
          frontColIn: { type: "integer", description: "Front print color count" },
          frontSurIn: { type: "string", description: "Front surface finish or None" },
          backColIn: { type: "integer", description: "Back color count, default 0" },
          backSurIn: { type: "string", description: "Back surface finish or None" },
          corrLayIn: { type: "integer", description: "Corrugation: 0, 3, or 5 ply" },
          kraftGsmIn: { type: "number", description: "Kraft GSM if corrugation" },
          foilIn: { type: "number", description: "Foil stamping sq in: 0,4,15,25,50,75" },
          windowIn: { type: "number", description: "Window patching sq in: 0,4,8,12,20,40" },
          matBot: { type: "string", description: "Bottom/outer paper type (Top-Bottom or outer box)" },
          gsmBot: { type: "number", description: "Bottom/outer GSM" },
          frontColBot: { type: "integer", description: "Bottom/outer front print color count" },
          frontSur: { type: "string", description: "Bottom/outer surface finish" }
        },
        required: ["ptype", "qty", "len", "brd", "height", "matin", "gsmTop", "frontColIn", "frontSurIn"]
      }
    }
  }
];

/** Tool for Book Quote Agent: call comm-est to get estimated pricing. Call only after gathering all required parameters and user confirmation. */
const BOOK_QUOTE_TOOLS = [
  {
    type: "function",
    function: {
      name: "calculate_book_quote",
      description: "Calculates the estimated price in Rupees for a book printing quote. Call ONLY after you have gathered all required parameters and the user has confirmed. Components: Text, Cover, End Paper, PLC, Gate Fold Cover, Binding Board, Foam, Sticker Paper, Text - 2. Binding: SS+PB, Plain Board Book, HC + Board Book, HC+Foam+Board Book, etc. Material/paper: FBB, CBB, Maplitho Gr A, Gloss Art, Matt Art, Bible Paper, etc. Surface: Gloss Lam, Matt Lam, None.",
      parameters: {
        type: "object",
        properties: {
          len: { type: "number", description: "Length (trim size) in mm" },
          brd: { type: "number", description: "Breadth in mm" },
          Qty: { type: "number", description: "Quantity" },
          binding_style: { type: "string", description: "Binding style e.g. SS+PB, Plain Board Book, HC + Board Book" },
          no_of_titles: { type: "number", description: "Number of titles, default 1" },
          parts: {
            type: "array",
            description: "Each component: comp, gsm, material, pages, and optionally front_print, back_print, front_surface, back_surface",
            items: {
              type: "object",
              properties: {
                comp: { type: "string", description: "Component: Text, Cover, End Paper, PLC, Gate Fold Cover, Binding Board, Foam, Sticker Paper, Text - 2" },
                gsm: { type: "number", description: "GSM for this component" },
                material: { type: "string", description: "Paper type: FBB, CBB, Maplitho Gr A, Gloss Art, Matt Art, etc." },
                pages: { type: "integer", description: "Page count for this component" },
                front_print: { type: "integer", description: "Front print colors, default 0" },
                back_print: { type: "integer", description: "Back print colors, default 0" },
                front_surface: { type: "string", description: "Front surface e.g. Gloss Lam, Matt Lam, None" },
                back_surface: { type: "string", description: "Back surface, default None" }
              },
              required: ["comp", "gsm", "material", "pages"]
            }
          }
        },
        required: ["len", "brd", "Qty", "binding_style", "parts"]
      }
    }
  }
];

/**
 * Fetch pending and completed orders for a user (by email). Used by the Order Status Agent tool.
 * Returns all pending jobs and top 50 completed jobs sorted by FinishPlanDate (newest first).
 * @param {Object} mongo - MongoDB db instance (from getDb)
 * @param {string} email - User email
 * @param {{ search?: string, range?: string }} opts
 * @returns {Promise<{pending: Array, completed: Array}>} Object with pending and completed arrays
 */
async function fetchPendingOrdersForUser(mongo, email, opts = {}) {
  const { search = "", range = "365d" } = opts;
  const tenant = await mongo.collection("tenants").findOne({ email });
  if (!tenant) return { pending: [], completed: [] };

  const ids1 = tenant.ledgerIds_db1 || [];
  const ids2 = tenant.ledgerIds_db2 || [];
  const win = parseRange(String(range));
  
  // Fetch pending jobs - use a high limit to get all (or no limit if API supports it)
  const pendingLimit = "10000"; // High limit to get all pending jobs
  
  // Fetch completed jobs - fetch more from each DB to ensure we get truly top 50 after merge
  const completedLimit = "100"; // Fetch 100 from each DB, then take top 50 after sorting

  const [pendingRows1, pendingRows2, completedRows1, completedRows2] = await Promise.all([
    callOrders(db1(), ids1, {
      from: win.from,
      to: win.to,
      status: "pending",
      q: search || "",
      cursor: null,
      limit: pendingLimit,
      sourceTag: "db1"
    }),
    callOrders(db2(), ids2, {
      from: win.from,
      to: win.to,
      status: "pending",
      q: search || "",
      cursor: null,
      limit: pendingLimit,
      sourceTag: "db2"
    }),
    callOrders(db1(), ids1, {
      from: win.from,
      to: win.to,
      status: "completed",
      q: search || "",
      cursor: null,
      limit: completedLimit,
      sourceTag: "db1"
    }),
    callOrders(db2(), ids2, {
      from: win.from,
      to: win.to,
      status: "completed",
      q: search || "",
      cursor: null,
      limit: completedLimit,
      sourceTag: "db2"
    })
  ]);

  // Merge and process pending jobs
  const pendingMerged = [...pendingRows1, ...pendingRows2].sort((a, b) => {
    const da = new Date(a._cursorDate || 0).getTime();
    const db = new Date(b._cursorDate || 0).getTime();
    if (da !== db) return db - da;
    return (b._cursorId || 0) - (a._cursorId || 0);
  });
  
  pendingMerged.forEach((r) => {
    delete r._cursorDate;
    delete r._cursorId;
  });

  // Merge and process completed jobs - sort by FinishPlanDate descending (newest first)
  const completedMerged = [...completedRows1, ...completedRows2].sort((a, b) => {
    const dateA = a.FinishPlanDate ? new Date(a.FinishPlanDate).getTime() : 0;
    const dateB = b.FinishPlanDate ? new Date(b.FinishPlanDate).getTime() : 0;
    if (dateB !== dateA) return dateB - dateA; // Descending (newest first)
    // If dates are equal, use cursor date/id as tiebreaker
    const da = new Date(a._cursorDate || 0).getTime();
    const db = new Date(b._cursorDate || 0).getTime();
    if (da !== db) return db - da;
    return (b._cursorId || 0) - (a._cursorId || 0);
  });
  
  // Take top 50 completed jobs
  const completedTop50 = completedMerged.slice(0, 50);
  completedTop50.forEach((r) => {
    delete r._cursorDate;
    delete r._cursorId;
  });

  return {
    pending: pendingMerged,
    completed: completedTop50
  };
}

/**
 * Call OpenAI Chat Completions. Returns assistant content or AI_NOT_CONFIGURED_MSG.
 * @param {Array<{role: string, content: string}>} messages - [system, ...history, user]
 * @returns {Promise<string>}
 */
async function callChatLlm(messages) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || typeof key !== "string" || !key.trim()) {
    return AI_NOT_CONFIGURED_MSG;
  }
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key.trim()}`,
      },
      body: JSON.stringify({ model, messages }),
    });
    if (!res.ok) {
      const t = await res.text();
      return `${AI_NOT_CONFIGURED_MSG} (${res.status}: ${(t || "").slice(0, 120)})`;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim()
      ? text.trim()
      : AI_NOT_CONFIGURED_MSG;
  } catch (e) {
    return `${AI_NOT_CONFIGURED_MSG} (${e?.message || "error"})`;
  }
}

/**
 * Run a tool by name for the Order Status Agent. Returns JSON string of result or error.
 */
async function runOrderStatusTool(name, args, { mongo, email }) {
  if (name !== "get_pending_job_details") {
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
  try {
    const search = (args && typeof args.search === "string") ? args.search : "";
    const range = (args && ["30d", "90d", "180d", "365d"].includes(args.date_range))
      ? args.date_range
      : "365d";
    const result = await fetchPendingOrdersForUser(mongo, email, { search, range });
    return JSON.stringify(result);
  } catch (e) {
    return JSON.stringify({ error: String(e?.message || "Failed to fetch job details") });
  }
}

/**
 * Run Packaging Quote tool: map LLM args to pck-est input, call calculatePricing, return price in Rupees.
 */
async function runPackagingQuoteTool(name, args) {
  if (name !== "calculate_packaging_quote") {
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
  try {
    const a = args || {};
    let ptype = String(a.ptype || "").trim();
    if (ptype === "Top-Bottom Box" || ptype === "Top-Bottom") ptype = "Top Bottom";

    const frontSurIn = String(a.frontSurIn || "").trim().toUpperCase();
    const backSurIn = String(a.backSurIn || "").trim().toUpperCase();

    const input = {
      len: Number(a.len),
      brd: Number(a.brd),
      height: Number(a.height),
      qty: Number(a.qty),
      matin: String(a.matin || ""),
      gsmTop: Number(a.gsmTop),
      ptype,
      frontColIn: Number(a.frontColIn) || 0,
      backColIn: Number(a.backColIn) || 0,
      frontSurIn: frontSurIn === "NONE" ? "" : frontSurIn,
      backSurIn: backSurIn === "NONE" ? "" : backSurIn,
      corrLayIn: Number(a.corrLayIn) || 0,
      kraftGsmIn: Number(a.kraftGsmIn) || 0,
      windowIn: Number(a.windowIn) || 0,
      fooinIn: Number(a.foilIn) || 0,
      matBot: String(a.matBot || ""),
      gsmBot: Number(a.gsmBot) || 0,
      frontColBot: Number(a.frontColBot) || 0,
      frontSur: String(a.frontSur || "").trim()
    };

    const result = await calculatePricing(input);
    const pin = Number(result?.pricing?.price_per_unit_In) || 0;
    const pout = Number(result?.pricing?.price_per_unit_Out) || 0;

    let total;
    if (ptype === "Top Bottom") {
      total = pin + pout;
    } else {
      const hasOuter = (a.matBot && String(a.matBot).trim()) || (a.gsmBot && Number(a.gsmBot) > 0);
      total = hasOuter ? pin * 10 + pout : pin;
    }

    const totalRupees = Math.round(total * 100) / 100;
    return JSON.stringify({
      total_price_rupees: totalRupees,
      price_per_unit_inner: pin,
      price_per_unit_outer: pout,
      product_type: ptype,
      note: ptype === "Top Bottom" ? "Combined inner + bottom." : (pout > 0 ? "10 inner boxes per outer." : "Inner box only.")
    });
  } catch (e) {
    return JSON.stringify({ error: String(e?.message || "Pricing calculation failed") });
  }
}

/**
 * Run Book Quote tool: map LLM args to comm-est input, call calCulate, return price in Rupees.
 */
async function runBookQuoteTool(name, args) {
  if (name !== "calculate_book_quote") {
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
  try {
    const a = args || {};
    const parts = Array.isArray(a.parts) ? a.parts : [];
    if (parts.length === 0) {
      return JSON.stringify({ error: "At least one component (part) is required" });
    }
    const noOfTitles = Number(a.no_of_titles) || 1;
    const Qty = Number(a.Qty);
    if (!Qty || Qty < 1) {
      return JSON.stringify({ error: "Valid quantity is required" });
    }
    const build = (fn) => parts.map((p) => String(fn(p) ?? "")).join("$");
    const input = {
      len: Number(a.len),
      brd: Number(a.brd),
      Qty: String(Qty),
      binding_style: String(a.binding_style || ""),
      no_of_titles: String(noOfTitles),
      components: build((p) => p.comp),
      gsm: build((p) => p.gsm),
      material: build((p) => p.material),
      page_number: build((p) => p.pages),
      front_print: build((p) => (p.front_print != null ? p.front_print : 0)),
      back_print: build((p) => (p.back_print != null ? p.back_print : 0)),
      front_surface: build((p) => (p.front_surface != null && p.front_surface !== "" ? p.front_surface : "None")),
      back_surface: build((p) => (p.back_surface != null && p.back_surface !== "" ? p.back_surface : "None"))
    };
    const result = await calCulate(input);
    const pricePerUnit = Number(result?.price_per_unit) || 0;
    const totalRupees = Math.round(pricePerUnit * (Qty / noOfTitles) * 100) / 100;
    return JSON.stringify({
      total_price_rupees: totalRupees,
      price_per_unit: pricePerUnit,
      note: "Price per unit for the book."
    });
  } catch (e) {
    return JSON.stringify({ error: String(e?.message || "Book pricing calculation failed") });
  }
}

/**
 * Call OpenAI Chat Completions with tools for the Order Status Agent.
 * Handles tool_calls in a loop (max 5 rounds), then returns final assistant content.
 * @param {Array<{role: string, content?: string, tool_calls?: Array}>} messages
 * @param {{ mongo: Object, email: string, log?: Object }} ctx
 * @returns {Promise<string>}
 */
async function callOrderStatusLlm(messages, ctx) {
  const { mongo, email, log } = ctx || {};
  const key = process.env.OPENAI_API_KEY;
  if (!key || typeof key !== "string" || !key.trim()) {
    return AI_NOT_CONFIGURED_MSG;
  }
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const maxRounds = 5;
  let current = [...messages];
  let lastContent = "";

  for (let round = 0; round < maxRounds; round++) {
    const body = {
      model,
      messages: current,
      tools: ORDER_STATUS_TOOLS,
      tool_choice: "auto"
    };
    let res;
    try {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.trim()}`
        },
        body: JSON.stringify(body)
      });
    } catch (e) {
      return `${AI_NOT_CONFIGURED_MSG} (${e?.message || "error"})`;
    }
    if (!res.ok) {
      const t = await res.text();
      return `${AI_NOT_CONFIGURED_MSG} (${res.status}: ${(t || "").slice(0, 120)})`;
    }
    const data = await res.json();
    const msg = data?.choices?.[0]?.message;
    if (!msg) return lastContent || AI_NOT_CONFIGURED_MSG;

    lastContent = (typeof msg.content === "string" && msg.content.trim()) ? msg.content.trim() : "";

    const toolCalls = msg.tool_calls;
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      return lastContent || AI_NOT_CONFIGURED_MSG;
    }

    // Append assistant message (with tool_calls)
    current = [...current, { role: "assistant", content: msg.content || null, tool_calls: toolCalls }];

    for (const tc of toolCalls) {
      const fn = tc.function;
      const name = fn?.name || "";
      let args = {};
      try {
        if (typeof fn?.arguments === "string" && fn.arguments.trim()) {
          args = JSON.parse(fn.arguments);
        }
      } catch (_) {}
      const result = await runOrderStatusTool(name, args, { mongo, email });
      current.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  return lastContent || AI_NOT_CONFIGURED_MSG;
}

/**
 * Call OpenAI Chat Completions with tools for the Packaging Quote Agent.
 * Handles tool_calls in a loop (max 5 rounds). Uses calculate_packaging_quote to get pricing from pck-est.
 * @param {Array<{role: string, content?: string, tool_calls?: Array}>} messages
 * @param {{ log?: Object }} ctx
 * @returns {Promise<string>}
 */
async function callPackagingQuoteLlm(messages, ctx) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || typeof key !== "string" || !key.trim()) {
    return AI_NOT_CONFIGURED_MSG;
  }
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const maxRounds = 5;
  let current = [...messages];
  let lastContent = "";

  for (let round = 0; round < maxRounds; round++) {
    const body = {
      model,
      messages: current,
      tools: PACKAGING_QUOTE_TOOLS,
      tool_choice: "auto"
    };
    let res;
    try {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.trim()}`
        },
        body: JSON.stringify(body)
      });
    } catch (e) {
      return `${AI_NOT_CONFIGURED_MSG} (${e?.message || "error"})`;
    }
    if (!res.ok) {
      const t = await res.text();
      return `${AI_NOT_CONFIGURED_MSG} (${res.status}: ${(t || "").slice(0, 120)})`;
    }
    const data = await res.json();
    const msg = data?.choices?.[0]?.message;
    if (!msg) return lastContent || AI_NOT_CONFIGURED_MSG;

    lastContent = (typeof msg.content === "string" && msg.content.trim()) ? msg.content.trim() : "";

    const toolCalls = msg.tool_calls;
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      return lastContent || AI_NOT_CONFIGURED_MSG;
    }

    current = [...current, { role: "assistant", content: msg.content || null, tool_calls: toolCalls }];

    for (const tc of toolCalls) {
      const fn = tc.function;
      const name = fn?.name || "";
      let args = {};
      try {
        if (typeof fn?.arguments === "string" && fn.arguments.trim()) {
          args = JSON.parse(fn.arguments);
        }
      } catch (_) {}
      const result = await runPackagingQuoteTool(name, args);
      current.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  return lastContent || AI_NOT_CONFIGURED_MSG;
}

/**
 * Call OpenAI Chat Completions with tools for the Book Quote Agent.
 * Handles tool_calls in a loop (max 5 rounds). Uses calculate_book_quote to get pricing from comm-est.
 */
async function callBookQuoteLlm(messages, ctx) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || typeof key !== "string" || !key.trim()) {
    return AI_NOT_CONFIGURED_MSG;
  }
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const maxRounds = 5;
  let current = [...messages];
  let lastContent = "";

  for (let round = 0; round < maxRounds; round++) {
    const body = {
      model,
      messages: current,
      tools: BOOK_QUOTE_TOOLS,
      tool_choice: "auto"
    };
    let res;
    try {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.trim()}`
        },
        body: JSON.stringify(body)
      });
    } catch (e) {
      return `${AI_NOT_CONFIGURED_MSG} (${e?.message || "error"})`;
    }
    if (!res.ok) {
      const t = await res.text();
      return `${AI_NOT_CONFIGURED_MSG} (${res.status}: ${(t || "").slice(0, 120)})`;
    }
    const data = await res.json();
    const msg = data?.choices?.[0]?.message;
    if (!msg) return lastContent || AI_NOT_CONFIGURED_MSG;

    lastContent = (typeof msg.content === "string" && msg.content.trim()) ? msg.content.trim() : "";

    const toolCalls = msg.tool_calls;
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      return lastContent || AI_NOT_CONFIGURED_MSG;
    }

    current = [...current, { role: "assistant", content: msg.content || null, tool_calls: toolCalls }];

    for (const tc of toolCalls) {
      const fn = tc.function;
      const name = fn?.name || "";
      let args = {};
      try {
        if (typeof fn?.arguments === "string" && fn.arguments.trim()) {
          args = JSON.parse(fn.arguments);
        }
      } catch (_) {}
      const result = await runBookQuoteTool(name, args);
      current.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  return lastContent || AI_NOT_CONFIGURED_MSG;
}

async function callOrders(
  pool,
  ledgerIds,
  { from, to, status, q, cursor, limit, sourceTag },
  logger = console
) {
  const startTime = performance.now();
  
  if (!ledgerIds || ledgerIds.length === 0) {
    return [];
  }
  
  const step1Start = performance.now();
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
  const prepareTime = (performance.now() - step1Start).toFixed(2);

  const procedureCallLog = {
    procedure: "dbo.portal_orders_list2",
    LedgerIds: ledgerIds,
    FromDate: fromDate ? fromDate.toISOString?.() ?? String(fromDate) : null,
    ToDate: toDate ? toDate.toISOString?.() ?? String(toDate) : null,
    Status: statusValue,
    Search: searchValue,
    AfterDate: afterDate ? (afterDate.toISOString?.() ?? String(afterDate)) : null,
    AfterJobId: afterJobId,
    Limit: limitValue,
    sourceTag,
  };
  if (logger && typeof logger.info === "function") {
    logger.info({ msg: "[ORDERS API] portal_orders_list2 call", ...procedureCallLog });
  } else {
    console.log("[ORDERS API] portal_orders_list2 call", procedureCallLog);
  }

  const step2Start = performance.now();
  const rs = await r.execute("dbo.portal_orders_list2");
  const rows = rs.recordset || [];
  const executeTime = (performance.now() - step2Start).toFixed(2);
  
  const step3Start = performance.now();
  rows.forEach((r) => (r._source = sourceTag));
  const tagTime = (performance.now() - step3Start).toFixed(2);
  
  const totalTime = (performance.now() - startTime).toFixed(2);
  
  if (logger && typeof logger.info === 'function') {
    logger.info({
      msg: `[ORDERS API] callOrders timings for ${sourceTag}`,
      timings: {
        prepare: prepareTime,
        execute: executeTime,
        tag: tagTime,
        total: totalTime,
        rowCount: rows.length
      }
    });
  }
  
  return rows;
}

/**
 * Call GetPaperLedger_ByClient_Manu for one ledger. Params: LedgerId, StartDate, EndDate.
 * @returns {Promise<object[]>} recordset rows (ItemName, RowType, VoucherDate, QtyReceived, QtyIssued, ...)
 */
async function callPaperLedger(pool, ledgerId, fromDate, toDate, sourceTag, logger = console) {
  const r = (await pool).request();
  r.input("LedgerId", sql.Int, ledgerId);
  r.input("StartDate", sql.Date, fromDate);
  r.input("EndDate", sql.Date, toDate);
  const rs = await r.execute("dbo.GetPaperLedger_ByClient_Manu");
  const rows = rs.recordset || [];
  rows.forEach((row) => {
    row._source = sourceTag;
  });
  if (logger && typeof logger.info === "function") {
    logger.info({
      msg: "[PAPER-LEDGER] GetPaperLedger_ByClient_Manu call",
      ledgerId,
      fromDate: fromDate ? fromDate.toISOString?.() ?? String(fromDate) : null,
      toDate: toDate ? toDate.toISOString?.() ?? String(toDate) : null,
      sourceTag,
      rowCount: rows.length
    });
  }
  return rows;
}

/**
 * Call GetPaperLedgerSummary_ByClient_Manu for one ledger. Params: LedgerId, StartDate, EndDate.
 * @returns {Promise<object[]>} recordset rows (ItemName, Opening, Receipt, Issued, Closing, ...)
 */
async function callPaperLedgerSummary(pool, ledgerId, fromDate, toDate, sourceTag, logger = console) {
  const r = (await pool).request();
  r.input("LedgerId", sql.Int, ledgerId);
  r.input("StartDate", sql.Date, fromDate);
  r.input("EndDate", sql.Date, toDate);
  const rs = await r.execute("dbo.GetPaperLedgerSummary_ByClient_Manu");
  const rows = rs.recordset || [];
  rows.forEach((row) => {
    row._source = sourceTag;
  });
  if (logger && typeof logger.info === "function") {
    logger.info({
      msg: "[PAPER-LEDGER-SUMMARY] GetPaperLedgerSummary_ByClient_Manu call",
      ledgerId,
      fromDate: fromDate ? fromDate.toISOString?.() ?? String(fromDate) : null,
      toDate: toDate ? toDate.toISOString?.() ?? String(toDate) : null,
      sourceTag,
      rowCount: rows.length
    });
  }
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
  // GET /api/orders?tab=all|pending|completed&range=30d|90d|180d|365d&q=&limit=25&cursor=
  fastify.get("/orders", async (req, reply) => {
    const startTime = performance.now();
    const stepTimings = {};
    
    // Step 1: Parse query parameters
    const step1Start = performance.now();
    const {
      tab = "all",
      range = "90d",
      q = "",
      limit = "25",
      cursor,
    } = req.query || {};
    
    const status = ["all", "pending", "completed"].includes(
      String(tab).toLowerCase()
    )
      ? String(tab).toLowerCase()
      : "all";
    stepTimings.parseQueryParams = (performance.now() - step1Start).toFixed(2);
    
    // Step 2: Parse date range
    const step2Start = performance.now();
    const win = parseRange(String(range));
    stepTimings.parseDateRange = (performance.now() - step2Start).toFixed(2);
    
    // Step 3: Decode cursor
    const step3Start = performance.now();
    let cur = null;
    if (cursor) {
      try {
        const [d, id] = Buffer.from(String(cursor), "base64")
          .toString("utf8")
          .split("|");
        cur = { date: new Date(d), id: Number(id) };
      } catch {}
    }
    stepTimings.decodeCursor = (performance.now() - step3Start).toFixed(2);

    // Step 4: Get MongoDB connection and find tenant
    const step4Start = performance.now();
    const mongo = await getDb();
    const tenant = await mongo
      .collection("tenants")
      .findOne({ email: req.user.email });
    if (!tenant) {
      return reply.code(400).send({ error: "Tenant binding missing" });
    }
    stepTimings.findTenant = (performance.now() - step4Start).toFixed(2);

    const ids1 = tenant.ledgerIds_db1 || [];
    const ids2 = tenant.ledgerIds_db2 || [];
    const names1 = tenant.ledgerNames_db1 || [];
    const names2 = tenant.ledgerNames_db2 || [];

    // Step 5: Call callOrders per ledger so we can tag each row with LedgerId and LedgerName
    const step5Start = performance.now();
    const opts1 = {
      from: win.from,
      to: win.to,
      status,
      q,
      cursor: cur,
      limit,
      sourceTag: "db1",
    };
    const opts2 = {
      from: win.from,
      to: win.to,
      status,
      q,
      cursor: cur,
      limit,
      sourceTag: "db2",
    };
    const rows1Batches = await Promise.all(
      ids1.map((ledgerId, i) =>
        callOrders(db1(), [ledgerId], opts1, req.log).then((rows) => {
          const ledgerName = names1[i] ?? "";
          rows.forEach((r) => {
            r.LedgerId = ledgerId;
            r.LedgerName = ledgerName;
          });
          return rows;
        })
      )
    );
    const rows2Batches = await Promise.all(
      ids2.map((ledgerId, i) =>
        callOrders(db2(), [ledgerId], opts2, req.log).then((rows) => {
          const ledgerName = names2[i] ?? "";
          rows.forEach((r) => {
            r.LedgerId = ledgerId;
            r.LedgerName = ledgerName;
          });
          return rows;
        })
      )
    );
    const rows1 = rows1Batches.flat();
    const rows2 = rows2Batches.flat();
    stepTimings.fetchOrders = (performance.now() - step5Start).toFixed(2);
    stepTimings.db1Rows = rows1.length;
    stepTimings.db2Rows = rows2.length;

    // Step 6: Merge and sort results
    const step6Start = performance.now();
    const merged = [...rows1, ...rows2].sort((a, b) => {
      const da = new Date(a._cursorDate).getTime();
      const dbb = new Date(b._cursorDate).getTime();
      if (da !== dbb) return dbb - da;
      return (b._cursorId || 0) - (a._cursorId || 0);
    });
    stepTimings.mergeAndSort = (performance.now() - step6Start).toFixed(2);

    // Step 7: Slice for pagination
    const step7Start = performance.now();
    const page = merged.slice(0, Number(limit));
    stepTimings.pagination = (performance.now() - step7Start).toFixed(2);

    // Step 8: Generate nextCursor
    const step8Start = performance.now();
    const last = page[page.length - 1];
    const nextCursor = last
      ? Buffer.from(`${last._cursorDate}|${last._cursorId}`, "utf8").toString(
          "base64"
        )
      : null;
    stepTimings.generateCursor = (performance.now() - step8Start).toFixed(2);

    // Step 9: Clean up internal fields
    const step9Start = performance.now();
    page.forEach((r) => {
      delete r._cursorDate;
      delete r._cursorId;
    });
    stepTimings.cleanup = (performance.now() - step9Start).toFixed(2);

    // Total time
    stepTimings.total = (performance.now() - startTime).toFixed(2);
    stepTimings.finalItemCount = page.length;

    // Log all timings
    req.log.info({
      msg: "[ORDERS API] Performance timings",
      timings: stepTimings
    });

    const response = { items: page, nextCursor };
    req.log.info({
      msg: "[ORDERS API] Response to frontend",
      itemCount: response.items.length,
      hasNextCursor: !!response.nextCursor,
      response
    });

    return response;
  });

  // GET /api/paper-ledger?range=30d|90d|180d|365d&from=ISO&to=ISO
  // Same behaviour as orders: run GetPaperLedger_ByClient_Manu on both DBs with corresponding ledger IDs.
  fastify.get("/paper-ledger", async (req, reply) => {
    try {
      const { range = "90d", from: fromParam, to: toParam } = req.query || {};
      let fromDate;
      let toDate;
      if (fromParam && toParam) {
        fromDate = new Date(fromParam);
        toDate = new Date(toParam);
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
          return reply.code(400).send({ error: "Invalid from or to date" });
        }
      } else {
        const win = parseRange(String(range));
        fromDate = win.from;
        toDate = win.to;
      }

      const mongo = await getDb();
      const tenant = await mongo
        .collection("tenants")
        .findOne({ email: req.user.email });
      if (!tenant) {
        return reply.code(400).send({ error: "Tenant binding missing" });
      }

      const ids1 = tenant.ledgerIds_db1 || [];
      const ids2 = tenant.ledgerIds_db2 || [];
      const names1 = tenant.ledgerNames_db1 || [];
      const names2 = tenant.ledgerNames_db2 || [];

      const batches1 = await Promise.all(
        ids1.map((id, i) =>
          callPaperLedger(db1(), id, fromDate, toDate, "db1", req.log).then((rows) => {
            const ledgerName = names1[i] ?? "";
            rows.forEach((r) => {
              r.LedgerId = id;
              r.LedgerName = ledgerName;
            });
            return rows;
          })
        )
      );
      const batches2 = await Promise.all(
        ids2.map((id, i) =>
          callPaperLedger(db2(), id, fromDate, toDate, "db2", req.log).then((rows) => {
            const ledgerName = names2[i] ?? "";
            rows.forEach((r) => {
              r.LedgerId = id;
              r.LedgerName = ledgerName;
            });
            return rows;
          })
        )
      );

      const rows1 = batches1.flat();
      const rows2 = batches2.flat();
      const merged = [...rows1, ...rows2].sort((a, b) => {
        const da = a.VoucherDate ? new Date(a.VoucherDate).getTime() : 0;
        const db = b.VoucherDate ? new Date(b.VoucherDate).getTime() : 0;
        if (da !== db) return db - da;
        return 0;
      });

      return { items: merged };
    } catch (err) {
      req.log.error(err, "Error in GET /paper-ledger");
      return reply.code(500).send({
        error: "Failed to load paper ledger",
        details: err.message
      });
    }
  });

  // GET /api/paper-ledger-summary?range=30d|90d|180d|365d&from=ISO&to=ISO
  // Same inputs as paper-ledger: both DBs, corresponding ledger IDs. Procedure: GetPaperLedgerSummary_ByClient_Manu.
  fastify.get("/paper-ledger-summary", async (req, reply) => {
    try {
      const { range = "90d", from: fromParam, to: toParam } = req.query || {};
      let fromDate;
      let toDate;
      if (fromParam && toParam) {
        fromDate = new Date(fromParam);
        toDate = new Date(toParam);
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
          return reply.code(400).send({ error: "Invalid from or to date" });
        }
      } else {
        const win = parseRange(String(range));
        fromDate = win.from;
        toDate = win.to;
      }

      const mongo = await getDb();
      const tenant = await mongo
        .collection("tenants")
        .findOne({ email: req.user.email });
      if (!tenant) {
        return reply.code(400).send({ error: "Tenant binding missing" });
      }

      const ids1 = tenant.ledgerIds_db1 || [];
      const ids2 = tenant.ledgerIds_db2 || [];
      const names1 = tenant.ledgerNames_db1 || [];
      const names2 = tenant.ledgerNames_db2 || [];

      const batches1 = await Promise.all(
        ids1.map((id, i) =>
          callPaperLedgerSummary(db1(), id, fromDate, toDate, "db1", req.log).then((rows) => {
            const ledgerName = names1[i] ?? "";
            rows.forEach((r) => {
              r.LedgerId = id;
              r.LedgerName = ledgerName;
            });
            return rows;
          })
        )
      );
      const batches2 = await Promise.all(
        ids2.map((id, i) =>
          callPaperLedgerSummary(db2(), id, fromDate, toDate, "db2", req.log).then((rows) => {
            const ledgerName = names2[i] ?? "";
            rows.forEach((r) => {
              r.LedgerId = id;
              r.LedgerName = ledgerName;
            });
            return rows;
          })
        )
      );

      const rows1 = batches1.flat();
      const rows2 = batches2.flat();
      const merged = [...rows1, ...rows2].sort((a, b) => {
        const na = (a.ItemName || "").toString();
        const nb = (b.ItemName || "").toString();
        return na.localeCompare(nb);
      });

      return { items: merged };
    } catch (err) {
      req.log.error(err, "Error in GET /paper-ledger-summary");
      return reply.code(500).send({
        error: "Failed to load paper ledger summary",
        details: err.message
      });
    }
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

  // GET /api/orders/:jobId/shipment-details?containerNo=XXX&source=db1|db2
  // Returns rows from ShipmentETA where containernumber matches.
  //
  // ContainerNo from portal_orders_list2 can be a single container OR a
  // pipe-separated list ("MAEU1234567 | CMAU9999999 | HLXU5555555") when
  // a job ships in multiple containers. We split on '|', fetch each
  // distinct container, and return all rows in the input order so the
  // modal lists them the same way as on the order card.
  fastify.get("/orders/:jobId/shipment-details", async (req, reply) => {
    const { jobId } = req.params;
    const { containerNo, source } = req.query || {};

    const containers = String(containerNo || "")
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    // Dedupe while preserving the order they came in on the order card.
    const seenContainers = new Set();
    const uniqueContainers = [];
    containers.forEach((c) => {
      if (!seenContainers.has(c)) {
        seenContainers.add(c);
        uniqueContainers.push(c);
      }
    });

    if (uniqueContainers.length === 0) {
      return reply.code(400).send({ error: "containerNo is required" });
    }

    const mongo = await getDb();
    const tenant = await mongo
      .collection("tenants")
      .findOne({ email: req.user.email });
    if (!tenant)
      return reply.code(400).send({ error: "Tenant binding missing" });

    const pool = source === "db2" ? db2() : db1();

    try {
      const r = (await pool).request();
      const placeholders = uniqueContainers
        .map((_, i) => `@c${i}`)
        .join(",");
      uniqueContainers.forEach((c, i) =>
        r.input(`c${i}`, sql.NVarChar(100), c)
      );
      const rs = await r.query(
        `SELECT * FROM dbo.ShipmentETA WHERE containernumber IN (${placeholders})`
      );
      const rawRows = rs.recordset || [];

      // Group by container number and emit rows in input order.
      const byContainer = new Map();
      rawRows.forEach((row) => {
        const cn = String(
          row.containernumber || row.ContainerNumber || ""
        ).trim();
        if (!cn) return;
        if (!byContainer.has(cn)) byContainer.set(cn, []);
        byContainer.get(cn).push(row);
      });
      const ordered = [];
      uniqueContainers.forEach((cn) => {
        if (byContainer.has(cn)) ordered.push(...byContainer.get(cn));
      });
      return ordered;
    } catch (err) {
      req.log?.error?.(
        { err, jobId, containerNo, containers: uniqueContainers },
        "ShipmentETA query failed"
      );
      return reply.code(500).send({
        error: "Unable to load shipment details.",
        message: err?.message || String(err),
      });
    }
  });

  // =====================================================================
  // POST /api/orders/export-summary
  //
  // Builds the per-order data needed by the frontend's Excel export.
  //
  // Implementation (current):
  //   Calls the internal SQL stored procedure dbo.GetJobFullDetails_Client
  //   on the source database (db1 = indusenterprise / KOL,
  //   db2 = indusenterprise2 / AHM) using a dbo.JobNoList TVP. The proc
  //   returns one flat row per job that already merges production-summary
  //   columns and shipment columns (Shipment_*). No external HTTP call is
  //   used. Two databases are processed in parallel; per-DB calls are
  //   batched in chunks of BATCH_SIZE jobs.
  //
  // Request body:
  //   {
  //     "jobs": [
  //       { "jobBookingNo": "J01359/26-27", "source": "db1", "containerNo": "ABCU1234567" },
  //       { "jobBookingNo": "J01250/26-27", "source": "db2" },
  //       ...
  //     ]
  //   }
  //
  // Response:
  //   {
  //     "total": <n>,
  //     "items": [
  //       {
  //         "jobBookingNo": "...",
  //         "source": "db1",
  //         "database": "KOL",
  //         "containerNo": "...",
  //         "production": { ...flat columns from the proc... } | null,
  //         "productionError": "..." | null,
  //         "shipment": { ContainerNumber, DestinationPort, ... } | null
  //       },
  //       ...
  //     ]
  //   }
  // =====================================================================
  fastify.post("/orders/export-summary", async (req, reply) => {
    const startedAt = performance.now();

    const MAX_JOBS = 500;
    // Each call to dbo.GetJobFullDetails_Client passes a TVP of up to this
    // many jobs. Two source DBs run in parallel; chunks within one DB run
    // sequentially.
    const BATCH_SIZE = 200;

    const body = req.body || {};
    const rawJobs = Array.isArray(body.jobs) ? body.jobs : [];

    if (rawJobs.length === 0) {
      return reply.code(400).send({ error: "jobs array is required" });
    }
    if (rawJobs.length > MAX_JOBS) {
      return reply
        .code(400)
        .send({ error: `Too many jobs in one request (max ${MAX_JOBS}).` });
    }

    const mongo = await getDb();
    const tenant = await mongo
      .collection("tenants")
      .findOne({ email: req.user.email });
    if (!tenant) {
      return reply.code(400).send({ error: "Tenant binding missing" });
    }

    // Normalize + validate jobs. Be lenient with field names since the
    // frontend may pass through fields exactly as returned by portal_orders_list2.
    const jobs = rawJobs
      .map((j) => {
        const jobBookingNo = String(
          j.jobBookingNo ?? j.JobBookingNo ?? j.JobCardNo ?? ""
        ).trim();
        const source = String(j.source ?? j._source ?? j.sourceTag ?? "")
          .trim()
          .toLowerCase();
        const containerNo = String(j.containerNo ?? j.ContainerNo ?? "").trim();
        return { jobBookingNo, source, containerNo };
      })
      .filter(
        (j) => j.jobBookingNo && (j.source === "db1" || j.source === "db2")
      );

    if (jobs.length === 0) {
      return reply.code(400).send({
        error:
          "No valid jobs in payload. Each item needs jobBookingNo and source (db1|db2).",
      });
    }

    // Build per-database job-number lists in input order, deduped.
    const jobNumbersByDb = { db1: [], db2: [] };
    const seenByDb = { db1: new Set(), db2: new Set() };
    jobs.forEach((j) => {
      if (!seenByDb[j.source].has(j.jobBookingNo)) {
        seenByDb[j.source].add(j.jobBookingNo);
        jobNumbersByDb[j.source].push(j.jobBookingNo);
      }
    });

    // Maps a flat row from dbo.GetJobFullDetails_Client into our
    // { production, shipment } shape. The proc returns columns in
    // PascalCase; we keep that casing on the wire so the frontend can
    // map to nice Excel labels without us having to hand-rename 25 fields.
    const splitProductionAndShipment = (row) => {
      const production = {
        JobBookingNo: row.JobBookingNo,
        JobName: row.JobName,
        TotalOrderQty: row.TotalOrderQty,
        TextPages: row.TextPages,
        TextColor: row.TextColor,
        CloseSize: row.CloseSize,
        BindingStyle: row.BindingStyle,
        FileReceivedDate: row.FileReceivedDate,
        SoftCopyApprovalSentDate: row.SoftCopyApprovalSentDate,
        FinalApprovalDate: row.FinalApprovalDate,
        FinallyApproved: row.FinallyApproved,
        TextPaperQuality: row.TextPaperQuality,
        CoverPaperQuality: row.CoverPaperQuality,
        TextPrintPlanQty: row.TextPrintPlanQty,
        TextPrintDoneQty: row.TextPrintDoneQty,
        TextPrintCompletionPct: row.TextPrintCompletionPct,
        TextPrintingEndDate: row.TextPrintingEndDate,
        CoverPrintPlanQty: row.CoverPrintPlanQty,
        CoverPrintDoneQty: row.CoverPrintDoneQty,
        CoverPrintCompletionPct: row.CoverPrintCompletionPct,
        CoverPrintingEndDate: row.CoverPrintingEndDate,
        BindingPlanQty: row.BindingPlanQty,
        BindingDoneQty: row.BindingDoneQty,
        BindingCompletionPct: row.BindingCompletionPct,
        BindingEndDate: row.BindingEndDate,
        LastGpnDate: row.LastGpnDate,
        ContainerNo: row.ContainerNo,
      };

      // The proc emits a Shipment_ContainerNumber alias when a matching
      // ShipmentETA row exists, and the unaliased shipment columns alongside
      // (Id, ContainerNumber, DestinationPort, ...). When there's no
      // shipment, all of these come back NULL so we return null.
      const hasShipment = !!(
        row.Shipment_ContainerNumber ||
        row.ContainerNumber ||
        row.DestinationPort ||
        row.GateInDate ||
        row.DepartureDate ||
        row.OriginalETA ||
        row.RevisedETA ||
        row.TrackingLink
      );
      const shipment = hasShipment
        ? {
            Shipment_ContainerNumber: row.Shipment_ContainerNumber,
            Id: row.Id,
            ContainerNumber:
              row.ContainerNumber || row.Shipment_ContainerNumber || null,
            DestinationPort: row.DestinationPort,
            GateInDate: row.GateInDate,
            DepartureDate: row.DepartureDate,
            OriginalETA: row.OriginalETA,
            RevisedETA: row.RevisedETA,
            TrackingLink: row.TrackingLink,
            CreatedAt: row.CreatedAt,
            Status: row.Status,
            rn: row.rn,
          }
        : null;

      return { production, shipment };
    };

    // Run dbo.GetJobFullDetails_Client for one source DB, in BATCH_SIZE
    // chunks. Returns:
    //   { perJob: Map<originalJobNo, { production, shipment }>,
    //     perJobError: Map<originalJobNo, errorString> }
    // We intentionally key the maps by the *exact* string the frontend sent
    // us (e.g. "J01015_26_27"), even though we hand the proc the slash-dash
    // form ("J01015/26-27"). Job numbers are matched back via canonicalJobNo
    // so any separator mix-and-match between portal_orders_list2 and the
    // export proc is transparent to callers.
    const processDatabase = async (sourceTag, jobBookingNos) => {
      const perJob = new Map();
      const perJobError = new Map();
      if (jobBookingNos.length === 0) {
        return { perJob, perJobError };
      }

      const companyId = COMPANY_ID_BY_SOURCE[sourceTag];
      if (!Number.isFinite(companyId)) {
        const errMsg = `CompanyID not configured for ${sourceTag}`;
        jobBookingNos.forEach((jn) => perJobError.set(jn, errMsg));
        req.log?.error?.({
          msg: "[EXPORT-SUMMARY] CompanyID missing",
          sourceTag,
        });
        return { perJob, perJobError };
      }

      let pool;
      try {
        pool = sourceTag === "db2" ? await db2() : await db1();
      } catch (err) {
        const errMsg = `pool_error: ${err?.message || String(err)}`;
        jobBookingNos.forEach((jn) => perJobError.set(jn, errMsg));
        req.log?.error?.(
          { err, sourceTag },
          "[EXPORT-SUMMARY] Failed to acquire SQL pool"
        );
        return { perJob, perJobError };
      }

      // canonical(jobNo) -> original frontend-supplied jobNo string.
      const canonicalToOriginal = new Map();
      jobBookingNos.forEach((jn) => {
        const canon = canonicalJobNo(jn);
        if (canon && !canonicalToOriginal.has(canon)) {
          canonicalToOriginal.set(canon, jn);
        }
      });

      req.log?.info?.({
        msg: "[EXPORT-SUMMARY] processDatabase begin",
        sourceTag,
        companyId,
        jobCount: jobBookingNos.length,
        sampleJobs: jobBookingNos.slice(0, 5),
      });

      for (let i = 0; i < jobBookingNos.length; i += BATCH_SIZE) {
        const chunk = jobBookingNos.slice(i, i + BATCH_SIZE);
        // We don't know which separator format the underlying data table
        // uses — some installations store JobBookingNo as "J00442_25_26"
        // (underscores, matching the URL-friendly JobCardNo alias), others
        // as "J00442/25-26" (slash + dash). To stay format-agnostic we
        // pass BOTH variants of every input to the proc. Duplicates in the
        // TVP cost nothing; the proc only returns rows that actually
        // exist, and we dedupe results by canonicalJobNo on the way out.
        const variants = new Set();
        chunk.forEach((jn) => {
          const original = String(jn || "").trim();
          if (original) variants.add(original);
          const sp = toSpJobNoForm(jn);
          if (sp) variants.add(sp);
        });
        const spChunk = Array.from(variants);
        try {
          const r = pool.request();
          r.input("CompanyID", sql.Int, companyId);
          r.input("InputJobs", toJobNoListTVP(spChunk));
          const rs = await r.execute("dbo.GetJobFullDetails_Client");
          const rows = rs.recordset || [];

          req.log?.info?.({
            msg: "[EXPORT-SUMMARY] chunk executed",
            sourceTag,
            companyId,
            chunkStart: i,
            chunkSize: chunk.length,
            tvpVariantsSent: spChunk.length,
            rowsReturned: rows.length,
            sampleSpInput: spChunk.slice(0, 6),
            sampleProcJobNo: rows[0]?.JobBookingNo || null,
          });

          // The proc may return multiple rows per job when a job has more
          // than one matching ShipmentETA entry (the proc tags each with
          // a row_number `rn`). We keep only the first row per job — the
          // proc orders shipments newest-first within a job, so this is
          // the latest shipment.
          rows.forEach((row) => {
            const rawJn = String(row?.JobBookingNo || "").trim();
            if (!rawJn) return;
            const canon = canonicalJobNo(rawJn);
            const originalKey = canonicalToOriginal.get(canon);
            if (!originalKey || perJob.has(originalKey)) return;
            perJob.set(originalKey, splitProductionAndShipment(row));
          });

          chunk.forEach((jn) => {
            if (!perJob.has(jn)) {
              perJobError.set(jn, "not_found_in_proc_result");
            }
          });
        } catch (err) {
          const errMsg = err?.message || String(err);
          chunk.forEach((jn) => perJobError.set(jn, errMsg));
          req.log?.error?.(
            {
              err,
              sourceTag,
              companyId,
              chunkStart: i,
              chunkSize: chunk.length,
              sampleSpInput: spChunk.slice(0, 3),
            },
            "[EXPORT-SUMMARY] dbo.GetJobFullDetails_Client failed for chunk"
          );
        }
      }

      return { perJob, perJobError };
    };

    // Run both databases in parallel.
    const [db1Res, db2Res] = await Promise.all([
      processDatabase("db1", jobNumbersByDb.db1),
      processDatabase("db2", jobNumbersByDb.db2),
    ]);

    // Assemble final results back in original input order.
    const results = jobs.map((job) => {
      const dbRes = job.source === "db1" ? db1Res : db2Res;
      const split = dbRes.perJob.get(job.jobBookingNo) || null;
      const production = split ? split.production : null;
      // Prefer the shipment row joined inside the proc; fall back to null.
      const shipment = split ? split.shipment : null;
      const productionError = production
        ? null
        : dbRes.perJobError.get(job.jobBookingNo) || "no_data";

      return {
        jobBookingNo: job.jobBookingNo,
        source: job.source,
        database: job.source === "db1" ? "KOL" : "AHM",
        containerNo: job.containerNo || production?.ContainerNo || null,
        production,
        productionError,
        shipment,
      };
    });

    const elapsedMs = (performance.now() - startedAt).toFixed(2);
    const productionFailures = results.filter((r) => r.productionError).length;
    const shipmentMatches = results.filter((r) => r.shipment).length;

    req.log?.info?.({
      msg: "[EXPORT-SUMMARY] Completed",
      totalRequested: rawJobs.length,
      totalProcessed: jobs.length,
      productionFailures,
      shipmentMatches,
      elapsedMs,
      db1: {
        companyId: COMPANY_ID_BY_SOURCE.db1,
        jobs: jobNumbersByDb.db1.length,
        successes: db1Res.perJob.size,
        errors: db1Res.perJobError.size,
        batches: Math.ceil(jobNumbersByDb.db1.length / BATCH_SIZE),
      },
      db2: {
        companyId: COMPANY_ID_BY_SOURCE.db2,
        jobs: jobNumbersByDb.db2.length,
        successes: db2Res.perJob.size,
        errors: db2Res.perJobError.size,
        batches: Math.ceil(jobNumbersByDb.db2.length / BATCH_SIZE),
      },
    });

    return {
      total: results.length,
      productionFailures,
      shipmentMatches,
      elapsedMs: Number(elapsedMs),
      items: results,
    };
  });

  // GET /api/approvals?tab=all|pending_approval|pending_files&range=30d|90d|180d|365d&q=&limit=25&cursor=base64(date|id)&source=db1|db2
  // Also supports: /api/approvals?from=YYYY-MM-DD&to=YYYY-MM-DD for custom date ranges
  fastify.get("/approvals", async (req, reply) => {
    const {
      tab = "all",
      range = "90d",
      q = "",
      limit = "25",
      cursor,
      source,
      from,
      to,
    } = req.query || {};

    // req.log.info({
    //   msg: "[APPROVALS] Request received",
    //   tab,
    //   range,
    //   from,
    //   to,
    //   q,
    //   limit,
    //   cursor: cursor ? "present" : "none",
    //   source,
    //   email: req.user?.email
    // });

    // normalize tab
    const status = ["all", "pending_approval", "pending_files"].includes(
      String(tab).toLowerCase()
    )
      ? String(tab).toLowerCase()
      : "all";

    // date window - support custom dates or predefined range
    let win;
    if (from && to) {
      try {
        // Parse custom dates as IST dates (UTC+5:30)
        const parseDateStringIST = (dateStr, isEndOfDay = false) => {
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            
            if (isEndOfDay) {
              return new Date(Date.UTC(year, month, day, 18, 29, 59, 999));
            } else {
              const utcDate = new Date(Date.UTC(year, month, day, 18, 30, 0, 0));
              utcDate.setUTCDate(utcDate.getUTCDate() - 1);
              return utcDate;
            }
          }
          return new Date(dateStr);
        };
        
        const fromDate = parseDateStringIST(from, false);
        const toDate = parseDateStringIST(to, true);
        win = { from: fromDate, to: toDate };
        
        // req.log.info({
        //   msg: "[APPROVALS] Custom date range parsed in IST",
        //   fromParam: from,
        //   toParam: to,
        //   fromDate: win.from.toISOString(),
        //   toDate: win.to.toISOString()
        // });
      } catch (err) {
        req.log.error(err, "[APPROVALS] Failed to parse custom dates, falling back to range");
        win = parseRange(String(range));
      }
    } else {
      win = parseRange(String(range));
      // req.log.info({
      //   msg: "[APPROVALS] Predefined range parsed",
      //   range,
      //   fromDate: win.from?.toISOString(),
      //   toDate: win.to?.toISOString()
      // });
    }

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
    // NOTE: Date filtering is NOT done in SQL procedure - it's done after SQL returns
    const execOne = async (pool, ids, tag) => {
      if (!ids || !ids.length) return [];
      const r = (await pool).request();
      r.input("LedgerIds", tvp(ids));
      // FromDate and ToDate are NOT passed to SQL procedure - filtering happens after
      r.input("Status", sql.VarChar(20), status);
      r.input("Search", sql.NVarChar(100), q || "");
      r.input("AfterDate", sql.DateTime2, after?.date || null);
      r.input("AfterId", sql.Int, after?.id || null);
      r.input("Limit", sql.Int, Number(limit) + 5);

      // req.log.info({
      //   msg: `[APPROVALS] Executing stored procedure for ${tag}`,
      //   ledgerIdsCount: ids.length,
      //   status,
      //   search: q || "",
      //   note: "FromDate and ToDate are NOT passed - filtering will be done after SQL returns"
      // });

      const rs = await r.execute("dbo.portal_approvals_list");
      const rows = rs.recordset || [];
      rows.forEach((row) => (row._source = tag));
      return rows;
    };

    // choose source — call per ledger to tag each row with LedgerId and LedgerName
    const ids1 = tenant.ledgerIds_db1 || [];
    const ids2 = tenant.ledgerIds_db2 || [];
    const names1 = tenant.ledgerNames_db1 || [];
    const names2 = tenant.ledgerNames_db2 || [];

    const tagRows = (rows, ledgerId, ledgerName) => {
      rows.forEach((row) => {
        row.LedgerId = ledgerId;
        row.LedgerName = ledgerName ?? "";
      });
      return rows;
    };

    let merged;
    if (source === "db1") {
      const batches = await Promise.all(
        ids1.map((ledgerId, i) =>
          execOne(db1(), [ledgerId], "db1").then((rows) =>
            tagRows(rows, ledgerId, names1[i])
          )
        )
      );
      merged = batches.flat();
    } else if (source === "db2") {
      const batches = await Promise.all(
        ids2.map((ledgerId, i) =>
          execOne(db2(), [ledgerId], "db2").then((rows) =>
            tagRows(rows, ledgerId, names2[i])
          )
        )
      );
      merged = batches.flat();
    } else {
      const [a, b] = await Promise.all([
        Promise.all(
          ids1.map((ledgerId, i) =>
            execOne(db1(), [ledgerId], "db1").then((rows) =>
              tagRows(rows, ledgerId, names1[i])
            )
          )
        ).then((arr) => arr.flat()),
        Promise.all(
          ids2.map((ledgerId, i) =>
            execOne(db2(), [ledgerId], "db2").then((rows) =>
              tagRows(rows, ledgerId, names2[i])
            )
          )
        ).then((arr) => arr.flat()),
      ]);
      merged = [...a, ...b];
    }

    // Filter by PODate after SQL procedure returns
    // PODate filtering is done in JavaScript, not in SQL procedure
    if (win.from && win.to) {
      const beforeFilter = merged.length;
      
      // Helper to convert date to IST date string for comparison
      const toISTDateStr = (date) => {
        if (!date) return null;
        // PODate comes as UTC ISO string but represents IST time
        // To get IST date: add 5:30 hours to UTC time, then extract date
        const istTime = new Date(date.getTime() + (5 * 60 + 30) * 60 * 1000);
        return `${istTime.getUTCFullYear()}-${String(istTime.getUTCMonth() + 1).padStart(2, '0')}-${String(istTime.getUTCDate()).padStart(2, '0')}`;
      };
      
      // Convert win dates to IST date strings for comparison
      const targetFromDate = toISTDateStr(win.from);
      const targetToDate = toISTDateStr(win.to);
      
      merged = merged.filter(item => {
        if (!item.PODate) return false;
        const poDateISTStr = toISTDateStr(new Date(item.PODate));
        // Compare IST date strings (YYYY-MM-DD format)
        return poDateISTStr >= targetFromDate && poDateISTStr <= targetToDate;
      });
      
      // req.log.info({
      //   msg: "[APPROVALS] Filtered results by PODate after SQL procedure",
      //   beforeFilter,
      //   afterFilter: merged.length,
      //   targetFromDate,
      //   targetToDate,
      //   dateRange: {
      //     from: win.from.toISOString(),
      //     to: win.to.toISOString()
      //   }
      // });
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

  // GET /api/dispatches?range=30d|90d|180d|365d&q=&limit=50&cursor=base64(date|id)&source=db1|db2
  // Also supports: /api/dispatches?from=YYYY-MM-DD&to=YYYY-MM-DD for custom date ranges
  fastify.get("/dispatches", async (req, reply) => {
    const { range = "90d", q = "", limit = "50", cursor, source, from, to } = req.query || {};

    // req.log.info({
    //   msg: "[DISPATCHES] Request received",
    //   range,
    //   from,
    //   to,
    //   q,
    //   limit,
    //   cursor: cursor ? "present" : "none",
    //   source,
    //   email: req.user?.email
    // });

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
        // req.log.info({
        //   msg: "[DISPATCHES] Custom date range parsed in IST",
        //   fromParam: from,
        //   toParam: to,
        //   fromDate: win.from.toISOString(),
        //   toDate: win.to.toISOString(),
        //   fromDateIST: `${win.from.getUTCFullYear()}-${String(win.from.getUTCMonth() + 1).padStart(2, '0')}-${String(win.from.getUTCDate()).padStart(2, '0')} ${String(win.from.getUTCHours()).padStart(2, '0')}:${String(win.from.getUTCMinutes()).padStart(2, '0')}:${String(win.from.getUTCSeconds()).padStart(2, '0')} IST`,
        //   toDateIST: `${win.to.getUTCFullYear()}-${String(win.to.getUTCMonth() + 1).padStart(2, '0')}-${String(win.to.getUTCDate()).padStart(2, '0')} ${String(win.to.getUTCHours()).padStart(2, '0')}:${String(win.to.getUTCMinutes()).padStart(2, '0')}:${String(win.to.getUTCSeconds()).padStart(2, '0')} IST`
        // });
      } catch (err) {
        req.log.error(err, "[DISPATCHES] Failed to parse custom dates, falling back to range");
        win = parseRange(String(range));
      }
    } else {
      win = parseRange(String(range));
      // req.log.info({
      //   msg: "[DISPATCHES] Predefined range parsed - Line 680",
      //   codeLocation: "Line 680: win = parseRange(String(range))",
      //   range,
      //   supportedRanges: "30d (Last 30 days), 90d (Last 90 days), 180d (Last 180 days), 365d (Last 365 days)",
      //   fromDate: win.from?.toISOString(),
      //   toDate: win.to?.toISOString(),
      //   fromDateLocal: win.from?.toString(),
      //   toDateLocal: win.to?.toString(),
      //   appliedDates: {
      //     from: win.from?.toISOString() || null,
      //     to: win.to?.toISOString() || null
      //   }
      // });
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
    const names1 = tenant.ledgerNames_db1 || [];
    const names2 = tenant.ledgerNames_db2 || [];

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
      
      // req.log.info({
      //   msg: `[DISPATCHES] Executing stored procedure for ${tag}`,
      //   ledgerIdsCount: ids.length,
      //   originalFromDate: win.from ? win.from.toISOString() : null,
      //   originalToDate: win.to ? win.to.toISOString() : null,
      //   fromDateParam: fromDateParam ? fromDateParam.toISOString() : null,
      //   toDateParam: toDateParam ? toDateParam.toISOString() : null,
      //   fromDateLocal: fromDateParam ? fromDateParam.toString() : null,
      //   toDateLocal: toDateParam ? toDateParam.toString() : null,
      //   fromDateSQL: fromDateParam ? `${fromDateParam.getFullYear()}-${String(fromDateParam.getMonth() + 1).padStart(2, '0')}-${String(fromDateParam.getDate()).padStart(2, '0')}` : null,
      //   toDateSQL: toDateParam ? `${toDateParam.getFullYear()}-${String(toDateParam.getMonth() + 1).padStart(2, '0')}-${String(toDateParam.getDate()).padStart(2, '0')}` : null,
      //   search: q || "",
      //   afterDate: after?.date ? after.date.toISOString() : null,
      //   afterId: after?.id || null,
      //   limit: Number(limit) + 5
      // });
      
      r.input("LedgerIds", tvp(ids));
      r.input("FromDate", sql.Date, fromDateParam);
      r.input("ToDate", sql.Date, toDateParam);
      r.input("Search", sql.NVarChar(100), q || "");
      r.input("AfterDate", sql.DateTime2, after?.date || null);
      r.input("AfterId", sql.BigInt, after?.id || null);
      r.input("Limit", sql.Int, Number(limit) + 5);

      const rs = await r.execute("dbo.portal_dispatches_list2");
      const rows = rs.recordset || [];
      
      // req.log.info({
      //   msg: `[DISPATCHES] Stored procedure result for ${tag}`,
      //   rowCount: rows.length,
      //   sampleDates: rows.slice(0, 5).map(row => ({
      //     DispatchDate: row.DispatchDate,
      //     DispatchDateISO: row.DispatchDate ? new Date(row.DispatchDate).toISOString() : null,
      //     DispatchDateLocal: row.DispatchDate ? new Date(row.DispatchDate).toString() : null,
      //     PODate: row.PODate,
      //     DispatchId: row.DispatchId,
      //     JobNum: row.JobNum
      //   }))
      // });
      
      rows.forEach((row) => (row._source = tag));
      return rows;
    };

    const tagDispatchRows = (rows, ledgerId, ledgerName) => {
      rows.forEach((row) => {
        row.LedgerId = ledgerId;
        row.LedgerName = ledgerName ?? "";
      });
      return rows;
    };

    let merged = [];
    if (source === "db1") {
      const batches = await Promise.all(
        ids1.map((ledgerId, i) =>
          execOne(db1(), [ledgerId], "db1").then((rows) =>
            tagDispatchRows(rows, ledgerId, names1[i])
          )
        )
      );
      merged = batches.flat();
    } else if (source === "db2") {
      const batches = await Promise.all(
        ids2.map((ledgerId, i) =>
          execOne(db2(), [ledgerId], "db2").then((rows) =>
            tagDispatchRows(rows, ledgerId, names2[i])
          )
        )
      );
      merged = batches.flat();
    } else {
      const [a, b] = await Promise.all([
        Promise.all(
          ids1.map((ledgerId, i) =>
            execOne(db1(), [ledgerId], "db1").then((rows) =>
              tagDispatchRows(rows, ledgerId, names1[i])
            )
          )
        ).then((arr) => arr.flat()),
        Promise.all(
          ids2.map((ledgerId, i) =>
            execOne(db2(), [ledgerId], "db2").then((rows) =>
              tagDispatchRows(rows, ledgerId, names2[i])
            )
          )
        ).then((arr) => arr.flat()),
      ]);
      merged = [...a, ...b];
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
      
    //   req.log.info({
    //     msg: "[DISPATCHES] Filtered results for IST date range",
    //     beforeFilter: merged.length,
    //     afterFilter: filteredMerged.length,
    //     targetFromDate,
    //     targetToDate
    //   });
    }

    // global sort and keyset trim
    filteredMerged.sort((a, b) => {
      const da = new Date(a._cursorDate || 0).getTime();
      const dbb = new Date(b._cursorDate || 0).getTime();
      if (da !== dbb) return dbb - da;
      return (b._cursorId || 0) - (a._cursorId || 0);
    });

    // req.log.info({
    //   msg: "[DISPATCHES] After merge and sort",
    //   totalMerged: filteredMerged.length,
    //   dateRange: {
    //     from: win.from?.toISOString(),
    //     to: win.to?.toISOString(),
    //     fromLocal: win.from?.toString(),
    //     toLocal: win.to?.toString()
    //   },
    //   allDispatchDates: filteredMerged.slice(0, 10).map(item => {
    //     const dispatchDate = item.DispatchDate ? new Date(item.DispatchDate) : null;
    //     const inRange = dispatchDate ? 
    //       (dispatchDate >= win.from && dispatchDate <= win.to) : 
    //       false;
    //     return {
    //       DispatchDate: item.DispatchDate,
    //       DispatchDateISO: dispatchDate?.toISOString() || null,
    //       DispatchDateLocal: dispatchDate?.toString() || null,
    //       inRange: inRange,
    //       comparison: dispatchDate ? {
    //         greaterThanOrEqualFrom: dispatchDate >= win.from,
    //         lessThanOrEqualTo: dispatchDate <= win.to
    //       } : null
    //     };
    //   })
    // });

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

    // req.log.info({
    //   msg: "[DISPATCHES] Final response",
    //   itemCount: page.length,
    //   hasNextCursor: !!nextCursor,
    //   dateWindow: {
    //     from: win.from?.toISOString(),
    //     to: win.to?.toISOString(),
    //     fromLocal: win.from?.toString(),
    //     toLocal: win.to?.toString()
    //   },
    //   firstItem: page[0] ? {
    //     DispatchDate: page[0].DispatchDate,
    //     DispatchDateISO: page[0].DispatchDate ? new Date(page[0].DispatchDate).toISOString() : null,
    //     PODate: page[0].PODate,
    //     DispatchId: page[0].DispatchId
    //   } : null
    // });

    return { items: page, nextCursor };
  });

  // GET /api/otif?range=30d|90d|180d|365d&q=&limit=50&cursor=base64(date|id)&source=db1|db2
  // Also supports: /api/otif?from=YYYY-MM-DD&to=YYYY-MM-DD for custom date ranges
  fastify.get("/otif", async (req, reply) => {
    const { range = "90d", q = "", limit = "50", cursor, source, from, to } = req.query || {};

    // req.log.info({
    //   msg: "[OTIF] Request received",
    //   range,
    //   from,
    //   to,
    //   q,
    //   limit,
    //   cursor: cursor ? "present" : "none",
    //   source,
    //   email: req.user?.email
    // });

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
        // req.log.info({
        //   msg: "[OTIF] Custom date range parsed in IST - Line 962",
        //   codeLocation: "Line 962: win = { from: fromDate, to: toDate }",
        //   fromParam: from,
        //   toParam: to,
        //   fromDate: win.from.toISOString(),
        //   toDate: win.to.toISOString(),
        //   fromDateIST: `${win.from.getUTCFullYear()}-${String(win.from.getUTCMonth() + 1).padStart(2, '0')}-${String(win.from.getUTCDate()).padStart(2, '0')} ${String(win.from.getUTCHours()).padStart(2, '0')}:${String(win.from.getUTCMinutes()).padStart(2, '0')}:${String(win.from.getUTCSeconds()).padStart(2, '0')} IST`,
        //   toDateIST: `${win.to.getUTCFullYear()}-${String(win.to.getUTCMonth() + 1).padStart(2, '0')}-${String(win.to.getUTCDate()).padStart(2, '0')} ${String(win.to.getUTCHours()).padStart(2, '0')}:${String(win.to.getUTCMinutes()).padStart(2, '0')}:${String(win.to.getUTCSeconds()).padStart(2, '0')} IST`,
        //   appliedDates: {
        //     from: win.from.toISOString(),
        //     to: win.to.toISOString()
        //   }
        // });
      } catch (err) {
        req.log.error(err, "[OTIF] Failed to parse custom dates, falling back to range");
        win = parseRange(String(range));
      }
    } else {
      win = parseRange(String(range));
        // req.log.info({
        //   msg: "[OTIF] Predefined range parsed - Line 987",
        //   codeLocation: "Line 987: win = parseRange(String(range))",
        //   range,
        //   supportedRanges: "30d (Last 30 days), 90d (Last 90 days), 180d (Last 180 days), 365d (Last 365 days)",
        //   fromDate: win.from?.toISOString(),
        //   toDate: win.to?.toISOString(),
        //   fromDateLocal: win.from?.toString(),
        //   toDateLocal: win.to?.toString(),
        //   appliedDates: {
        //     from: win.from?.toISOString() || null,
        //     to: win.to?.toISOString() || null
        //   }
        // });
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
    const names1 = tenant.ledgerNames_db1 || [];
    const names2 = tenant.ledgerNames_db2 || [];

    const tvp = (ids) => {
      const t = new sql.Table("dbo.IdList");
      t.columns.add("Id", sql.Int, { nullable: false });
      (ids || []).forEach((id) => t.rows.add(id));
      return t;
    };

    const execOne = async (pool, ids, tag) => {
      if (!ids || !ids.length) return [];
      const r = (await pool).request();
      
      // Helper function to convert date to IST and format
      const toIST = (date) => {
        if (!date) return null;
        // IST is UTC+5:30, so add 5 hours 30 minutes
        const istTime = new Date(date.getTime() + (5 * 60 + 30) * 60 * 1000);
        return {
          date: istTime,
          year: istTime.getUTCFullYear(),
          month: istTime.getUTCMonth(),
          day: istTime.getUTCDate(),
          hours: istTime.getUTCHours(),
          minutes: istTime.getUTCMinutes(),
          seconds: istTime.getUTCSeconds(),
          formatted: `${istTime.getUTCFullYear()}-${String(istTime.getUTCMonth() + 1).padStart(2, '0')}-${String(istTime.getUTCDate()).padStart(2, '0')} ${String(istTime.getUTCHours()).padStart(2, '0')}:${String(istTime.getUTCMinutes()).padStart(2, '0')}:${String(istTime.getUTCSeconds()).padStart(2, '0')} IST`,
          dateOnly: `${istTime.getUTCFullYear()}-${String(istTime.getUTCMonth() + 1).padStart(2, '0')}-${String(istTime.getUTCDate()).padStart(2, '0')}`
        };
      };
      
      // For sql.Date, extract the date part from IST dates
      // Since OTIF data dates are returned in IST, we extract the IST date components
      let fromDateParam = null;
      let toDateParam = null;
      
      if (win.from) {
        // Convert win.from to IST and extract date components
        const istFrom = toIST(win.from);
        // Create SQL date parameter using IST date components
        // SQL Server will interpret this as the date in its timezone
        fromDateParam = new Date(Date.UTC(istFrom.year, istFrom.month, istFrom.day, 0, 0, 0, 0));
        // req.log.info({
        //   msg: `[OTIF] FromDate calculated - Line 1063`,
        //   codeLocation: "Line 1063: fromDateParam = new Date(Date.UTC(...))",
        //   sourceWinFrom: win.from.toISOString(),
        //   sourceWinFromIST: istFrom.formatted,
        //   extractedISTComponents: { year: istFrom.year, month: istFrom.month + 1, day: istFrom.day },
        //   calculatedFromDateParamIST: toIST(fromDateParam)?.formatted,
        //   appliedDateIST: toIST(fromDateParam)?.formatted,
        //   appliedDateOnlyIST: toIST(fromDateParam)?.dateOnly
        // });
      }
      
      if (win.to) {
        // Convert win.to to IST and extract date components
        const istTo = toIST(win.to);
        // Create SQL date parameter using IST date components
        toDateParam = new Date(Date.UTC(istTo.year, istTo.month, istTo.day, 23, 59, 59, 999));
        // req.log.info({
        //   msg: `[OTIF] ToDate calculated - Line 1080`,
        //   codeLocation: "Line 1080: toDateParam = new Date(Date.UTC(...))",
        //   sourceWinTo: win.to.toISOString(),
        //   sourceWinToIST: istTo.formatted,
        //   extractedISTComponents: { year: istTo.year, month: istTo.month + 1, day: istTo.day },
        //   calculatedToDateParamIST: toIST(toDateParam)?.formatted,
        //   appliedDateIST: toIST(toDateParam)?.formatted,
        //   appliedDateOnlyIST: toIST(toDateParam)?.dateOnly
        // });
      }
      
      // req.log.info({
      //   msg: `[OTIF] Executing stored procedure for ${tag}`,
      //   ledgerIdsCount: ids.length,
      //   originalFromDateIST: win.from ? toIST(win.from)?.formatted : null,
      //   originalToDateIST: win.to ? toIST(win.to)?.formatted : null,
      //   fromDateParamIST: fromDateParam ? toIST(fromDateParam)?.formatted : null,
      //   toDateParamIST: toDateParam ? toIST(toDateParam)?.formatted : null,
      //   fromDateSQLIST: fromDateParam ? toIST(fromDateParam)?.dateOnly : null,
      //   toDateSQLIST: toDateParam ? toIST(toDateParam)?.dateOnly : null,
      //   search: q || "",
      //   afterDateIST: after?.date ? toIST(after.date)?.formatted : null,
      //   afterId: after?.id || null,
      //   limit: Number(limit) + 5
      // });
      
      r.input("LedgerIds", tvp(ids));
      // req.log.info({
      //   msg: `[OTIF] Applying dates to SQL procedure - Lines 1118-1119`,
      //   codeLocation: "Lines 1118-1119: r.input('FromDate'/'ToDate', sql.Date, ...)",
      //   fromDateAppliedIST: fromDateParam ? toIST(fromDateParam)?.formatted : null,
      //   toDateAppliedIST: toDateParam ? toIST(toDateParam)?.formatted : null,
      //   fromDateSQLFormatIST: fromDateParam ? toIST(fromDateParam)?.dateOnly : null,
      //   toDateSQLFormatIST: toDateParam ? toIST(toDateParam)?.dateOnly : null,
      //   sqlParameterType: "sql.Date"
      // });
      r.input("FromDate", sql.Date, fromDateParam);
      r.input("ToDate", sql.Date, toDateParam);
      r.input("Search", sql.NVarChar(100), q || "");
      r.input("AfterDate", sql.DateTime2, after?.date || null);
      r.input("AfterId", sql.Int, after?.id || null);
      r.input("Limit", sql.Int, Number(limit) + 5);

      const rs = await r.execute("dbo.portal_otif_list");
      const rows = rs.recordset || [];
      
      // req.log.info({
      //   msg: `[OTIF] Stored procedure result for ${tag}`,
      //   rowCount: rows.length,
      //   sampleDates: rows.slice(0, 5).map(row => ({
      //     PODate: row.PODate,
      //     ApprovalDate: row.ApprovalDate,
      //     CommittedDeliveryDate: row.CommittedDeliveryDate,
      //     LastDeliveryDate: row.LastDeliveryDate,
      //     PONumber: row.PONumber,
      //     JobCardNumber: row.JobCardNumber
      //   }))
      // });
      
      rows.forEach((row) => (row._source = tag));
      return rows;
    };

    const tagOtifRows = (rows, ledgerId, ledgerName) => {
      rows.forEach((row) => {
        row.LedgerId = ledgerId;
        row.LedgerName = ledgerName ?? "";
      });
      return rows;
    };

    let merged = [];
    if (source === "db1") {
      const batches = await Promise.all(
        ids1.map((ledgerId, i) =>
          execOne(db1(), [ledgerId], "db1").then((rows) =>
            tagOtifRows(rows, ledgerId, names1[i])
          )
        )
      );
      merged = batches.flat();
    } else if (source === "db2") {
      const batches = await Promise.all(
        ids2.map((ledgerId, i) =>
          execOne(db2(), [ledgerId], "db2").then((rows) =>
            tagOtifRows(rows, ledgerId, names2[i])
          )
        )
      );
      merged = batches.flat();
    } else {
      const [a, b] = await Promise.all([
        Promise.all(
          ids1.map((ledgerId, i) =>
            execOne(db1(), [ledgerId], "db1").then((rows) =>
              tagOtifRows(rows, ledgerId, names1[i])
            )
          )
        ).then((arr) => arr.flat()),
        Promise.all(
          ids2.map((ledgerId, i) =>
            execOne(db2(), [ledgerId], "db2").then((rows) =>
              tagOtifRows(rows, ledgerId, names2[i])
            )
          )
        ).then((arr) => arr.flat()),
      ]);
      merged = [...a, ...b];
    }

    // All date filtering is done in SQL procedure - no JavaScript filtering needed
    // global sort + page trim
    const filteredMerged = merged;
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

    // req.log.info({
    //   msg: "[OTIF] Final response",
    //   itemCount: page.length,
    //   hasNextCursor: !!nextCursor,
    //   dateWindow: {
    //     from: win.from?.toISOString(),
    //     to: win.to?.toISOString(),
    //     fromLocal: win.from?.toString(),
    //     toLocal: win.to?.toString()
    //   },
    //   firstItem: page[0] ? {
    //     PONumber: page[0].PONumber,
    //     PODate: page[0].PODate,
    //     PODateISO: page[0].PODate ? new Date(page[0].PODate).toISOString() : null,
    //     JobCardNumber: page[0].JobCardNumber,
    //     OrderStatus: page[0].OrderStatus
    //   } : null
    // });

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

  fastify.get(
    "/orders/:jobId/processes/:processId/inspections",
    async (req, reply) => {
      const { jobId, processId } = req.params;
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
        r.input("ProcessID", sql.Int, Number(processId));
        r.input("LedgerIds", tvp(ids));
        const rs = await r.execute("dbo.portal_order_process_inspections");
        return rs.recordset || [];
      };

      if (source === "db1")
        return execOne(db1(), tenant.ledgerIds_db1 || []);
      if (source === "db2")
        return execOne(db2(), tenant.ledgerIds_db2 || []);

      // If source is not specified, try both DBs and return whichever has data
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
        return reply.code(404).send({ error: "No inspection data found" });

      // rows already in final shape: ParameterName, TotalChecks, NotOkChecks, NotOkPct
      return rows;
    }
  );

  /**
   * CHAT HISTORY + PERSISTENCE
   *
   * Collection: chat_sessions
   * Shape:
   * {
   *   _id: ObjectId,
   *   userId: string,        // typically req.user.email
   *   agentKey: string,      // e.g. "packaging-quote"
   *   agentName: string,
   *   messages: [
   *     { role: "user" | "assistant", content: string, ts: Date }
   *   ],
   *   createdAt: Date,
   *   updatedAt: Date
   * }
   */

  // GET /api/chat/agents – list all active chat agents (for chatbot UI)
  fastify.get("/chat/agents", async (req, reply) => {
    try {
      const agents = await getAllChatAgents();
      const list = (agents || []).map((a) => ({
        agentKey: a.agentKey,
        name: a.name,
        buttonText: a.buttonText,
        description: a.description || "",
      }));
      return { agents: list };
    } catch (err) {
      req.log.error(err, "Error in GET /api/chat/agents");
      return reply
        .code(500)
        .send({ error: "Failed to load chat agents", details: err.message });
    }
  });

  // GET /api/chat/history?agentKey=packaging-quote
  // Returns existing chat for this user+agent.
  // If no history exists, returns a single initial assistant message
  // derived from the agent's job/description.
  fastify.get("/chat/history", async (req, reply) => {
    try {
      const { agentKey } = req.query || {};

      if (!agentKey || typeof agentKey !== "string") {
        return reply.code(400).send({ error: "agentKey is required" });
      }

      const userId = req.user?.email || req.user?.id || null;
      if (!userId) {
        return reply.code(401).send({ error: "User not authenticated" });
      }

      const db = await getDb();
      const agent = await getChatAgentByKey(agentKey);
      if (!agent) {
        return reply.code(404).send({ error: "Chat agent not found" });
      }

      let session = await db.collection("chat_sessions").findOne({
        userId,
        agentKey,
      });

      if (!session) {
        // No history → create session with initial assistant message (persisted)
        const initialText =
          agent.initialMessage ||
          `Hi, I am ${agent.name}. ${agent.description || "How can I help you today?"}`;

        const initialMessage = {
          role: "assistant",
          content: initialText,
          ts: new Date(),
        };

        await db.collection("chat_sessions").insertOne({
          userId,
          agentKey,
          agentName: agent.name,
          messages: [initialMessage],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        return {
          hasHistory: false,
          agent: {
            agentKey: agent.agentKey,
            name: agent.name,
            buttonText: agent.buttonText,
            description: agent.description,
          },
          messages: [initialMessage],
        };
      }

      return {
        hasHistory: true,
        agent: {
          agentKey: agent.agentKey,
          name: agent.name,
          buttonText: agent.buttonText,
          description: agent.description,
        },
        messages: session.messages || [],
      };
    } catch (err) {
      req.log.error(err, "Error in GET /api/chat/history");
      return reply
        .code(500)
        .send({ error: "Failed to load chat history", details: err.message });
    }
  });

  // POST /api/chat/message
  // Body: { agentKey: string, message: { role: "user", content: string } }
  // Appends user + generated assistant to session. Returns { ok, assistant: { role, content } }.
  fastify.post("/chat/message", async (req, reply) => {
    try {
      const { agentKey, message } = req.body || {};

      if (!agentKey || typeof agentKey !== "string") {
        return reply.code(400).send({ error: "agentKey is required" });
      }

      if (
        !message ||
        typeof message.content !== "string" ||
        message.role !== "user"
      ) {
        return reply.code(400).send({
          error: 'message with role "user" and content is required',
        });
      }

      const userId = req.user?.email || req.user?.id || null;
      if (!userId) {
        return reply.code(401).send({ error: "User not authenticated" });
      }

      const db = await getDb();
      const agent = await getChatAgentByKey(agentKey);
      if (!agent) {
        return reply.code(404).send({ error: "Chat agent not found" });
      }

      const now = new Date();
      const userContent = String(message.content).trim();
      const userMsg = { role: "user", content: userContent, ts: now };

      const session = await db.collection("chat_sessions").findOne({
        userId,
        agentKey,
      });

      const initialText =
        agent.initialMessage ||
        `Hi, I am ${agent.name}. ${agent.description || "How can I help you today?"}`;
      const initialMsg = { role: "assistant", content: initialText, ts: now };

      const existing = session?.messages || [];
      const forLlm = [
        { role: "system", content: agent.systemPrompt || "You are a helpful assistant." },
        ...existing.map((m) => ({ role: m.role, content: m.content || "" })),
        { role: "user", content: userContent },
      ];

      const assistantContent =
        agentKey === "order-status"
          ? await callOrderStatusLlm(forLlm, { mongo: db, email: userId, log: req.log })
          : agentKey === "packaging-quote"
          ? await callPackagingQuoteLlm(forLlm, { log: req.log })
          : agentKey === "book-quote"
          ? await callBookQuoteLlm(forLlm, { log: req.log })
          : await callChatLlm(forLlm);
      const assistantMsg = { role: "assistant", content: assistantContent, ts: new Date() };

      const toPush = !session ? [initialMsg, userMsg, assistantMsg] : [userMsg, assistantMsg];

      await db.collection("chat_sessions").updateOne(
        { userId, agentKey },
        {
          $setOnInsert: { agentName: agent.name, createdAt: now },
          $set: { updatedAt: now },
          $push: { messages: { $each: toPush } },
        },
        { upsert: true }
      );

      return { ok: true, assistant: { role: "assistant", content: assistantContent } };
    } catch (err) {
      req.log.error(err, "Error in POST /api/chat/message");
      return reply
        .code(500)
        .send({ error: "Failed to save chat message", details: err.message });
    }
  });
}

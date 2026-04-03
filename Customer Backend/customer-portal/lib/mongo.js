import { MongoClient } from "mongodb";

let client, db;
let tenantIndexState = "pending"; // pending | ok | failed

/**
 * Tenants are unique on (email, customer_key). Drops a legacy unique index on
 * customer_key alone if present, then creates the compound unique index.
 */
async function ensureTenantIndexes(database) {
  const col = database.collection("tenants");
  const existing = await col.indexes();
  for (const idx of existing) {
    const key = idx.key || {};
    const names = Object.keys(key);
    if (
      idx.unique &&
      names.length === 1 &&
      key.customer_key === 1 &&
      idx.name &&
      idx.name !== "_id_"
    ) {
      await col.dropIndex(idx.name);
    }
  }
  await col.createIndex(
    { email: 1, customer_key: 1 },
    { unique: true, name: "tenants_email_customer_key_unique" }
  );
}

export async function getDb() {
  if (!db) {
    client = new MongoClient(process.env.MONGO_URI, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 8000,
    });
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    db = client.db(process.env.MONGO_DB);
  }
  if (tenantIndexState === "pending") {
    try {
      await ensureTenantIndexes(db);
      tenantIndexState = "ok";
    } catch (e) {
      tenantIndexState = "failed";
      console.warn(
        "[mongo] tenants index setup failed (fix indexes in MongoDB if needed):",
        e?.message || e
      );
    }
  }
  return db;
}

/** Resolve tenant by the compound identity (email + customer_key). */
export async function getTenantByEmailAndCustomerKey(email, customer_key) {
  const db = await getDb();
  const emailNorm = String(email || "").trim().toLowerCase();
  let t = await db.collection("tenants").findOne({ email: emailNorm, customer_key });
  if (!t && customer_key != null) {
    const asString = String(customer_key);
    if (asString !== customer_key) {
      t = await db.collection("tenants").findOne({
        email: emailNorm,
        customer_key: asString,
      });
    }
    if (!t) {
      const n = Number(customer_key);
      if (Number.isFinite(n)) {
        t = await db.collection("tenants").findOne({
          email: emailNorm,
          $or: [{ customer_key: asString }, { sales_ledger_id: n }],
        });
      }
    }
  }
  if (!t) throw new Error("Tenant not found");
  return { ledgerId_db1: t.ledgerId_db1, ledgerId_db2: t.ledgerId_db2 };
}

/**
 * Ambiguous when multiple users share one customer_key. Prefer getTenantByEmailAndCustomerKey.
 * @deprecated
 */
export async function getTenantByCustomerKey(customer_key) {
  const db = await getDb();
  const t = await db.collection("tenants").findOne({ customer_key });
  if (!t) throw new Error("Tenant not found");
  return { ledgerId_db1: t.ledgerId_db1, ledgerId_db2: t.ledgerId_db2 };
}
export async function closeMongo() {
  if (client) await client.close();
}

import { MongoClient } from "mongodb";

let client, db;
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
  return db;
}
export async function getTenantByCustomerKey(customer_key) {
  const db = await getDb();
  const t = await db.collection("tenants").findOne({ customer_key });
  if (!t) throw new Error("Tenant not found");
  return { ledgerId_db1: t.ledgerId_db1, ledgerId_db2: t.ledgerId_db2 };
}
export async function closeMongo() {
  if (client) await client.close();
}

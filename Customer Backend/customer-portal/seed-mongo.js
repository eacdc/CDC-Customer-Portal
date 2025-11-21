import { MongoClient } from "mongodb";
import "dotenv/config";

const client = new MongoClient(process.env.MONGO_URI);

async function run() {
  await client.connect();
  const db = client.db(process.env.MONGO_DB);

  await db.collection("tenants").insertOne({
    customer_key: "ABC123",
    ledgerId_db1: 6793,
    ledgerId_db2: 6793,
  });

  console.log("✅ Tenant seeded successfully");
  await client.close();
}

run().catch(console.error);

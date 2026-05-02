import "dotenv/config";
import { createRequire } from "module";
import { getDb, closeMongo } from "./lib/mongo.js";

const require = createRequire(import.meta.url);
const masterTableData = require("./pck_est/data/masterTable.json");
const optionsDataRaw = require("./comm_est/data/optionsData.json");
const calculateSheetData = require("./comm_est/data/calculateSheetData.json");
const commMasterTable = {
  ...optionsDataRaw,
  ...calculateSheetData,
};

const seedDocs = [
  { _id: "masterTable", data: masterTableData },
  { _id: "comm_masterTable", data: commMasterTable },
];

async function run() {
  const db = await getDb();
  const col = db.collection("pricing_tables");
  let inserted = 0;

  for (const doc of seedDocs) {
    const existing = await col.findOne({ _id: doc._id }, { projection: { _id: 1 } });
    if (existing) continue;

    await col.insertOne({
      ...doc,
      updatedAt: new Date(),
      updatedBy: "seed-script",
    });
    inserted += 1;
  }

  console.log(`[seed-pricing-tables] done. inserted=${inserted} checked=${seedDocs.length}`);
}

run()
  .catch((err) => {
    console.error("[seed-pricing-tables] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongo();
  });

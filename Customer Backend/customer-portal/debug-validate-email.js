import "dotenv/config";
import sql from "mssql";

const email = "anish@apurva.org.in";
const key = "400996";

async function runOne(tag, cfg) {
  const pool = await new sql.ConnectionPool(cfg).connect();
  const r = pool.request();
  r.input("Email", sql.NVarChar(320), email.trim().toLowerCase());
  r.input("CustomerKey", sql.NVarChar(50), key);
  r.output("IsSuccess", sql.Bit);
  r.output("LedgerIDsCsv", sql.NVarChar(sql.MAX));
  r.output("Message", sql.NVarChar(200));
  const rs = await r.execute("dbo.portal_validate_email_key");
  console.log(`=== ${tag} ===`);
  console.log(
    "ok, csv, message:",
    !!rs.output.IsSuccess,
    rs.output.LedgerIDsCsv,
    rs.output.Message
  );
  console.log("recordset:", rs.recordset);
  await pool.close();
}

await runOne("DB1", {
  user: process.env.DB1_USER,
  password: process.env.DB1_PASSWORD,
  server: process.env.DB1_SERVER,
  port: Number(process.env.DB1_PORT),
  database: process.env.DB1_DATABASE,
  options: { encrypt: true, trustServerCertificate: true },
});

await runOne("DB2", {
  user: process.env.DB2_USER,
  password: process.env.DB2_PASSWORD,
  server: process.env.DB2_SERVER,
  port: Number(process.env.DB2_PORT),
  database: process.env.DB2_DATABASE,
  options: { encrypt: true, trustServerCertificate: true },
});

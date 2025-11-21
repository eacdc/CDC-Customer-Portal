import sql from "mssql";
import "dotenv/config";

const pool = await new sql.ConnectionPool({
  user: process.env.DB1_USER,
  password: process.env.DB1_PASSWORD,
  server: process.env.DB1_SERVER,
  port: Number(process.env.DB1_PORT),
  database: process.env.DB1_DATABASE,

  options: {
    encrypt: true, // true if SQL Server uses SSL
    trustServerCertificate: true, // true if using self-signed cert
  },
}).connect();

console.log("✅ Connected to DB:", process.env.DB1_DATABASE);
await pool.close();

import sql from "mssql";

let pool;
export async function db2() {
  if (!pool) {
    pool = await new sql.ConnectionPool({
      user: process.env.DB2_USER,
      password: process.env.DB2_PASSWORD,
      server: process.env.DB2_SERVER,
      port: Number(process.env.DB2_PORT), // 👈 separate port
      database: process.env.DB2_DATABASE,
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
    }).connect();
  }
  return pool;
}

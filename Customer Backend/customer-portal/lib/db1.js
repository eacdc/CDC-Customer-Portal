import sql from "mssql";

let pool;
export async function db1() {
  if (!pool) {
    pool = await new sql.ConnectionPool({
      user: process.env.DB1_USER,
      password: process.env.DB1_PASSWORD,
      server: process.env.DB1_SERVER,
      port: Number(process.env.DB1_PORT), // 👈 separate port
      database: process.env.DB1_DATABASE,
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
    }).connect();
  }
  return pool;
}

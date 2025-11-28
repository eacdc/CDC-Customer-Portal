import sql from "mssql";

let pool;
export async function db1() {
  if (!pool) {
    pool = await new sql.ConnectionPool({
      user: process.env.DB1_USER,
      password: process.env.DB1_PASSWORD,
      server: process.env.DB1_SERVER,
      port: Number(process.env.DB1_PORT),
      database: process.env.DB1_DATABASE,
      options: {
        encrypt: true,
        trustServerCertificate: true,
        requestTimeout: 60000, // 60 seconds
        connectionTimeout: 30000, // 30 seconds
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      }
    }).connect();
  }
  return pool;
}

import sql from "mssql";

let pool;
export async function db2() {
  if (!pool) {
    pool = await new sql.ConnectionPool({
      user: process.env.DB2_USER,
      password: process.env.DB2_PASSWORD,
      server: process.env.DB2_SERVER,
      port: Number(process.env.DB2_PORT),
      database: process.env.DB2_DATABASE,
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

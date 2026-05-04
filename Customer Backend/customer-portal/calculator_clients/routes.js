import { listJobBookingClients } from "../lib/jobBookingClients.js";
import { normalizeDatabaseKey } from "../lib/salesExecutives.js";

export default async function calculatorClientsPlugin(fastify) {
  fastify.get("/calculator-clients", async (req, reply) => {
    const raw = (req.query && (req.query.database || req.query.site)) || "";
    const dbKey = normalizeDatabaseKey(raw);
    if (!dbKey) {
      return reply.code(400).send({
        success: false,
        error: "Query parameter database is required (ahm or kol)."
      });
    }
    try {
      const clients = await listJobBookingClients(dbKey);
      return {
        success: true,
        database: dbKey,
        clients
      };
    } catch (e) {
      req.log.error(e);
      return reply.code(503).send({
        success: false,
        error: "Could not load clients from the database."
      });
    }
  });
}

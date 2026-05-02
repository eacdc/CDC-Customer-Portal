import { listSalesExecutives, normalizeDatabaseKey } from "../lib/salesExecutives.js";

export default async function salesExecutivesPlugin(fastify) {
  fastify.get("/sales-executives", async (req, reply) => {
    const raw =
      (req.query && (req.query.database || req.query.site)) || "";
    const dbKey = normalizeDatabaseKey(raw);
    if (!dbKey) {
      return reply.code(400).send({
        success: false,
        error: "Query parameter database is required (ahm or kol)."
      });
    }
    try {
      const users = await listSalesExecutives(dbKey);
      return {
        success: true,
        database: dbKey,
        users: users.map((u) => ({
          ledgerId: u.ledgerId,
          ledgerName: u.ledgerName
        }))
      };
    } catch (e) {
      req.log.error(e);
      return reply.code(503).send({
        success: false,
        error: "Could not load sales executives from the database."
      });
    }
  });
}

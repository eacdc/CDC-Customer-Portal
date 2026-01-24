// comm_est/routes.js - Fastify plugin for commercial estimation API
import { calCulate } from './calculator.js';

export default async function commEstPlugin(fastify, opts) {
  // POST /api/comm-est/calculate
  fastify.post('/comm-est/calculate', {
    schema: {
      body: {
        type: 'object'
      }
    }
  }, async (req, reply) => {
    const requestStartTime = Date.now();
    
    try {
      // Check if body exists
      if (!req.body || typeof req.body !== 'object') {
        return reply.code(400).send({
          success: false,
          error: 'Request body is missing or invalid. Please send JSON data.'
        });
      }

      // Validate required fields
      const requiredFields = ['len', 'brd', 'Qty', 'binding_style', 'components', 'gsm', 'material', 'page_number'];
      const missingFields = requiredFields.filter(field => req.body[field] === undefined || req.body[field] === null);
      
      if (missingFields.length > 0) {
        return reply.code(400).send({
          success: false,
          error: 'Missing required fields',
          missingFields: missingFields
        });
      }

      // Call the calculator
      const result = await calCulate(req.body, requestStartTime);

      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      fastify.log.error(error, 'Error in comm-est/calculate');
      return reply.code(500).send({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  });

  // GET /api/comm-est/health - Health check endpoint
  fastify.get('/comm-est/health', async (req, reply) => {
    return reply.send({
      ok: true,
      service: 'commercial-estimation',
      ts: new Date().toISOString()
    });
  });
}

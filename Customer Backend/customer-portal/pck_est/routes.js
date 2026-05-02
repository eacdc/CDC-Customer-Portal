// pck_est/routes.js - Fastify plugin for packaging estimation API
import { calculatePricing } from './calculator.js';

export default async function pckEstPlugin(fastify, opts) {
  // POST /api/pck-est/calculate
  fastify.post('/pck-est/calculate', {
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
      const requiredFields = ['client_name', 'sku_name', 'len', 'brd', 'height', 'qty', 'matin', 'gsmTop', 'ptype'];
      const missingFields = requiredFields.filter((field) => {
        const v = req.body[field];
        if (v === undefined || v === null) return true;
        if (field === 'client_name' || field === 'sku_name') {
          return String(v).trim() === '';
        }
        return false;
      });
      
      if (missingFields.length > 0) {
        return reply.code(400).send({
          success: false,
          error: 'Missing required fields',
          missingFields: missingFields
        });
      }

      // Call the calculator
      const result = await calculatePricing(req.body, requestStartTime);

      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      fastify.log.error(error, 'Error in pck-est/calculate');
      return reply.code(500).send({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  });

  // GET /api/pck-est/health - Health check endpoint
  fastify.get('/pck-est/health', async (req, reply) => {
    return reply.send({
      ok: true,
      service: 'packaging-estimation',
      ts: new Date().toISOString()
    });
  });
}

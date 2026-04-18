import { sql } from 'kysely';
import type { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/healthz', async (_req, reply) => {
    try {
      await sql`SELECT 1`.execute(app.db);
      return { status: 'ok', db: 'ok' };
    } catch (err) {
      app.log.error({ err }, 'healthz db probe failed');
      reply.code(503);
      return { status: 'degraded', db: 'error' };
    }
  });
};

export default healthRoutes;

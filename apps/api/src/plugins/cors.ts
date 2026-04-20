import fp from 'fastify-plugin';
import cors from '@fastify/cors';

export default fp(
  async (app) => {
    const raw = app.config.CORS_ORIGIN;
    const origins = raw.includes(',')
      ? raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : raw;
    await app.register(cors, { origin: origins });
  },
  { name: 'cors-plugin', dependencies: ['@fastify/env'] },
);

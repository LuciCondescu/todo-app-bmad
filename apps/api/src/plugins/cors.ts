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
    // @fastify/cors v11 defaults `methods` to 'GET,HEAD,POST' — PATCH and DELETE
    // are not included by default. Story 3.1 (PATCH /v1/todos/:id) and Story 3.2
    // (DELETE /v1/todos/:id) require both, so declare the full list explicitly.
    await app.register(cors, {
      origin: origins,
      methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
    });
  },
  { name: 'cors-plugin', dependencies: ['@fastify/env'] },
);

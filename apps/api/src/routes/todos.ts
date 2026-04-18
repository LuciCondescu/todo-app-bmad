import type { FastifyPluginAsync } from 'fastify';

const todosRoutes: FastifyPluginAsync = async (_app) => {
  // Handlers for POST/GET/PATCH/DELETE /v1/todos* land in Epic 2 (stories 2.1..3.2).
  // Keeping this file + its /v1 prefix registration stable avoids churn in app.ts.
};

export default todosRoutes;

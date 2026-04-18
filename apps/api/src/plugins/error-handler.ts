import fp from 'fastify-plugin';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { NotFoundError } from '../errors/index.js';

type PgLikeError = { code?: string };

export function isPgError(err: unknown): err is PgLikeError {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as PgLikeError).code === 'string'
  );
}

export default fp(
  async (app) => {
    app.setErrorHandler(
      async (error: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
        if (error.validation) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: error.message,
          });
        }

        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: error.message,
          });
        }

        if (isPgError(error) && typeof error.code === 'string' && error.code.startsWith('23')) {
          return reply.status(409).send({
            statusCode: 409,
            error: 'Conflict',
            message: 'Conflict — the request violates a database constraint.',
          });
        }

        app.log.error({ err: error }, 'unhandled route error');
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Internal server error',
        });
      },
    );
  },
  { name: 'error-handler-plugin' },
);

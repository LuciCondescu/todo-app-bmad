import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ErrorResponseSchema } from '../schemas/errors.js';
import { TodoSchema, CreateTodoInputSchema } from '../schemas/todo.js';

export default fp(
  async (app) => {
    app.addSchema(ErrorResponseSchema);
    app.addSchema(TodoSchema);
    app.addSchema(CreateTodoInputSchema);

    await app.register(swagger, {
      openapi: {
        info: {
          title: 'todo-app API',
          version: '1.0.0',
        },
        servers: [{ url: '/' }],
      },
      // Preserve `$id` as the components.schemas key so routes `$ref: 'ErrorResponse#'`
      // resolve to `#/components/schemas/ErrorResponse` (default emits `def-0`).
      refResolver: {
        buildLocalReference(json, _baseUri, _fragment, i) {
          return typeof json.$id === 'string' ? json.$id : `def-${i}`;
        },
      },
    });

    await app.register(swaggerUi, { routePrefix: '/docs' });
  },
  { name: 'swagger-plugin', dependencies: ['@fastify/env'] },
);

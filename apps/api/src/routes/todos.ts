import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsync } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { CreateTodoInputSchema, TodoSchema } from '../schemas/todo.js';
import * as todosRepo from '../repositories/todosRepo.js';

const todosRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<TypeBoxTypeProvider>();

  typedApp.post(
    '/todos',
    {
      schema: {
        body: CreateTodoInputSchema,
        response: {
          201: TodoSchema,
          400: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const todo = await todosRepo.create(request.body, app.db);
      reply.code(201);
      return todo;
    },
  );

  typedApp.get(
    '/todos',
    {
      schema: {
        response: { 200: Type.Array(TodoSchema) },
      },
    },
    async () => {
      return todosRepo.listAll(app.db);
    },
  );

  // Handlers for PATCH /todos/:id, DELETE /todos/:id land in stories 3.1, 3.2.
};

export default todosRoutes;

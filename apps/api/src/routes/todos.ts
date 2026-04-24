import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsync } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { CreateTodoInputSchema, TodoSchema, UpdateTodoInputSchema } from '../schemas/todo.js';
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

  typedApp.patch(
    '/todos/:id',
    {
      schema: {
        params: Type.Object(
          { id: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: UpdateTodoInputSchema,
        response: {
          200: TodoSchema,
          400: { $ref: 'ErrorResponse#' },
          404: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request) => {
      return todosRepo.update(request.params.id, request.body, app.db);
    },
  );

  // Handler for DELETE /todos/:id lands in story 3.2.
};

export default todosRoutes;

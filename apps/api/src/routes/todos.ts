import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsync } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { NotFoundError } from '../errors/index.js';
import { CreateTodoInputSchema, TodoSchema, UpdateTodoInputSchema } from '../schemas/todo.js';
import * as todosRepo from '../repositories/todosRepo.js';

const TodoIdParamsSchema = Type.Object(
  { id: Type.String({ format: 'uuid' }) },
  { additionalProperties: false },
);

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
        params: TodoIdParamsSchema,
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

  typedApp.delete(
    '/todos/:id',
    {
      schema: {
        params: TodoIdParamsSchema,
        response: {
          204: Type.Null({ description: 'No Content' }),
          400: { $ref: 'ErrorResponse#' },
          404: { $ref: 'ErrorResponse#' },
        },
      },
    },
    async (request, reply) => {
      const affected = await todosRepo.remove(request.params.id, app.db);
      if (affected === 0) {
        throw new NotFoundError(`Todo ${request.params.id} not found`);
      }
      return reply.status(204).send(null);
    },
  );
};

export default todosRoutes;

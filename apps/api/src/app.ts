import fastify, { type FastifyInstance } from 'fastify';
import fastifyEnv from '@fastify/env';
import * as addFormatsModule from 'ajv-formats';
import type { Ajv } from 'ajv';

// ajv-formats is CJS; under NodeNext its namespace import exposes the callable plugin
// as `.default`. Fall through to the namespace itself if the default field is absent.
const addFormats = (addFormatsModule as unknown as { default: (ajv: Ajv) => Ajv }).default;
import type { Kysely } from 'kysely';
import { envSchema } from './config.js';
import { createDb } from './db/index.js';
import type { Database } from './db/schema.js';
import healthRoutes from './routes/health.js';
import corsPlugin from './plugins/cors.js';
import helmetPlugin from './plugins/helmet.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import swaggerPlugin from './plugins/swagger.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import todosRoutes from './routes/todos.js';

export interface BuildAppOptions {
  config?: Record<string, unknown>;
  db?: Kysely<Database>;
  registerTestRoutes?: (app: FastifyInstance) => Promise<void>;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = fastify({ logger: buildLoggerConfig(), bodyLimit: 65_536 });

  try {
    await app.register(fastifyEnv, {
      schema: envSchema,
      dotenv: opts.config === undefined,
      data: opts.config ?? process.env,
      ajv: {
        customOptions: (ajv) => {
          addFormats(ajv);
          return ajv;
        },
      },
    });

    const db = opts.db ?? createDb(app.config.DATABASE_URL);
    app.decorate('db', db);
    app.addHook('onClose', async () => {
      await db.destroy();
    });

    await app.register(corsPlugin);
    await app.register(helmetPlugin);
    await app.register(rateLimitPlugin);
    await app.register(swaggerPlugin);
    await app.register(errorHandlerPlugin);

    if (opts.registerTestRoutes) {
      await opts.registerTestRoutes(app);
    }

    await app.register(healthRoutes);
    await app.register(todosRoutes, { prefix: '/v1' });
    await app.ready();
  } catch (err) {
    await app.close();
    throw err;
  }

  return app;
}

function buildLoggerConfig() {
  // Read raw env BEFORE @fastify/env is registered — logger is constructor-time only.
  const level = process.env.LOG_LEVEL ?? 'info';
  const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';

  return isDev
    ? {
        level,
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
        },
      }
    : { level };
}

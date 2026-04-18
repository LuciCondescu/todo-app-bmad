import fastify, { type FastifyInstance } from 'fastify';
import fastifyEnv from '@fastify/env';
import type { Kysely } from 'kysely';
import { envSchema } from './config.js';
import { createDb } from './db/index.js';
import type { Database } from './db/schema.js';
import healthRoutes from './routes/health.js';

export interface BuildAppOptions {
  config?: Record<string, unknown>;
  db?: Kysely<Database>;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = fastify({ logger: buildLoggerConfig() });

  try {
    await app.register(fastifyEnv, {
      schema: envSchema,
      dotenv: opts.config === undefined,
      data: opts.config ?? process.env,
    });

    const db = opts.db ?? createDb(app.config.DATABASE_URL);
    app.decorate('db', db);
    app.addHook('onClose', async () => {
      await db.destroy();
    });

    await app.register(healthRoutes);
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

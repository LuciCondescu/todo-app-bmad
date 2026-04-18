import fastify, { type FastifyInstance } from 'fastify';
import fastifyEnv from '@fastify/env';
import { envSchema } from './config.js';
import healthRoutes from './routes/health.js';

export interface BuildAppOptions {
  config?: Record<string, unknown>;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = fastify({ logger: buildLoggerConfig() });

  try {
    await app.register(fastifyEnv, {
      schema: envSchema,
      dotenv: opts.config === undefined,
      data: opts.config ?? process.env,
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

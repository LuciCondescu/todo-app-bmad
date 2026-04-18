// Env schema for @fastify/env. Plain JSON Schema; TypeBox arrives in Story 2.1.

export const envSchema = {
  type: 'object',
  required: ['DATABASE_URL'],
  properties: {
    DATABASE_URL: { type: 'string', format: 'uri', minLength: 1 },
    PORT: { type: 'number', minimum: 1, maximum: 65535, default: 3000 },
    CORS_ORIGIN: {
      type: 'string',
      format: 'uri',
      default: 'http://localhost:5173',
      minLength: 1,
    },
    LOG_LEVEL: {
      type: 'string',
      enum: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
    },
    NODE_ENV: {
      type: 'string',
      enum: ['development', 'production', 'test'],
      default: 'development',
    },
  },
} as const;

export interface Config {
  DATABASE_URL: string;
  PORT: number;
  CORS_ORIGIN: string;
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  NODE_ENV: 'development' | 'production' | 'test';
}

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
  }
}

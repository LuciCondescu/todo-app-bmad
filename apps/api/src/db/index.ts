import pg from 'pg';
import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import type { Database } from './schema.js';

const { Pool } = pg;

export function createDb(connectionString: string): Kysely<Database> {
  const pool = new Pool({ connectionString, max: 10 });

  // pg.Pool emits 'error' on idle-client failures (Postgres restart, network blip,
  // admin shutdown 57P01). Without a listener Node treats the event as unhandled
  // and crashes the process; the pool reconnects on the next acquire either way.
  pool.on('error', (err) => {
    // eslint-disable-next-line no-console -- Fastify logger not accessible at pool scope
    console.error('pg pool error (auto-recovering):', err.message);
  });

  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin()],
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Kysely<Database>;
  }
}

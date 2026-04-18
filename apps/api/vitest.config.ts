import { defineConfig } from 'vitest/config';

// Integration tests restart Postgres and mutate a shared schema; running files
// in parallel produces spurious "admin shutdown" / cross-file connection kills.
// Serial file execution keeps the suite deterministic at negligible cost.
export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
  },
});

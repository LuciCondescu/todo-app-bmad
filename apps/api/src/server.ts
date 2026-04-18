import { buildApp } from './app.js';

async function main() {
  const app = await buildApp();
  try {
    await app.listen({ port: app.config.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  // If buildApp itself threw (e.g. missing DATABASE_URL), app.log isn't available.
  // Fall back to console.error — observable form of AC2 fail-fast.
  console.error(err);
  process.exit(1);
});

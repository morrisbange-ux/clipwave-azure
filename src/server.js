'use strict';
require('./telemetry');
const config = require('./config');
const { createDb } = require('./db');
const { createStorage } = require('./storage');
const { createApp } = require('./app');

async function main() {
  const db = createDb();
  const storage = createStorage();
  await db.init();
  if (storage.init) await storage.init();
  const app = createApp({ db, storage, config });
  const server = app.listen(config.port, () => {
    console.log(`ClipWave listening on :${config.port} (db=${db.kind}, storage=${storage.kind}, revision=${config.build.revision})`);
  });
  // Graceful shutdown so scale-in and revision swaps don't drop requests.
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e) => {
  console.error('Failed to start', e);
  process.exit(1);
});

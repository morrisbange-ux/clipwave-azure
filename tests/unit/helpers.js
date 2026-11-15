'use strict';
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../../src/app');
const { createMemoryDb } = require('../../src/db/memory');
const { createLocalStorage } = require('../../src/storage/local');
const baseConfig = require('../../src/config');

function makeApp(overrides = {}) {
  const localDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipwave-'));
  const db = createMemoryDb();
  const storage = createLocalStorage({ localDir });
  const config = { ...baseConfig, jwtSecret: 'test-secret', maxUploadBytes: 1024 * 1024, ...overrides };
  return { app: createApp({ db, storage, config }), db, storage, config };
}

module.exports = { makeApp };

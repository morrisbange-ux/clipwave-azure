'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Minimal .env loader so local development needs no extra dependency.
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const env = process.env;

module.exports = {
  port: Number(env.PORT) || 3000,
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-do-not-use-in-production',
  maxUploadBytes: Number(env.MAX_UPLOAD_MB || 100) * 1024 * 1024,
  allowedVideoTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
  storage: {
    connectionString: env.AZURE_STORAGE_CONNECTION_STRING || '',
    container: env.STORAGE_CONTAINER || 'videos',
    localDir: env.LOCAL_UPLOAD_DIR || path.join(__dirname, '..', 'uploads'),
  },
  cosmos: {
    endpoint: env.COSMOS_ENDPOINT || '',
    key: env.COSMOS_KEY || '',
    database: env.COSMOS_DATABASE || 'clipwave',
    prefix: env.COSMOS_CONTAINER_PREFIX || '',
  },
  appInsights: env.APPLICATIONINSIGHTS_CONNECTION_STRING || '',
  build: {
    version: env.APP_VERSION || require('../package.json').version,
    commit: env.GIT_SHA || 'local',
    // Set automatically by Azure Container Apps on every replica.
    revision: env.CONTAINER_APP_REVISION || 'local',
    environment: env.APP_ENVIRONMENT || 'development',
  },
};

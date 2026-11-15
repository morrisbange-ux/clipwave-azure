'use strict';
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const defaultConfig = require('./config');
const { authenticate } = require('./auth');
const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/videos');

function createApp({ db, storage, config = defaultConfig }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind the Container Apps ingress (Envoy)

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        mediaSrc: ["'self'", 'blob:', 'https://*.blob.core.windows.net'],
        connectSrc: ["'self'", 'https://*.blob.core.windows.net'],
        imgSrc: ["'self'", 'data:'],
      },
    },
  }));
  app.use(express.json({ limit: '20kb' }));

  // Health probes used by Container Apps and the CI/CD smoke tests.
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', async (_req, res) => {
    try {
      await db.ping();
      res.json({ status: 'ready', db: db.kind, storage: storage.kind });
    } catch (e) {
      res.status(503).json({ status: 'unavailable', error: e.message });
    }
  });
  app.get('/api/version', (_req, res) => res.json(config.build));

  const apiLimiter = rateLimit({ windowMs: 60_000, limit: Number(process.env.RATE_LIMIT || 300), standardHeaders: 'draft-7', legacyHeaders: false });
  app.use('/api', apiLimiter, authenticate(config.jwtSecret));
  app.use('/api/auth', rateLimit({ windowMs: 60_000, limit: Number(process.env.AUTH_RATE_LIMIT || 30) }), authRoutes({ db, config }));
  app.use('/api/videos', videoRoutes({ db, storage, config }));

  // Local-storage mode only: emulate Blob Storage upload/download endpoints.
  if (storage.kind === 'local') {
    app.put('/media/:name', (req, res) => {
      let ws;
      try { ws = storage.writeStream(req.params.name); } catch { return res.status(400).end(); }
      let bytes = 0;
      req.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > config.maxUploadBytes) { req.unpipe(ws); ws.destroy(); res.status(413).end(); }
      });
      req.pipe(ws);
      ws.on('finish', () => res.status(201).end());
      ws.on('error', () => { if (!res.headersSent) res.status(500).end(); });
    });
    app.get('/media/:name', (req, res) => {
      try { res.sendFile(storage.filePath(req.params.name)); } catch { res.status(400).end(); }
    });
  }

  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };

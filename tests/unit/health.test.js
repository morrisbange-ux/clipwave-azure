'use strict';
const request = require('supertest');
const { makeApp } = require('./helpers');
const { createDb } = require('../../src/db');
const { createStorage } = require('../../src/storage');

describe('health, version and platform concerns', () => {
  test('liveness and readiness probes', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/healthz')).body).toEqual({ status: 'ok' });
    const ready = await request(app).get('/readyz');
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({ status: 'ready', db: 'memory', storage: 'local' });
  });

  test('readiness fails when the database is unreachable', async () => {
    const { app, db } = makeApp();
    db.ping = async () => { throw new Error('down'); };
    expect((await request(app).get('/readyz')).status).toBe(503);
  });

  test('version endpoint exposes the build and revision', async () => {
    const { app } = makeApp({ build: { version: '9.9.9', commit: 'abc1234', revision: 'clipwave--r1', environment: 'test' } });
    const res = await request(app).get('/api/version');
    expect(res.body).toEqual({ version: '9.9.9', commit: 'abc1234', revision: 'clipwave--r1', environment: 'test' });
  });

  test('sets security headers and hides the framework', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('unknown API routes return JSON 404', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });

  test('falls back to in-memory DB and local storage without Azure config', () => {
    expect(createDb({ endpoint: '', key: '' }).kind).toBe('memory');
    expect(createStorage({ connectionString: '', localDir: require('node:os').tmpdir() }).kind).toBe('local');
  });
});

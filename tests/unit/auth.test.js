'use strict';
const request = require('supertest');
const { makeApp } = require('./helpers');

describe('auth API', () => {
  let app;
  beforeEach(() => { ({ app } = makeApp()); });

  test('registers a user and returns a JWT', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'alice', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.username).toBe('alice');
  });

  test('rejects duplicate usernames (case-insensitive)', async () => {
    await request(app).post('/api/auth/register').send({ username: 'bob', password: 'password123' });
    const res = await request(app).post('/api/auth/register').send({ username: 'BOB', password: 'password123' });
    expect(res.status).toBe(409);
  });

  test.each([
    [{ username: 'ab', password: 'password123' }, /Username/],
    [{ username: 'bad name!', password: 'password123' }, /Username/],
    [{ username: 'carol', password: 'short' }, /Password/],
  ])('validates input %#', async (body, msg) => {
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(msg);
  });

  test('logs in with correct credentials only', async () => {
    await request(app).post('/api/auth/register').send({ username: 'dave', password: 'password123' });
    const ok = await request(app).post('/api/auth/login').send({ username: 'dave', password: 'password123' });
    expect(ok.status).toBe(200);
    const bad = await request(app).post('/api/auth/login').send({ username: 'dave', password: 'wrongpass1' });
    expect(bad.status).toBe(401);
    const missing = await request(app).post('/api/auth/login').send({ username: 'nobody', password: 'password123' });
    expect(missing.status).toBe(401);
  });

  test('stores password hashes, never plain text', async () => {
    const { app: a, db } = makeApp();
    await request(a).post('/api/auth/register').send({ username: 'erin', password: 'password123' });
    const u = await db.getUserByUsername('erin');
    expect(u.passwordHash).not.toBe('password123');
    expect(u.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  test('ignores an invalid bearer token (treated as anonymous)', async () => {
    const res = await request(app).post('/api/videos/upload-url').set('Authorization', 'Bearer not-a-jwt').send({ contentType: 'video/mp4', size: 10 });
    expect(res.status).toBe(401);
  });
});

'use strict';
const request = require('supertest');
const { makeApp } = require('./helpers');

async function signup(app, username = 'tester') {
  const res = await request(app).post('/api/auth/register').send({ username, password: 'password123' });
  return res.body.token;
}

async function uploadVideo(app, token, caption = 'hello world') {
  const u = await request(app).post('/api/videos/upload-url').set('Authorization', `Bearer ${token}`).send({ contentType: 'video/mp4', size: 4 });
  expect(u.status).toBe(200);
  const put = await request(app).put(u.body.uploadUrl).set('Content-Type', 'video/mp4').send(Buffer.from('fake'));
  expect(put.status).toBe(201);
  const v = await request(app).post('/api/videos').set('Authorization', `Bearer ${token}`).send({ blobName: u.body.blobName, caption });
  expect(v.status).toBe(201);
  return v.body;
}

describe('videos API', () => {
  let app; let token;
  beforeEach(async () => {
    ({ app } = makeApp());
    token = await signup(app);
  });

  test('requires auth to request an upload URL', async () => {
    const res = await request(app).post('/api/videos/upload-url').send({ contentType: 'video/mp4', size: 10 });
    expect(res.status).toBe(401);
  });

  test('rejects non-video content types and oversized files', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const t = await request(app).post('/api/videos/upload-url').set(auth).send({ contentType: 'image/png', size: 10 });
    expect(t.status).toBe(400);
    const s = await request(app).post('/api/videos/upload-url').set(auth).send({ contentType: 'video/mp4', size: 50 * 1024 * 1024 });
    expect(s.status).toBe(400);
  });

  test('full upload flow puts the video at the top of the feed', async () => {
    await uploadVideo(app, token, 'first');
    await uploadVideo(app, token, 'second');
    const feed = await request(app).get('/api/videos');
    expect(feed.status).toBe(200);
    expect(feed.body.items.map((v) => v.caption)).toEqual(['second', 'first']);
    expect(feed.body.items[0].username).toBe('tester');
    const media = await request(app).get(feed.body.items[0].url);
    expect(media.status).toBe(200);
  });

  test('refuses to register a blob that was never uploaded', async () => {
    const res = await request(app).post('/api/videos').set('Authorization', `Bearer ${token}`)
      .send({ blobName: '00000000-0000-0000-0000-000000000000.mp4', caption: 'x' });
    expect(res.status).toBe(400);
  });

  test('rejects path traversal in blob names', async () => {
    const res = await request(app).post('/api/videos').set('Authorization', `Bearer ${token}`).send({ blobName: '../../etc/passwd', caption: 'x' });
    expect(res.status).toBe(400);
    const put = await request(app).put('/media/..%2F..%2Fevil.mp4').send('x');
    expect(put.status).toBe(400);
  });

  test('rejects captions over 150 characters', async () => {
    const u = await request(app).post('/api/videos/upload-url').set('Authorization', `Bearer ${token}`).send({ contentType: 'video/mp4', size: 4 });
    const res = await request(app).post('/api/videos').set('Authorization', `Bearer ${token}`).send({ blobName: u.body.blobName, caption: 'x'.repeat(151) });
    expect(res.status).toBe(400);
  });

  test('paginates the feed with a cursor', async () => {
    for (let i = 0; i < 3; i += 1) await uploadVideo(app, token, `v${i}`);
    const p1 = await request(app).get('/api/videos?limit=2');
    expect(p1.body.items).toHaveLength(2);
    expect(p1.body.cursor).toBeTruthy();
    const p2 = await request(app).get(`/api/videos?limit=2&cursor=${p1.body.cursor}`);
    expect(p2.body.items).toHaveLength(1);
    expect(p2.body.cursor).toBeNull();
  });

  test('like toggles on and off and is per-user', async () => {
    const v = await uploadVideo(app, token);
    const auth = { Authorization: `Bearer ${token}` };
    const l1 = await request(app).post(`/api/videos/${v.id}/like`).set(auth);
    expect(l1.body).toEqual({ liked: true, likeCount: 1 });
    const other = await signup(app, 'friend');
    const l2 = await request(app).post(`/api/videos/${v.id}/like`).set('Authorization', `Bearer ${other}`);
    expect(l2.body.likeCount).toBe(2);
    const l3 = await request(app).post(`/api/videos/${v.id}/like`).set(auth);
    expect(l3.body).toEqual({ liked: false, likeCount: 1 });
    const single = await request(app).get(`/api/videos/${v.id}`).set('Authorization', `Bearer ${other}`);
    expect(single.body.likedByMe).toBe(true);
  });

  test('comments can be added and listed', async () => {
    const v = await uploadVideo(app, token);
    const auth = { Authorization: `Bearer ${token}` };
    expect((await request(app).post(`/api/videos/${v.id}/comments`).set(auth).send({ text: '  ' })).status).toBe(400);
    const c = await request(app).post(`/api/videos/${v.id}/comments`).set(auth).send({ text: 'Nice clip!' });
    expect(c.status).toBe(201);
    const list = await request(app).get(`/api/videos/${v.id}/comments`);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ text: 'Nice clip!', username: 'tester' });
    const single = await request(app).get(`/api/videos/${v.id}`);
    expect(single.body.commentCount).toBe(1);
  });

  test('returns 404 for unknown videos', async () => {
    const id = 'does-not-exist';
    expect((await request(app).get(`/api/videos/${id}`)).status).toBe(404);
    expect((await request(app).get(`/api/videos/${id}/comments`)).status).toBe(404);
    expect((await request(app).post(`/api/videos/${id}/like`).set('Authorization', `Bearer ${token}`)).status).toBe(404);
    expect((await request(app).post(`/api/videos/${id}/comments`).set('Authorization', `Bearer ${token}`).send({ text: 'hi' })).status).toBe(404);
  });
});

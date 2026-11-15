'use strict';
const express = require('express');
const { randomUUID } = require('node:crypto');
const { requireAuth } = require('../auth');

const EXT = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

module.exports = function videoRoutes({ db, storage, config }) {
  const r = express.Router();

  async function present(video, user) {
    return {
      id: video.id,
      caption: video.caption,
      username: video.username,
      createdAt: video.createdAt,
      likeCount: video.likeCount,
      commentCount: video.commentCount,
      url: await storage.getReadUrl(video.blobName),
      likedByMe: user ? await db.hasLiked(video.id, user.id) : false,
    };
  }

  // Step 1 of upload: get a short-lived URL to upload the file directly to storage.
  r.post('/upload-url', requireAuth, async (req, res) => {
    const { contentType, size } = req.body || {};
    if (!config.allowedVideoTypes.includes(contentType)) return res.status(400).json({ error: 'Only MP4, WebM or MOV videos are allowed' });
    if (!Number.isFinite(size) || size <= 0 || size > config.maxUploadBytes) {
      return res.status(400).json({ error: `Video must be under ${Math.round(config.maxUploadBytes / 1048576)} MB` });
    }
    const blobName = `${randomUUID()}.${EXT[contentType]}`;
    res.json({ blobName, uploadUrl: await storage.getUploadUrl(blobName) });
  });

  // Step 2 of upload: register the uploaded blob as a video.
  r.post('/', requireAuth, async (req, res) => {
    const { blobName, caption = '' } = req.body || {};
    if (typeof blobName !== 'string' || !/^[a-f0-9-]{36}\.(mp4|webm|mov)$/.test(blobName)) return res.status(400).json({ error: 'Invalid blobName' });
    if (typeof caption !== 'string' || caption.length > 150) return res.status(400).json({ error: 'Caption must be 150 characters or fewer' });
    const props = await storage.getProperties(blobName);
    if (!props) return res.status(400).json({ error: 'Upload not found - upload the file first' });
    if (props.size > config.maxUploadBytes) return res.status(400).json({ error: 'Video too large' });
    const video = await db.createVideo({ blobName, caption: caption.trim(), userId: req.user.id, username: req.user.username });
    res.status(201).json(await present(video, req.user));
  });

  // Feed: newest first, cursor-paginated so the client can infinite-scroll.
  r.get('/', async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const { items, cursor } = await db.listVideos({ limit, cursor: req.query.cursor });
    res.set('Cache-Control', 'no-store');
    res.json({ items: await Promise.all(items.map((v) => present(v, req.user))), cursor });
  });

  r.get('/:id', async (req, res) => {
    const video = await db.getVideo(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    res.json(await present(video, req.user));
  });

  r.post('/:id/like', requireAuth, async (req, res) => {
    const result = await db.toggleLike(req.params.id, req.user.id);
    if (!result) return res.status(404).json({ error: 'Video not found' });
    res.json(result);
  });

  r.get('/:id/comments', async (req, res) => {
    const video = await db.getVideo(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    res.json({ items: await db.listComments(req.params.id) });
  });

  r.post('/:id/comments', requireAuth, async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > 300) return res.status(400).json({ error: 'Comment must be 1-300 characters' });
    const comment = await db.addComment({ videoId: req.params.id, userId: req.user.id, username: req.user.username, text });
    if (!comment) return res.status(404).json({ error: 'Video not found' });
    res.status(201).json(comment);
  });

  return r;
};

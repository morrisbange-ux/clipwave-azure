'use strict';
const { randomUUID } = require('node:crypto');

/** In-memory implementation of the data layer, used for local dev and tests. */
function createMemoryDb() {
  const users = new Map();
  const videos = new Map();
  const likes = new Set();
  const comments = [];

  return {
    kind: 'memory',
    async init() {},
    async ping() { return true; },

    async createUser({ username, passwordHash }) {
      const key = username.toLowerCase();
      if (users.has(key)) return null;
      const user = { id: randomUUID(), username, passwordHash, createdAt: new Date().toISOString() };
      users.set(key, user);
      return user;
    },
    async getUserByUsername(username) {
      return users.get(String(username).toLowerCase()) || null;
    },

    async createVideo(v) {
      const video = { id: randomUUID(), likeCount: 0, commentCount: 0, createdAt: new Date().toISOString(), ...v };
      videos.set(video.id, video);
      return video;
    },
    async getVideo(id) { return videos.get(id) || null; },
    async listVideos({ limit = 10, cursor } = {}) {
      const all = [...videos.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      const start = cursor ? Number(cursor) : 0;
      const items = all.slice(start, start + limit);
      const next = start + limit < all.length ? String(start + limit) : null;
      return { items, cursor: next };
    },

    async toggleLike(videoId, userId) {
      const video = videos.get(videoId);
      if (!video) return null;
      const key = `${videoId}:${userId}`;
      const liked = !likes.has(key);
      if (liked) likes.add(key); else likes.delete(key);
      video.likeCount += liked ? 1 : -1;
      return { liked, likeCount: video.likeCount };
    },
    async hasLiked(videoId, userId) { return likes.has(`${videoId}:${userId}`); },

    async addComment({ videoId, userId, username, text }) {
      const video = videos.get(videoId);
      if (!video) return null;
      const c = { id: randomUUID(), videoId, userId, username, text, createdAt: new Date().toISOString() };
      comments.push(c);
      video.commentCount += 1;
      return c;
    },
    async listComments(videoId) {
      return comments.filter((c) => c.videoId === videoId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
  };
}

module.exports = { createMemoryDb };

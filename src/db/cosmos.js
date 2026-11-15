'use strict';
const { randomUUID } = require('node:crypto');
const { CosmosClient } = require('@azure/cosmos');

/**
 * Azure Cosmos DB (NoSQL API) implementation of the data layer.
 * Partition keys are chosen so the hot paths are single-partition reads:
 *   users    -> /username   (login lookup)
 *   videos   -> /id         (point reads; feed is a cross-partition ORDER BY)
 *   likes    -> /videoId    (one doc per user per video, id = userId)
 *   comments -> /videoId    (all comments for a video in one partition)
 * Containers share the database's provisioned throughput, which keeps the
 * whole app inside the Cosmos DB free tier (1000 RU/s, 25 GB).
 */
function createCosmosDb({ endpoint, key, database, prefix }) {
  const client = new CosmosClient({ endpoint, key });
  const c = {};

  async function init() {
    const { database: db } = await client.databases.createIfNotExists({ id: database });
    const defs = { users: '/username', videos: '/id', likes: '/videoId', comments: '/videoId' };
    for (const [name, pk] of Object.entries(defs)) {
      const { container } = await db.containers.createIfNotExists({ id: `${prefix}${name}`, partitionKey: { paths: [pk] } });
      c[name] = container;
    }
  }

  return {
    kind: 'cosmos',
    init,
    async ping() {
      await client.getDatabaseAccount();
      return true;
    },

    async createUser({ username, passwordHash }) {
      const lower = username.toLowerCase();
      const user = { id: randomUUID(), username: lower, displayName: username, passwordHash, createdAt: new Date().toISOString() };
      const { resources } = await c.users.items
        .query({ query: 'SELECT VALUE COUNT(1) FROM u WHERE u.username = @u', parameters: [{ name: '@u', value: lower }] }, { partitionKey: lower })
        .fetchAll();
      if (resources[0] > 0) return null;
      await c.users.items.create(user);
      return { ...user, username };
    },
    async getUserByUsername(username) {
      const lower = String(username).toLowerCase();
      const { resources } = await c.users.items
        .query({ query: 'SELECT * FROM u WHERE u.username = @u', parameters: [{ name: '@u', value: lower }] }, { partitionKey: lower })
        .fetchAll();
      const u = resources[0];
      return u ? { ...u, username: u.displayName || u.username } : null;
    },

    async createVideo(v) {
      const video = { id: randomUUID(), likeCount: 0, commentCount: 0, createdAt: new Date().toISOString(), ...v };
      await c.videos.items.create(video);
      return video;
    },
    async getVideo(id) {
      try {
        const { resource } = await c.videos.item(id, id).read();
        return resource || null;
      } catch (e) {
        if (e.code === 404) return null;
        throw e;
      }
    },
    async listVideos({ limit = 10, cursor } = {}) {
      const iter = c.videos.items.query('SELECT * FROM v ORDER BY v.createdAt DESC', { maxItemCount: limit, continuationToken: cursor || undefined });
      const { resources, continuationToken } = await iter.fetchNext();
      return { items: resources, cursor: continuationToken || null };
    },

    async toggleLike(videoId, userId) {
      const video = await this.getVideo(videoId);
      if (!video) return null;
      let liked;
      try {
        await c.likes.item(userId, videoId).delete();
        liked = false;
      } catch (e) {
        if (e.code !== 404) throw e;
        await c.likes.items.create({ id: userId, videoId, createdAt: new Date().toISOString() });
        liked = true;
      }
      // Atomic counter update with a patch operation (no read-modify-write race).
      const { resource } = await c.videos.item(videoId, videoId).patch([{ op: 'incr', path: '/likeCount', value: liked ? 1 : -1 }]);
      return { liked, likeCount: resource.likeCount };
    },
    async hasLiked(videoId, userId) {
      try {
        const { resource } = await c.likes.item(userId, videoId).read();
        return Boolean(resource);
      } catch (e) {
        if (e.code === 404) return false;
        throw e;
      }
    },

    async addComment({ videoId, userId, username, text }) {
      const video = await this.getVideo(videoId);
      if (!video) return null;
      const comment = { id: randomUUID(), videoId, userId, username, text, createdAt: new Date().toISOString() };
      await c.comments.items.create(comment);
      await c.videos.item(videoId, videoId).patch([{ op: 'incr', path: '/commentCount', value: 1 }]);
      return comment;
    },
    async listComments(videoId) {
      const { resources } = await c.comments.items
        .query({ query: 'SELECT * FROM c WHERE c.videoId = @v ORDER BY c.createdAt ASC', parameters: [{ name: '@v', value: videoId }] }, { partitionKey: videoId })
        .fetchAll();
      return resources;
    },
  };
}

module.exports = { createCosmosDb };

'use strict';
const fs = require('node:fs');
const path = require('node:path');

/**
 * Local-disk storage used for development and tests. It mimics the Azure
 * flow: the API hands out an upload URL, the browser PUTs the file to it,
 * then the client registers the video.
 */
function createLocalStorage({ localDir }) {
  fs.mkdirSync(localDir, { recursive: true });
  const safe = (name) => {
    if (!/^[a-zA-Z0-9-]+\.(mp4|webm|mov)$/.test(name)) throw new Error('invalid blob name');
    return path.join(localDir, name);
  };

  return {
    kind: 'local',
    async getUploadUrl(blobName) { return `/media/${blobName}`; },
    async getReadUrl(blobName) { return `/media/${blobName}`; },
    async getProperties(blobName) {
      try {
        const st = await fs.promises.stat(safe(blobName));
        return { size: st.size };
      } catch {
        return null;
      }
    },
    // Only used by the local PUT /media/:name route.
    writeStream(blobName) { return fs.createWriteStream(safe(blobName)); },
    filePath(blobName) { return safe(blobName); },
  };
}

module.exports = { createLocalStorage };

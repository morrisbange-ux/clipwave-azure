'use strict';
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
} = require('@azure/storage-blob');

/**
 * Azure Blob Storage implementation. Videos never pass through the API:
 * the browser uploads straight to Blob Storage with a short-lived,
 * write-only SAS URL (valet key pattern), and plays them back with a
 * read-only SAS. This keeps API replicas small and stateless.
 */
function createBlobStorage({ connectionString, container }) {
  const service = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = service.getContainerClient(container);
  const parts = Object.fromEntries(connectionString.split(';').filter(Boolean).map((kv) => {
    const i = kv.indexOf('=');
    return [kv.slice(0, i), kv.slice(i + 1)];
  }));
  const credential = new StorageSharedKeyCredential(parts.AccountName, parts.AccountKey);

  function sasUrl(blobName, permissions, minutes) {
    const startsOn = new Date(Date.now() - 5 * 60 * 1000);
    const expiresOn = new Date(Date.now() + minutes * 60 * 1000);
    const sas = generateBlobSASQueryParameters(
      { containerName: container, blobName, permissions: BlobSASPermissions.parse(permissions), startsOn, expiresOn, protocol: SASProtocol.Https },
      credential,
    ).toString();
    return `${containerClient.getBlockBlobClient(blobName).url}?${sas}`;
  }

  return {
    kind: 'blob',
    async init() { await containerClient.createIfNotExists(); },
    async getUploadUrl(blobName) { return sasUrl(blobName, 'cw', 15); },
    async getReadUrl(blobName) { return sasUrl(blobName, 'r', 60); },
    async getProperties(blobName) {
      try {
        const p = await containerClient.getBlockBlobClient(blobName).getProperties();
        return { size: p.contentLength, contentType: p.contentType };
      } catch (e) {
        if (e.statusCode === 404) return null;
        throw e;
      }
    },
  };
}

module.exports = { createBlobStorage };

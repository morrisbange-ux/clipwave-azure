'use strict';
const config = require('../config');
const { createLocalStorage } = require('./local');

function createStorage(cfg = config.storage) {
  if (cfg.connectionString) {
    const { createBlobStorage } = require('./blob');
    return createBlobStorage(cfg);
  }
  return createLocalStorage(cfg);
}

module.exports = { createStorage };

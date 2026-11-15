'use strict';
const config = require('../config');
const { createMemoryDb } = require('./memory');

function createDb(cfg = config.cosmos) {
  if (cfg.endpoint && cfg.key) {
    const { createCosmosDb } = require('./cosmos');
    return createCosmosDb(cfg);
  }
  return createMemoryDb();
}

module.exports = { createDb };

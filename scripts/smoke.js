#!/usr/bin/env node
'use strict';
// Post-deployment smoke test. Usage: node scripts/smoke.js https://my-app.azurecontainerapps.io [expectedSha]
// Retries for up to ~2 minutes because a new revision may be cold-starting (scale-to-zero).
const base = (process.argv[2] || process.env.BASE_URL || '').replace(/\/$/, '');
const expectedSha = process.argv[3] || process.env.EXPECTED_SHA;
if (!base) { console.error('Usage: smoke.js <baseUrl> [expectedSha]'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function check(path, assert) {
  const res = await fetch(base + path);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  const body = await res.json();
  assert(body);
  console.log(`  ok ${path}`, JSON.stringify(body));
}

(async () => {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      console.log(`Smoke test ${base} (attempt ${attempt})`);
      await check('/healthz', (b) => { if (b.status !== 'ok') throw new Error('not healthy'); });
      await check('/readyz', (b) => { if (b.status !== 'ready') throw new Error('not ready'); });
      await check('/api/version', (b) => {
        if (expectedSha && b.commit !== expectedSha) throw new Error(`expected commit ${expectedSha}, got ${b.commit}`);
      });
      await check('/api/videos?limit=1', (b) => { if (!Array.isArray(b.items)) throw new Error('feed malformed'); });
      console.log('Smoke test passed');
      return;
    } catch (e) {
      console.log(`  failed: ${e.message}`);
      await sleep(10_000);
    }
  }
  console.error('Smoke test FAILED');
  process.exit(1);
})();

// k6 load test: simulates users scrolling the feed.
// Run: k6 run -e BASE_URL=https://<your-app> load/feed-load.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // ramp up
    { duration: '1m', target: 50 },   // sustained load - watch replicas scale out in the portal
    { duration: '30s', target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],     // <1% errors
    http_req_duration: ['p(95)<800'],   // 95% of requests under 800 ms
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const feed = http.get(`${BASE}/api/videos?limit=5`);
  check(feed, { 'feed 200': (r) => r.status === 200 });
  const items = feed.json('items') || [];
  if (items.length) {
    const id = items[Math.floor(Math.random() * items.length)].id;
    check(http.get(`${BASE}/api/videos/${id}/comments`), { 'comments 200': (r) => r.status === 200 });
  }
  sleep(1);
}

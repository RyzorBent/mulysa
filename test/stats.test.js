import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, lastDays, createMemoryCounter, createRedisCounter } from '../lib/stats.js';

// ---------- days are South African days ----------

test('dayKey uses South African time (UTC+2), not UTC', () => {
  assert.equal(dayKey(new Date('2026-11-11T21:59:00Z')), '2026-11-11'); // 23:59 SAST
  assert.equal(dayKey(new Date('2026-11-11T22:00:00Z')), '2026-11-12'); // 00:00 SAST
});

test('lastDays lists days newest first, across a month boundary', () => {
  assert.deepEqual(lastDays(3, new Date('2026-12-01T10:00:00Z')), ['2026-12-01', '2026-11-30', '2026-11-29']);
});

// ---------- shared behaviour for both counters ----------

// A small stand-in for the parts of @upstash/redis the counter uses.
function fakeRedis() {
  const hashes = new Map();
  const expiries = new Map();
  const api = {
    hashes,
    expiries,
    pipeline() {
      const ops = [];
      const p = {
        hincrby: (key, field, by) => { ops.push(() => {
          const h = hashes.get(key) ?? {};
          h[field] = (Number(h[field]) || 0) + by;
          hashes.set(key, h);
          return h[field];
        }); return p; },
        expire: (key, seconds) => { ops.push(() => { expiries.set(key, seconds); return 1; }); return p; },
        hgetall: (key) => { ops.push(() => (hashes.has(key) ? { ...hashes.get(key) } : null)); return p; },
        exec: async () => ops.map((op) => op()),
      };
      return p;
    },
  };
  return api;
}

const NOW = new Date('2026-11-12T08:00:00Z'); // 10:00 SAST on 12 Nov
const counters = {
  memory: () => createMemoryCounter({ now: () => NOW }),
  redis: () => createRedisCounter(fakeRedis(), { now: () => NOW }),
};

for (const [name, make] of Object.entries(counters)) {
  test(`${name} counter: counts today's visits and sends`, async () => {
    const counter = make();
    await counter.recordVisit();
    await counter.recordVisit();
    await counter.recordSend();
    const stats = await counter.read(7);
    assert.deepEqual(stats.today, { date: '2026-11-12', visits: 2, sends: 1 });
  });

  test(`${name} counter: reports every day in the range, zeros included, newest first`, async () => {
    const counter = make();
    await counter.recordVisit();
    const stats = await counter.read(3);
    assert.deepEqual(stats.days, [
      { date: '2026-11-12', visits: 1, sends: 0 },
      { date: '2026-11-11', visits: 0, sends: 0 },
      { date: '2026-11-10', visits: 0, sends: 0 },
    ]);
  });

  test(`${name} counter: keeps all-time totals`, async () => {
    const counter = make();
    await counter.recordVisit();
    await counter.recordSend();
    await counter.recordSend();
    const stats = await counter.read(1);
    assert.deepEqual(stats.totals, { visits: 1, sends: 2 });
  });

  test(`${name} counter: starts at zero`, async () => {
    const stats = await make().read(2);
    assert.deepEqual(stats.totals, { visits: 0, sends: 0 });
    assert.deepEqual(stats.today, { date: '2026-11-12', visits: 0, sends: 0 });
  });
}

test('redis counter: day keys expire after about 13 months so old data cleans itself up', async () => {
  const redis = fakeRedis();
  const counter = createRedisCounter(redis, { now: () => NOW });
  await counter.recordVisit();
  assert.equal(redis.expiries.get('mulysa:day:2026-11-12'), 400 * 24 * 60 * 60);
  assert.equal(redis.expiries.has('mulysa:totals'), false, 'totals never expire');
});

test('redis counter: stores counts only, under mulysa: keys', async () => {
  const redis = fakeRedis();
  const counter = createRedisCounter(redis, { now: () => NOW });
  await counter.recordVisit();
  await counter.recordSend();
  assert.deepEqual([...redis.hashes.keys()].sort(), ['mulysa:day:2026-11-12', 'mulysa:totals']);
  assert.deepEqual(redis.hashes.get('mulysa:day:2026-11-12'), { visits: 1, sends: 1 });
});

// ---------- choosing a counter from the environment ----------

import { counterFromEnv } from '../lib/stats.js';

test('without Redis settings, local development counts in memory', () => {
  assert.equal(counterFromEnv({}).kind, 'memory');
});

test('on Vercel without Redis, counting is off rather than silently wrong', async () => {
  const counter = counterFromEnv({ VERCEL: '1' });
  assert.equal(counter.kind, 'disabled');
  await counter.recordVisit(); // no-op, never throws
  await assert.rejects(() => counter.read(30), /not connected/i);
});

test('with Upstash settings (either naming), Redis is used', () => {
  assert.equal(counterFromEnv({ KV_REST_API_URL: 'https://x.upstash.io', KV_REST_API_TOKEN: 't' }).kind, 'redis');
  assert.equal(counterFromEnv({ UPSTASH_REDIS_REST_URL: 'https://x.upstash.io', UPSTASH_REDIS_REST_TOKEN: 't', VERCEL: '1' }).kind, 'redis');
});

// Anonymous usage counters: page visits and successful sends, per South African day.
//
// Only numbers are stored. No IP addresses, email addresses, user agents or
// anything else about who visited or what they sent.
//
// In Redis (Upstash) the data looks like:
//   mulysa:day:2026-11-12  -> { visits: 41, sends: 7 }   (expires after ~13 months)
//   mulysa:totals          -> { visits: 980, sends: 112 } (all time)
//
// Without Redis settings: local development counts in memory (reset on restart);
// on Vercel counting is switched off and the stats page says so.

import { Redis } from '@upstash/redis';

export const TIME_ZONE = 'Africa/Johannesburg';
const DAY_TTL_SECONDS = 400 * 24 * 60 * 60;
const FIELDS = ['visits', 'sends'];

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The South African calendar day for a moment, as YYYY-MM-DD. */
export function dayKey(date = new Date()) {
  return dayFormat.format(date);
}

/** The last `count` South African days, newest first, ending with the day of `now`. */
export function lastDays(count, now = new Date()) {
  const days = [];
  // Step back in 24h jumps from midday SAST to stay clear of any boundary.
  const middayToday = new Date(`${dayKey(now)}T12:00:00+02:00`);
  for (let i = 0; i < count; i++) {
    days.push(dayKey(new Date(middayToday.getTime() - i * 24 * 60 * 60 * 1000)));
  }
  return days;
}

function toCounts(hash) {
  return {
    visits: Number(hash?.visits) || 0,
    sends: Number(hash?.sends) || 0,
  };
}

function shapeStats(dates, dayHashes, totalsHash) {
  const days = dates.map((date, i) => ({ date, ...toCounts(dayHashes[i]) }));
  return { today: days[0], days, totals: toCounts(totalsHash), timeZone: TIME_ZONE };
}

/** Counts kept in this server process only (local development, tests). */
export function createMemoryCounter({ now = () => new Date() } = {}) {
  const byDay = new Map();
  const totals = { visits: 0, sends: 0 };
  const bump = async (field) => {
    const key = dayKey(now());
    const day = byDay.get(key) ?? { visits: 0, sends: 0 };
    day[field] += 1;
    byDay.set(key, day);
    totals[field] += 1;
  };
  return {
    kind: 'memory',
    recordVisit: () => bump('visits'),
    recordSend: () => bump('sends'),
    async read(count) {
      const dates = lastDays(count, now());
      return shapeStats(dates, dates.map((d) => byDay.get(d)), totals);
    },
  };
}

/** Counts kept in Redis. `redis` is an @upstash/redis client (or anything with the same pipeline API). */
export function createRedisCounter(redis, { now = () => new Date(), prefix = 'mulysa' } = {}) {
  const dayRedisKey = (date) => `${prefix}:day:${date}`;
  const totalsKey = `${prefix}:totals`;

  const bump = async (field) => {
    if (!FIELDS.includes(field)) throw new Error(`unknown field ${field}`);
    const key = dayRedisKey(dayKey(now()));
    await redis
      .pipeline()
      .hincrby(key, field, 1)
      .expire(key, DAY_TTL_SECONDS)
      .hincrby(totalsKey, field, 1)
      .exec();
  };

  return {
    kind: 'redis',
    recordVisit: () => bump('visits'),
    recordSend: () => bump('sends'),
    async read(count) {
      const dates = lastDays(count, now());
      const p = redis.pipeline();
      for (const date of dates) p.hgetall(dayRedisKey(date));
      p.hgetall(totalsKey);
      const results = await p.exec();
      return shapeStats(dates, results.slice(0, dates.length), results[dates.length]);
    },
  };
}

/**
 * Used on Vercel when Redis isn't connected. Vercel runs many short-lived copies
 * of the app, so in-memory counts there would be scattered and wrong; better to
 * count nothing and say so on the stats page.
 */
export function createDisabledCounter() {
  return {
    kind: 'disabled',
    recordVisit: async () => {},
    recordSend: async () => {},
    async read() {
      throw Object.assign(new Error('Counting is not connected (no Redis settings).'), { code: 'COUNTER_DISABLED' });
    },
  };
}

/** Redis when the Upstash settings are present (Vercel adds them); else in-memory locally, off on Vercel. */
export function counterFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url && token) return createRedisCounter(new Redis({ url, token }));
  if (env.VERCEL) return createDisabledCounter();
  return createMemoryCounter();
}

// The Express app: five small JSON endpoints, the page, and a hidden stats page.
//
//   GET  /api/config    provinces, the locked notice and the photo list (counts one page visit)
//   POST /api/generate  { province }                           -> { mockNumber, prefix, province }
//   POST /api/verify    { gmail, appPassword }                 -> { ok: true }
//   POST /api/send      { gmail, appPassword, to, subject, message, photoIds }
//                                                              -> { ok, accepted, rejected, messageId, sentAt }
//   POST /api/stats     { password }                           -> daily visit/send counts (owner only)
//   GET  /stats         the hidden, password-protected stats page (not linked, noindex)
//
// Nothing the tester types is stored. The only thing kept is two anonymous
// numbers per day (visits, successful sends); see lib/stats.js.

import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PROVINCES, prefixFor, generateMockNumber } from './reference.js';
import { composeEmail, LOCKED_NOTICE, MAX_IMAGES, ValidationError } from './email.js';
import { readCredentials, verifyGmail, sendWithGmail, friendlyMailError } from './mailer.js';
import { PHOTO_IDS, photoUrl } from './photos.js';
import { counterFromEnv } from './stats.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));
const STATS_PAGE = fileURLToPath(new URL('../public/stats.html', import.meta.url));
const STATS_DAYS = 30;
const COUNTER_TIMEOUT_MS = 1500;

// The real mailer. Tests pass in a fake one with the same two methods.
const gmailMailer = { verify: verifyGmail, send: sendWithGmail };

/** Constant-time comparison, so response timing can't reveal the stats password. */
function samePassword(given, expected) {
  const hash = (s) => createHash('sha256').update(String(s)).digest();
  return timingSafeEqual(hash(given), hash(expected));
}

/**
 * Runs a counter update without ever letting it break or stall the real work:
 * errors are swallowed (logged without detail) and it gives up after 1.5s.
 */
async function countQuietly(task, label) {
  let timer;
  try {
    await Promise.race([
      task(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), COUNTER_TIMEOUT_MS); }),
    ]);
  } catch {
    console.error(`stats counter error: ${label}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} [options]
 * @param {{verify: Function, send: Function}} [options.mailer] defaults to real Gmail
 * @param {{recordVisit: Function, recordSend: Function, read: Function}} [options.counter]
 *   defaults to Redis when Upstash settings exist, else in-memory (see lib/stats.js)
 * @param {string} [options.statsPassword] unlocks /api/stats; defaults to STATS_PASSWORD.
 *   When empty, the stats page is switched off.
 */
export function createApp({
  mailer = gmailMailer,
  counter = counterFromEnv(),
  statsPassword = process.env.STATS_PASSWORD,
} = {}) {
  const app = express();
  app.disable('x-powered-by');

  // Small limit: the biggest legitimate body is a 5,000-character message.
  app.use(express.json({ limit: '32kb' }));

  // The hidden stats page. Not linked anywhere, and search engines are told to skip it.
  app.get(['/stats', '/stats.html'], (req, res) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Cache-Control', 'no-store');
    res.sendFile(STATS_PAGE);
  });

  // Serves the page and its files (index.html, app.js, styles.css, ...).
  app.use(express.static(PUBLIC_DIR));

  // API responses contain the tester's choices; tell browsers and proxies not to keep them.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/config', async (req, res) => {
    // The page loads this exactly once each time it is opened, so it doubles as the visit counter.
    await countQuietly(() => counter.recordVisit(), 'visit');
    res.json({
      provinces: PROVINCES.map((p) => p.name),
      lockedNotice: LOCKED_NOTICE,
      maxImages: MAX_IMAGES,
      photos: PHOTO_IDS.map((id) => ({ id, url: photoUrl(id) })),
    });
  });

  app.post('/api/generate', (req, res) => {
    const province = req.body?.province;
    const prefix = prefixFor(province);
    if (!prefix) {
      return res.status(400).json({ error: 'Choose one of the listed provinces.' });
    }
    res.json({ mockNumber: generateMockNumber(prefix), prefix, province });
  });

  app.post('/api/verify', async (req, res, next) => {
    try {
      const creds = readCredentials(req.body);
      await mailer.verify(creds);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/send', async (req, res, next) => {
    try {
      const creds = readCredentials(req.body);
      const email = composeEmail(req.body ?? {});
      // Awaited on purpose: on Vercel the function can be frozen as soon as we
      // reply, so we must not respond until Gmail has answered.
      const result = await mailer.send(creds, email);
      await countQuietly(() => counter.recordSend(), 'send');
      res.json({ ok: true, ...result, sentAt: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/stats', async (req, res) => {
    if (!statsPassword) {
      return res.status(503).json({ error: 'The stats page is switched off (STATS_PASSWORD is not set).' });
    }
    const given = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!given || !samePassword(given, statsPassword)) {
      return res.status(401).json({ error: 'That password is not right.' });
    }
    try {
      res.json(await counter.read(STATS_DAYS));
    } catch (err) {
      if (err?.code === 'COUNTER_DISABLED') {
        return res.status(503).json({ error: 'Counting is not connected yet: the Upstash Redis database is not linked to this project.' });
      }
      console.error('stats counter error: read');
      res.status(503).json({ error: 'The stats are unavailable right now. Try again in a moment.' });
    }
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  // One error handler for everything. It never logs or returns the request body
  // or the raw error message, because either could contain what the tester typed.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'The request was not valid JSON.' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'That message is too long.' });
    }
    if (err.code) {
      // A mail error. Log only its code (e.g. EAUTH), never its message.
      console.error(`mail error: ${err.code}`);
      return res.status(502).json({ error: friendlyMailError(err) });
    }
    console.error('unexpected error');
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}

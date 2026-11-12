// The Express app: four small JSON endpoints, plus the static page when running locally.
//
//   GET  /api/config    provinces, the locked notice, whether an access code is needed
//   POST /api/generate  { province }                           -> { mockNumber, prefix, province }
//   POST /api/verify    { gmail, appPassword }                 -> { ok: true }
//   POST /api/send      { gmail, appPassword, to, subject, message, imageSeeds }
//                                                              -> { ok, accepted, rejected, messageId, sentAt }
//
// Nothing in this file stores anything. Each request is handled and forgotten.

import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PROVINCES, prefixFor, generateMockNumber } from './reference.js';
import { composeEmail, LOCKED_NOTICE, MAX_IMAGES, ValidationError } from './email.js';
import { readCredentials, verifyGmail, sendWithGmail, friendlyMailError } from './mailer.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

// The real mailer. Tests pass in a fake one with the same two methods.
const gmailMailer = { verify: verifyGmail, send: sendWithGmail };

/** Compares two strings in constant time so the access code can't be guessed by timing. */
function sameSecret(a, b) {
  const hash = (s) => createHash('sha256').update(String(s)).digest();
  return timingSafeEqual(hash(a), hash(b));
}

/**
 * @param {object} [options]
 * @param {{verify: Function, send: Function}} [options.mailer] defaults to real Gmail
 * @param {string} [options.accessCode] if set, every API call except /api/config must
 *   send it in the x-access-code header. Defaults to the ACCESS_CODE env var.
 */
export function createApp({ mailer = gmailMailer, accessCode = process.env.ACCESS_CODE } = {}) {
  const app = express();
  app.disable('x-powered-by');

  // Small limit: the biggest legitimate body is a 5,000-character message.
  app.use(express.json({ limit: '32kb' }));

  // Locally, Express serves the page. On Vercel, files in public/ are served by
  // Vercel's CDN instead (express.static is ignored there), so this is harmless.
  app.use(express.static(PUBLIC_DIR));

  // API responses contain the tester's choices; tell browsers and proxies not to keep them.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/config', (req, res) => {
    res.json({
      provinces: PROVINCES.map((p) => p.name),
      lockedNotice: LOCKED_NOTICE,
      maxImages: MAX_IMAGES,
      accessCodeRequired: Boolean(accessCode),
    });
  });

  // Everything below needs the access code, if one is configured.
  app.use('/api', (req, res, next) => {
    if (!accessCode) return next();
    const given = req.get('x-access-code') ?? '';
    if (given && sameSecret(given, accessCode)) return next();
    res.status(401).json({ error: 'That access code is not right. Ask whoever runs this demo for the tester code.' });
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
      res.json({ ok: true, ...result, sentAt: new Date().toISOString() });
    } catch (err) {
      next(err);
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../lib/app.js';
import { LOCKED_NOTICE } from '../lib/email.js';
import { PHOTO_IDS, photoUrl } from '../lib/photos.js';

const PASSWORD = 'abcd efgh ijkl mnop';

// A stand-in for Gmail so tests never touch the network. It records what the
// app handed it, which is what we want to check.
function fakeMailer({ fail } = {}) {
  const calls = { verify: [], send: [] };
  return {
    calls,
    async verify(creds) {
      calls.verify.push(creds);
      if (fail) throw fail;
    },
    async send(creds, email) {
      calls.send.push({ creds, email });
      if (fail) throw fail;
      return { accepted: [email.to], rejected: [], messageId: '<fake@gmail.com>' };
    },
  };
}

// Starts the app on a random free port and returns a small fetch helper.
async function start(options) {
  const app = createApp(options);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const raw = await res.text();
    let json;
    try { json = JSON.parse(raw); } catch { json = undefined; }
    return { status: res.status, json, raw };
  };
  return { call, close: () => new Promise((r) => server.close(r)) };
}

const sendBody = {
  gmail: 'tester@gmail.com',
  appPassword: PASSWORD,
  to: 'friend@example.com',
  subject: 'Your reference number PTA-2026-481927',
  message: 'Hello',
  photoIds: [PHOTO_IDS[0]],
};

test('GET /api/config lists the provinces, the locked notice and the photos', async (t) => {
  const { call, close } = await start({ mailer: fakeMailer() });
  t.after(close);
  const res = await call('GET', '/api/config');
  assert.equal(res.status, 200);
  assert.equal(res.json.provinces.length, 5);
  assert.equal(res.json.lockedNotice, LOCKED_NOTICE);
  assert.equal('accessCodeRequired' in res.json, false);
  assert.equal(res.json.photos.length, PHOTO_IDS.length);
  assert.deepEqual(res.json.photos[0], { id: PHOTO_IDS[0], url: photoUrl(PHOTO_IDS[0]) });
});

test('POST /api/generate returns a number with the province prefix', async (t) => {
  const { call, close } = await start({ mailer: fakeMailer() });
  t.after(close);
  const res = await call('POST', '/api/generate', { province: 'Western Cape (Cape Town)' });
  assert.equal(res.status, 200);
  assert.match(res.json.mockNumber, /^CTR-\d{4}-\d{6}$/);
  assert.equal(res.json.prefix, 'CTR');
});

test('the old ACCESS_CODE setting is ignored: no code is ever needed', async (t) => {
  process.env.ACCESS_CODE = 'leftover-code';
  t.after(() => { delete process.env.ACCESS_CODE; });
  const { call, close } = await start({ mailer: fakeMailer() });
  t.after(close);
  const res = await call('POST', '/api/generate', { province: 'Gauteng (Pretoria)' });
  assert.equal(res.status, 200);
});

test('POST /api/generate rejects an unknown province with 400', async (t) => {
  const { call, close } = await start({ mailer: fakeMailer() });
  t.after(close);
  const res = await call('POST', '/api/generate', { province: 'Atlantis' });
  assert.equal(res.status, 400);
  assert.ok(res.json.error);
});

test('malformed JSON gets a 400, not a crash', async (t) => {
  const { call, close } = await start({ mailer: fakeMailer() });
  t.after(close);
  const res = await call('POST', '/api/generate', '{not json');
  assert.equal(res.status, 400);
});

test('POST /api/verify checks the login with the tester credentials', async (t) => {
  const mailer = fakeMailer();
  const { call, close } = await start({ mailer });
  t.after(close);
  const res = await call('POST', '/api/verify', { gmail: 'tester@gmail.com', appPassword: PASSWORD });
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.deepEqual(mailer.calls.verify, [{ user: 'tester@gmail.com', pass: 'abcdefghijklmnop' }]);
});

test('POST /api/send sends from the tester account with the locked notice attached', async (t) => {
  const mailer = fakeMailer();
  const { call, close } = await start({ mailer });
  t.after(close);
  const res = await call('POST', '/api/send', sendBody);
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.deepEqual(res.json.accepted, ['friend@example.com']);
  assert.equal(res.json.messageId, '<fake@gmail.com>');
  assert.ok(res.json.sentAt);
  const { creds, email } = mailer.calls.send[0];
  assert.equal(creds.user, 'tester@gmail.com');
  assert.ok(email.html.includes(LOCKED_NOTICE));
  assert.ok(email.text.includes(LOCKED_NOTICE));
});

test('POST /api/send never echoes the app password back', async (t) => {
  const { call, close } = await start({ mailer: fakeMailer() });
  t.after(close);
  const res = await call('POST', '/api/send', sendBody);
  assert.ok(!res.raw.includes('abcdefghijklmnop'));
  assert.ok(!res.raw.includes(PASSWORD));
});

test('POST /api/send without credentials is a 400 and nothing is sent', async (t) => {
  const mailer = fakeMailer();
  const { call, close } = await start({ mailer });
  t.after(close);
  const res = await call('POST', '/api/send', { ...sendBody, appPassword: '' });
  assert.equal(res.status, 400);
  assert.equal(mailer.calls.send.length, 0);
});

test('POST /api/send with a bad recipient is a 400 and nothing is sent', async (t) => {
  const mailer = fakeMailer();
  const { call, close } = await start({ mailer });
  t.after(close);
  const res = await call('POST', '/api/send', { ...sendBody, to: 'a@x.com; b@y.com' });
  assert.equal(res.status, 400);
  assert.equal(mailer.calls.send.length, 0);
});

test('a Gmail login failure gives a friendly 502 that does not leak the password', async (t) => {
  const fail = Object.assign(new Error(`Invalid login for abcdefghijklmnop`), { code: 'EAUTH' });
  const { call, close } = await start({ mailer: fakeMailer({ fail }) });
  t.after(close);
  // Swallow the app's one-line error log during this test, and check it too.
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  t.after(() => { console.error = original; });

  const res = await call('POST', '/api/send', sendBody);
  assert.equal(res.status, 502);
  assert.match(res.json.error, /app password/i);
  assert.ok(!res.raw.includes('abcdefghijklmnop'));
  assert.ok(!logged.join('\n').includes('abcdefghijklmnop'));
});

// ---------- usage counters and the hidden stats page ----------

import { createMemoryCounter } from '../lib/stats.js';

test('opening the page (loading /api/config) counts one visit', async (t) => {
  const counter = createMemoryCounter();
  const { call, close } = await start({ mailer: fakeMailer(), counter });
  t.after(close);
  await call('GET', '/api/config');
  await call('GET', '/api/config');
  assert.equal((await counter.read(1)).today.visits, 2);
});

test('a successful send is counted', async (t) => {
  const counter = createMemoryCounter();
  const { call, close } = await start({ mailer: fakeMailer(), counter });
  t.after(close);
  await call('POST', '/api/send', sendBody);
  assert.equal((await counter.read(1)).today.sends, 1);
});

test('failed or invalid sends are not counted', async (t) => {
  const counter = createMemoryCounter();
  const fail = Object.assign(new Error('nope'), { code: 'EAUTH' });
  const { call, close } = await start({ mailer: fakeMailer({ fail }), counter });
  t.after(close);
  const original = console.error;
  console.error = () => {};
  t.after(() => { console.error = original; });
  await call('POST', '/api/send', sendBody);
  await call('POST', '/api/send', { ...sendBody, to: 'not-an-email' });
  assert.equal((await counter.read(1)).today.sends, 0);
});

test('a broken counter never breaks the page or sending', async (t) => {
  const broken = {
    recordVisit: async () => { throw new Error('redis down'); },
    recordSend: async () => { throw new Error('redis down'); },
    read: async () => { throw new Error('redis down'); },
  };
  const original = console.error;
  console.error = () => {};
  t.after(() => { console.error = original; });
  const { call, close } = await start({ mailer: fakeMailer(), counter: broken });
  t.after(close);
  assert.equal((await call('GET', '/api/config')).status, 200);
  assert.equal((await call('POST', '/api/send', sendBody)).status, 200);
});

test('POST /api/stats is switched off (503) when no stats password is set', async (t) => {
  const { call, close } = await start({ mailer: fakeMailer(), counter: createMemoryCounter(), statsPassword: '' });
  t.after(close);
  const res = await call('POST', '/api/stats', { password: 'anything' });
  assert.equal(res.status, 503);
});

test('POST /api/stats refuses a wrong password', async (t) => {
  const { call, close } = await start({ mailer: fakeMailer(), counter: createMemoryCounter(), statsPassword: 'right-one' });
  t.after(close);
  assert.equal((await call('POST', '/api/stats', { password: 'wrong' })).status, 401);
  assert.equal((await call('POST', '/api/stats', {})).status, 401);
});

test('POST /api/stats returns the counts with the right password', async (t) => {
  const counter = createMemoryCounter();
  await counter.recordVisit();
  await counter.recordSend();
  const { call, close } = await start({ mailer: fakeMailer(), counter, statsPassword: 'right-one' });
  t.after(close);
  const res = await call('POST', '/api/stats', { password: 'right-one' });
  assert.equal(res.status, 200);
  assert.equal(res.json.days.length, 30);
  assert.deepEqual(res.json.totals, { visits: 1, sends: 1 });
  assert.ok(!res.raw.includes('right-one'), 'password is not echoed back');
});

test('reading stats does not count as a visit', async (t) => {
  const counter = createMemoryCounter();
  const { call, close } = await start({ mailer: fakeMailer(), counter, statsPassword: 'pw' });
  t.after(close);
  await call('POST', '/api/stats', { password: 'pw' });
  assert.equal((await counter.read(1)).today.visits, 0);
});

test('GET /stats serves the hidden page and tells search engines to stay away', async (t) => {
  const { close } = await start({ mailer: fakeMailer(), counter: createMemoryCounter() });
  t.after(close);
  // call() helper parses JSON; fetch the page directly instead.
  const app = createApp({ mailer: fakeMailer(), counter: createMemoryCounter() });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  t.after(() => new Promise((r) => server.close(r)));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/stats`);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('x-robots-tag') ?? '', /noindex/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(html, /Usage stats/);
});

test('POST /api/stats explains when counting is not connected', async (t) => {
  const disabled = {
    recordVisit: async () => {}, recordSend: async () => {},
    read: async () => { throw Object.assign(new Error('Counting is not connected'), { code: 'COUNTER_DISABLED' }); },
  };
  const original = console.error;
  console.error = () => {};
  t.after(() => { console.error = original; });
  const { call, close } = await start({ mailer: fakeMailer(), counter: disabled, statsPassword: 'pw' });
  t.after(close);
  const res = await call('POST', '/api/stats', { password: 'pw' });
  assert.equal(res.status, 503);
  assert.match(res.json.error, /Redis/);
});

// ---------- where visits come from ----------

import http from 'node:http';

// fetch() won't let us set Host or User-Agent freely, so use a raw request.
function rawGet(port, path, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET', headers }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

async function startRaw(options) {
  const app = createApp(options);
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  return { port: server.address().port, close: () => new Promise((r) => server.close(r)) };
}

test('a visit records the city and device from the request', async (t) => {
  const counter = createMemoryCounter();
  const { port, close } = await startRaw({ mailer: fakeMailer(), counter, env: { VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'mulysa.vercel.app' } });
  t.after(close);
  await rawGet(port, '/api/config', {
    host: 'mulysa.vercel.app',
    'user-agent': PHONE_UA,
    'x-vercel-ip-country': 'ZA',
    'x-vercel-ip-city': 'Johannesburg',
  });
  const stats = await counter.read(1);
  assert.equal(stats.today.visits, 1);
  assert.deepEqual(stats.breakdown.places, [{ label: 'Johannesburg, South Africa', visits: 1, sends: 0 }]);
  assert.deepEqual(stats.breakdown.devices, [{ label: 'Mobile · Android · Chrome', visits: 1, sends: 0 }]);
});

test("Vercel's own check of a new deployment is not counted as a visit", async (t) => {
  const counter = createMemoryCounter();
  const { port, close } = await startRaw({ mailer: fakeMailer(), counter, env: { VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'mulysa.vercel.app' } });
  t.after(close);
  const status = await rawGet(port, '/api/config', { host: 'mulysa-b3k4dvc6x-ryzorbents-projects.vercel.app', 'user-agent': PHONE_UA });
  assert.equal(status, 200, 'the page still works there');
  assert.equal((await counter.read(1)).today.visits, 0);
});

test('a bot loading the page is not counted as a visit', async (t) => {
  const counter = createMemoryCounter();
  const { port, close } = await startRaw({ mailer: fakeMailer(), counter, env: {} });
  t.after(close);
  await rawGet(port, '/api/config', { host: 'localhost', 'user-agent': 'Mozilla/5.0 HeadlessChrome/131.0.0.0' });
  assert.equal((await counter.read(1)).today.visits, 0);
});

test('a successful send records the city and device too', async (t) => {
  const counter = createMemoryCounter();
  const app = createApp({ mailer: fakeMailer(), counter, env: {} });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  t.after(() => new Promise((r) => server.close(r)));
  const body = JSON.stringify(sendBody);
  await new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: server.address().port, path: '/api/send', method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'user-agent': PHONE_UA, 'x-vercel-ip-country': 'ZA', 'x-vercel-ip-city': 'Durban' },
    }, (res) => { res.resume(); res.on('end', resolve); });
    req.on('error', reject);
    req.end(body);
  });
  const stats = await counter.read(1);
  assert.deepEqual(stats.breakdown.places, [{ label: 'Durban, South Africa', visits: 0, sends: 1 }]);
  assert.deepEqual(stats.breakdown.devices, [{ label: 'Mobile · Android · Chrome', visits: 0, sends: 1 }]);
});

test('POST /api/stats includes the place and device breakdown', async (t) => {
  const counter = createMemoryCounter();
  await counter.recordVisit({ place: 'Musina, South Africa', device: 'Mobile · Android · Chrome' });
  const { call, close } = await start({ mailer: fakeMailer(), counter, statsPassword: 'pw' });
  t.after(close);
  const res = await call('POST', '/api/stats', { password: 'pw' });
  assert.deepEqual(res.json.breakdown.places, [{ label: 'Musina, South Africa', visits: 1, sends: 0 }]);
  assert.deepEqual(res.json.breakdown.devices, [{ label: 'Mobile · Android · Chrome', visits: 1, sends: 0 }]);
});

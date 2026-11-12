import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../lib/app.js';
import { LOCKED_NOTICE } from '../lib/email.js';

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
  imageSeeds: ['abc'],
};

test('GET /api/config lists the provinces, the locked notice and whether a code is needed', async (t) => {
  const { call, close } = await start({ mailer: fakeMailer() });
  t.after(close);
  const res = await call('GET', '/api/config');
  assert.equal(res.status, 200);
  assert.equal(res.json.provinces.length, 5);
  assert.equal(res.json.lockedNotice, LOCKED_NOTICE);
  assert.equal(res.json.accessCodeRequired, false);
});

test('POST /api/generate returns a number with the province prefix', async (t) => {
  const { call, close } = await start({ mailer: fakeMailer() });
  t.after(close);
  const res = await call('POST', '/api/generate', { province: 'Western Cape (Cape Town)' });
  assert.equal(res.status, 200);
  assert.match(res.json.mockNumber, /^CTR-\d{4}-\d{6}$/);
  assert.equal(res.json.prefix, 'CTR');
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

test('with an access code set, API calls without it are refused', async (t) => {
  const { call, close } = await start({ mailer: fakeMailer(), accessCode: 'letmein' });
  t.after(close);
  const res = await call('POST', '/api/generate', { province: 'Gauteng (Pretoria)' });
  assert.equal(res.status, 401);
});

test('with an access code set, the right code is accepted', async (t) => {
  const { call, close } = await start({ mailer: fakeMailer(), accessCode: 'letmein' });
  t.after(close);
  const res = await call('POST', '/api/generate', { province: 'Gauteng (Pretoria)' }, { 'x-access-code': 'letmein' });
  assert.equal(res.status, 200);
});

test('with an access code set, a wrong code is refused', async (t) => {
  const { call, close } = await start({ mailer: fakeMailer(), accessCode: 'letmein' });
  t.after(close);
  const res = await call('POST', '/api/generate', { province: 'Gauteng (Pretoria)' }, { 'x-access-code': 'nope' });
  assert.equal(res.status, 401);
  assert.equal(res.json.reason, 'access-code-wrong');
  assert.match(res.json.error, /not right/i);
});

test('with an access code set, a missing code asks for it rather than calling it wrong', async (t) => {
  const { call, close } = await start({ mailer: fakeMailer(), accessCode: 'letmein' });
  t.after(close);
  const res = await call('POST', '/api/generate', { province: 'Gauteng (Pretoria)' });
  assert.equal(res.status, 401);
  assert.equal(res.json.reason, 'access-code-missing');
  assert.match(res.json.error, /enter the tester access code/i);
  assert.doesNotMatch(res.json.error, /not right/i);
});

test('with an access code set, config still loads and says a code is needed', async (t) => {
  const { call, close } = await start({ mailer: fakeMailer(), accessCode: 'letmein' });
  t.after(close);
  const res = await call('GET', '/api/config');
  assert.equal(res.status, 200);
  assert.equal(res.json.accessCodeRequired, true);
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

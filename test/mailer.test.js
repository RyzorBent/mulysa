import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gmailTransportOptions, friendlyMailError, readCredentials } from '../lib/mailer.js';
import { ValidationError } from '../lib/email.js';

test('connects to Gmail over TLS on port 465', () => {
  const opts = gmailTransportOptions({ user: 'me@gmail.com', pass: 'abcdabcdabcdabcd' });
  assert.equal(opts.host, 'smtp.gmail.com');
  assert.equal(opts.port, 465);
  assert.equal(opts.secure, true);
});

test('turns Nodemailer logging off so credentials never reach the logs', () => {
  const opts = gmailTransportOptions({ user: 'me@gmail.com', pass: 'abcdabcdabcdabcd' });
  assert.equal(opts.logger, false);
  assert.equal(opts.debug, false);
});

test('readCredentials strips the spaces Google shows in app passwords', () => {
  const creds = readCredentials({ gmail: ' me@gmail.com ', appPassword: 'abcd efgh ijkl mnop' });
  assert.deepEqual(creds, { user: 'me@gmail.com', pass: 'abcdefghijklmnop' });
});

test('readCredentials rejects a missing Gmail address', () => {
  assert.throws(() => readCredentials({ gmail: '', appPassword: 'abcdefghijklmnop' }), ValidationError);
});

test('readCredentials rejects a missing app password', () => {
  assert.throws(() => readCredentials({ gmail: 'me@gmail.com', appPassword: '  ' }), ValidationError);
});

test('explains a rejected login in terms of app passwords', () => {
  const err = Object.assign(new Error('Invalid login: 535 secretpassword'), { code: 'EAUTH' });
  const message = friendlyMailError(err);
  assert.match(message, /app password/i);
  assert.ok(!message.includes('secretpassword'));
});

test('explains a network failure as not reaching Gmail', () => {
  const err = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
  assert.match(friendlyMailError(err), /reach Gmail/i);
});

test('falls back to a generic message without echoing the raw error', () => {
  const err = new Error('something odd with secretpassword');
  const message = friendlyMailError(err);
  assert.ok(!message.includes('secretpassword'));
  assert.ok(message.length > 0);
});

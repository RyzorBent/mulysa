import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeEmail, LOCKED_NOTICE, MAX_IMAGES, picsumUrl, ValidationError } from '../lib/email.js';

const valid = {
  to: 'friend@example.com',
  subject: 'Your reference number PTA-2026-481927',
  message: 'Hello,\n\nYour reference number is PTA-2026-481927.',
  imageSeeds: ['abc123'],
};

test('always adds the locked demo notice to the plain-text body', () => {
  const email = composeEmail(valid);
  assert.ok(email.text.includes(LOCKED_NOTICE));
});

test('always adds the locked demo notice to the HTML body', () => {
  const email = composeEmail(valid);
  assert.ok(email.html.includes(LOCKED_NOTICE));
});

test('adds the notice even when the tester empties the message', () => {
  const email = composeEmail({ ...valid, message: '' });
  assert.ok(email.text.includes(LOCKED_NOTICE));
  assert.ok(email.html.includes(LOCKED_NOTICE));
});

test('notice says the number is fake and not from Home Affairs', () => {
  assert.match(LOCKED_NOTICE, /fake/i);
  assert.match(LOCKED_NOTICE, /Home Affairs/);
});

test('escapes HTML typed into the message', () => {
  const email = composeEmail({ ...valid, message: '<script>alert(1)</script> & co' });
  assert.ok(!email.html.includes('<script>'));
  assert.ok(email.html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co'));
});

test('keeps line breaks from the message in the HTML', () => {
  const email = composeEmail({ ...valid, message: 'line one\nline two' });
  assert.ok(email.html.includes('line one<br>line two'));
});

test('turns image seeds into Lorem Picsum images in the HTML', () => {
  const email = composeEmail({ ...valid, imageSeeds: ['abc123', 'x-y_z'] });
  assert.ok(email.html.includes(`src="${picsumUrl('abc123')}"`));
  assert.ok(email.html.includes(`src="${picsumUrl('x-y_z')}"`));
  assert.equal(picsumUrl('abc123'), 'https://picsum.photos/seed/abc123/600/360');
});

test('allows an email with no images', () => {
  const email = composeEmail({ ...valid, imageSeeds: [] });
  assert.ok(!email.html.includes('<img'));
});

test('passes recipient and subject through unchanged', () => {
  const email = composeEmail(valid);
  assert.equal(email.to, 'friend@example.com');
  assert.equal(email.subject, 'Your reference number PTA-2026-481927');
});

test('rejects an image seed that is not a simple word (no arbitrary URLs)', () => {
  assert.throws(
    () => composeEmail({ ...valid, imageSeeds: ['https://evil.example/x.png'] }),
    ValidationError,
  );
});

test(`rejects more than ${MAX_IMAGES} images`, () => {
  const seeds = Array.from({ length: MAX_IMAGES + 1 }, (_, i) => `s${i}`);
  assert.throws(() => composeEmail({ ...valid, imageSeeds: seeds }), ValidationError);
});

test('rejects a missing recipient', () => {
  assert.throws(() => composeEmail({ ...valid, to: '' }), ValidationError);
});

test('rejects more than one recipient', () => {
  assert.throws(() => composeEmail({ ...valid, to: 'a@example.com, b@example.com' }), ValidationError);
});

test('rejects a recipient that is not an email address', () => {
  assert.throws(() => composeEmail({ ...valid, to: 'not-an-email' }), ValidationError);
});

test('rejects an empty subject', () => {
  assert.throws(() => composeEmail({ ...valid, subject: '   ' }), ValidationError);
});

test('rejects a subject containing a line break (header injection)', () => {
  assert.throws(() => composeEmail({ ...valid, subject: 'Hi\r\nBcc: x@example.com' }), ValidationError);
});

test('rejects a message longer than 5000 characters', () => {
  assert.throws(() => composeEmail({ ...valid, message: 'a'.repeat(5001) }), ValidationError);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeEmail, LOCKED_NOTICE, MAX_IMAGES, ValidationError } from '../lib/email.js';
import { PHOTO_IDS, photoUrl } from '../lib/photos.js';

const valid = {
  to: 'friend@example.com',
  subject: 'Your reference number PTA-2026-481927',
  message: 'Hello,\n\nYour reference number is PTA-2026-481927.',
  photoIds: [PHOTO_IDS[0]],
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

test('turns photo ids into Unsplash images in the HTML', () => {
  const email = composeEmail({ ...valid, photoIds: [PHOTO_IDS[0], PHOTO_IDS[1]] });
  assert.ok(email.html.includes(`src="${photoUrl(PHOTO_IDS[0])}"`));
  assert.ok(email.html.includes(`src="${photoUrl(PHOTO_IDS[1])}"`));
});

test('photo URLs point at Unsplash as 600x360 JPEGs', () => {
  assert.equal(
    photoUrl('1506744038136-46273834b3fb'),
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&h=360&fit=crop&fm=jpg&q=70',
  );
});

test('offers a decent set of photos to shuffle through', () => {
  assert.ok(PHOTO_IDS.length >= 20);
  assert.equal(new Set(PHOTO_IDS).size, PHOTO_IDS.length, 'no duplicates');
});

test('allows an email with no images', () => {
  const email = composeEmail({ ...valid, photoIds: [] });
  assert.ok(!email.html.includes('<img'));
});

test('passes recipient and subject through unchanged', () => {
  const email = composeEmail(valid);
  assert.equal(email.to, 'friend@example.com');
  assert.equal(email.subject, 'Your reference number PTA-2026-481927');
});

test('rejects a photo that is not in the approved list (no arbitrary URLs)', () => {
  assert.throws(
    () => composeEmail({ ...valid, photoIds: ['https://evil.example/x.png'] }),
    ValidationError,
  );
  assert.throws(() => composeEmail({ ...valid, photoIds: ['abc123'] }), ValidationError);
});

test(`rejects more than ${MAX_IMAGES} images`, () => {
  const ids = PHOTO_IDS.slice(0, MAX_IMAGES + 1);
  assert.throws(() => composeEmail({ ...valid, photoIds: ids }), ValidationError);
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

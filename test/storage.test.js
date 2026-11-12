import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadRecipients,
  rememberRecipient,
  clearRecipients,
  loadCredentials,
  saveCredentials,
  clearCredentials,
  MAX_RECIPIENTS,
} from '../public/storage.js';

// A stand-in for the browser's localStorage.
function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    dump: () => Object.fromEntries(data),
  };
}

// localStorage can throw (private browsing, storage disabled, quota full).
const brokenStorage = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); },
};

// ---------- recipients ----------

test('starts with no saved recipients', () => {
  assert.deepEqual(loadRecipients(memoryStorage()), []);
});

test('remembers a recipient so it can be offered next time', () => {
  const s = memoryStorage();
  rememberRecipient(s, 'friend@example.com');
  assert.deepEqual(loadRecipients(s), ['friend@example.com']);
});

test('lists the most recently used recipient first', () => {
  const s = memoryStorage();
  rememberRecipient(s, 'a@example.com');
  rememberRecipient(s, 'b@example.com');
  assert.deepEqual(loadRecipients(s), ['b@example.com', 'a@example.com']);
});

test('re-using an address moves it to the top instead of duplicating it (case-insensitive)', () => {
  const s = memoryStorage();
  rememberRecipient(s, 'a@example.com');
  rememberRecipient(s, 'b@example.com');
  rememberRecipient(s, ' A@Example.com ');
  assert.deepEqual(loadRecipients(s), ['A@Example.com', 'b@example.com']);
});

test(`keeps at most ${MAX_RECIPIENTS} recipients, dropping the oldest`, () => {
  const s = memoryStorage();
  for (let i = 0; i < MAX_RECIPIENTS + 5; i++) rememberRecipient(s, `p${i}@example.com`);
  const list = loadRecipients(s);
  assert.equal(list.length, MAX_RECIPIENTS);
  assert.equal(list[0], `p${MAX_RECIPIENTS + 4}@example.com`);
  assert.ok(!list.includes('p0@example.com'));
});

test('ignores a blank address', () => {
  const s = memoryStorage();
  rememberRecipient(s, '   ');
  assert.deepEqual(loadRecipients(s), []);
});

test('clearing recipients removes them from storage', () => {
  const s = memoryStorage();
  rememberRecipient(s, 'a@example.com');
  clearRecipients(s);
  assert.deepEqual(loadRecipients(s), []);
  assert.deepEqual(s.dump(), {});
});

test('a corrupted saved list is treated as empty', () => {
  const s = memoryStorage();
  s.setItem('mulysa.recipients', '{not json');
  assert.deepEqual(loadRecipients(s), []);
  s.setItem('mulysa.recipients', JSON.stringify(['ok@example.com', 42, null]));
  assert.deepEqual(loadRecipients(s), ['ok@example.com']);
});

test('recipients never throw when the browser blocks storage', () => {
  assert.deepEqual(loadRecipients(brokenStorage), []);
  assert.doesNotThrow(() => rememberRecipient(brokenStorage, 'a@example.com'));
  assert.doesNotThrow(() => clearRecipients(brokenStorage));
  assert.deepEqual(loadRecipients(null), []);
});

// ---------- Gmail details ----------

test('has no saved Gmail details by default', () => {
  assert.equal(loadCredentials(memoryStorage()), null);
});

test('saves and loads Gmail details', () => {
  const s = memoryStorage();
  saveCredentials(s, { gmail: 'me@gmail.com', appPassword: 'abcd efgh ijkl mnop' });
  assert.deepEqual(loadCredentials(s), { gmail: 'me@gmail.com', appPassword: 'abcd efgh ijkl mnop' });
});

test('clearing Gmail details removes them from storage', () => {
  const s = memoryStorage();
  saveCredentials(s, { gmail: 'me@gmail.com', appPassword: 'x' });
  clearCredentials(s);
  assert.equal(loadCredentials(s), null);
  assert.deepEqual(s.dump(), {});
});

test('clearing Gmail details leaves saved recipients alone', () => {
  const s = memoryStorage();
  rememberRecipient(s, 'a@example.com');
  saveCredentials(s, { gmail: 'me@gmail.com', appPassword: 'x' });
  clearCredentials(s);
  assert.deepEqual(loadRecipients(s), ['a@example.com']);
});

test('corrupted Gmail details load as nothing', () => {
  const s = memoryStorage();
  s.setItem('mulysa.gmail', 'garbage');
  assert.equal(loadCredentials(s), null);
});

test('Gmail details never throw when the browser blocks storage', () => {
  assert.equal(loadCredentials(brokenStorage), null);
  assert.doesNotThrow(() => saveCredentials(brokenStorage, { gmail: 'a', appPassword: 'b' }));
  assert.doesNotThrow(() => clearCredentials(brokenStorage));
});

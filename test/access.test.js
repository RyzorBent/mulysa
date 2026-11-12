import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessCodeMatches } from '../lib/access.js';

const CODE = 'mulysa-kemzr-h24fd';

test('accepts the exact code', () => {
  assert.equal(accessCodeMatches(CODE, CODE), true);
});

test('ignores capital letters', () => {
  assert.equal(accessCodeMatches('Mulysa-KEMZR-h24fd', CODE), true);
});

test('ignores spaces before, after and inside', () => {
  assert.equal(accessCodeMatches('  mulysa - kemzr - h24fd \n', CODE), true);
});

test('accepts typographic dashes that sneak in when copying', () => {
  assert.equal(accessCodeMatches('mulysa–kemzr—h24fd', CODE), true); // en dash, em dash
  assert.equal(accessCodeMatches('mulysa‑kemzr‐h24fd', CODE), true); // non-breaking hyphen, hyphen
});

test('ignores quotes and backticks copied along with the code', () => {
  assert.equal(accessCodeMatches('`mulysa-kemzr-h24fd`', CODE), true);
  assert.equal(accessCodeMatches('"mulysa-kemzr-h24fd"', CODE), true);
});

test('ignores invisible zero-width characters', () => {
  assert.equal(accessCodeMatches('mulysa-​kemzr-h24fd﻿', CODE), true);
});

test('still rejects a different code', () => {
  assert.equal(accessCodeMatches('mulysa-kemzr-h24fe', CODE), false);
  assert.equal(accessCodeMatches('mulysa-kemzr', CODE), false);
});

test('rejects an empty code', () => {
  assert.equal(accessCodeMatches('', CODE), false);
  assert.equal(accessCodeMatches('   ', CODE), false);
});

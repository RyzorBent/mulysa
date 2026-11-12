import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROVINCES, prefixFor, generateMockNumber } from '../lib/reference.js';

test('offers exactly the five provinces from the spec', () => {
  assert.deepEqual(
    PROVINCES.map((p) => p.name),
    [
      'Gauteng (Pretoria)',
      'Western Cape (Cape Town)',
      'KwaZulu-Natal (Durban)',
      'Limpopo (Musina)',
      'Eastern Cape (Gqeberha)',
    ],
  );
});

test('maps each province to its prefix', () => {
  assert.equal(prefixFor('Gauteng (Pretoria)'), 'PTA');
  assert.equal(prefixFor('Western Cape (Cape Town)'), 'CTR');
  assert.equal(prefixFor('KwaZulu-Natal (Durban)'), 'DUR');
  assert.equal(prefixFor('Limpopo (Musina)'), 'MUS');
  assert.equal(prefixFor('Eastern Cape (Gqeberha)'), 'PEB');
});

test('returns null for a province that is not in the list', () => {
  assert.equal(prefixFor('Free State (Bloemfontein)'), null);
  assert.equal(prefixFor(undefined), null);
});

test('builds PREFIX-YEAR-6DIGITS using the given date', () => {
  const number = generateMockNumber('PTA', new Date('2026-03-01T00:00:00Z'));
  assert.match(number, /^PTA-2026-\d{6}$/);
});

test('random part is always six digits and never starts with 0', () => {
  for (let i = 0; i < 500; i++) {
    const digits = Number(generateMockNumber('DUR').split('-')[2]);
    assert.ok(digits >= 100000 && digits <= 999999, `out of range: ${digits}`);
  }
});

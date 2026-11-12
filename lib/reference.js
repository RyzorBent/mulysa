// Mock reference numbers.
//
// LEARNING DEMO: these numbers are random and FAKE. They are not issued by,
// registered with, or checked against the Department of Home Affairs or any
// other real system. Nothing here talks to a government service.

import { randomInt } from 'node:crypto';

// The province list shown in the dropdown, and the prefix each one uses.
export const PROVINCES = [
  { name: 'Gauteng (Pretoria)', prefix: 'PTA' },
  { name: 'Western Cape (Cape Town)', prefix: 'CTR' },
  { name: 'KwaZulu-Natal (Durban)', prefix: 'DUR' },
  { name: 'Limpopo (Musina)', prefix: 'MUS' },
  { name: 'Eastern Cape (Gqeberha)', prefix: 'PEB' },
];

/** Returns the prefix for a province name, or null if it isn't one of ours. */
export function prefixFor(provinceName) {
  const match = PROVINCES.find((p) => p.name === provinceName);
  return match ? match.prefix : null;
}

/**
 * Builds a mock number shaped like {PREFIX}-{YEAR}-{6 digits}, e.g. PTA-2026-481927.
 * `now` can be passed in so tests can pin the year.
 */
export function generateMockNumber(prefix, now = new Date()) {
  const year = now.getFullYear();
  // randomInt's upper bound is exclusive, so this gives 100000..999999:
  // always six digits, never a leading zero.
  const random = randomInt(100000, 1000000);
  return `${prefix}-${year}-${random}`;
}

// Tester access code check.
//
// Testers type or paste the code, so be forgiving about things that aren't
// really part of it: capital letters, spaces, quotes/backticks copied along
// with it, invisible characters, and typographic dashes (– — ‑) that some
// apps swap in for a plain "-". The letters and digits still have to match.

import { createHash, timingSafeEqual } from 'node:crypto';

export function normalizeAccessCode(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‐-―−﹘﹣－]/g, '-') // dash look-alikes -> "-"
    .replace(/[\s​-‍⁠﻿­`'"‘’“”]/g, ''); // spaces, invisibles, quotes
}

/** Constant-time comparison of the normalised codes, so timing can't reveal the code. */
export function accessCodeMatches(given, expected) {
  const a = normalizeAccessCode(given);
  const b = normalizeAccessCode(expected);
  if (a === '' || b === '') return false;
  const hash = (s) => createHash('sha256').update(s).digest();
  return timingSafeEqual(hash(a), hash(b));
}

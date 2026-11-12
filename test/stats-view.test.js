import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodTotals, compactDays } from '../public/stats-view.js';

const day = (date, visits = 0, sends = 0) => ({ date, visits, sends });

test('periodTotals adds up visits and sends over the days given', () => {
  assert.deepEqual(periodTotals([day('2026-11-12', 3, 1), day('2026-11-11'), day('2026-11-10', 2, 0)]), { visits: 5, sends: 1 });
  assert.deepEqual(periodTotals([]), { visits: 0, sends: 0 });
});

test('today is always shown, even with nothing in it', () => {
  const items = compactDays([day('2026-11-12'), day('2026-11-11', 1, 0)]);
  assert.deepEqual(items[0], { type: 'day', today: true, ...day('2026-11-12') });
});

test('days with activity are shown; runs of empty days collapse into one gap', () => {
  const items = compactDays([
    day('2026-11-12', 2, 1), // today
    day('2026-11-11'),
    day('2026-11-10'),
    day('2026-11-09', 4, 0),
    day('2026-11-08'),
    day('2026-11-07', 0, 1),
  ]);
  assert.deepEqual(items, [
    { type: 'day', today: true, ...day('2026-11-12', 2, 1) },
    { type: 'gap', count: 2, newest: '2026-11-11', oldest: '2026-11-10' },
    { type: 'day', today: false, ...day('2026-11-09', 4, 0) },
    { type: 'gap', count: 1, newest: '2026-11-08', oldest: '2026-11-08' },
    { type: 'day', today: false, ...day('2026-11-07', 0, 1) },
  ]);
});

test('a quiet month is today plus a single gap', () => {
  const days = [day('2026-11-12')];
  for (let i = 11; i >= 1; i--) days.push(day(`2026-11-${String(i).padStart(2, '0')}`));
  const items = compactDays(days);
  assert.equal(items.length, 2);
  assert.deepEqual(items[1], { type: 'gap', count: 11, newest: '2026-11-11', oldest: '2026-11-01' });
});

test('a trailing run of empty days ends the list as a gap', () => {
  const items = compactDays([day('2026-11-12', 1, 0), day('2026-11-11', 1, 0), day('2026-11-10'), day('2026-11-09')]);
  assert.deepEqual(items.at(-1), { type: 'gap', count: 2, newest: '2026-11-10', oldest: '2026-11-09' });
});

test('no days at all gives an empty list', () => {
  assert.deepEqual(compactDays([]), []);
});

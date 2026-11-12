// Pure helpers for the stats page (no DOM), so they can be tested in Node.

/** Sum of visits and sends over a list of days. */
export function periodTotals(days) {
  return days.reduce(
    (sum, d) => ({ visits: sum.visits + d.visits, sends: sum.sends + d.sends }),
    { visits: 0, sends: 0 },
  );
}

/**
 * Turns 30 days (newest first) into table rows: today always, then only days
 * with activity, with each run of empty days folded into one "gap" row.
 *
 *   { type: 'day', today, date, visits, sends }
 *   { type: 'gap', count, newest, oldest }
 */
export function compactDays(days) {
  const items = [];
  let gap = null;
  days.forEach((d, i) => {
    const today = i === 0;
    if (today || d.visits > 0 || d.sends > 0) {
      if (gap) { items.push(gap); gap = null; }
      items.push({ type: 'day', today, ...d });
      return;
    }
    if (gap) {
      gap.count += 1;
      gap.oldest = d.date;
    } else {
      gap = { type: 'gap', count: 1, newest: d.date, oldest: d.date };
    }
  });
  if (gap) items.push(gap);
  return items;
}

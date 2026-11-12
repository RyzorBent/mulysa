// The hidden stats page. The password stays in the password box only; it is
// sent with each "Show stats" / "Refresh" request and never saved by this page.

import { periodTotals, compactDays } from './stats-view.js';

const $ = (id) => document.getElementById(id);
const number = new Intl.NumberFormat('en-ZA');

function setStatus(text, kind) {
  $('unlock-status').textContent = text;
  $('unlock-status').className = `status${kind ? ` ${kind}` : ''}`;
}

/** "2026-11-12" -> "Thu 12 Nov" (the date is already a South African day). */
function formatDay(date, isToday) {
  if (isToday) return 'Today';
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** A table cell with the exact number and a bar scaled to the busiest count in the table. */
function barCell(value, max) {
  const td = document.createElement('td');
  const wrap = document.createElement('div');
  wrap.className = 'bar-cell';
  const track = document.createElement('span');
  track.className = 'bar-track';
  const bar = document.createElement('span');
  bar.className = 'bar';
  bar.style.width = max > 0 && value > 0 ? `${Math.max(4, (value / max) * 100)}%` : '0';
  track.append(bar);
  const label = document.createElement('span');
  label.className = 'bar-value';
  label.textContent = number.format(value);
  wrap.append(track, label);
  td.append(wrap);
  return td;
}

const BREAKDOWN_ROWS = 10;

/** Top rows of a place/device breakdown, with the rest folded into "Everything else". */
function breakdownRows(list, emptyText) {
  if (!list.length) {
    const tr = document.createElement('tr');
    tr.className = 'is-empty';
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = emptyText;
    tr.append(td);
    return [tr];
  }
  const top = list.slice(0, BREAKDOWN_ROWS);
  const rest = list.slice(BREAKDOWN_ROWS);
  if (rest.length) {
    top.push({
      label: `Everything else (${rest.length})`,
      visits: rest.reduce((n, r) => n + r.visits, 0),
      sends: rest.reduce((n, r) => n + r.sends, 0),
    });
  }
  const max = Math.max(0, ...top.flatMap((r) => [r.visits, r.sends]));
  return top.map((row) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = row.label;
    tr.append(th, barCell(row.visits, max), barCell(row.sends, max));
    return tr;
  });
}

/** "No activity · 28 days (14 Oct – 11 Nov)" row spanning the table. */
function gapRow(gap) {
  const tr = document.createElement('tr');
  tr.className = 'gap-row';
  const td = document.createElement('td');
  td.colSpan = 3;
  const days = gap.count === 1 ? '1 day' : `${gap.count} days`;
  const when = gap.count === 1
    ? formatDay(gap.newest, false)
    : `${formatDay(gap.oldest, false)} – ${formatDay(gap.newest, false)}`;
  td.textContent = `No activity · ${days} (${when})`;
  tr.append(td);
  return tr;
}

function render(stats) {
  // Tiles: the 30-day and all-time totals. Today is the first row of the table below.
  const month = periodTotals(stats.days);
  $('month-visits').textContent = number.format(month.visits);
  $('month-sends').textContent = number.format(month.sends);
  $('total-visits').textContent = number.format(stats.totals.visits);
  $('total-sends').textContent = number.format(stats.totals.sends);

  // One shared scale for both columns: they're the same unit (a count per day),
  // so 5 visits must draw a longer bar than 2 sends.
  const max = Math.max(0, ...stats.days.flatMap((d) => [d.visits, d.sends]));
  const rows = compactDays(stats.days).map((item) => {
    if (item.type === 'gap') return gapRow(item);
    const tr = document.createElement('tr');
    if (item.today) tr.className = 'is-today';
    if (item.visits === 0 && item.sends === 0) tr.classList.add('is-empty');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = formatDay(item.date, item.today);
    th.title = item.date;
    tr.append(th, barCell(item.visits, max), barCell(item.sends, max));
    return tr;
  });
  $('daily-rows').replaceChildren(...rows);

  const breakdown = stats.breakdown ?? { places: [], devices: [] };
  $('place-rows').replaceChildren(...breakdownRows(breakdown.places, 'No visits yet.'));
  $('device-rows').replaceChildren(...breakdownRows(breakdown.devices, 'No visits yet.'));

  $('stats-updated').textContent = `Updated ${new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}`;
  $('stats').hidden = false;
}

async function load() {
  const password = $('password').value;
  if (!password) {
    setStatus('Enter the stats password.', 'err');
    $('password').focus();
    return;
  }
  $('btn-unlock').disabled = true;
  $('btn-refresh').disabled = true;
  setStatus('Loading…');
  try {
    const res = await fetch('/api/stats', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
      cache: 'no-store',
    });
    let data = {};
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
    render(data);
    setStatus('');
    $('unlock-step').hidden = true;
  } catch (err) {
    setStatus(`✗ ${err.message}`, 'err');
  } finally {
    $('btn-unlock').disabled = false;
    $('btn-refresh').disabled = false;
  }
}

$('unlock-form').addEventListener('submit', (event) => {
  event.preventDefault();
  load();
});
$('btn-refresh').addEventListener('click', load);
$('btn-lock').addEventListener('click', () => {
  $('password').value = '';
  $('daily-rows').replaceChildren();
  $('place-rows').replaceChildren();
  $('device-rows').replaceChildren();
  $('stats').hidden = true;
  $('unlock-step').hidden = false;
  setStatus('Locked.', 'ok');
});

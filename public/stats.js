// The hidden stats page. The password stays in the password box only; it is
// sent with each "Show stats" / "Refresh" request and never saved by this page.

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

function render(stats) {
  $('today-visits').textContent = number.format(stats.today.visits);
  $('today-sends').textContent = number.format(stats.today.sends);
  $('total-visits').textContent = number.format(stats.totals.visits);
  $('total-sends').textContent = number.format(stats.totals.sends);

  // One shared scale for both columns: they're the same unit (a count per day),
  // so 5 visits must draw a longer bar than 2 sends.
  const max = Math.max(0, ...stats.days.flatMap((d) => [d.visits, d.sends]));
  const rows = stats.days.map((day, i) => {
    const tr = document.createElement('tr');
    if (i === 0) tr.className = 'is-today';
    if (day.visits === 0 && day.sends === 0) tr.classList.add('is-empty');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = formatDay(day.date, i === 0);
    th.title = day.date;
    tr.append(th, barCell(day.visits, max), barCell(day.sends, max));
    return tr;
  });
  $('daily-rows').replaceChildren(...rows);

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
  $('stats').hidden = true;
  $('unlock-step').hidden = false;
  setStatus('Locked.', 'ok');
});

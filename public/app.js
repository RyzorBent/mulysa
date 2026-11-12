// Front-end for the mock reference demo.
//
// PRIVACY: nothing the tester types is ever stored on the server. In the
// browser (localStorage only, see storage.js):
//   - addresses they've sent to are remembered, for the "To" drop-down;
//   - their Gmail address + app password are remembered ONLY if they tick
//     "Remember my Gmail details on this device".
// Both can be cleared from the page at any time. No cookies, no sessionStorage.

import {
  loadRecipients, rememberRecipient, clearRecipients,
  loadCredentials, saveCredentials, clearCredentials,
} from './storage.js';

const $ = (id) => document.getElementById(id);

// localStorage itself can be blocked (e.g. some private-browsing modes); then we just don't remember.
const store = (() => {
  try { return window.localStorage; } catch { return null; }
})();

// Only non-sensitive page state lives here.
const state = {
  maxImages: 4,
  photos: [],         // [{ id, url }] the approved photo list, from /api/config
  photoIds: [],       // the photos currently in the email
  current: null,      // { number, province } of the last generated number
};

// ---------- helpers ----------

/** Calls the API. Throws an Error with the server's friendly message on failure. */
async function api(path, body) {
  const headers = { 'content-type': 'application/json' };

  let res;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  let data = {};
  try { data = await res.json(); } catch { /* non-JSON reply */ }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

function setStatus(el, text, kind) {
  el.textContent = text;
  el.className = `status${kind ? ` ${kind}` : ''}`;
}

/** Read credentials fresh from the inputs every time; never keep them. */
function credentials() {
  return { gmail: $('gmail').value, appPassword: $('app-password').value };
}

/** Picks a random photo from the approved list, preferring one not already in the email. */
function randomPhotoId(except = []) {
  const unused = state.photos.filter((p) => !state.photoIds.includes(p.id) && !except.includes(p.id));
  const pool = unused.length ? unused : state.photos;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

/** Same URL the server puts in the email, so the preview is exactly what is sent. */
function photoUrlFor(id) {
  return state.photos.find((p) => p.id === id)?.url ?? '';
}

// ---------- step 1: Gmail ----------

$('btn-verify').addEventListener('click', async () => {
  const status = $('verify-status');
  const button = $('btn-verify');
  button.disabled = true;
  setStatus(status, 'Checking with Gmail…');
  try {
    await api('/api/verify', credentials());
    setStatus(status, '✓ Connected. Gmail accepted your login.', 'ok');
  } catch (err) {
    setStatus(status, `✗ ${err.message}`, 'err');
  } finally {
    button.disabled = false;
  }
});

function clearDetailFields() {
  $('gmail').value = '';
  $('app-password').value = '';
  setStatus($('verify-status'), '');
}

function saveDetailsIfRemembering() {
  if ($('remember-me').checked) saveCredentials(store, credentials());
}

$('btn-forget').addEventListener('click', () => {
  clearDetailFields();
  clearCredentials(store);
  $('remember-me').checked = false;
  setStatus($('verify-status'), 'Cleared. Your details are gone from this page and this browser.', 'ok');
});

$('remember-me').addEventListener('change', () => {
  if ($('remember-me').checked) {
    saveCredentials(store, credentials());
    setStatus($('verify-status'), 'Your Gmail details will be remembered in this browser only.', 'ok');
  } else {
    clearCredentials(store);
    setStatus($('verify-status'), 'This browser no longer remembers your Gmail details.', 'ok');
  }
});

for (const id of ['gmail', 'app-password']) {
  $(id).addEventListener('input', () => {
    setStatus($('verify-status'), ''); // new details invalidate an old "Connected" message
    saveDetailsIfRemembering();
  });
}

// If the browser restores this page from its back/forward cache, wipe the
// fields unless the tester asked us to remember them.
window.addEventListener('pageshow', (event) => {
  if (event.persisted && !$('remember-me').checked) clearDetailFields();
});

// ---------- saved recipients ----------

function renderRecipients() {
  const saved = loadRecipients(store);
  const options = $('recipient-options');
  options.replaceChildren(...saved.map((address) => {
    const option = document.createElement('option');
    option.value = address;
    return option;
  }));
  $('saved-recipients').hidden = saved.length === 0;
  $('saved-recipients-info').textContent = saved.length === 1
    ? '1 saved address: click the To box to pick it.'
    : `${saved.length} saved addresses: click the To box to pick one.`;
  $('to').placeholder = saved.length ? 'Type an address, or pick a saved one' : 'recipient@example.com';
}

$('btn-clear-recipients').addEventListener('click', () => {
  clearRecipients(store);
  renderRecipients();
});

// ---------- steps 2 & 3: province and number ----------

function fillCompose(previous, next) {
  const subject = $('subject');
  const message = $('message');

  if (previous) {
    // The tester may have edited the text, so swap the old number and
    // province for the new ones rather than overwriting their edits.
    for (const field of [subject, message]) {
      field.value = field.value
        .replaceAll(previous.number, next.number)
        .replaceAll(previous.province, next.province);
    }
    return;
  }

  if (!subject.value.trim()) subject.value = `Your reference number ${next.number}`;
  if (!message.value.trim()) {
    message.value = [
      'Hello,',
      '',
      `Your reference number is ${next.number}, issued for ${next.province}.`,
      '',
      'Please keep this number for your records.',
      '',
      'Kind regards',
    ].join('\n');
  }
}

$('btn-generate').addEventListener('click', async () => {
  const status = $('generate-status');
  const button = $('btn-generate');
  button.disabled = true;
  setStatus(status, '');
  try {
    const province = $('province').value;
    const data = await api('/api/generate', { province });
    const next = { number: data.mockNumber, province: data.province };
    fillCompose(state.current, next);
    state.current = next;
    $('number').textContent = next.number;
    $('number-box').hidden = false;
  } catch (err) {
    setStatus(status, `✗ ${err.message}`, 'err');
  } finally {
    button.disabled = false;
  }
});

// ---------- step 4: photos ----------

function renderPhotos() {
  const grid = $('photos');
  grid.replaceChildren();

  if (state.photoIds.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'photos-empty';
    empty.textContent = 'No photos. The email will be text only.';
    grid.append(empty);
  }

  state.photoIds.forEach((id, index) => {
    const tile = document.createElement('div');
    tile.className = 'photo';

    const img = document.createElement('img');
    img.src = photoUrlFor(id);
    img.alt = `Placeholder photo ${index + 1}`;
    img.loading = 'lazy';

    const swap = document.createElement('button');
    swap.type = 'button';
    swap.className = 'swap';
    swap.textContent = '↻';
    swap.title = 'Swap for a different photo';
    swap.setAttribute('aria-label', `Swap photo ${index + 1}`);
    swap.addEventListener('click', () => {
      state.photoIds[index] = randomPhotoId([id]);
      renderPhotos();
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = '✕';
    remove.title = 'Remove this photo';
    remove.setAttribute('aria-label', `Remove photo ${index + 1}`);
    remove.addEventListener('click', () => {
      state.photoIds.splice(index, 1);
      renderPhotos();
    });

    tile.append(img, swap, remove);
    grid.append(tile);
  });

  $('btn-add-photo').disabled = state.photoIds.length >= state.maxImages || state.photos.length === 0;
}

$('btn-add-photo').addEventListener('click', () => {
  if (state.photoIds.length < state.maxImages && state.photos.length) {
    state.photoIds.push(randomPhotoId());
    renderPhotos();
  }
});

// ---------- steps 4 & 5: send and result ----------

function showResult(build) {
  const box = $('result');
  box.replaceChildren();
  build(box);
}

function addLine(parent, text, className) {
  const p = document.createElement('p');
  if (className) p.className = className;
  p.textContent = text;
  parent.append(p);
  return p;
}

$('btn-send').addEventListener('click', async () => {
  const button = $('btn-send');

  if (!state.current) {
    showResult((box) => addLine(box, '✗ Generate a number first (step 3).', 'err'));
    return;
  }

  button.disabled = true;
  button.textContent = 'Sending…';
  showResult((box) => addLine(box, 'Sending through Gmail…', 'muted'));

  try {
    const data = await api('/api/send', {
      ...credentials(),
      to: $('to').value,
      subject: $('subject').value,
      message: $('message').value,
      photoIds: state.photoIds,
    });

    // Remember who we sent to, in this browser only, for the To drop-down next time.
    for (const address of data.accepted) rememberRecipient(store, address);
    renderRecipients();

    const time = new Date(data.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    showResult((box) => {
      addLine(box, `✓ Accepted by Gmail at ${time}`, 'ok');
      const dl = document.createElement('dl');
      const rows = [
        ['To', data.accepted.join(', ') || '(none)'],
        ['Reference', state.current.number],
        ['Message ID', data.messageId],
      ];
      if (data.rejected.length) rows.push(['Rejected', data.rejected.join(', ')]);
      for (const [label, value] of rows) {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        const code = document.createElement(label === 'Message ID' ? 'code' : 'span');
        code.textContent = value;
        dd.append(code);
        dl.append(dt, dd);
      }
      box.append(dl);
      addLine(
        box,
        'Gmail has accepted the email for delivery. It can’t tell us whether it lands in the inbox or in spam, so ask the recipient to check both.',
        'muted',
      );
    });
  } catch (err) {
    showResult((box) => addLine(box, `✗ ${err.message}`, 'err'));
  } finally {
    button.disabled = false;
    button.textContent = 'Send';
  }
});

// ---------- start-up ----------

async function init() {
  // Restore anything this browser was asked to remember.
  const saved = loadCredentials(store);
  if (saved) {
    $('gmail').value = saved.gmail;
    $('app-password').value = saved.appPassword;
    $('remember-me').checked = true;
  }
  renderRecipients();

  try {
    const config = await api('/api/config');

    const select = $('province');
    for (const name of config.provinces) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.append(option);
    }

    $('locked-notice').textContent = `"${config.lockedNotice}"`;
    state.maxImages = config.maxImages;
    state.photos = config.photos;
  } catch (err) {
    showResult((box) => addLine(box, `✗ Could not load the page settings: ${err.message}`, 'err'));
  }

  for (let i = 0; i < Math.min(3, state.maxImages) && state.photos.length; i++) {
    state.photoIds.push(randomPhotoId());
  }
  renderPhotos();
}

init();

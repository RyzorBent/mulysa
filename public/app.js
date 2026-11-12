// Front-end for the mock reference demo.
//
// PRIVACY: the Gmail address and app password are read straight
// from their input boxes at the moment a request is made. They are not copied
// into any variable that lives on, and nothing is put in localStorage,
// sessionStorage or cookies. Reloading the page clears everything.

const $ = (id) => document.getElementById(id);

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

function forgetDetails() {
  $('gmail').value = '';
  $('app-password').value = '';
  setStatus($('verify-status'), '');
}

$('btn-forget').addEventListener('click', () => {
  forgetDetails();
  setStatus($('verify-status'), 'Cleared. Your details are gone from this page.', 'ok');
});

// Typing new details invalidates the old "Connected" message.
for (const id of ['gmail', 'app-password']) {
  $(id).addEventListener('input', () => setStatus($('verify-status'), ''));
}

// If the browser restores this page from its back/forward cache, wipe the password.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) forgetDetails();
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

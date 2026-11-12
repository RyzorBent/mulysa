// What this app keeps in the BROWSER (localStorage), and nowhere else.
//
//   mulysa.recipients  addresses you've sent to, newest first (saved automatically)
//   mulysa.gmail       your Gmail address + app password, ONLY if you tick
//                      "Remember my Gmail details on this device"
//
// None of this is ever sent to or stored on the server. Each item can be
// cleared from the page at any time. Every function takes the storage object
// as an argument (window.localStorage in the browser, a fake in tests) and
// never throws, because browsers can block storage (private mode, quota).

const RECIPIENTS_KEY = 'mulysa.recipients';
const CREDENTIALS_KEY = 'mulysa.gmail';
export const MAX_RECIPIENTS = 20;

function read(storage, key) {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: the app still works, it just won't remember.
  }
}

function remove(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // Nothing to do.
  }
}

// ---------- recipients ----------

export function loadRecipients(storage) {
  const list = read(storage, RECIPIENTS_KEY);
  return Array.isArray(list) ? list.filter((x) => typeof x === 'string' && x.trim() !== '') : [];
}

/** Puts an address at the top of the saved list (no duplicates, oldest dropped past the limit). */
export function rememberRecipient(storage, address) {
  const clean = String(address ?? '').trim();
  if (!clean) return loadRecipients(storage);
  const others = loadRecipients(storage).filter((x) => x.toLowerCase() !== clean.toLowerCase());
  const list = [clean, ...others].slice(0, MAX_RECIPIENTS);
  write(storage, RECIPIENTS_KEY, list);
  return list;
}

export function clearRecipients(storage) {
  remove(storage, RECIPIENTS_KEY);
}

// ---------- Gmail details (opt-in) ----------

export function loadCredentials(storage) {
  const saved = read(storage, CREDENTIALS_KEY);
  if (saved && typeof saved.gmail === 'string' && typeof saved.appPassword === 'string') {
    return { gmail: saved.gmail, appPassword: saved.appPassword };
  }
  return null;
}

export function saveCredentials(storage, { gmail, appPassword }) {
  write(storage, CREDENTIALS_KEY, { gmail: String(gmail ?? ''), appPassword: String(appPassword ?? '') });
}

export function clearCredentials(storage) {
  remove(storage, CREDENTIALS_KEY);
}

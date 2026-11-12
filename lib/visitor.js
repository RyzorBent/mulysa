// Coarse, anonymous descriptions of a visit, for the usage stats.
//
//   describeDevice  "Mobile · Android · Chrome"  (type · OS · browser; no versions)
//   describePlace   "Johannesburg, South Africa" (from Vercel's location headers; no IP)
//   isCountableVisit  whether a page load should count at all
//
// These labels are only ever added to per-day totals. Nothing links a place to a
// device, or either of them to a person.

const MAX_LABEL = 80;

// ---------- device ----------

function deviceType(ua) {
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'Tablet';
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

function operatingSystem(ua) {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
  if (/Linux|X11/i.test(ua)) return 'Linux';
  return null;
}

function browser(ua) {
  // Order matters: many browsers also say "Chrome" and "Safari".
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/Edg(e|A|iOS)?\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/Firefox|FxiOS/i.test(ua)) return 'Firefox';
  if (/CriOS|Chrome\//i.test(ua)) return 'Chrome';
  if (/Version\/.*Safari\//i.test(ua)) return 'Safari';
  return null;
}

/** "Mobile · Android · Chrome", or "Unknown device". */
export function describeDevice(userAgent) {
  const ua = String(userAgent ?? '');
  const os = operatingSystem(ua);
  const name = browser(ua);
  if (!os && !name) return 'Unknown device';
  return [deviceType(ua), os ?? 'Other OS', name ?? 'Other browser'].join(' · ');
}

// ---------- place ----------

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });

function clean(text) {
  return String(text)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

/** "City, Country", "Country", or "Unknown place", from Vercel's x-vercel-ip-* headers. */
export function describePlace(headers = {}) {
  const code = String(headers['x-vercel-ip-country'] ?? '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return 'Unknown place';
  let country;
  try {
    country = countryNames.of(code) ?? code;
  } catch {
    return 'Unknown place';
  }

  let city = '';
  if (headers['x-vercel-ip-city']) {
    try {
      city = clean(decodeURIComponent(headers['x-vercel-ip-city']));
    } catch {
      city = ''; // not valid URL encoding: leave the city out
    }
  }
  return (city ? `${city}, ${country}` : country).slice(0, MAX_LABEL);
}

// ---------- which visits count ----------

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|screenshot|vercel|facebookexternalhit|embedly|curl|wget|python|node-fetch|undici/i;

// Vercel's per-deployment and per-branch addresses look like
//   mulysa-b3k4dvc6x-team.vercel.app   mulysa-git-main-team.vercel.app   mulysa-team.vercel.app
// The public production address is the short one, e.g. mulysa.vercel.app.
function isVercelDeploymentHost(host) {
  return host.endsWith('.vercel.app') && host.slice(0, -'.vercel.app'.length).includes('-');
}

/**
 * Should this page load count as a visit? Only real people on the real address:
 * not Vercel's own checks of each new deployment, and not bots or headless browsers.
 */
export function isCountableVisit({ host, userAgent, env = process.env }) {
  const ua = String(userAgent ?? '');
  if (!ua || BOT.test(ua)) return false;
  if (!env.VERCEL) return true; // local development

  const h = String(host ?? '').toLowerCase().split(':')[0];
  if (!h.endsWith('.vercel.app')) return true; // a custom domain
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return h === env.VERCEL_PROJECT_PRODUCTION_URL.toLowerCase();
  return !isVercelDeploymentHost(h);
}

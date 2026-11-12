import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeDevice, describePlace, isCountableVisit } from '../lib/visitor.js';

// ---------- device: broad type · OS · browser, nothing finer ----------

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/115.0.0.0',
};

test('labels phones', () => {
  assert.equal(describeDevice(UA.iphoneSafari), 'Mobile · iOS · Safari');
  assert.equal(describeDevice(UA.iphoneChrome), 'Mobile · iOS · Chrome');
  assert.equal(describeDevice(UA.androidChrome), 'Mobile · Android · Chrome');
  assert.equal(describeDevice(UA.samsung), 'Mobile · Android · Samsung Internet');
});

test('labels tablets', () => {
  assert.equal(describeDevice(UA.androidTablet), 'Tablet · Android · Chrome');
  assert.equal(describeDevice(UA.ipad), 'Tablet · iOS · Safari');
});

test('labels computers', () => {
  assert.equal(describeDevice(UA.windowsEdge), 'Desktop · Windows · Edge');
  assert.equal(describeDevice(UA.windowsFirefox), 'Desktop · Windows · Firefox');
  assert.equal(describeDevice(UA.macChrome), 'Desktop · macOS · Chrome');
  assert.equal(describeDevice(UA.macSafari), 'Desktop · macOS · Safari');
  assert.equal(describeDevice(UA.linuxFirefox), 'Desktop · Linux · Firefox');
  assert.equal(describeDevice(UA.chromebook), 'Desktop · ChromeOS · Chrome');
  assert.equal(describeDevice(UA.opera), 'Desktop · Windows · Opera');
});

test('never includes version numbers', () => {
  for (const ua of Object.values(UA)) assert.doesNotMatch(describeDevice(ua), /\d/);
});

test('an empty or odd user agent is "Unknown device"', () => {
  assert.equal(describeDevice(''), 'Unknown device');
  assert.equal(describeDevice(undefined), 'Unknown device');
  assert.equal(describeDevice('curl/8.7.1'), 'Unknown device');
});

// ---------- place: city and country from Vercel's location headers ----------

test('city and country', () => {
  assert.equal(describePlace({ 'x-vercel-ip-country': 'ZA', 'x-vercel-ip-city': 'Johannesburg' }), 'Johannesburg, South Africa');
});

test('decodes city names Vercel sends URL-encoded', () => {
  assert.equal(describePlace({ 'x-vercel-ip-country': 'BR', 'x-vercel-ip-city': 'S%C3%A3o%20Paulo' }), 'São Paulo, Brazil');
});

test('country only when the city is unknown', () => {
  assert.equal(describePlace({ 'x-vercel-ip-country': 'ZW' }), 'Zimbabwe');
});

test('no location headers (e.g. running locally) is "Unknown place"', () => {
  assert.equal(describePlace({}), 'Unknown place');
});

test('junk in the headers is cleaned and capped', () => {
  const label = describePlace({ 'x-vercel-ip-country': 'ZA', 'x-vercel-ip-city': `Cape%0ATown${'x'.repeat(200)}` });
  assert.doesNotMatch(label, /[\n\r]/);
  assert.ok(label.length <= 80);
  assert.equal(describePlace({ 'x-vercel-ip-country': 'not-a-country' }), 'Unknown place');
  assert.equal(describePlace({ 'x-vercel-ip-country': 'ZA', 'x-vercel-ip-city': '%E0%A4%A' }), 'South Africa'); // undecodable city dropped
});

// ---------- which visits count ----------

const human = UA.androidChrome;
const vercelEnv = { VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'mulysa.vercel.app' };

test('locally, every visit counts', () => {
  assert.equal(isCountableVisit({ host: 'localhost:3000', userAgent: human, env: {} }), true);
});

test('the real production address counts', () => {
  assert.equal(isCountableVisit({ host: 'mulysa.vercel.app', userAgent: human, env: vercelEnv }), true);
});

test("Vercel's one-off deployment addresses do not count", () => {
  assert.equal(isCountableVisit({ host: 'mulysa-b3k4dvc6x-ryzorbents-projects.vercel.app', userAgent: human, env: vercelEnv }), false);
  assert.equal(isCountableVisit({ host: 'mulysa-git-main-ryzorbents-projects.vercel.app', userAgent: human, env: vercelEnv }), false);
  assert.equal(isCountableVisit({ host: 'mulysa-ryzorbents-projects.vercel.app', userAgent: human, env: vercelEnv }), false);
});

test('a custom domain counts', () => {
  assert.equal(isCountableVisit({ host: 'demo.example.org', userAgent: human, env: vercelEnv }), true);
});

test('without the production-URL setting, deployment-looking addresses still do not count', () => {
  const env = { VERCEL: '1' };
  assert.equal(isCountableVisit({ host: 'mulysa.vercel.app', userAgent: human, env }), true);
  assert.equal(isCountableVisit({ host: 'mulysa-b3k4dvc6x-ryzorbents-projects.vercel.app', userAgent: human, env }), false);
  assert.equal(isCountableVisit({ host: 'mulysa-git-main-ryzorbents-projects.vercel.app', userAgent: human, env }), false);
});

test('bots, crawlers and headless browsers do not count', () => {
  for (const ua of [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse',
    'facebookexternalhit/1.1',
    'vercel-screenshot/1.0',
    '',
  ]) {
    assert.equal(isCountableVisit({ host: 'mulysa.vercel.app', userAgent: ua, env: vercelEnv }), false, ua);
  }
});

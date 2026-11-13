# Mock Asylum Reference Generator (learning demo)

**Live app: <https://mulysa.vercel.app>**

> ⚠ **Learning demo.** Every reference number this app makes is random and **fake**. It is not issued by,
> registered with, or checked against the Department of Home Affairs. The app never contacts any
> government system.

A small full-stack app for learning Express, structured ID generation and sending email with Nodemailer.

1. **Your Gmail account:** the tester enters their own Gmail address and an app password.
2. **Choose province:** one of five.
3. **Generate number:** e.g. `PTA-2026-481927` (shown with a *FAKE · DEMO ONLY* badge).
4. **Write the email:** subject and message are pre-filled and fully editable. Placeholder photos can be
   swapped (↻), removed (✕) or added (up to 4).
5. **Delivery result:** what Gmail reported back.

Every email ends with this notice, added on the server so it can't be edited out:

> This is a learning demo. The reference number in this email is fake and was not issued by the Department of Home Affairs.

| Province | Prefix |
|---|---|
| Gauteng (Pretoria) | PTA |
| Western Cape (Cape Town) | CTR |
| KwaZulu-Natal (Durban) | DUR |
| Limpopo (Musina) | MUS |
| Eastern Cape (Gqeberha) | PEB |

## What happens to testers' details

**The server stores nothing the tester types.** Anything remembered lives only in the tester's own browser,
and they can clear it at any time. The only thing the server keeps is two anonymous numbers per day (see
[Usage stats](#usage-stats-hidden-page)).

On the server:

- The Gmail address and app password arrive with a single request over HTTPS, are used to log in to
  Gmail for that request, and are then dropped. There is no database, no file, no session and no cookie.
- A new Gmail connection is opened for each request and closed straight after.
- Nodemailer's logging is switched off. The server never logs request bodies. On a mail error it logs
  only the error *code* (e.g. `EAUTH`), and the tester sees a fixed message that never repeats what they typed.

In the tester's browser (`localStorage` only; see [`public/storage.js`](public/storage.js)):

| What | When it's saved | How to clear it |
|---|---|---|
| Addresses you've sent to (up to 20, newest first) | Automatically after each successful send, so the **To** box offers them in a drop-down next time | **Clear saved addresses** under the To box |
| Gmail address + app password | **Only** if you tick *Remember my Gmail details on this device* | **Forget my details**, or untick the box |

Saved Gmail details are kept **unencrypted** in that browser, so only tick the box on your own computer,
never a shared one. The page sets a strict Content-Security-Policy (only its own scripts, photos only
from Unsplash, requests only to its own API) to make it harder for anything else to read that storage.

Like any email, a copy of each sent message appears in the tester's own Gmail **Sent** folder. That is
Gmail's doing, not this app's.

The server code that touches credentials is short and commented: [`lib/mailer.js`](lib/mailer.js) and
[`lib/app.js`](lib/app.js). Tests check that the password is never echoed back or logged, and that the
browser storage rules above hold.

**Advice for testers:** create an app password just for this demo and delete it afterwards at
<https://myaccount.google.com/apppasswords>. Once it's deleted it stops working, whatever happens.

## Usage stats (hidden page)

`/stats` (e.g. `https://mulysa.vercel.app/stats`) is a password-protected page for the owner. It isn't
linked from the app and tells search engines not to index it. It shows **page visits** and **successful
email sends**: 30-day and all-time totals, then a day-by-day table (today first, only days with activity,
quiet stretches folded into one "No activity" line), using South African days.

- **What's counted:** a visit each time a person opens the page on the real address, and a send each
  time Gmail accepts an email. Failed or invalid sends aren't counted, and neither are opening `/stats`,
  bots/headless browsers, or Vercel's own checks of each new deployment (its one-off
  `*-<hash>-<team>.vercel.app` addresses).
- **Where from and which devices:** each visit/send also adds 1 to its **city** (from Vercel's
  `x-vercel-ip-city` / `x-vercel-ip-country` headers, e.g. "Johannesburg, South Africa") and its broad
  **device** ("Mobile · Android · Chrome", no versions; see [`lib/visitor.js`](lib/visitor.js)). The stats
  page shows the top 10 of each for the last 30 days.
- **What's stored:** only daily totals in Upstash Redis: `mulysa:day:YYYY-MM-DD` → `{visits, sends}`, and
  `…:places:visits|sends` / `…:devices:visits|sends` → `{label: count}`, all expiring after about 13
  months, plus all-time totals. Places and devices are tallied separately, so nothing links a place to a
  device or either to a person. No IP addresses, email addresses or user agents are stored. The app's
  footer says this to visitors.
- **Settings:** `STATS_PASSWORD` unlocks the page; without it the page is switched off. The Redis
  connection comes from the Upstash for Redis Marketplace integration (`KV_REST_API_URL` /
  `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).
- **Without Redis:** locally the counts are kept in memory and reset on restart. On Vercel counting is
  switched off and the stats page says so, rather than showing wrong numbers.
- A broken or slow Redis never breaks the app: counting gives up after 1.5 seconds and the page and
  sending carry on.

## Getting a Gmail app password

1. Turn on 2-Step Verification for the Google account.
2. Go to <https://myaccount.google.com/apppasswords>, create one (any name), and copy the 16 characters.
3. Paste it into step 1. Spaces are fine; they're stripped.

Your normal Gmail password will **not** work.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm start          # http://localhost:3000
npm test           # 116 tests, no network needed
```

Set `PORT` to use a different port. Set `STATS_PASSWORD` to try the stats page at `/stats` (counts are
kept in memory locally).

## Deploy to Vercel

Vercel runs this Express app with no extra configuration: `server.js` default-exports the app, and
files in `public/` are served by Vercel's CDN.

1. Import the repo in the Vercel dashboard, or run `vercel` in this folder.
2. Add the **Upstash for Redis** integration from the Vercel Marketplace and connect it to the project
   (it adds the Redis settings), and set `STATS_PASSWORD` for the stats page. Both are optional: the app
   works without them, just without stats.

Why not Render's free plan: since September 2025 it blocks the outgoing ports Gmail needs (465/587).
A paid Render instance would work.

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/config` | none | provinces, locked notice, max photos, photo list |
| POST | `/api/generate` | `{ province }` | `{ mockNumber, prefix, province }` |
| POST | `/api/verify` | `{ gmail, appPassword }` | `{ ok: true }` |
| POST | `/api/send` | `{ gmail, appPassword, to, subject, message, photoIds }` | `{ ok, accepted, rejected, messageId, sentAt }` |
| POST | `/api/stats` | `{ password }` | `{ today, days[30], totals }` (owner only) |


## Good to know

- **"Accepted by Gmail" isn't "delivered".** Gmail can confirm it accepted the message, not whether it
  reached the inbox or went to spam.
- **One recipient per send**, a subject of up to 200 characters, a message of up to 5,000 characters,
  and up to 4 photos. Gmail also caps personal accounts at about 500 emails a day.
- **Photos are free [Unsplash](https://unsplash.com/license) landscapes** from a fixed list of 23 in
  [`lib/photos.js`](lib/photos.js), loaded from Unsplash's image CDN as 600×360 JPEGs. The email uses
  the same URL as the preview, so the recipient sees exactly what the tester saw. Only photos from the
  list are accepted. (Lorem Picsum was the original choice but was down in Nov 2026.)
- **Browser password managers** may still offer to save the app password. The fields are marked so most
  won't, but if one asks, just decline.

## Project layout

```
server.js          entry point: Vercel imports it; `npm start` runs it
lib/app.js         Express routes and error handling
lib/reference.js   provinces and mock number generation
lib/email.js       validates input, builds the email, adds the locked notice
lib/mailer.js      Gmail SMTP: one connection per request, logging off
lib/photos.js      approved placeholder photo list
lib/stats.js       anonymous daily visit/send counters (Upstash Redis)
lib/visitor.js     city and device labels, and which visits count
public/            the page (index.html, styles.css, app.js, storage.js) and the hidden stats page
                   (stats.html, stats.js, stats-view.js)
test/              node:test suites
```

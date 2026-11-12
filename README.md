# Mock Asylum Reference Generator (learning demo)

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

**Nothing is stored.** Specifically:

- The Gmail address and app password stay in the input boxes on the page. They are read at the moment
  you click *Test connection* or *Send*, sent to the server with that one request over HTTPS, used to log
  in to Gmail, and then dropped. There is no database, no file, no session, no cookie and no
  `localStorage`/`sessionStorage`.
- A new Gmail connection is opened for each request and closed straight after.
- Nodemailer's logging is switched off. The server never logs request bodies. On a mail error it logs
  only the error *code* (e.g. `EAUTH`), and the tester sees a fixed message that never repeats what they typed.
- *Forget my details* empties the fields immediately; reloading the page does the same.
- Like any email, a copy of each sent message appears in the tester's own Gmail **Sent** folder. That is
  Gmail's doing, not this app's.

The code that touches credentials is short and commented: [`lib/mailer.js`](lib/mailer.js) and
[`lib/app.js`](lib/app.js). Tests check that the password is never echoed back or logged.

**Advice for testers:** create an app password just for this demo and delete it afterwards at
<https://myaccount.google.com/apppasswords>. Once it's deleted it stops working, whatever happens.

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
npm test           # 56 tests, no network needed
```

Set `PORT` to use a different port. Set `ACCESS_CODE` to try the access-code screen locally:

```bash
ACCESS_CODE=letmein npm start
```

## Deploy to Vercel

Vercel runs this Express app with no extra configuration: `server.js` default-exports the app, and
files in `public/` are served by Vercel's CDN.

1. Import the repo in the Vercel dashboard, or run `vercel` in this folder.
2. **Set an access code** so only your testers can use it:
   Project → Settings → Environment Variables → `ACCESS_CODE` = something you share with testers.
   Without it, anyone who finds the link can use the app. Testers can type it in any case, and stray
   spaces, quotes or "smart" dashes from copy-pasting are ignored.

   **Easiest for testers:** send them a link with the code in it, so they never see the code box:
   `https://<your-app>.vercel.app/?code=<the code>` (or `#code=<the code>`). Anyone opening the plain
   address without the code still gets stopped. Don't hard-code the code into the page itself: anyone
   can read page source, so that would be the same as having no code at all.
3. Redeploy after adding the variable.

Why not Render's free plan: since September 2025 it blocks the outgoing ports Gmail needs (465/587).
A paid Render instance would work.

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/config` | none | provinces, locked notice, max photos, whether an access code is needed |
| POST | `/api/generate` | `{ province }` | `{ mockNumber, prefix, province }` |
| POST | `/api/verify` | `{ gmail, appPassword }` | `{ ok: true }` |
| POST | `/api/send` | `{ gmail, appPassword, to, subject, message, photoIds }` | `{ ok, accepted, rejected, messageId, sentAt }` |

When `ACCESS_CODE` is set, every call except `/api/config` needs an `x-access-code` header.

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
lib/app.js         Express routes, access code, error handling
lib/reference.js   provinces and mock number generation
lib/email.js       validates input, builds the email, adds the locked notice
lib/mailer.js      Gmail SMTP: one connection per request, logging off
lib/access.js      tester access code check (forgiving about case, spaces, dashes)
lib/photos.js      approved placeholder photo list
public/            the page (index.html, styles.css, app.js)
test/              node:test suites
```

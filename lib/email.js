// Turns what the tester typed into an email Nodemailer can send.
//
// The tester can edit the subject and message freely, but the server always
// appends LOCKED_NOTICE to the end. It is added here, on the server, so it
// cannot be removed from the page.

export const LOCKED_NOTICE =
  'This is a learning demo. The reference number in this email is fake and was not issued by the Department of Home Affairs.';

export const MAX_IMAGES = 4;
export const MAX_SUBJECT_LENGTH = 200;
export const MAX_MESSAGE_LENGTH = 5000;

/** Thrown for anything the tester can fix; the server turns it into a 400. */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Exactly one address: no spaces, commas, semicolons or angle brackets,
// which rules out lists like "a@x.com, b@y.com".
const SINGLE_EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

// Image "seeds" are short words. Lorem Picsum turns the same seed into the
// same photo every time, so the preview matches what the recipient sees.
// Only seeds are accepted (never full URLs), so the app can't be used to
// embed arbitrary images.
const SEED = /^[A-Za-z0-9_-]{1,40}$/;

export function picsumUrl(seed) {
  return `https://picsum.photos/seed/${seed}/600/360`;
}

export function isValidEmailAddress(value) {
  return typeof value === 'string' && value.length <= 254 && SINGLE_EMAIL.test(value);
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Blank lines become paragraphs; single line breaks become <br>. */
function messageToHtml(message) {
  return message
    .split(/\n{2,}/)
    .filter((para) => para.trim() !== '')
    .map((para) => `<p style="margin:0 0 14px">${escapeHtml(para).replaceAll('\n', '<br>')}</p>`)
    .join('\n');
}

function validate({ to, subject, message, imageSeeds }) {
  if (!isValidEmailAddress(to)) {
    throw new ValidationError('Enter one valid recipient email address.');
  }
  if (typeof subject !== 'string' || subject.trim() === '') {
    throw new ValidationError('Enter a subject.');
  }
  if (/[\r\n]/.test(subject)) {
    throw new ValidationError('The subject must be a single line.');
  }
  if (subject.length > MAX_SUBJECT_LENGTH) {
    throw new ValidationError(`The subject can be at most ${MAX_SUBJECT_LENGTH} characters.`);
  }
  if (typeof message !== 'string') {
    throw new ValidationError('The message must be text.');
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`The message can be at most ${MAX_MESSAGE_LENGTH} characters.`);
  }
  if (!Array.isArray(imageSeeds) || imageSeeds.length > MAX_IMAGES) {
    throw new ValidationError(`You can include up to ${MAX_IMAGES} photos.`);
  }
  if (!imageSeeds.every((seed) => typeof seed === 'string' && SEED.test(seed))) {
    throw new ValidationError('One of the photos is not valid. Try shuffling it.');
  }
}

/**
 * Validates the tester's input and returns { to, subject, text, html }.
 * Throws ValidationError if anything is wrong.
 */
export function composeEmail({ to, subject, message = '', imageSeeds = [] }) {
  if (typeof to === 'string') to = to.trim();
  validate({ to, subject, message, imageSeeds });

  const text = [message.trim(), '---', LOCKED_NOTICE].filter(Boolean).join('\n\n');

  const images = imageSeeds
    .map(
      (seed) =>
        `<img src="${picsumUrl(seed)}" alt="Placeholder photo" width="600" ` +
        `style="display:block;max-width:100%;height:auto;border-radius:6px;margin:0 0 12px">`,
    )
    .join('\n');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1f;max-width:600px">
${messageToHtml(message)}
${images}
<div style="margin-top:20px;padding:12px 14px;border-left:4px solid #ff9f0a;background:#fff4e0;color:#7a4b00;font-size:13px">
${escapeHtml(LOCKED_NOTICE)}
</div>
</div>`;

  return { to, subject: subject.trim(), text, html };
}

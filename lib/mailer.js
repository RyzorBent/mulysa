// Sends email through the TESTER'S OWN Gmail account.
//
// PRIVACY PROMISE: none of the tester's details are remembered.
//   - Credentials arrive with a single request, are used for that request, and
//     are then dropped. They are never kept in a variable that outlives the
//     request, never written to a file, database or cookie, and never logged.
//   - A fresh connection to Gmail is opened per request and closed straight after.
//   - Nodemailer's logger/debug output is switched off so the SMTP login is never
//     printed anywhere.
//   - Errors shown to the tester are rewritten into fixed messages, so nothing
//     the tester typed is ever echoed back or written to the logs.

import nodemailer from 'nodemailer';
import { ValidationError, isValidEmailAddress } from './email.js';

/** Pulls { user, pass } out of a request body, or throws ValidationError. */
export function readCredentials(body = {}) {
  const user = typeof body.gmail === 'string' ? body.gmail.trim() : '';
  // Google displays app passwords as "abcd efgh ijkl mnop"; the spaces aren't part of it.
  const pass = typeof body.appPassword === 'string' ? body.appPassword.replace(/\s+/g, '') : '';

  if (!isValidEmailAddress(user)) {
    throw new ValidationError('Enter your Gmail address in step 1.');
  }
  if (pass === '' || pass.length > 100) {
    throw new ValidationError('Enter your Gmail app password in step 1.');
  }
  return { user, pass };
}

export function gmailTransportOptions({ user, pass }) {
  return {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // TLS from the first byte
    auth: { user, pass },
    logger: false,
    debug: false,
    // Keep well inside Vercel's function time limit.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  };
}

/** Checks the login works without sending anything. */
export async function verifyGmail(creds) {
  const transport = nodemailer.createTransport(gmailTransportOptions(creds));
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}

/** Sends one email from the tester's Gmail. Returns what Gmail told us. */
export async function sendWithGmail(creds, email) {
  const transport = nodemailer.createTransport(gmailTransportOptions(creds));
  try {
    const info = await transport.sendMail({
      from: creds.user,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    return {
      accepted: info.accepted.map(String),
      rejected: info.rejected.map(String),
      messageId: info.messageId,
    };
  } finally {
    transport.close();
  }
}

/** Maps a Nodemailer error to a fixed, safe message. Never includes err.message. */
export function friendlyMailError(err) {
  switch (err?.code) {
    case 'EAUTH':
    case 'ENOAUTH':
      return 'Gmail did not accept that login. Check the address, and use a Gmail app password (not your normal password).';
    case 'ETIMEDOUT':
    case 'ECONNECTION':
    case 'ESOCKET':
    case 'EDNS':
    case 'ECONNREFUSED':
      return 'Could not reach Gmail. Please try again in a moment.';
    case 'EENVELOPE':
      return 'Gmail would not accept that recipient address.';
    case 'EMESSAGE':
      return 'Gmail refused the message. Try shortening or changing it.';
    default:
      return 'Sending failed. Please try again.';
  }
}

'use strict';
/**
 * 2911 Jobs — email (v110, Nov 9, 2026).
 *
 * Optional email confirmation for account creation, plus email-first
 * password reset, so SMS is reserved for job alerts. Email is OPTIONAL
 * at signup: phone + SMS verification stays the way in, and an account
 * works fine with phone only. When a member gives an email, we send a
 * confirmation link; a verified email then becomes the password-reset
 * channel, with the existing SMS-code reset as the fallback.
 *
 * Sender: Brevo free plan (smtp-relay.brevo.com, BREVO_SMTP_* env vars).
 * The Brevo account is shared with 2911 Dating; the same SMTP key is
 * reused, no new key is generated for Jobs. From address from MAIL_FROM
 * (default "2911 Jobs <noreply@pieceworkzambia.com>"), base URL from
 * APP_BASE_URL (default https://pieceworkzambia.com).
 *
 * sendMail never throws: a failed or unconfigured send logs and returns
 * { ok: false, reason } so signup and login are never blocked by email.
 * Confirmation tokens are valid 24h, reset tokens 1h, both stored as
 * sha256 hashes (see server.js).
 *
 * Branding: 2911 Jobs navy #0B1F3B, blue #2563EB, emerald #10B981.
 * NO phone numbers appear in any email.
 */
const nodemailer = require('nodemailer');

const APP_URL = (process.env.APP_BASE_URL || 'https://pieceworkzambia.com').replace(/\/$/, '');
const FROM = process.env.MAIL_FROM || '2911 Jobs <noreply@pieceworkzambia.com>';

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  // Stream transport is a test-only capture (local runs). It is never
  // enabled in production, and never sends anything.
  if (process.env.MAIL_TRANSPORT === 'stream' && process.env.NODE_ENV !== 'production') {
    transporter = nodemailer.createTransport({ streamTransport: true, newline: 'unix', buffer: true });
    return transporter;
  }
  if (!process.env.BREVO_SMTP_USER || !process.env.BREVO_SMTP_PASS) return null;
  const port = parseInt(process.env.BREVO_SMTP_PORT || '587', 10);
  transporter = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
    port,
    secure: port === 465,
    auth: { user: process.env.BREVO_SMTP_USER, pass: process.env.BREVO_SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
  return transporter;
}

function getTransports() {
  const t = getTransporter();
  return t ? [t] : [];
}
function isMailConfigured() { return getTransports().length > 0; }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Shared branded wrapper. All colours are inline so the design survives
// email clients that strip <style>. No phone numbers anywhere.
function wrap({ preheader, heading, bodyHtml, buttonText, buttonUrl, plainBody }) {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(heading)}</title></head><body style="margin:0;padding:0;background-color:#EEF2F7;font-family:Arial,Helvetica,sans-serif;color:#0B1F3B;">
<div style="display:none;max-height:0;overflow:hidden;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EEF2F7;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#FFFFFF;border-radius:20px;overflow:hidden;">
<tr><td style="background-color:#0B1F3B;padding:28px 24px 20px;text-align:center;">
<p style="margin:0;color:#FFFFFF;font-size:26px;font-weight:bold;letter-spacing:0.4px;">2911 Jobs</p>
<p style="margin:8px 0 0;color:#93C5FD;font-size:14px;">Find work. Hire help. Earn locally.</p>
</td></tr>
<tr><td style="padding:28px 28px 8px;">
<h1 style="margin:0 0 14px;font-size:22px;color:#0B1F3B;">${esc(heading)}</h1>
${bodyHtml}
${buttonUrl ? `<p style="text-align:center;margin:26px 0 10px;"><a href="${esc(buttonUrl)}" style="display:inline-block;background-color:#2563EB;color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:999px;">${esc(buttonText)}</a></p>
<p style="font-size:13px;color:#5B6B82;line-height:1.6;">If the button does not work, copy and paste this link into your browser:<br><a href="${esc(buttonUrl)}" style="color:#2563EB;word-break:break-all;">${esc(buttonUrl)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:8px 28px 26px;">
<p style="font-size:13px;color:#5B6B82;line-height:1.6;border-top:1px solid #E2E8F0;padding-top:16px;margin:0;">2911 Jobs — Find work. Hire help. Earn locally.<br>
<a href="${APP_URL}" style="color:#2563EB;">pieceworkzambia.com</a> · <a href="${APP_URL}/privacy.html" style="color:#2563EB;">Privacy policy</a></p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = `${heading}\n\n${plainBody}\n${buttonUrl ? `\n${buttonText}: ${buttonUrl}\n` : ''}\n2911 Jobs — Find work. Hire help. Earn locally.\n${APP_URL}`;
  return { html, text };
}

// Try each configured transporter in order until one succeeds.
// Exported for tests: a test can pass a stub transport whose sendMail
// throws as the first entry and a stream transport as the second, and
// assert the send still succeeds.
async function sendMailWithTransports(transports, to, subject, content) {
  let attempted = 0;
  for (const t of transports) {
    attempted += 1;
    try {
      const info = await t.sendMail({ from: FROM, to, subject, html: content.html, text: content.text });
      if (attempted > 1) console.log('sendMail sent via fallback transporter (attempt ' + attempted + ')');
      // In stream (test) mode, return the raw message so tests can inspect it.
      if (info && info.message) return { ok: true, raw: info.message.toString() };
      return { ok: true };
    } catch (e) {
      console.error('sendMail attempt ' + attempted + ' failed:', e && e.message ? e.message : e);
    }
  }
  return { ok: false, reason: attempted > 0 ? 'send_failed' : 'not_configured' };
}

async function sendMail(to, subject, content) {
  return sendMailWithTransports(getTransports(), to, subject, content);
}

async function sendConfirmationEmail(user, token) {
  const url = `${APP_URL}/api/auth/verify-email?token=${token}`;
  const firstName = String(user.name || 'there').split(' ')[0];
  const content = wrap({
    preheader: 'Confirm your email for 2911 Jobs.',
    heading: `Welcome to 2911 Jobs, ${firstName}`,
    bodyHtml: `<p style="font-size:15px;line-height:1.7;margin:0 0 12px;">Thank you for joining 2911 Jobs. Please confirm your email address so we know it is really you.</p>
<p style="font-size:15px;line-height:1.7;margin:0 0 12px;">Your account already works, and confirming keeps it safe. This link works for 24 hours.</p>`,
    buttonText: 'Confirm my email',
    buttonUrl: url,
    plainBody: `Thank you for joining 2911 Jobs. Please confirm your email address so we know it is really you.\n\nYour account already works, and confirming keeps it safe. This link works for 24 hours.`,
  });
  return sendMail(user.email, 'Confirm your email for 2911 Jobs', content);
}

async function sendResetEmail(user, token) {
  const url = `${APP_URL}/api/auth/reset-password?token=${token}`;
  const firstName = String(user.name || 'there').split(' ')[0];
  const content = wrap({
    preheader: 'Reset your 2911 Jobs password.',
    heading: `Reset your password, ${firstName}`,
    bodyHtml: `<p style="font-size:15px;line-height:1.7;margin:0 0 12px;">You asked to reset your 2911 Jobs password. Tap the button below to choose a new one.</p>
<p style="font-size:15px;line-height:1.7;margin:0 0 12px;">This link works for 1 hour and can only be used once. If you did not ask for this, just ignore this email and your password stays the same.</p>`,
    buttonText: 'Reset my password',
    buttonUrl: url,
    plainBody: `You asked to reset your 2911 Jobs password. Use the link below to choose a new one.\n\nThis link works for 1 hour and can only be used once. If you did not ask for this, just ignore this email and your password stays the same.`,
  });
  return sendMail(user.email, 'Reset your 2911 Jobs password', content);
}

module.exports = { isMailConfigured, sendConfirmationEmail, sendResetEmail, sendMailWithTransports, getTransports, APP_URL };

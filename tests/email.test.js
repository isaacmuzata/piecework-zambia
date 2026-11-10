'use strict';
/**
 * 2911 Jobs email tests (v111, Nov 9, 2026).
 *
 * Two parts, run in order:
 *  1. Mailer unit tests: the Brevo mailer in stream-transport mode
 *     (MAIL_TRANSPORT=stream, dummy Brevo vars), so nothing is ever
 *     sent. Checks subjects, links and the not-configured behaviour.
 *  2. Migration test: a database built with the PRE-email schema
 *     (users and pending_registrations without the email columns) is
 *     opened by the current db.js init(). The migration must add the
 *     columns and the partial unique index, keep every existing row,
 *     and be idempotent (a second init() changes nothing).
 *
 * Run: node tests/email.test.js   (exit code 0 = all passed)
 * Also wired into `npm test` after tests/api.test.js.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@libsql/client');

const APP = path.join(__dirname, '..');
const MIG_DB = '/tmp/pwz2-email-mig.db';

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { passed++; console.log('PASS  ' + name); }
  else { failed++; failures.push(name); console.log('FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

function runNode(script, env) {
  return new Promise((resolve) => {
    execFile(process.execPath, ['-e', script], {
      cwd: APP,
      env: { ...process.env, ...env },
      timeout: 60000,
    }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}

// ------------------------------------------------------------------ mailer
async function mailerTests() {
  // Stream transport + dummy Brevo vars: the mailer is configured but
  // captures the message instead of sending it.
  process.env.MAIL_TRANSPORT = 'stream';
  process.env.BREVO_SMTP_USER = 'test@smtp-brevo.com';
  process.env.BREVO_SMTP_PASS = 'test-key';
  delete process.env.NODE_ENV; // stream mode is disabled in production
  const mailer = require('../mailer');

  check('MAILER: mail is configured with Brevo vars + stream transport', mailer.isMailConfigured() === true);

  const conf = await mailer.sendConfirmationEmail({ name: 'Mutinta Phiri', email: 'mutinta@example.com' }, 'tok-confirm-123');
  check('MAILER: confirmation email returns ok with the raw message',
    conf.ok === true && typeof conf.raw === 'string', JSON.stringify(conf).slice(0, 120));
  // Quoted-printable soft-wraps long lines and encodes '=' as '=3D'
  // in the raw MIME; undo both before looking for the link.
  const confRaw = String(conf.raw).replace(/=\r?\n/g, '').replace(/=3D/g, '=');
  check('MAILER: confirmation subject and verify link are in the message',
    confRaw.includes('Confirm your email for 2911 Jobs')
    && confRaw.includes('/api/auth/verify-email?token=tok-confirm-123')
    && confRaw.includes('mutinta@example.com'), 'raw head: ' + String(conf.raw).slice(0, 200));
  check('MAILER: confirmation HTML includes the 2911 Jobs logo (hosted icon, alt text)',
    confRaw.includes('https://pieceworkzambia.com/icon-512.png')
    && confRaw.includes('alt="2911 Jobs"'), 'logo missing from confirmation raw');

  const reset = await mailer.sendResetEmail({ name: 'Mutinta Phiri', email: 'mutinta@example.com' }, 'tok-reset-456');
  check('MAILER: reset email returns ok with the raw message',
    reset.ok === true && typeof reset.raw === 'string', JSON.stringify(reset).slice(0, 120));
  const resetRaw = String(reset.raw).replace(/=\r?\n/g, '').replace(/=3D/g, '=');
  check('MAILER: reset subject and reset link are in the message',
    resetRaw.includes('Reset your 2911 Jobs password')
    && resetRaw.includes('/api/auth/reset-password?token=tok-reset-456'),
    'raw head: ' + String(reset.raw).slice(0, 200));
  check('MAILER: reset HTML includes the 2911 Jobs logo (hosted icon, alt text)',
    resetRaw.includes('https://pieceworkzambia.com/icon-512.png')
    && resetRaw.includes('alt="2911 Jobs"'), 'logo missing from reset raw');

  // Fallback: a failing first transport falls through to the stream one.
  const nodemailer = require('nodemailer');
  const failing = { sendMail: async () => { throw new Error('smtp down'); } };
  const stream = nodemailer.createTransport({ streamTransport: true, newline: 'unix', buffer: true });
  const fb = await mailer.sendMailWithTransports([failing, stream], 'a@b.com', 'Subject', { html: '<p>hi</p>', text: 'hi' });
  check('MAILER: a failing transport falls through to the next one',
    fb.ok === true, JSON.stringify(fb).slice(0, 120));
  const none = await mailer.sendMailWithTransports([], 'a@b.com', 'Subject', { html: '<p>hi</p>', text: 'hi' });
  check('MAILER: no transports means not_configured',
    none.ok === false && none.reason === 'not_configured', JSON.stringify(none));

  // No Brevo vars at all: not configured (separate process, clean env).
  const clean = await runNode(
    `const m = require('/home/hatch/workspace/piecework-zambia-2.0/mailer.js');
     m.sendConfirmationEmail({ name: 'X', email: 'x@y.com' }, 't')
       .then(r => { console.log(JSON.stringify(r)); process.exit(0); });`,
    { MAIL_TRANSPORT: '', BREVO_SMTP_USER: '', BREVO_SMTP_PASS: '', NODE_ENV: '' }
  );
  let cleanResult = null;
  try { cleanResult = JSON.parse(clean.stdout.trim().split('\n').pop()); } catch { /* parse below */ }
  check('MAILER: without Brevo vars the send reports not_configured',
    clean.code === 0 && cleanResult && cleanResult.ok === false && cleanResult.reason === 'not_configured',
    'code ' + clean.code + ' out ' + String(clean.stdout).slice(0, 200) + ' err ' + String(clean.stderr).slice(0, 200));
}

// --------------------------------------------------------------- migration
// The users / pending_registrations tables exactly as they were before
// v110 (no email columns anywhere).
const OLD_USERS_SQL = `CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    phone         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    city          TEXT NOT NULL,
    bio           TEXT DEFAULT '',
    skills        TEXT DEFAULT '',
    rating_avg    REAL DEFAULT 0,
    rating_count  INTEGER DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`;
const OLD_PENDING_SQL = `CREATE TABLE pending_registrations (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    phone          TEXT NOT NULL UNIQUE,
    name           TEXT NOT NULL,
    password_hash  TEXT NOT NULL,
    city           TEXT NOT NULL,
    open_to_work   INTEGER NOT NULL DEFAULT 0,
    ref_code       TEXT DEFAULT '',
    device_id      TEXT DEFAULT '',
    signup_ip      TEXT DEFAULT '',
    ip_duplicate   INTEGER NOT NULL DEFAULT 0,
    avatar         TEXT NOT NULL,
    selfie         TEXT NOT NULL,
    code_hash      TEXT NOT NULL,
    expires_at     TEXT NOT NULL,
    used_at        TEXT,
    attempts       INTEGER NOT NULL DEFAULT 0,
    last_sent_at   TEXT NOT NULL DEFAULT (datetime('now')),
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

async function migrationTests() {
  try { fs.unlinkSync(MIG_DB); } catch { /* fresh db */ }
  const old = createClient({ url: 'file:' + MIG_DB });
  await old.execute(OLD_USERS_SQL);
  await old.execute(OLD_PENDING_SQL);
  await old.execute(`INSERT INTO users (name, phone, password_hash, city) VALUES
    ('Old User One', '+260970000101', 'hash1', 'Lusaka'),
    ('Old User Two', '+260970000102', 'hash2', 'Kitwe')`);
  await old.execute(`INSERT INTO pending_registrations
    (phone, name, password_hash, city, avatar, selfie, code_hash, expires_at)
    VALUES ('+260970000103', 'Old Pending', 'hash3', 'Ndola', '', '', 'codehash', datetime('now', '+30 minutes'))`);
  old.close();

  // Run the CURRENT db.js init() against the old-schema DB, twice: the
  // migration must apply cleanly and be idempotent. TURSO vars are
  // stripped so the local file is used, never production.
  const env = { DB_PATH: MIG_DB, TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: '' };
  const script = `const { init } = require('/home/hatch/workspace/piecework-zambia-2.0/db.js');
    (async () => { await init(); await init(); console.log('INIT-OK'); process.exit(0); })()
    .catch((e) => { console.error(e); process.exit(1); });`;
  const r1 = await runNode(script, env);
  check('MIGRATION: current init() runs cleanly twice against the old-schema DB',
    r1.code === 0 && r1.stdout.includes('INIT-OK'),
    'code ' + r1.code + ' err ' + String(r1.stderr).slice(0, 300));

  const db = createClient({ url: 'file:' + MIG_DB });
  const cols = async (table) => (await db.execute(`PRAGMA table_info(${table})`)).rows.map((c) => c.name);
  const userCols = await cols('users');
  for (const col of ['email', 'email_verified', 'email_verify_token_hash', 'email_verify_expires', 'reset_token_hash', 'reset_token_expires']) {
    check('MIGRATION: users gains column ' + col, userCols.includes(col));
  }
  check('MIGRATION: pending_registrations gains column email', (await cols('pending_registrations')).includes('email'));
  const idx = await db.execute(
    `SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_users_email_unique'`);
  check('MIGRATION: partial unique index on users(email) exists',
    idx.rows.length === 1 && String(idx.rows[0].sql || '').includes('WHERE email IS NOT NULL'),
    JSON.stringify(idx.rows));
  const kept = await db.execute('SELECT COUNT(*) AS n FROM users');
  check('MIGRATION: existing users are kept (2 rows)',
    Number(kept.rows[0].n) === 2, JSON.stringify(kept.rows));
  const keptPending = await db.execute('SELECT COUNT(*) AS n FROM pending_registrations');
  check('MIGRATION: existing pending signups are kept (1 row)',
    Number(keptPending.rows[0].n) === 1, JSON.stringify(keptPending.rows));

  // The index enforces case-insensitive uniqueness (addresses are stored
  // lowercased) while still allowing many members with no email.
  await db.execute("UPDATE users SET email = 'dup@example.com' WHERE phone = '+260970000101'");
  let dupFailed = false;
  try {
    await db.execute("UPDATE users SET email = 'dup@example.com' WHERE phone = '+260970000102'");
  } catch { dupFailed = true; }
  check('MIGRATION: a duplicate email is refused by the unique index', dupFailed === true);
  await db.execute("UPDATE users SET email = NULL WHERE phone = '+260970000102'");
  const nulls = await db.execute('SELECT COUNT(*) AS n FROM users WHERE email IS NULL');
  check('MIGRATION: multiple members with no email are still allowed',
    Number(nulls.rows[0].n) === 1, JSON.stringify(nulls.rows));
  db.close();
}

(async () => {
  await mailerTests();
  await migrationTests();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) console.log('Failures: ' + failures.join(' | '));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

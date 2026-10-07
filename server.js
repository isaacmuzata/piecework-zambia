'use strict';
/**
 * PieceWork Zambia — Express API + static frontend.
 */
require('dotenv').config();
const express = require('express');
const https = require('https');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');

const { client, init } = require('./db');
const { parseLatLng, resolveCoords, haversineKm } = require('./geo');

const PORT = parseInt(process.env.PORT || '3000', 10);
const JWT_SECRET = process.env.JWT_SECRET || '';
const IS_PROD = process.env.NODE_ENV === 'production';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL: set a strong JWT_SECRET (>=32 chars) in .env — see .env.example');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false, // single-origin vanilla app; no external resources to allow
  crossOriginEmbedderPolicy: false,
}));
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true,
}));
const json400kb = express.json({ limit: '400kb' });
const json10mb = express.json({ limit: '10mb' });
// Profile updates may carry an intro video (up to ~6MB); everything else
// stays on the small default limit.
app.use((req, res, next) => {
  if (req.method === 'PATCH' && req.path === '/api/users/me') return json10mb(req, res, next);
  json400kb(req, res, next);
});
app.use(cookieParser());

// ---------------------------------------------------------------- device id
// Anti-fraud: one PieceWork account per browser. A long-lived device cookie
// identifies the browser; registration is refused when the device already
// has an account. The cookie alone can be cleared, so the signup IP is also
// recorded — same-IP signups are allowed but disqualified from giveaways.
app.use((req, res, next) => {
  let d = req.cookies && req.cookies.pw_device;
  if (!d || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d)) {
    d = crypto.randomUUID();
    res.cookie('pw_device', d, {
      httpOnly: true, sameSite: 'lax', secure: IS_PROD,
      maxAge: 2 * 365 * 24 * 3600 * 1000, path: '/',
    });
  }
  req.deviceId = d;
  next();
});

// ---------------------------------------------------------------- constants
const CATEGORIES = [
  'Events Setup', 'Moving Help', 'Cleaning', 'Construction & Labor',
  'Delivery & Errands', 'Cooking & Catering', 'Gardening', 'Painting',
  'Security & Ushering', 'Other',
];
const CITIES = [
  'Lusaka', 'Kitwe', 'Ndola', 'Kabwe', 'Chipata', 'Livingstone',
  'Chingola', 'Luanshya', 'Kasama', 'Solwezi', 'Mongu', 'Choma', 'Other',
];
const PAY_TYPES = ['per_job', 'per_hour', 'per_day', 'per_month'];
const JOB_STATUSES = ['open', 'filled', 'completed', 'cancelled'];
// Admin gate: comma-separated E.164 numbers. Defaults to Zac's official
// poster number so the admin page works without extra Render config;
// override with the ADMIN_PHONES env var any time.
const ADMIN_PHONES = (process.env.ADMIN_PHONES || '+14706538327')
  .split(',').map((s) => s.trim()).filter(Boolean);
function isAdmin(user) { return !!user && ADMIN_PHONES.includes(user.phone); }
// Support staff: can review verification selfies and issue password reset
// codes, but cannot see referrals, giveaways, stats, or NRC documents.
// Add their signup phone numbers via the SUPPORT_PHONES env var.
const SUPPORT_PHONES = (process.env.SUPPORT_PHONES || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
function isSupport(user) { return !!user && SUPPORT_PHONES.includes(user.phone); }
function canModerate(user) { return isAdmin(user) || isSupport(user); }

// ---------------------------------------------------------------- helpers
const err = (res, code, message, fields) =>
  res.status(code).json(fields ? { error: message, fields } : { error: message });

/**
 * Wrap async route handlers/middleware so rejected promises reach Express 4's
 * error middleware instead of becoming unhandled rejections.
 */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Referral codes: 6 chars, no lookalikes (0/O, 1/I/L). */
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateReferralCode() {
  return Array.from(crypto.randomBytes(6), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
}

/** Real client IP behind Render's proxy (trust proxy is set). */
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  const raw = (typeof fwd === 'string' && fwd ? fwd.split(',')[0] : req.ip || '').trim();
  return raw.replace(/^::ffff:/, '');
}

/**
 * Giveaway entries for a round: one entry per referred signup inside the
 * round window. Admin accounts and IP/device-duplicate accounts are
 * excluded from winning, and duplicate signups earn no entries.
 * Returns [{ user_id, name, phone, city, entries }].
 */
async function giveawayEntries(giveawayId) {
  const g = await getOne('SELECT * FROM giveaways WHERE id = ?', [giveawayId]);
  if (!g) return null;
  const rows = await getAll(
    `SELECT u.id AS user_id, u.name, u.phone, u.city, COUNT(r.id) AS entries
     FROM users u
     JOIN users r ON r.referred_by = u.id
     WHERE r.created_at >= ? AND r.created_at < ?
       AND COALESCE(u.ip_duplicate, 0) = 0
       AND COALESCE(r.ip_duplicate, 0) = 0
     GROUP BY u.id
     ORDER BY entries DESC, u.created_at ASC`,
    [g.starts_at, g.ends_at]
  );
  const adminPhones = new Set(ADMIN_PHONES);
  return rows
    .filter((r) => !adminPhones.has(r.phone))
    .map((r) => ({
      user_id: Number(r.user_id), name: r.name, phone: r.phone,
      city: r.city, entries: Number(r.entries),
    }));
}

/** Weighted random pick using crypto randomness. Returns { entry, total }. */
function pickWinner(entries) {
  const total = entries.reduce((s, e) => s + e.entries, 0);
  let roll = crypto.randomInt(total);
  for (const e of entries) {
    roll -= e.entries;
    if (roll < 0) return { entry: e, total };
  }
  return { entry: entries[entries.length - 1], total };
}

/** Counts for the admin panel: disqualified referrers / referrals. */
async function giveawayFraudCounts(giveawayId) {
  const g = await getOne('SELECT * FROM giveaways WHERE id = ?', [giveawayId]);
  if (!g) return { disqualified_referrers: 0, disqualified_referrals: 0 };
  const a = await getOne(
    `SELECT COUNT(DISTINCT u.id) AS c FROM users u
     JOIN users r ON r.referred_by = u.id
     WHERE r.created_at >= ? AND r.created_at < ? AND COALESCE(u.ip_duplicate, 0) = 1`,
    [g.starts_at, g.ends_at]
  );
  const b = await getOne(
    `SELECT COUNT(*) AS c FROM users r
     WHERE r.referred_by IS NOT NULL AND r.created_at >= ? AND r.created_at < ?
       AND COALESCE(r.ip_duplicate, 0) = 1`,
    [g.starts_at, g.ends_at]
  );
  return {
    disqualified_referrers: Number(a.c || 0),
    disqualified_referrals: Number(b.c || 0),
  };
}

/** Run a single-row SELECT; returns the row or undefined. */
async function getOne(sql, args) {
  return (await client.execute({ sql, args: args || [] })).rows[0];
}

/** Run a SELECT returning all rows. */
async function getAll(sql, args) {
  return (await client.execute({ sql, args: args || [] })).rows;
}

/** Run an INSERT/UPDATE/DELETE; returns the raw result set. */
async function runWrite(sql, args) {
  return client.execute({ sql, args: args || [] });
}

/** lastInsertRowid comes back as a BigInt from libsql — normalise to Number. */
function insertId(result) {
  return Number(result.lastInsertRowid);
}

/**
 * Normalise a Zambian phone number to +260XXXXXXXXX.
 * Accepts: 0977123456, +260977123456, 260977123456, with spaces/dashes.
 * Returns the normalised string or null when invalid.
 */
function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  let d = digits;
  if (d.startsWith('260')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  // Zambian mobile numbers are 9 digits starting with 9, 7 or 6.
  if (/^[976]\d{8}$/.test(d)) return '+260' + d;
  // Otherwise accept any plausible international number (E.164: 7-15 digits),
  // so the founder and diaspora users can register with non-Zambian numbers.
  if (/^\d{7,15}$/.test(digits)) return '+' + digits;
  return null;
}

function publicUser(row, includePhone = true) {
  if (!row) return null;
  const u = {
    id: row.id, name: row.name, city: row.city,
    referral_code: row.referral_code || '',
    bio: row.bio || '', skills: row.skills || '', avatar: row.avatar || '',
    open_to_work: !!row.open_to_work, is_admin: isAdmin(row),
    is_support: isSupport(row),
    selfie_status: row.selfie_status || 'pending',
    terms_accepted_at: row.terms_accepted_at || null,
    orientation_accepted_at: row.orientation_accepted_at || null,
    food_license_valid: foodLicenseValid(row),
    food_license_status: row.food_license_status || 'none',
    rating_avg: row.rating_avg || 0, rating_count: row.rating_count || 0,
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    created_at: row.created_at,
  };
  if (includePhone) u.phone = row.phone;
  return u;
}

/**
 * Trust badges for a user row. verified = selfie approved by the team;
 * id = national ID on file; vouched = vouched for by verified members;
 * proven = 3+ completed ratings averaging 4 stars or more;
 * food = valid food handler's license on file.
 */
function foodLicenseValid(row) {
  if (!row || row.food_license_status !== 'approved') return false;
  const exp = String(row.food_license_expires_at || '');
  if (!exp) return true; // approved with no expiry recorded
  return exp >= new Date().toISOString().slice(0, 10);
}
function trustBadges(row, vouchCount) {
  const badges = [];
  if ((row.selfie_status || 'pending') === 'approved') badges.push('verified');
  if (row.nrc_verified) badges.push('id');
  if (Number(vouchCount || 0) >= 1) badges.push('vouched');
  if (Number(row.rating_count || 0) >= 3 && Number(row.rating_avg || 0) >= 4) badges.push('proven');
  if (foodLicenseValid(row)) badges.push('food');
  return badges;
}

/**
 * Validate a client-downscaled JPEG/PNG/WebP data URL.
 * Returns null when valid, otherwise an error message.
 */
function imageDataUrlError(s, maxLen, label) {
  const v = String(s || '');
  if (!v) return `${label} is required.`;
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(v)) return `${label} must be a JPEG, PNG or WebP image.`;
  if (v.length > maxLen) return `${label} is too large. Try a smaller photo.`;
  return null;
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' });
}

function setAuthCookie(res, token) {
  res.cookie('pw_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

/** Auth middleware — reads httpOnly cookie, falls back to Bearer header. */
async function auth(req, res, next) {
  const token = req.cookies?.pw_token ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return err(res, 401, 'Sign in required.');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await getOne('SELECT * FROM users WHERE id = ?', [payload.sub]);
    if (!user) return err(res, 401, 'Account no longer exists.');
    req.user = user;
    next();
  } catch {
    return err(res, 401, 'Session expired. Please sign in again.');
  }
}

/** Optional auth — attaches req.user when a valid token is present, else continues. */
async function maybeAuth(req, res, next) {
  const token = req.cookies?.pw_token ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = (await getOne('SELECT * FROM users WHERE id = ?', [payload.sub])) || null;
    } catch { /* ignore — treat as anonymous */ }
  }
  next();
}

// ---------------------------------------------------------------- rate limits
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 15, standardHeaders: true });
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true });
app.use('/api/', apiLimiter);

// ---------------------------------------------------------------- auth routes
app.post('/api/auth/register', registerLimiter, ah(async (req, res) => {
  const { name, phone, password, city, avatar, selfie } = req.body || {};
  const fields = {};
  if (!name || String(name).trim().length < 2) fields.name = 'Please enter your full name.';
  const normPhone = normalizePhone(phone);
  if (!normPhone) fields.phone = 'Enter a valid phone number, e.g. 0977 123 456.';
  if (!password || String(password).length < 8) fields.password = 'Password must be at least 8 characters.';
  if (!city || !CITIES.includes(city)) fields.city = 'Please choose your city.';
  const avatarErr = imageDataUrlError(avatar, 300000, 'A profile photo');
  if (avatarErr) fields.avatar = avatarErr;
  const selfieErr = imageDataUrlError(selfie, 500000, 'A verification selfie');
  if (selfieErr) fields.selfie = selfieErr;
  if (Object.keys(fields).length) return err(res, 422, 'Please fix the highlighted fields.', fields);

  const exists = await getOne('SELECT id FROM users WHERE phone = ?', [normPhone]);
  if (exists) return err(res, 409, 'This number is already registered. Try signing in.');

  // Anti-fraud: one account per browser/device.
  const deviceId = req.deviceId;
  const devExists = await getOne('SELECT id FROM users WHERE device_id = ?', [deviceId]);
  if (devExists) return err(res, 409, 'This device already has a PieceWork account. Please sign in instead.');

  // Referral: ?ref=CODE captured on the signup page.
  let referredBy = null;
  const refCode = req.body && typeof req.body.ref === 'string' ? req.body.ref.trim().toUpperCase() : '';
  if (refCode) {
    const referrer = await getOne('SELECT id, referral_code FROM users WHERE referral_code = ?', [refCode]);
    if (referrer) referredBy = Number(referrer.id);
  }

  // Same IP as an existing account: allowed to register, but flagged and
  // disqualified from giveaways (mobile networks share IPs, so no hard block).
  const ip = clientIp(req);
  let ipDuplicate = 0;
  if (ip) {
    const ipExists = await getOne('SELECT id FROM users WHERE signup_ip = ? AND signup_ip != ?', [ip, '']);
    if (ipExists) ipDuplicate = 1;
  }

  // Unique referral code for the new account.
  let myCode = generateReferralCode();
  for (let i = 0; i < 5; i++) {
    const clash = await getOne('SELECT id FROM users WHERE referral_code = ?', [myCode]);
    if (!clash) break;
    myCode = generateReferralCode();
  }

  const hash = bcrypt.hashSync(String(password), 12);
  const openToWork = (req.body && req.body.open_to_work) ? 1 : 0;
  const info = await runWrite(
    `INSERT INTO users (name, phone, password_hash, city, open_to_work,
      referral_code, referred_by, device_id, signup_ip, ip_duplicate,
      avatar, selfie, selfie_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [String(name).trim(), normPhone, hash, city, openToWork,
     myCode, referredBy, deviceId, ip || '', ipDuplicate,
     String(avatar), String(selfie)]
  );
  const user = await getOne('SELECT * FROM users WHERE id = ?', [insertId(info)]);
  setAuthCookie(res, signToken(user.id));
  res.status(201).json({ user: publicUser(user) });
}));

app.post('/api/auth/login', loginLimiter, ah(async (req, res) => {
  const { phone, password } = req.body || {};
  const normPhone = normalizePhone(phone);
  if (!normPhone || !password) return err(res, 422, 'Enter your phone number and password.');
  const user = await getOne('SELECT * FROM users WHERE phone = ?', [normPhone]);
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return err(res, 401, 'Wrong number or password.');
  }
  setAuthCookie(res, signToken(user.id));
  res.json({ user: publicUser(user) });
}));

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('pw_token', { path: '/' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- password reset
// Phone-only accounts + no SMS gateway yet, so reset codes are delivered by
// the admin over WhatsApp (same pattern as payment proof). Codes are
// crypto-random, sha256-hashed at rest, single use, 30-minute expiry, and
// locked after 5 wrong attempts. Swap deliverResetCode() for an SMS API
// later without touching the verify path.
const SUPPORT_WHATSAPP = process.env.SUPPORT_WHATSAPP || '+14437417068';
const RESET_CODE_TTL_MIN = 30;
const RESET_MAX_ATTEMPTS = 5;
const forgotLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true });
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true });

// Africa's Talking SMS (optional): set AT_USERNAME + AT_API_KEY (+ AT_SENDER_ID)
// as env vars and reset codes go out by text automatically. Until then the
// admin sends them over WhatsApp from the admin panel.
const AT_USERNAME = process.env.AT_USERNAME || '';
const AT_API_KEY = process.env.AT_API_KEY || '';
const AT_SENDER_ID = process.env.AT_SENDER_ID || '';
const smsEnabled = () => !!(AT_USERNAME && AT_API_KEY);

function sendSms(to, message) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({ username: AT_USERNAME, to, message });
    if (AT_SENDER_ID) body.set('from', AT_SENDER_ID);
    const payload = body.toString();
    const req = https.request({
      hostname: 'api.africastalking.com',
      path: '/version1/messaging',
      method: 'POST',
      headers: {
        apiKey: AT_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error('SMS provider returned HTTP ' + res.statusCode));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('SMS provider timed out')));
    req.write(payload);
    req.end();
  });
}

function newResetCode() {
  return String(crypto.randomInt(100000, 1000000));
}
function hashResetCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}
function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Step 1: user asks for a reset. Only registered numbers get the WhatsApp
// prompt, so the admin only hears from real account holders. (This reveals
// whether a number is registered; accepted trade-off per the founder,
// Oct 5 2026, to stop unregistered users messaging the admin.)
app.post('/api/auth/forgot', forgotLimiter, ah(async (req, res) => {
  const normPhone = normalizePhone(req.body && req.body.phone);
  if (!normPhone) return err(res, 422, 'Enter a valid phone number.');
  const user = await getOne('SELECT id FROM users WHERE phone = ?', [normPhone]);
  if (!user) {
    return res.json({
      ok: true, sms_sent: false, account_found: false,
      message: 'No account found with that number. Check the number and try again, or sign up for a new account.',
      whatsapp: null,
    });
  }
  let smsSent = false;
  // One live code per user: retire older unused ones.
  await runWrite("UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL", [user.id]);
  const code = newResetCode();
  await runWrite(
    `INSERT INTO password_resets (user_id, code_hash, expires_at)
     VALUES (?, ?, datetime('now', ?))`,
    [user.id, hashResetCode(code), `+${RESET_CODE_TTL_MIN} minutes`]
  );
  if (smsEnabled()) {
    try {
      await sendSms(normPhone,
        `Your PieceWork password reset code is ${code}. It expires in ${RESET_CODE_TTL_MIN} minutes. Do not share it with anyone.`);
      smsSent = true;
    } catch (e) {
      console.error('Password-reset SMS failed:', e.message);
      // Fall through to the WhatsApp-assisted flow below.
    }
  }
  res.json({
    ok: true,
    sms_sent: smsSent,
    account_found: true,
    message: smsSent
      ? 'We sent a 6-digit reset code to your phone by SMS. Enter it on the next screen.'
      : 'Request received. Message us on WhatsApp and we will send your reset code.',
    whatsapp: SUPPORT_WHATSAPP,
  });
}));

// Step 2: user redeems the code the admin sent over WhatsApp.
app.post('/api/auth/reset', resetLimiter, ah(async (req, res) => {
  const { phone, code, new_password } = req.body || {};
  const normPhone = normalizePhone(phone);
  if (!normPhone) return err(res, 422, 'Enter a valid phone number.');
  if (!/^\d{6}$/.test(String(code || '').trim())) return err(res, 422, 'Enter the 6-digit code we sent you.');
  if (!new_password || String(new_password).length < 8) {
    return err(res, 422, 'New password must be at least 8 characters.');
  }
  const user = await getOne('SELECT * FROM users WHERE phone = ?', [normPhone]);
  const row = user && await getOne(
    `SELECT * FROM password_resets WHERE user_id = ? AND used_at IS NULL
     ORDER BY id DESC LIMIT 1`,
    [user.id]
  );
  const fail = async (msg, status) => {
    if (row) {
      const attempts = (row.attempts || 0) + 1;
      await runWrite('UPDATE password_resets SET attempts = ? WHERE id = ?', [attempts, row.id]);
      if (attempts >= RESET_MAX_ATTEMPTS) {
        await runWrite("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?", [row.id]);
      }
    }
    return err(res, status || 401, msg);
  };
  if (!row) return fail('That code is not valid. Request a new one.', 401);
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await runWrite("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?", [row.id]);
    return fail('That code has expired. Request a new one.', 401);
  }
  if (!timingSafeEqual(row.code_hash, hashResetCode(String(code).trim()))) {
    return fail('Wrong code. Check the message and try again.', 401);
  }
  await runWrite('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(String(new_password), 12), user.id]);
  await runWrite("UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL", [user.id]);
  setAuthCookie(res, signToken(user.id));
  res.json({ user: publicUser(user) });
}));

// Admin: list reset requests (newest first) with live status.
app.get('/api/admin/resets', ah(auth), ah(async (req, res) => {
  if (!canModerate(req.user)) return err(res, 403, 'Not authorized.');
  const rows = await getAll(
    `SELECT r.id, r.created_at, r.expires_at, r.used_at, r.attempts,
            u.id AS user_id, u.name AS user_name, u.phone AS user_phone
     FROM password_resets r JOIN users u ON u.id = r.user_id
     ORDER BY r.id DESC LIMIT 50`
  );
  res.json({
    resets: rows.map((r) => ({
      id: r.id, user_id: r.user_id, user_name: r.user_name, user_phone: r.user_phone,
      created_at: r.created_at, expires_at: r.expires_at, attempts: r.attempts,
      status: r.used_at ? 'closed'
        : (new Date(r.expires_at).getTime() < Date.now() ? 'expired' : 'pending'),
    })),
  });
}));

// Admin: (re)issue the code for a request and return it ONCE as plaintext so
// it can be pasted into WhatsApp. The stored hash is replaced, so only the
// freshly issued code works.
app.post('/api/admin/resets/:id/issue', ah(auth), ah(async (req, res) => {
  if (!canModerate(req.user)) return err(res, 403, 'Not authorized.');
  const id = parseInt(req.params.id, 10);
  const row = await getOne(
    `SELECT r.*, u.name AS user_name, u.phone AS user_phone
     FROM password_resets r JOIN users u ON u.id = r.user_id WHERE r.id = ?`,
    [id]
  );
  if (!row) return err(res, 404, 'Request not found.');
  const code = newResetCode();
  await runWrite(
    `UPDATE password_resets
     SET code_hash = ?, expires_at = datetime('now', ?), used_at = NULL, attempts = 0
     WHERE id = ?`,
    [hashResetCode(code), `+${RESET_CODE_TTL_MIN} minutes`, id]
  );
  res.json({ code, user_name: row.user_name, user_phone: row.user_phone, expires_minutes: RESET_CODE_TTL_MIN });
}));

// Admin: every job posted, regardless of city or distance. Admin only
// (support staff do not get job oversight).
app.get('/api/admin/jobs', ah(auth), ah(async (req, res) => {
  if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const status = String(req.query.status || 'all');
  if (status !== 'all' && !JOB_STATUSES.includes(status)) return err(res, 422, 'Invalid status filter.');
  const city = req.query.city && CITIES.includes(req.query.city) ? req.query.city : null;
  const q = req.query.q && String(req.query.q).trim() ? String(req.query.q).trim() : null;
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const limit = 25;
  const conds = [];
  const params = [];
  if (status !== 'all') { conds.push('j.status = ?'); params.push(status); }
  if (city) { conds.push('j.city = ?'); params.push(city); }
  if (q) { conds.push('(j.title LIKE ? OR j.description LIKE ?)'); params.push('%' + q + '%', '%' + q + '%'); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const total = (await getOne(`SELECT COUNT(*) AS n FROM jobs j ${where}`, params)).n;
  const jobs = await getAll(`
    SELECT j.id, j.title, j.category, j.city, j.area, j.pay_amount, j.pay_type,
           j.workers_needed, j.status, j.created_at,
           u.name AS poster_name
    FROM jobs j JOIN users u ON u.id = j.poster_id
    ${where} ORDER BY j.id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  res.json({ jobs, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}));

app.get('/api/auth/me', ah(auth), ah(async (req, res) => {
  res.json({ user: publicUser(req.user) });
}));

// ---------------------------------------------------------------- jobs: browse
// Jobs are matched by DISTANCE IN KILOMETRES. The viewer's location comes
// from explicit ?lat=&lng= query params, falling back to the signed-in
// user's saved location (precise coords, else their city centre).
// When the location is known, jobs get `distance_km`, are sorted nearest
// first, and are filtered to the ?max_km= radius (default 50 km; "any"
// disables the radius). Jobs whose location cannot be resolved are sorted
// last and are excluded while a finite radius applies.
// An explicitly chosen ?city= or ?q= search, and ?mine=1 (the signed-in
// poster's own dashboard), skip the default radius so matching jobs are
// never hidden behind it.
app.get('/api/jobs', ah(maybeAuth), ah(async (req, res) => {
  const status = req.query.status || 'open';
  if (!JOB_STATUSES.includes(status)) return err(res, 422, 'Invalid status filter.');
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const limit = 20;

  let viewer = parseLatLng(req.query);
  if (viewer && viewer.error) return err(res, 422, viewer.error, { location: viewer.error });
  if (!viewer && req.user) viewer = resolveCoords(req.user);

  // "My Postings": a signed-in poster sees ALL of their own jobs, regardless
  // of distance. Never hide a poster's own jobs behind the matching radius.
  const mine = String(req.query.mine || '') === '1';
  if (mine && !req.user) return err(res, 401, 'Sign in required.');

  const explicitCity = req.query.city && CITIES.includes(req.query.city);
  const explicitQ = req.query.q && String(req.query.q).trim();

  let maxKm = 50; // default matching radius (km) once the viewer location is known
  const rawMax = req.query.max_km;
  const explicitMax = rawMax !== undefined && rawMax !== null && String(rawMax).trim() !== '';
  if (explicitMax) {
    if (String(rawMax).trim().toLowerCase() === 'any') {
      maxKm = Infinity;
    } else {
      maxKm = parseFloat(rawMax);
      if (!Number.isFinite(maxKm) || maxKm <= 0 || maxKm > 2000) {
        return err(res, 422, 'max_km must be a number between 1 and 2000, or "any".');
      }
    }
  } else if (mine || explicitCity || explicitQ) {
    // An explicitly chosen city, a typed search, or the poster's own dashboard
    // expresses clear intent: never hide matching jobs behind the default radius.
    maxKm = Infinity;
  }

  const conds = ['j.status = ?'];
  const params = [status];
  if (mine) { conds.push('j.poster_id = ?'); params.push(req.user.id); }
  if (explicitCity) { conds.push('j.city = ?'); params.push(req.query.city); }
  if (req.query.category && CATEGORIES.includes(req.query.category)) { conds.push('j.category = ?'); params.push(req.query.category); }
  if (req.query.q && String(req.query.q).trim()) {
    conds.push('(j.title LIKE ? OR j.description LIKE ? OR j.area LIKE ?)');
    const q = `%${String(req.query.q).trim()}%`;
    params.push(q, q, q);
  }
  const where = 'WHERE ' + conds.join(' AND ');

  // Pull a generous candidate set, then match by kilometres in JS so the
  // radius filter and nearest-first ordering stay consistent with pagination.
  const CANDIDATE_CAP = 500;
  const rows = await getAll(`
    SELECT j.*, u.name AS poster_name, u.city AS poster_city,
           u.rating_avg AS poster_rating, u.rating_count AS poster_rating_count,
           u.avatar AS poster_avatar,
           (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status != 'withdrawn') AS applicant_count,
           (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status = 'accepted') AS accepted_count
    FROM jobs j JOIN users u ON u.id = j.poster_id
    ${where} ORDER BY j.created_at DESC LIMIT ?
  `, [...params, CANDIDATE_CAP]);

  let jobs = rows.map((r) => {
    const job = serializeJob(r);
    job.distance_km = null;
    job.lat = null;
    job.lng = null;
    if (viewer) {
      const jc = resolveCoords(r);
      if (jc) {
        job.lat = jc.lat;
        job.lng = jc.lng;
        job.distance_km = Math.round(haversineKm(viewer.lat, viewer.lng, jc.lat, jc.lng) * 10) / 10;
      }
    }
    return job;
  });

  if (mine) {
    // Own dashboard: newest first, no distance games.
    jobs.sort((a, b) => b.created_at.localeCompare(a.created_at));
  } else if (viewer) {
    if (Number.isFinite(maxKm)) {
      jobs = jobs.filter((j) => j.distance_km != null && j.distance_km <= maxKm);
    }
    jobs.sort((a, b) => {
      if (a.distance_km == null && b.distance_km == null) return b.created_at.localeCompare(a.created_at);
      if (a.distance_km == null) return 1;
      if (b.distance_km == null) return -1;
      return (a.distance_km - b.distance_km) || b.created_at.localeCompare(a.created_at);
    });
  }

  const total = jobs.length;
  const totalPages = Math.ceil(total / limit);
  const pageJobs = jobs.slice((page - 1) * limit, page * limit);

  res.json({
    jobs: pageJobs,
    page, total, totalPages, limit,
    ...(mine ? { mine: true } : {}),
    ...(viewer ? {
      viewer_lat: Math.round(viewer.lat * 100000) / 100000,
      viewer_lng: Math.round(viewer.lng * 100000) / 100000,
      max_km: Number.isFinite(maxKm) ? maxKm : 'any',
    } : {}),
  });
}));

function serializeJob(j) {
  return {
    id: j.id, title: j.title, category: j.category, description: j.description,
    city: j.city, area: j.area || '', date_needed: j.date_needed,
    pay_amount: j.pay_amount, pay_type: j.pay_type,
    workers_needed: j.workers_needed, status: j.status,
    created_at: j.created_at,
    requires_food_license: !!j.requires_food_license,
    poster: {
      id: j.poster_id, name: j.poster_name, city: j.poster_city,
      rating_avg: j.poster_rating || 0, rating_count: j.poster_rating_count || 0,
      avatar: j.poster_avatar || '',
    },
    applicant_count: j.applicant_count || 0,
    accepted_count: j.accepted_count || 0,
  };
}

// ---------------------------------------------------------------- jobs: detail
app.get('/api/jobs/:id', ah(maybeAuth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return err(res, 404, 'Job not found.');
  const j = await getOne(`
    SELECT j.*, u.name AS poster_name, u.city AS poster_city,
           u.rating_avg AS poster_rating, u.rating_count AS poster_rating_count,
           u.avatar AS poster_avatar,
           (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status != 'withdrawn') AS applicant_count,
           (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status = 'accepted') AS accepted_count
    FROM jobs j JOIN users u ON u.id = j.poster_id WHERE j.id = ?
  `, [id]);
  if (!j) return err(res, 404, 'Job not found.');
  const job = serializeJob(j);
  // Distance from the viewer (explicit ?lat=&lng=, else the signed-in user's location).
  job.distance_km = null; job.lat = null; job.lng = null;
  let dv = parseLatLng(req.query);
  if (dv && dv.error) dv = null;
  if (!dv && req.user) dv = resolveCoords(req.user);
  if (dv) {
    const jc = resolveCoords(j);
    if (jc) {
      job.lat = jc.lat; job.lng = jc.lng;
      job.distance_km = Math.round(haversineKm(dv.lat, dv.lng, jc.lat, jc.lng) * 10) / 10;
    }
  }
  const isPoster = req.user && req.user.id === j.poster_id;
  job.is_poster = !!isPoster;
  job.my_application = req.user
    ? (await getOne(
        'SELECT id, status, created_at FROM applications WHERE job_id = ? AND worker_id = ?',
        [id, req.user.id]
      )) || null
    : null;
  const dt = await getOne("SELECT status FROM delivery_tracking WHERE job_id = ?", [id]);
  job.delivery_status = dt ? dt.status : 'none';
  if (isPoster) {
    job.applications = await getAll(`
      SELECT a.id, a.message, a.status, a.created_at, a.arrived_at,
             u.id AS worker_id, u.name AS worker_name, u.city AS worker_city,
             u.rating_avg AS worker_rating, u.rating_count AS worker_rating_count,
             u.avatar AS worker_avatar,
             CASE WHEN a.status = 'accepted' THEN u.phone ELSE NULL END AS worker_phone
      FROM applications a JOIN users u ON u.id = a.worker_id
      WHERE a.job_id = ? AND a.status != 'withdrawn'
      ORDER BY a.created_at ASC
    `, [id]);
  }
  res.json({ job });
}));

// ---------------------------------------------------------------- jobs: create
function validateJobInput(body) {
  const f = {};
  const b = body || {};
  if (!b.title || String(b.title).trim().length < 5) f.title = 'Give the job a clear title (5+ characters).';
  if (!CATEGORIES.includes(b.category)) f.category = 'Choose a valid category.';
  if (!b.description || String(b.description).trim().length < 20) f.description = 'Describe the work (20+ characters).';
  if (!CITIES.includes(b.city)) f.city = 'Choose a valid city.';
  if (b.date_needed && !/^\d{4}-\d{2}-\d{2}$/.test(b.date_needed)) f.date_needed = 'Use YYYY-MM-DD.';
  else if (b.date_needed) {
    const d = new Date(b.date_needed + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (isNaN(d.getTime())) f.date_needed = 'Enter a valid date.';
    else if (d < today) f.date_needed = 'The date cannot be in the past.';
  } else f.date_needed = 'When is the work needed?';
  const pay = parseInt(b.pay_amount, 10);
  if (!Number.isInteger(pay) || pay < 1 || pay > 1000000) f.pay_amount = 'Enter the pay in Kwacha (1 – 1,000,000).';
  if (!PAY_TYPES.includes(b.pay_type)) f.pay_type = 'Choose how the pay works.';
  const wn = parseInt(b.workers_needed, 10);
  if (!Number.isInteger(wn) || wn < 1 || wn > 50) f.workers_needed = 'Workers needed: 1 – 50.';
  if (b.whatsapp) {
    const w = normalizePhone(b.whatsapp);
    if (!w) f.whatsapp = 'Enter a valid Zambian WhatsApp number.';
  }
  if (b.lat !== undefined || b.lng !== undefined) {
    const c = parseLatLng(b);
    if (c && c.error) f.location = c.error;
  }
  return f;
}

app.post('/api/jobs', ah(auth), ah(async (req, res) => {
  const fields = validateJobInput(req.body);
  if (Object.keys(fields).length) return err(res, 422, 'Please fix the highlighted fields.', fields);
  const b = req.body;
  // Terms gate: posters must accept the Terms & Conditions (liability waiver)
  // before posting. Recorded once per account; enforced server-side so the
  // form checkbox cannot be bypassed via the API.
  const termsOk = req.user.terms_accepted_at || b.terms_accepted === '1' || b.terms_accepted === true;
  if (!termsOk) {
    return err(res, 422, 'Please read and accept the Terms and Conditions before posting.',
      { terms_accepted: 'You must accept the Terms and Conditions to post a job.' });
  }
  if (!req.user.terms_accepted_at) {
    await runWrite("UPDATE users SET terms_accepted_at = datetime('now') WHERE id = ?", [req.user.id]);
  }
  const whatsapp = b.whatsapp ? normalizePhone(b.whatsapp) : '';
  const coords = parseLatLng(b);
  const requiresFoodLicense = b.requires_food_license === '1' || b.requires_food_license === true || b.requires_food_license === 1 ? 1 : 0;
  const info = await runWrite(`
    INSERT INTO jobs (poster_id, title, category, description, city, area, date_needed,
                      pay_amount, pay_type, workers_needed, whatsapp, lat, lng, requires_food_license)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    req.user.id, String(b.title).trim(), b.category, String(b.description).trim(),
    b.city, String(b.area || '').trim(), b.date_needed,
    parseInt(b.pay_amount, 10), b.pay_type, parseInt(b.workers_needed, 10), whatsapp,
    coords ? coords.lat : null, coords ? coords.lng : null, requiresFoodLicense,
  ]);
  res.status(201).json({ id: insertId(info) });
}));

// ---------------------------------------------------------------- jobs: update
app.patch('/api/jobs/:id', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const job = await getOne('SELECT * FROM jobs WHERE id = ?', [id]);
  if (!job) return err(res, 404, 'Job not found.');
  if (job.poster_id !== req.user.id) return err(res, 403, 'Only the poster can change this job.');

  const b = req.body || {};
  const updates = [];
  const params = [];

  // Status transitions.
  if (b.status && b.status !== job.status) {
    const allowed = { open: ['cancelled', 'completed'], filled: ['completed', 'cancelled'] };
    if (!JOB_STATUSES.includes(b.status) || !(allowed[job.status] || []).includes(b.status)) {
      return err(res, 422, `Cannot move a ${job.status} job to ${b.status}.`);
    }
    updates.push('status = ?'); params.push(b.status);
  }

  // Field edits (allowed while open or filled).
  if (['completed', 'cancelled'].includes(job.status)) {
    return err(res, 422, 'This job is closed and can no longer be edited.');
  }
  const editable = ['title', 'description', 'category', 'city', 'area', 'date_needed', 'pay_amount', 'pay_type', 'workers_needed', 'whatsapp', 'requires_food_license'];
  const merged = { ...job, ...b };
  const fields = validateJobInput(merged);
  // Only surface errors for fields the poster actually tried to change.
  const relevant = Object.keys(fields).filter(k => k in b);
  if (relevant.length) {
    const rf = {}; relevant.forEach(k => rf[k] = fields[k]);
    return err(res, 422, 'Please fix the highlighted fields.', rf);
  }
  for (const k of editable) {
    if (k === 'requires_food_license') continue; // handled below as a real boolean
    if (k in b) {
      let v = b[k];
      if (k === 'pay_amount' || k === 'workers_needed') v = parseInt(v, 10);
      if (k === 'whatsapp') v = v ? normalizePhone(v) : '';
      if (typeof v === 'string') v = v.trim();
      updates.push(`${k} = ?`); params.push(v);
    }
  }
  if ('requires_food_license' in b) {
    const v = b.requires_food_license === '1' || b.requires_food_license === true || b.requires_food_license === 1 ? 1 : 0;
    updates.push('requires_food_license = ?'); params.push(v);
  }
  // Job location: precise GPS coords, or cleared (falls back to the city centre).
  if ('lat' in b || 'lng' in b) {
    const c = parseLatLng(b);
    if (c && c.error) return err(res, 422, c.error, { location: c.error });
    updates.push('lat = ?'); params.push(c ? c.lat : null);
    updates.push('lng = ?'); params.push(c ? c.lng : null);
  }
  if (!updates.length) return err(res, 422, 'Nothing to update.');
  params.push(id);
  await runWrite(`UPDATE jobs SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- applications
app.post('/api/jobs/:id/apply', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const job = await getOne('SELECT * FROM jobs WHERE id = ?', [id]);
  if (!job) return err(res, 404, 'Job not found.');
  if (job.status !== 'open') return err(res, 422, 'This job is no longer open for applications.');
  if (job.poster_id === req.user.id) return err(res, 403, 'You cannot apply to your own job.');
  // Orientation gate: workers must accept the Code of Conduct before applying.
  const me = await getOne('SELECT orientation_accepted_at, food_license_status, food_license_expires_at FROM users WHERE id = ?', [req.user.id]);
  if (!me || !me.orientation_accepted_at) {
    return err(res, 422, 'Please complete the worker orientation before applying.', { orientation: 'required' });
  }
  // Food handler's license gate for hospitality jobs that require it.
  if (job.requires_food_license && !foodLicenseValid(me)) {
    return err(res, 422, 'This job requires a valid food handler\u2019s license. Upload yours under Profile to apply.', { food_license: 'required' });
  }
  const dup = await getOne('SELECT id, status FROM applications WHERE job_id = ? AND worker_id = ?', [id, req.user.id]);
  if (dup && dup.status !== 'withdrawn') return err(res, 409, 'You have already applied to this job.');

  const message = String((req.body || {}).message || '').trim().slice(0, 500);
  if (dup && dup.status === 'withdrawn') {
    await runWrite(
      "UPDATE applications SET status = 'pending', message = ?, created_at = datetime('now') WHERE id = ?",
      [message, dup.id]
    );
    return res.status(201).json({ id: dup.id });
  }
  const info = await runWrite(
    'INSERT INTO applications (job_id, worker_id, message) VALUES (?, ?, ?)',
    [id, req.user.id, message]
  );
  res.status(201).json({ id: insertId(info) });
}));

/** Jobs the signed-in user has applied to. */
app.get('/api/applications/mine', ah(auth), ah(async (req, res) => {
  const rows = await getAll(`
    SELECT a.id, a.status AS app_status, a.message, a.created_at AS applied_at, a.arrived_at,
           j.id AS job_id, j.title, j.city, j.area, j.date_needed, j.pay_amount, j.pay_type,
           j.status AS job_status, j.category,
           u.name AS poster_name,
           CASE WHEN a.status = 'accepted' THEN u.phone ELSE NULL END AS poster_phone
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN users u ON u.id = j.poster_id
    WHERE a.worker_id = ? AND a.status != 'withdrawn'
    ORDER BY a.created_at DESC
  `, [req.user.id]);
  res.json({ applications: rows });
}));

/** Poster-only: list applications for one of their jobs. */
app.get('/api/jobs/:id/applications', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const job = await getOne('SELECT * FROM jobs WHERE id = ?', [id]);
  if (!job) return err(res, 404, 'Job not found.');
  if (job.poster_id !== req.user.id) return err(res, 403, 'Only the poster can view applications.');
  const rows = await getAll(`
    SELECT a.id, a.message, a.status, a.created_at, a.arrived_at,
           u.id AS worker_id, u.name AS worker_name, u.city AS worker_city,
           u.bio AS worker_bio, u.skills AS worker_skills,
           u.rating_avg AS worker_rating, u.rating_count AS worker_rating_count,
           CASE WHEN a.status = 'accepted' THEN u.phone ELSE NULL END AS worker_phone
    FROM applications a JOIN users u ON u.id = a.worker_id
    WHERE a.job_id = ? AND a.status != 'withdrawn'
    ORDER BY a.created_at ASC
  `, [id]);
  res.json({ applications: rows });
}));

async function acceptedCount(jobId) {
  const row = await getOne(
    "SELECT COUNT(*) AS c FROM applications WHERE job_id = ? AND status = 'accepted'",
    [jobId]
  );
  return row.c;
}

/** Poster accepts/declines; worker withdraws their own application. */
app.patch('/api/applications/:id', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const appRow = await getOne('SELECT * FROM applications WHERE id = ?', [id]);
  if (!appRow) return err(res, 404, 'Application not found.');
  const job = await getOne('SELECT * FROM jobs WHERE id = ?', [appRow.job_id]);
  const { status } = req.body || {};
  const isPoster = job.poster_id === req.user.id;
  const isWorker = appRow.worker_id === req.user.id;

  if (isWorker && status === 'withdrawn') {
    if (appRow.status === 'accepted') return err(res, 422, 'You were already accepted — contact the poster directly.');
    await runWrite("UPDATE applications SET status = 'withdrawn' WHERE id = ?", [id]);
    // If the job was filled and this withdrawal drops below the target, reopen it.
    if (job.status === 'filled' && (await acceptedCount(job.id)) < job.workers_needed) {
      await runWrite("UPDATE jobs SET status = 'open' WHERE id = ?", [job.id]);
    }
    return res.json({ ok: true });
  }

  if (!isPoster) return err(res, 403, 'Only the poster can accept or decline.');
  if (!['accepted', 'declined'].includes(status)) return err(res, 422, 'Status must be accepted or declined.');
  if (appRow.status !== 'pending') return err(res, 422, `This application is already ${appRow.status}.`);

  if (status === 'accepted') {
    if (job.status !== 'open') return err(res, 422, 'This job is no longer hiring.');
    if ((await acceptedCount(job.id)) >= job.workers_needed) {
      return err(res, 409, 'You already have enough workers for this job.');
    }
    // One atomic batch: BEGIN/COMMIT across separate requests cannot hold a
    // transaction on Turso remote, so accept the application and fill the job
    // in a single batch instead.
    await client.batch([
      { sql: 'UPDATE applications SET status = ? WHERE id = ?', args: ['accepted', id] },
      { sql: `UPDATE jobs SET status = 'filled' WHERE id = ? AND status = 'open'
              AND (SELECT COUNT(*) FROM applications WHERE job_id = ? AND status = 'accepted') >= workers_needed`,
        args: [job.id, job.id] },
    ], 'write');
  } else {
    await runWrite('UPDATE applications SET status = ? WHERE id = ?', ['declined', id]);
  }
  res.json({ ok: true });
}));

/** Hired worker: "I've arrived" — marks arrival; the job begins. */
app.post('/api/applications/:id/arrive', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const appRow = await getOne('SELECT * FROM applications WHERE id = ?', [id]);
  if (!appRow) return err(res, 404, 'Application not found.');
  if (appRow.worker_id !== req.user.id) return err(res, 403, 'Only the hired worker can mark arrival.');
  if (appRow.status !== 'accepted') return err(res, 422, 'You can mark arrival once the poster accepts you.');
  const job = await getOne('SELECT id, status FROM jobs WHERE id = ?', [appRow.job_id]);
  if (!job || ['completed', 'cancelled'].includes(job.status)) {
    return err(res, 422, 'This job is no longer active.');
  }
  if (!appRow.arrived_at) {
    await runWrite("UPDATE applications SET arrived_at = datetime('now') WHERE id = ?", [id]);
  }
  const updated = await getOne('SELECT arrived_at FROM applications WHERE id = ?', [id]);
  res.json({ ok: true, arrived_at: updated.arrived_at });
}));

// ---------------------------------------------------------------- NRC identity docs
// A hired worker uploads their NRC for the job. Only the hiring poster can
// view it, and it auto-deletes 10 days after upload (see the sweeper below).
const NRC_TTL_DAYS = 10;

app.post('/api/applications/:id/nrc', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const appRow = await getOne('SELECT * FROM applications WHERE id = ?', [id]);
  if (!appRow) return err(res, 404, 'Application not found.');
  if (appRow.worker_id !== req.user.id) return err(res, 403, 'Only the hired worker can upload their NRC.');
  if (appRow.status !== 'accepted') return err(res, 422, 'NRC upload is only needed once you are hired.');
  const job = await getOne('SELECT id, poster_id FROM jobs WHERE id = ?', [appRow.job_id]);
  if (!job) return err(res, 404, 'Job not found.');
  const imgErr = imageDataUrlError(req.body && req.body.image, 800000, 'The NRC photo');
  if (imgErr) return err(res, 422, imgErr);
  // Zambian NRC numbers follow a documented format: 6 digits, district code,
  // nationality digit — e.g. 123456/11/1. Reject anything else at the door.
  const nrcNumber = String((req.body && req.body.nrc_number) || '').trim();
  if (!/^\d{6}\/\d{2}\/\d$/.test(nrcNumber)) {
    return err(res, 422, 'Enter your NRC number in the format 123456/11/1.', { nrc_number: 'Use the format 123456/11/1.' });
  }
  const existing = await getOne('SELECT id FROM nrc_docs WHERE application_id = ?', [id]);
  if (existing) {
    await runWrite(
      `UPDATE nrc_docs SET image = ?, nrc_number = ?, uploaded_at = datetime('now'),
        expires_at = datetime('now', '+${NRC_TTL_DAYS} days') WHERE id = ?`,
      [String(req.body.image), nrcNumber, existing.id]
    );
  } else {
    await runWrite(
      `INSERT INTO nrc_docs (application_id, worker_id, job_id, poster_id, image, nrc_number, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+${NRC_TTL_DAYS} days'))`,
      [id, appRow.worker_id, job.id, job.poster_id, String(req.body.image), nrcNumber]
    );
  }
  // Permanent trust signal: this worker has put a national ID on file,
  // even after the doc itself expires and is deleted.
  await runWrite('UPDATE users SET nrc_verified = 1 WHERE id = ?', [appRow.worker_id]);
  res.json({ ok: true, expires_in_days: NRC_TTL_DAYS });
}));

app.get('/api/applications/:id/nrc', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const doc = await getOne('SELECT * FROM nrc_docs WHERE application_id = ?', [id]);
  if (!doc) return err(res, 404, 'No NRC on file for this hire yet.');
  if (doc.poster_id !== req.user.id && !isAdmin(req.user)) {
    return err(res, 403, 'Only the poster who hired this worker can view the NRC.');
  }
  if (doc.expires_at <= new Date().toISOString().slice(0, 19).replace('T', ' ')) {
    await runWrite('DELETE FROM nrc_docs WHERE id = ?', [doc.id]);
    return err(res, 410, 'This NRC has expired and was deleted.');
  }
  res.json({
    image: doc.image,
    nrc_number: doc.nrc_number || null,
    uploaded_at: doc.uploaded_at,
    expires_at: doc.expires_at,
  });
}));

// ---------------------------------------------------------------- delivery tracking
/** Hired worker: parcel collected — start sharing live location with the poster. */
app.post('/api/jobs/:id/collect', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const job = await getOne('SELECT id, poster_id FROM jobs WHERE id = ?', [id]);
  if (!job) return err(res, 404, 'Job not found.');
  const appRow = await getOne(
    "SELECT id FROM applications WHERE job_id = ? AND worker_id = ? AND status = 'accepted'",
    [id, req.user.id]
  );
  if (!appRow) return err(res, 403, 'Only the hired worker can start delivery tracking.');
  const existing = await getOne('SELECT id FROM delivery_tracking WHERE job_id = ?', [id]);
  if (existing) {
    await runWrite("UPDATE delivery_tracking SET status = 'active', updated_at = datetime('now') WHERE id = ?", [existing.id]);
  } else {
    await runWrite(
      "INSERT INTO delivery_tracking (job_id, worker_id, poster_id, status) VALUES (?, ?, ?, 'active')",
      [id, req.user.id, job.poster_id]
    );
  }
  res.json({ ok: true });
}));

/** Hired worker: share current GPS while the delivery is active. */
app.post('/api/jobs/:id/location', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const c = parseLatLng(req.body || {});
  if (!c || c.error) return err(res, 422, 'Valid coordinates required.');
  const t = await getOne(
    "SELECT id FROM delivery_tracking WHERE job_id = ? AND worker_id = ? AND status = 'active'",
    [id, req.user.id]
  );
  if (!t) return err(res, 422, 'No active delivery for this job.');
  await runWrite("UPDATE delivery_tracking SET lat = ?, lng = ?, updated_at = datetime('now') WHERE id = ?", [c.lat, c.lng, t.id]);
  res.json({ ok: true });
}));

/** Hired worker: mark delivered — stops tracking and clears the coordinates. */
app.post('/api/jobs/:id/delivered', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const t = await getOne(
    "SELECT id FROM delivery_tracking WHERE job_id = ? AND worker_id = ? AND status = 'active'",
    [id, req.user.id]
  );
  if (!t) return err(res, 422, 'No active delivery for this job.');
  await runWrite("UPDATE delivery_tracking SET status = 'delivered', lat = NULL, lng = NULL, updated_at = datetime('now') WHERE id = ?", [t.id]);
  res.json({ ok: true });
}));

/** Poster or hired worker: current delivery tracking state. */
app.get('/api/jobs/:id/track', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const job = await getOne('SELECT id, poster_id FROM jobs WHERE id = ?', [id]);
  if (!job) return err(res, 404, 'Job not found.');
  const t = await getOne('SELECT status, lat, lng, updated_at FROM delivery_tracking WHERE job_id = ?', [id]);
  if (!t) return res.json({ status: 'none' });
  const mine = await getOne('SELECT id FROM applications WHERE job_id = ? AND worker_id = ?', [id, req.user.id]);
  if (job.poster_id !== req.user.id && !mine && !isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  res.json(t);
}));

// Worker-facing: which of my accepted applications still need an NRC upload.
app.get('/api/nrc/pending', ah(auth), ah(async (req, res) => {
  const rows = await getAll(`
    SELECT a.id AS application_id, a.job_id, j.title, j.poster_id
    FROM applications a JOIN jobs j ON j.id = a.job_id
    LEFT JOIN nrc_docs n ON n.application_id = a.id
    WHERE a.worker_id = ? AND a.status = 'accepted' AND n.id IS NULL
    ORDER BY a.created_at DESC
  `, [req.user.id]);
  res.json({ pending: rows });
}));

// Sweeper: permanently delete NRC docs older than the TTL. Runs on boot and
// every 24h — Render disks are ephemeral anyway, this is the privacy guarantee.
async function sweepExpiredNrc() {
  try {
    const r = await runWrite(`DELETE FROM nrc_docs WHERE expires_at <= datetime('now')`);
    if (r && r.changes) console.log(`[nrc-sweeper] deleted ${r.changes} expired NRC doc(s)`);
  } catch (e) { console.error('[nrc-sweeper]', e.message); }
}

// ---------------------------------------------------------------- selfie verification (admin)
app.get('/api/admin/verifications', ah(auth), ah(async (req, res) => {
  if (!canModerate(req.user)) return err(res, 403, 'Not authorized.');
  const [rows, countRow] = await Promise.all([
    getAll(`
    SELECT id, name, phone, city, selfie, selfie_status, created_at
    FROM users WHERE selfie IS NOT NULL AND selfie_status = 'pending'
    ORDER BY created_at ASC LIMIT 100`),
    getOne(`SELECT COUNT(*) AS c FROM users WHERE selfie IS NOT NULL AND selfie_status = 'pending'`),
  ]);
  res.json({ pending: rows, pending_count: Number(countRow.c || 0) });
}));

app.post('/api/admin/verifications/:userId', ah(auth), ah(async (req, res) => {
  if (!canModerate(req.user)) return err(res, 403, 'Not authorized.');
  const userId = parseInt(req.params.userId, 10);
  const { status } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) return err(res, 422, 'Status must be approved or rejected.');
  const user = await getOne('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) return err(res, 404, 'User not found.');
  await runWrite('UPDATE users SET selfie_status = ? WHERE id = ?', [status, userId]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- food handler's license review (admin)
// Hospitality workers upload their council food handler's license; the team
// reviews it (and can phone the issuing council to verify) before approval.
app.get('/api/admin/food-licenses', ah(auth), ah(async (req, res) => {
  if (!canModerate(req.user)) return err(res, 403, 'Not authorized.');
  const rows = await getAll(`
    SELECT id, name, phone, city, food_license_image, food_license_number,
           food_license_expires_at, food_license_status, created_at
    FROM users WHERE food_license_status IN ('pending', 'approved', 'rejected')
    ORDER BY CASE food_license_status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
             food_license_expires_at ASC
    LIMIT 100
  `);
  const pending = await getOne(
    `SELECT COUNT(*) AS c FROM users WHERE food_license_status = 'pending'`);
  res.json({ licenses: rows, pending_count: Number(pending.c || 0) });
}));

app.post('/api/admin/food-licenses/:userId', ah(auth), ah(async (req, res) => {
  if (!canModerate(req.user)) return err(res, 403, 'Not authorized.');
  const userId = parseInt(req.params.userId, 10);
  const { status } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) return err(res, 422, 'Status must be approved or rejected.');
  const user = await getOne('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) return err(res, 404, 'User not found.');
  await runWrite('UPDATE users SET food_license_status = ? WHERE id = ?', [status, userId]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- vouches
// A verified member publicly stands behind someone they personally know.
// Only selfie-approved members can vouch; one vouch per pair; no self-vouch.
app.post('/api/vouches', ah(auth), ah(async (req, res) => {
  const targetId = parseInt((req.body || {}).user_id, 10);
  if (!targetId) return err(res, 422, 'Choose who to vouch for.');
  if (targetId === req.user.id) return err(res, 422, 'You cannot vouch for yourself.');
  const me = await getOne('SELECT selfie_status FROM users WHERE id = ?', [req.user.id]);
  if (!me || me.selfie_status !== 'approved') {
    return err(res, 403, 'Only verified members can vouch for others.');
  }
  const target = await getOne('SELECT id FROM users WHERE id = ?', [targetId]);
  if (!target) return err(res, 404, 'User not found.');
  await runWrite('INSERT OR IGNORE INTO vouches (voucher_id, vouchee_id) VALUES (?, ?)',
    [req.user.id, targetId]);
  res.json({ ok: true });
}));

app.delete('/api/vouches/:userId', ah(auth), ah(async (req, res) => {
  const targetId = parseInt(req.params.userId, 10);
  await runWrite('DELETE FROM vouches WHERE voucher_id = ? AND vouchee_id = ?',
    [req.user.id, targetId]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- users
app.get('/api/workers', ah(async (req, res) => {
  const city = (req.query.city || '').trim();
  const where = city ? 'WHERE open_to_work = 1 AND city = ?' : 'WHERE open_to_work = 1';
  const params = city ? [city] : [];
  const rows = await getAll(
    `SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT 100`, params
  );
  const vcRows = await getAll('SELECT vouchee_id, COUNT(*) AS c FROM vouches GROUP BY vouchee_id');
  const vcMap = Object.fromEntries(vcRows.map(r => [r.vouchee_id, Number(r.c)]));
  res.json({ workers: rows.map(r => {
    const v = vcMap[r.id] || 0;
    return { ...publicUser(r, false), badges: trustBadges(r, v), vouch_count: v, has_intro_video: !!r.intro_video };
  })});
}));

app.get('/api/users/:id', maybeAuth, ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = await getOne('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) return err(res, 404, 'User not found.');
  const isSelf = !!(req.user && req.user.id === id);
  const completed = (await getOne(`
    SELECT COUNT(DISTINCT j.id) AS c FROM jobs j
    LEFT JOIN applications a ON a.job_id = j.id AND a.status = 'accepted'
    WHERE j.status = 'completed' AND (j.poster_id = ? OR a.worker_id = ?)
  `, [id, id])).c;
  const reviews = await getAll(`
    SELECT r.rating, r.comment, r.created_at, u.name AS reviewer_name, j.title AS job_title
    FROM reviews r JOIN users u ON u.id = r.reviewer_id JOIN jobs j ON j.id = r.job_id
    WHERE r.reviewee_id = ? ORDER BY r.created_at DESC LIMIT 10
  `, [id]);
  const vouchCount = Number((await getOne(
    'SELECT COUNT(*) AS c FROM vouches WHERE vouchee_id = ?', [id])).c || 0);
  const vouchedBy = await getAll(`
    SELECT u.name FROM vouches v JOIN users u ON u.id = v.voucher_id
    WHERE v.vouchee_id = ? ORDER BY v.created_at DESC LIMIT 10
  `, [id]);
  let viewerVouched = false;
  if (req.user) {
    viewerVouched = !!(await getOne(
      'SELECT id FROM vouches WHERE voucher_id = ? AND vouchee_id = ?', [req.user.id, id]));
  }
  const u = publicUser(user, isSelf);
  u.badges = trustBadges(user, vouchCount);
  u.vouch_count = vouchCount;
  u.intro_video = user.intro_video || null;
  if (isSelf || (req.user && (isAdmin(req.user) || isSupport(req.user)))) {
    u.food_license = {
      status: user.food_license_status || 'none',
      number: user.food_license_number || null,
      expires_at: user.food_license_expires_at || null,
      image: user.food_license_image || null,
    };
  }
  res.json({
    user: u, completed_jobs: completed, reviews,
    vouched_by: vouchedBy.map(r => r.name), viewer_vouched: viewerVouched,
  });
}));

app.patch('/api/users/me', ah(auth), ah(async (req, res) => {
  const b = req.body || {};
  const fields = {};
  const updates = [];
  const params = [];
  if ('name' in b) {
    if (!b.name || String(b.name).trim().length < 2) fields.name = 'Please enter your full name.';
    else { updates.push('name = ?'); params.push(String(b.name).trim()); }
  }
  if ('city' in b) {
    if (!CITIES.includes(b.city)) fields.city = 'Choose a valid city.';
    else { updates.push('city = ?'); params.push(b.city); }
  }
  if ('bio' in b) { updates.push('bio = ?'); params.push(String(b.bio).slice(0, 500)); }
  if ('skills' in b) { updates.push('skills = ?'); params.push(String(b.skills).slice(0, 300)); }
  if ('open_to_work' in b) { updates.push('open_to_work = ?'); params.push(b.open_to_work ? 1 : 0); }
  if ('avatar' in b) {
    const av = String(b.avatar || '');
    if (av && !/^data:image\/(jpeg|png|webp);base64,/.test(av)) fields.avatar = 'Avatar must be a JPEG, PNG or WebP image.';
    else if (av.length > 300000) fields.avatar = 'That photo is too large. Try a smaller one.';
    else { updates.push('avatar = ?'); params.push(av); }
  }
  if ('intro_video' in b) {
    const v = String(b.intro_video || '');
    if (v && !/^data:video\/(mp4|webm|quicktime|3gpp);base64,/.test(v)) {
      fields.intro_video = 'Intro video must be an MP4, WebM or MOV clip.';
    } else if (v.length > 8000000) {
      fields.intro_video = 'That video is too large. Record a 10-second clip instead.';
    } else { updates.push('intro_video = ?'); params.push(v || null); }
  }
  if ('orientation_accepted' in b) {
    if (b.orientation_accepted === true || b.orientation_accepted === '1' || b.orientation_accepted === 1) {
      updates.push("orientation_accepted_at = datetime('now')");
    }
  }
  if ('food_license_image' in b || 'food_license_number' in b || 'food_license_expires_at' in b) {
    const img = String(b.food_license_image || '');
    const num = String(b.food_license_number || '').trim().slice(0, 60);
    const exp = String(b.food_license_expires_at || '').trim();
    if (img && !/^data:image\/(jpeg|png|webp);base64,/.test(img)) {
      fields.food_license_image = 'License photo must be a JPEG, PNG or WebP image.';
    } else if (img.length > 800000) {
      fields.food_license_image = 'That photo is too large. Try a smaller one.';
    } else if (exp && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) {
      fields.food_license_expires_at = 'Enter the expiry date as YYYY-MM-DD.';
    } else {
      if (img) { updates.push('food_license_image = ?'); params.push(img); }
      updates.push('food_license_number = ?'); params.push(num || null);
      updates.push('food_license_expires_at = ?'); params.push(exp || null);
      // Any (re)submission goes back to the review queue.
      updates.push("food_license_status = 'pending'");
    }
  }
  if ('lat' in b || 'lng' in b) {
    const c = parseLatLng(b);
    if (c && c.error) fields.location = c.error;
    else { updates.push('lat = ?'); params.push(c ? c.lat : null); updates.push('lng = ?'); params.push(c ? c.lng : null); }
  }
  if (Object.keys(fields).length) return err(res, 422, 'Please fix the highlighted fields.', fields);
  if (!updates.length) return err(res, 422, 'Nothing to update.');
  params.push(req.user.id);
  await runWrite(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
  const user = await getOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ user: publicUser(user) });
}));

// ---------------------------------------------------------------- reviews
app.post('/api/reviews', ah(auth), ah(async (req, res) => {
  const { job_id, reviewee_id, rating, comment } = req.body || {};
  const jid = parseInt(job_id, 10);
  const rid = parseInt(reviewee_id, 10);
  const r = parseInt(rating, 10);
  const fields = {};
  if (!jid) fields.job_id = 'Job is required.';
  if (!rid) fields.reviewee_id = 'Who are you reviewing?';
  if (!Number.isInteger(r) || r < 1 || r > 5) fields.rating = 'Rating must be 1–5 stars.';
  if (Object.keys(fields).length) return err(res, 422, 'Please fix the highlighted fields.', fields);

  const job = await getOne('SELECT * FROM jobs WHERE id = ?', [jid]);
  if (!job) return err(res, 404, 'Job not found.');
  if (job.status !== 'completed') return err(res, 422, 'You can only review once the job is completed.');
  if (rid === req.user.id) return err(res, 422, 'You cannot review yourself.');

  const isPoster = job.poster_id === req.user.id;
  const isAcceptedWorker = await getOne(
    "SELECT id FROM applications WHERE job_id = ? AND worker_id = ? AND status = 'accepted'",
    [jid, req.user.id]
  );
  if (!isPoster && !isAcceptedWorker) {
    return err(res, 403, 'Only the poster and accepted workers can leave reviews for this job.');
  }
  // Reviewee must be the other party on the job.
  const revieweeIsPoster = rid === job.poster_id;
  const revieweeIsWorker = await getOne(
    "SELECT id FROM applications WHERE job_id = ? AND worker_id = ? AND status = 'accepted'",
    [jid, rid]
  );
  if (!revieweeIsPoster && !revieweeIsWorker) {
    return err(res, 422, 'You can only review the poster or an accepted worker on this job.');
  }
  const dup = await getOne(
    'SELECT id FROM reviews WHERE job_id = ? AND reviewer_id = ? AND reviewee_id = ?',
    [jid, req.user.id, rid]
  );
  if (dup) return err(res, 409, 'You have already reviewed this person for this job.');

  // One atomic batch (same Turso-remote reason as above): insert the review
  // and recompute the reviewee's aggregate rating from the reviews table.
  await client.batch([
    { sql: 'INSERT INTO reviews (job_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
      args: [jid, req.user.id, rid, r, String(comment || '').slice(0, 500)] },
    { sql: `UPDATE users SET
              rating_avg = (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE reviewee_id = ?),
              rating_count = (SELECT COUNT(*) FROM reviews WHERE reviewee_id = ?)
            WHERE id = ?`,
      args: [rid, rid, rid] },
  ], 'write');
  res.status(201).json({ ok: true });
}));

// ---------------------------------------------------------------- admin stats
// Simple self-serve dashboard for Zac: signups, applications, jobs, messages.
// Locked to ADMIN_PHONES.
app.get('/api/admin/stats', ah(auth), ah(async (req, res) => {
  if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const [
    userCount, signupsByDay, appCount, appsByStatus,
    jobsByStatus, convCount, msgCount, otwCount, selfiePending,
  ] = await Promise.all([
    getOne('SELECT COUNT(*) AS c FROM users'),
    getAll(`SELECT date(created_at) AS d, COUNT(*) AS c FROM users
            WHERE created_at >= date('now', '-13 days') GROUP BY d ORDER BY d`),
    getOne(`SELECT COUNT(*) AS c FROM applications WHERE status != 'withdrawn'`),
    getAll(`SELECT status, COUNT(*) AS c FROM applications GROUP BY status`),
    getAll(`SELECT status, COUNT(*) AS c FROM jobs GROUP BY status`),
    getOne('SELECT COUNT(*) AS c FROM conversations'),
    getOne('SELECT COUNT(*) AS c FROM messages'),
    getOne('SELECT COUNT(*) AS c FROM users WHERE open_to_work = 1'),
    getOne(`SELECT COUNT(*) AS c FROM users WHERE selfie IS NOT NULL AND selfie_status = 'pending'`),
  ]);
  res.json({
    users: Number(userCount.c || 0),
    signups_by_day: signupsByDay.map((r) => ({ day: r.d, count: Number(r.c) })),
    applications: Number(appCount.c || 0),
    applications_by_status: Object.fromEntries(appsByStatus.map((r) => [r.status, Number(r.c)])),
    jobs_by_status: Object.fromEntries(jobsByStatus.map((r) => [r.status, Number(r.c)])),
    conversations: Number(convCount.c || 0),
    messages: Number(msgCount.c || 0),
    open_to_work: Number(otwCount.c || 0),
    selfies_pending: Number(selfiePending.c || 0),
  });
}));

// ---------------------------------------------------------------- referrals & giveaways
// Every account gets a ?ref=CODE invite link. Giveaway rounds run the
// bi-weekly K1,500 raffle; the live draw page is screenshared on Facebook.

// My referral status (auth).
app.get('/api/referral/me', ah(auth), ah(async (req, res) => {
  const me = await getOne('SELECT referral_code FROM users WHERE id = ?', [req.user.id]);
  const code = me && me.referral_code;
  if (!code) return err(res, 500, 'Referral code missing.');
  const count = await getOne('SELECT COUNT(*) AS c FROM users WHERE referred_by = ?', [req.user.id]);
  const g = await getOne(`SELECT id, title, prize_kwacha, ends_at FROM giveaways
                          WHERE status = 'active' ORDER BY ends_at DESC LIMIT 1`);
  res.json({
    code,
    link: `https://pieceworkzambia.com/?ref=${code}`,
    referrals: Number(count.c || 0),
    giveaway: g
      ? { id: Number(g.id), title: g.title, prize_kwacha: Number(g.prize_kwacha), ends_at: g.ends_at }
      : null,
  });
}));

// Current public giveaway (signed-out friendly, for the invite page).
app.get('/api/giveaways/current', ah(async (req, res) => {
  const g = await getOne(`SELECT id, title, prize_kwacha, starts_at, ends_at FROM giveaways
                          WHERE status = 'active' ORDER BY ends_at DESC LIMIT 1`);
  if (!g) return res.json({ giveaway: null });
  const entries = await giveawayEntries(Number(g.id));
  res.json({
    giveaway: {
      id: Number(g.id), title: g.title, prize_kwacha: Number(g.prize_kwacha),
      starts_at: g.starts_at, ends_at: g.ends_at, entrants: entries.length,
    },
  });
}));

function requireAdmin(req, res) {
  if (!isAdmin(req.user)) { err(res, 403, 'Not authorized.'); return false; }
  return true;
}

// Admin referral monitor: signups, leaderboard, recent joins, disqualified.
app.get('/api/admin/referrals/summary', ah(auth), ah(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const [
    total, today, week, withRefs,
    leaderboard, recent, disqualified,
  ] = await Promise.all([
    getOne('SELECT COUNT(*) AS c FROM users'),
    getOne(`SELECT COUNT(*) AS c FROM users WHERE date(created_at) = date('now')`),
    getOne(`SELECT COUNT(*) AS c FROM users WHERE created_at >= date('now', '-7 days')`),
    getOne('SELECT COUNT(*) AS c FROM users WHERE referred_by IS NOT NULL'),
    getAll(
      `SELECT u.name, u.phone, u.city, COUNT(r.id) AS referrals
       FROM users u JOIN users r ON r.referred_by = u.id
       GROUP BY u.id ORDER BY referrals DESC, u.created_at ASC LIMIT 50`
    ),
    getAll(
      `SELECT u.name, u.phone, u.city, u.created_at, u.ip_duplicate, p.name AS referrer_name
       FROM users u LEFT JOIN users p ON p.id = u.referred_by
       ORDER BY u.created_at DESC LIMIT 30`
    ),
    getAll(
      `SELECT name, phone, city, created_at, signup_ip FROM users
       WHERE COALESCE(ip_duplicate, 0) = 1 ORDER BY created_at DESC LIMIT 50`
    ),
  ]);
  res.json({
    total_signups: Number(total.c || 0),
    signups_today: Number(today.c || 0),
    signups_this_week: Number(week.c || 0),
    referred_signups: Number(withRefs.c || 0),
    leaderboard: leaderboard.map((r) => ({
      name: r.name, phone: r.phone, city: r.city, referrals: Number(r.referrals),
    })),
    recent: recent.map((r) => ({
      name: r.name, phone: r.phone, city: r.city, created_at: r.created_at,
      referrer: r.referrer_name || '—', disqualified: !!r.ip_duplicate,
    })),
    disqualified: disqualified.map((r) => ({
      name: r.name, phone: r.phone, city: r.city,
      created_at: r.created_at, signup_ip: r.signup_ip || '—',
    })),
  });
}));

app.get('/api/admin/giveaways', ah(auth), ah(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const rows = await getAll(
    `SELECT g.*, u.name AS winner_name, u.phone AS winner_phone
     FROM giveaways g LEFT JOIN users u ON u.id = g.winner_user_id
     ORDER BY g.created_at DESC`
  );
  const out = [];
  for (const g of rows) {
    const entries = g.status === 'drawn' ? [] : await giveawayEntries(Number(g.id));
    const fraud = await giveawayFraudCounts(Number(g.id));
    out.push({
      id: Number(g.id), title: g.title, prize_kwacha: Number(g.prize_kwacha),
      starts_at: g.starts_at, ends_at: g.ends_at, status: g.status,
      winner: g.winner_user_id ? { name: g.winner_name, phone: g.winner_phone } : null,
      drawn_at: g.drawn_at, entrants: entries.length,
      total_entries: entries.reduce((s, e) => s + e.entries, 0),
      disqualified_referrers: fraud.disqualified_referrers,
      disqualified_referrals: fraud.disqualified_referrals,
    });
  }
  res.json({ giveaways: out });
}));

app.post('/api/admin/giveaways', ah(auth), ah(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { title, prize_kwacha, starts_at, ends_at } = req.body || {};
  if (!title || !String(title).trim()) return err(res, 422, 'Give the round a title.');
  const prize = parseInt(prize_kwacha, 10);
  if (!prize || prize <= 0) return err(res, 422, 'Prize must be a positive Kwacha amount.');
  if (!starts_at || !ends_at || starts_at >= ends_at)
    return err(res, 422, 'Set a valid start and end date.');
  const active = await getOne(`SELECT id FROM giveaways WHERE status = 'active'`);
  if (active) return err(res, 409, 'There is already an active round. Draw it first.');
  const info = await runWrite(
    `INSERT INTO giveaways (title, prize_kwacha, starts_at, ends_at) VALUES (?, ?, ?, ?)`,
    [String(title).trim(), prize, starts_at, ends_at]
  );
  res.status(201).json({ id: Number(insertId(info)) });
}));

app.get('/api/admin/giveaways/:id/entries', ah(auth), ah(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const g = await getOne('SELECT * FROM giveaways WHERE id = ?', [req.params.id]);
  if (!g) return err(res, 404, 'Giveaway not found.');
  const entries = await giveawayEntries(Number(g.id));
  const fraud = await giveawayFraudCounts(Number(g.id));
  res.json({
    giveaway: {
      id: Number(g.id), title: g.title, prize_kwacha: Number(g.prize_kwacha),
      status: g.status, winner_user_id: g.winner_user_id ? Number(g.winner_user_id) : null,
      drawn_at: g.drawn_at,
    },
    entries,
    disqualified: fraud,
  });
}));

// The official draw: weighted random, recorded, idempotent.
app.post('/api/admin/giveaways/:id/draw', ah(auth), ah(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const g = await getOne('SELECT * FROM giveaways WHERE id = ?', [req.params.id]);
  if (!g) return err(res, 404, 'Giveaway not found.');
  if (g.status === 'drawn') {
    const w = await getOne('SELECT name, phone, city FROM users WHERE id = ?', [g.winner_user_id]);
    return res.json({
      already_drawn: true,
      winner: { name: w.name, phone: w.phone, city: w.city },
      drawn_at: g.drawn_at,
    });
  }
  const entries = await giveawayEntries(Number(g.id));
  if (!entries.length) return err(res, 422, 'No eligible entries yet.');
  const { entry, total } = pickWinner(entries);
  const snapshot = JSON.stringify(entries.map((e) => ({ user_id: e.user_id, name: e.name, entries: e.entries })));
  await runWrite(
    `INSERT INTO giveaway_draws (giveaway_id, winner_user_id, total_entries, entries_json, drawn_by)
     VALUES (?, ?, ?, ?, ?)`,
    [g.id, entry.user_id, total, snapshot, req.user.phone]
  );
  await runWrite(
    `UPDATE giveaways SET status = 'drawn', winner_user_id = ?, drawn_at = datetime('now'),
     drawn_by = ? WHERE id = ?`,
    [entry.user_id, req.user.phone, g.id]
  );
  res.json({
    winner: { name: entry.name, phone: entry.phone, city: entry.city },
    entries: entry.entries, total_entries: total,
  });
}));

// ---------------------------------------------------------------- messaging
// Client <-> worker chat, scoped to a job application. Only the poster
// (client) can start a conversation, and only with a worker who applied —
// workers reply once the poster messages first. This keeps unsolicited
// contact out.
const msgLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true });

function convSummary(c, meId) {
  const otherIsPoster = c.poster_id === meId;
  return {
    id: c.id, job_id: c.job_id, job_title: c.job_title,
    other_id: otherIsPoster ? c.worker_id : c.poster_id,
    other_name: otherIsPoster ? c.worker_name : c.poster_name,
    other_avatar: otherIsPoster ? c.worker_avatar : c.poster_avatar,
    other_phone: c.other_phone || null,
    last_body: c.last_body || '', last_at: c.last_at || c.updated_at,
    last_sender: c.last_sender || null,
    unread: Number(c.unread || 0),
    updated_at: c.updated_at,
  };
}

// List my conversations, newest first, with last message + unread count.
app.get('/api/conversations', ah(auth), ah(async (req, res) => {
  const me = req.user.id;
  const rows = await getAll(`
    SELECT c.*, j.title AS job_title,
      p.name AS poster_name, p.avatar AS poster_avatar,
      w.name AS worker_name, w.avatar AS worker_avatar,
      (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
      (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at,
      (SELECT sender_id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_sender,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.read_at IS NULL) AS unread
    FROM conversations c
    JOIN jobs j ON j.id = c.job_id
    JOIN users p ON p.id = c.poster_id
    JOIN users w ON w.id = c.worker_id
    WHERE c.poster_id = ? OR c.worker_id = ?
    ORDER BY c.updated_at DESC
  `, [me, me, me]);
  res.json({ conversations: rows.map((c) => convSummary(c, me)) });
}));

// Total unread messages across all my conversations (for the tab badge).
app.get('/api/messages/unread', ah(auth), ah(async (req, res) => {
  const me = req.user.id;
  const row = await getOne(`
    SELECT COUNT(*) AS c FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE (c.poster_id = ? OR c.worker_id = ?) AND m.sender_id != ? AND m.read_at IS NULL
  `, [me, me, me]);
  res.json({ unread: Number(row.c || 0) });
}));

// Open (find-or-create) a conversation about a job application.
// Only the poster (client) can start a conversation, and only with a worker
// who applied. Once started, both sides can reply.
app.post('/api/conversations', ah(auth), ah(async (req, res) => {
  const me = req.user.id;
  const jid = parseInt(req.body && req.body.job_id, 10);
  const wid = parseInt(req.body && req.body.worker_id, 10);
  if (!jid || !wid) return err(res, 422, 'Job and worker are required.');
  const job = await getOne('SELECT id, poster_id, title FROM jobs WHERE id = ?', [jid]);
  if (!job) return err(res, 404, 'Job not found.');
  // Only the poster can start the conversation (after shortlisting).
  // The worker sees it under Messages once the poster writes.
  if (me !== job.poster_id) return err(res, 403, 'Only the poster can start the conversation.');
  const appRow = await getOne(
    'SELECT id FROM applications WHERE job_id = ? AND worker_id = ? AND status != ?',
    [jid, wid, 'withdrawn']
  );
  if (!appRow) return err(res, 403, 'You can only message about an active application.');
  let conv = await getOne('SELECT id FROM conversations WHERE job_id = ? AND worker_id = ?', [jid, wid]);
  if (!conv) {
    const info = await runWrite(
      'INSERT INTO conversations (job_id, poster_id, worker_id) VALUES (?, ?, ?)',
      [jid, job.poster_id, wid]
    );
    conv = { id: insertId(info) };
  }
  res.status(201).json({ conversation_id: conv.id });
}));

// Read one conversation (marks the other party's messages as read).
app.get('/api/conversations/:id', ah(auth), ah(async (req, res) => {
  const me = req.user.id;
  const cid = parseInt(req.params.id, 10);
  const conv = await getOne(`
    SELECT c.*, j.title AS job_title,
      p.name AS poster_name, p.avatar AS poster_avatar,
      w.name AS worker_name, w.avatar AS worker_avatar,
      CASE WHEN EXISTS (SELECT 1 FROM applications a
                        WHERE a.job_id = c.job_id AND a.worker_id = c.worker_id
                          AND a.status = 'accepted')
           THEN CASE WHEN c.poster_id = ? THEN w.phone ELSE p.phone END
           ELSE NULL END AS other_phone
    FROM conversations c
    JOIN jobs j ON j.id = c.job_id
    JOIN users p ON p.id = c.poster_id
    JOIN users w ON w.id = c.worker_id
    WHERE c.id = ?
  `, [me, cid]);
  if (!conv) return err(res, 404, 'Conversation not found.');
  if (conv.poster_id !== me && conv.worker_id !== me) return err(res, 403, 'Not your conversation.');
  const messages = await getAll(
    'SELECT id, sender_id, body, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 300',
    [cid]
  );
  await runWrite(
    'UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL',
    [cid, me]
  );
  res.json({ conversation: convSummary(conv, me), messages });
}));

// Send a message in a conversation.
app.post('/api/conversations/:id/messages', ah(auth), msgLimiter, ah(async (req, res) => {
  const me = req.user.id;
  const cid = parseInt(req.params.id, 10);
  const body = String((req.body && req.body.body) || '').trim();
  if (!body) return err(res, 422, 'Message cannot be empty.');
  if (body.length > 1000) return err(res, 422, 'Keep messages under 1000 characters.');
  const conv = await getOne('SELECT id, poster_id, worker_id FROM conversations WHERE id = ?', [cid]);
  if (!conv) return err(res, 404, 'Conversation not found.');
  if (conv.poster_id !== me && conv.worker_id !== me) return err(res, 403, 'Not your conversation.');
  const info = await runWrite(
    'INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)',
    [cid, me, body]
  );
  await runWrite('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [cid]);
  const msg = await getOne('SELECT id, sender_id, body, created_at FROM messages WHERE id = ?', [insertId(info)]);
  res.status(201).json({ message: msg });
}));

// ---------------------------------------------------------------- frontend
// The service worker script itself must never be HTTP-cached: browsers check
// for SW updates against the HTTP cache, so a cached sw.js would delay every
// future frontend deploy by up to maxAge for returning visitors.
app.get('/sw.js', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});
// The app shell (HTML/JS/CSS) is managed by the service worker's
// stale-while-revalidate cache, so it must revalidate on every load too:
// otherwise returning visitors (and the SW's own background revalidation)
// keep serving the previous deploy's bundle for up to maxAge.
for (const shellFile of ['/app.js', '/styles.css']) {
  app.get(shellFile, (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', shellFile));
  });
}
app.get(['/', '/index.html'], (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: IS_PROD ? '1h' : 0 }));
// Digital Asset Links for the Android app (TWA verification). Must be served
// at exactly /.well-known/assetlinks.json (express.static ignores dotfiles).
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('application/json');
  res.sendFile(path.join(__dirname, 'public', '.well-known', 'assetlinks.json'));
});
// SPA fallback: anything that isn't /api serves index.html.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Consistent JSON 404 for unknown API routes.
app.use('/api/', (req, res) => err(res, 404, 'Unknown API endpoint.'));

// eslint-disable-next-line no-unused-vars
app.use((e, req, res, next) => {
  if (e && (e.type === 'entity.parse.failed' || e instanceof SyntaxError)) {
    return err(res, 400, 'Request body is not valid JSON.');
  }
  console.error('Unhandled error:', e);
  err(res, 500, 'Something went wrong. Please try again.');
});

// Initialise the schema (idempotent) before accepting traffic.
init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`PieceWork Zambia running on http://localhost:${PORT}`);
    });
    // NRC privacy sweeper: purge expired identity docs on boot and daily.
    sweepExpiredNrc();
    setInterval(sweepExpiredNrc, 24 * 60 * 60 * 1000);
  })
  .catch((e) => {
    console.error('FATAL: database init failed:', e && e.message ? e.message : e);
    process.exit(1);
  });

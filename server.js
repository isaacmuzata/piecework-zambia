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
const compression = require('compression');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const webpush = require('web-push');

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
app.use(compression()); // gzip text payloads: cuts bandwidth on HTML/JS/CSS/JSON
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
// Photo-carrying routes (registration selfie, job/product photos, business
// logo, cover and documents, NRC uploads) and profile updates with an intro
// video legitimately exceed the small default limit: a single phone photo
// downscaled by the app still runs 200-500 KB as base64. Everything else
// stays on the small default limit. (Oct 23, 2026: the 400 KB cap was
// rejecting real marketplace and job photos with a 413 before validation.)
const BIG_JSON_PREFIXES = [
  ['POST', '/api/auth/register'],
  ['POST', '/api/jobs'], ['PATCH', '/api/jobs'],
  ['POST', '/api/products'], ['PATCH', '/api/products'],
  ['POST', '/api/businesses'], ['PATCH', '/api/businesses'],
  ['POST', '/api/applications'], ['PATCH', '/api/applications'],
];
app.use((req, res, next) => {
  if (req.method === 'PATCH' && req.path === '/api/users/me') return json10mb(req, res, next);
  if (BIG_JSON_PREFIXES.some(([m, p]) => req.method === m && req.path.startsWith(p))) return json10mb(req, res, next);
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
// 2.0 M0: job categories live in the database so admins can manage them
// without a code deploy. The seed is the UNION of the old server list
// above and the old frontend list: the two had drifted apart, which
// silently made 8 frontend categories (Carpentry, Plumbing, Electrical,
// Bricklaying, Welding, Waiter, Bartender, Mixologist) impossible to
// post because the server rejected them. The in-memory set is the
// validation source; the table is the admin-facing source of truth.
const CATEGORY_SEED = [
  'Events Setup', 'Moving Help', 'Cleaning', 'Construction & Labor',
  'Carpentry', 'Plumbing', 'Electrical', 'Bricklaying', 'Welding',
  'Delivery & Errands', 'Cooking & Catering', 'Gardening', 'Painting',
  'Security & Ushering', 'Waiter', 'Bartender', 'Mixologist', 'Other',
];
let categorySet = new Set(CATEGORY_SEED);
async function refreshCategories() {
  try {
    const rows = await getAll("SELECT name FROM categories WHERE kind = 'job' AND active = 1");
    if (rows.length) categorySet = new Set(rows.map((r) => r.name));
  } catch { /* keep the current set */ }
}
const MARKET_CATEGORY_SEED = [
  'Vehicles & Parts', 'Electronics', 'Phones & Tablets', 'Computers & IT',
  'Home & Furniture', 'Appliances', 'Fashion & Clothing', 'Beauty & Health',
  'Building & Hardware', 'Agriculture & Livestock', 'Food & Produce',
  'Baby & Kids', 'Sports & Leisure', 'Books & Education', 'Property & Rentals',
  'Other',
];
let marketCategorySet = new Set(MARKET_CATEGORY_SEED);
async function refreshMarketCategories() {
  try {
    const rows = await getAll("SELECT name FROM categories WHERE kind = 'market' AND active = 1");
    if (rows.length) marketCategorySet = new Set(rows.map((r) => r.name));
  } catch { /* keep the current set */ }
}
async function seedCategories() {
  for (let i = 0; i < CATEGORY_SEED.length; i++) {
    await runWrite("INSERT OR IGNORE INTO categories (name, kind, sort) VALUES (?, 'job', ?)", [CATEGORY_SEED[i], i]);
  }
  for (let i = 0; i < MARKET_CATEGORY_SEED.length; i++) {
    await runWrite("INSERT OR IGNORE INTO categories (name, kind, sort) VALUES (?, 'market', ?)", [MARKET_CATEGORY_SEED[i], i]);
  }
  await refreshCategories();
  await refreshMarketCategories();
}
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

/** 2.0 M0: record a sensitive admin action. Never breaks the request. */
function logAdmin(req, action, targetType, targetId, detail) {
  runWrite(
    'INSERT INTO admin_audit (admin_id, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?)',
    [req.user ? req.user.id : 0, action, targetType || '', targetId || null, String(detail || '').slice(0, 300)]
  ).catch(() => { /* audit must never break admin work */ });
}

/** 2.0 M0: true when a block exists between two users in either direction. */
async function blockExists(a, b) {
  const row = await getOne(
    'SELECT 1 AS x FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
    [a, b, b, a]
  );
  return !!row;
}
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

/** Last-seen touches, throttled in memory so the admin activity board can
 * show when each user last opened the app without a DB write per request. */
const lastSeenTouch = new Map();
function touchLastSeen(userId) {
  const now = Date.now();
  if (now - (lastSeenTouch.get(userId) || 0) < 5 * 60 * 1000) return;
  lastSeenTouch.set(userId, now);
  runWrite("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?", [userId])
    .catch(() => { /* activity tracking must never break a request */ });
  // One row per user per day (Zambia time, UTC+2) feeds the tester tracker.
  runWrite("INSERT OR IGNORE INTO activity_days (user_id, day) VALUES (?, date('now', '+2 hours'))", [userId])
    .catch(() => { /* same: never break a request */ });
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
    if (user.suspended_at && !isAdmin(user)) {
      return err(res, 403, 'This account has been suspended. Contact PieceWork support if you believe this is a mistake.');
    }
    req.user = user;
    touchLastSeen(user.id);
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
      if (req.user) touchLastSeen(req.user.id);
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
  // Registration confirmation text (fire-and-forget; logged either way).
  notifySms(user.id, 'welcome', composeSms(
    (n) => `Hi, this is Zac, your assistant. Welcome to PieceWork Zambia, ${n}. Your account is ready: pieceworkzambia.com`,
    user.name, ''), user.phone).catch(() => {});
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
  if (user.suspended_at && !isAdmin(user)) {
    return err(res, 403, 'This account has been suspended. Contact PieceWork support if you believe this is a mistake.');
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

// ---------------------------------------------------------------- SMS notifications
// Event notifications (offer made, application made, application accepted)
// go out over the same Africa's Talking transport as reset codes. Every
// attempt is written to sms_log: 'skipped' when no gateway creds are set,
// 'sent' or 'failed' (with the provider error) when they are. notifySms
// must never break a request: it swallows all errors and callers fire it
// without awaiting.
async function notifySms(userId, kind, message) {
  try {
    const user = await getOne('SELECT id, phone FROM users WHERE id = ?', [userId]);
    if (!user || !user.phone) return;
    if (!smsEnabled()) {
      await runWrite(
        'INSERT INTO sms_log (user_id, phone, kind, body, status) VALUES (?, ?, ?, ?, ?)',
        [userId, user.phone, kind, message, 'skipped']
      );
      return;
    }
    try {
      await sendSms(user.phone, message);
      await runWrite(
        'INSERT INTO sms_log (user_id, phone, kind, body, status) VALUES (?, ?, ?, ?, ?)',
        [userId, user.phone, kind, message, 'sent']
      );
    } catch (e) {
      await runWrite(
        'INSERT INTO sms_log (user_id, phone, kind, body, status, error) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, user.phone, kind, message, 'failed', String((e && e.message) || e).slice(0, 300)]
      );
    }
  } catch (e) {
    console.error('notifySms failed:', e && e.message);
  }
}

// Build a message that fits a single SMS segment (160 chars) by shrinking
// the interpolated name first, then the title, only as much as needed.
function composeSms(build, name, title) {
  let n = String(name || '').trim();
  let t = String(title || '').trim();
  let msg = build(n, t);
  while (msg.length > 160 && t.length) { t = t.slice(0, -1).trimEnd(); msg = build(n, t); }
  while (msg.length > 160 && n.length) { n = n.slice(0, -1).trimEnd(); msg = build(n, t); }
  return msg.slice(0, 160);
}

// ---------------------------------------------------------------- Web Push
// Browser push notifications (2026-10-23): the same events that send an
// SMS also push to the user's subscribed browsers. Optional: set
// VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (+ optional VAPID_SUBJECT) as env
// vars to enable. Until then subscribe/test answer honestly as disabled
// and notifyPush is a no-op. VAPID keys are generated once by the server
// owner (web-push generate-vapid-keys) and never ship in the repo.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@2911itservices.com';
const pushEnabled = () => !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
let vapidConfigured = false;
function ensureVapid() {
  if (!pushEnabled()) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  }
  return true;
}

/**
 * Deliver one payload to every subscription a user has. Prunes endpoints
 * the push service reports gone (404/410) and stamps last_seen_at on
 * success. Returns { sent, failed }; never throws.
 */
async function deliverPush(userId, payload) {
  const counts = { sent: 0, failed: 0 };
  try {
    if (!ensureVapid()) return counts;
    const subs = await getAll('SELECT * FROM push_subscriptions WHERE user_id = ?', [userId]);
    const data = JSON.stringify({
      title: payload.title || 'PieceWork Zambia',
      body: payload.body || '',
      url: payload.url || '#/',
      tag: payload.tag || 'piecework',
    });
    await Promise.all(subs.map(async (sub) => {
      const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
      try {
        // A stalled push service must not pin the sender (sendSms uses
        // the same idea: a 15s timeout on the Africa's Talking request).
        await webpush.sendNotification(subscription, data, { timeout: 10000 });
        counts.sent++;
        await runWrite("UPDATE push_subscriptions SET last_seen_at = datetime('now') WHERE id = ?", [sub.id]).catch(() => {});
      } catch (e) {
        const code = e && (e.statusCode || e.status);
        if (code === 404 || code === 410) {
          await runWrite('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]).catch(() => {});
        } else {
          counts.failed++;
          console.error('notifyPush failed:', e && e.message);
        }
      }
    }));
  } catch (e) {
    console.error('notifyPush failed:', e && e.message);
  }
  return counts;
}

/**
 * Fire-and-forget event push, the twin of notifySms: no-op when push is
 * not configured, never breaks a request, callers do not await it.
 */
async function notifyPush(userId, payload) {
  try {
    if (!pushEnabled() || !userId) return;
    await deliverPush(userId, payload || {});
  } catch (e) {
    console.error('notifyPush failed:', e && e.message);
  }
}

app.get('/api/push/public-key', (req, res) => {
  res.json({ publicKey: pushEnabled() ? VAPID_PUBLIC_KEY : null });
});

app.post('/api/push/subscribe', ah(auth), ah(async (req, res) => {
  const sub = (req.body && req.body.subscription) || {};
  const endpoint = typeof sub.endpoint === 'string' ? sub.endpoint.trim() : '';
  const keys = sub.keys || {};
  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh.trim() : '';
  const authKey = typeof keys.auth === 'string' ? keys.auth.trim() : '';
  let endpointOk = false;
  try { endpointOk = new URL(endpoint).protocol === 'https:'; } catch { endpointOk = false; }
  if (!endpointOk || endpoint.length > 2000 || !p256dh || p256dh.length > 512 || !authKey || authKey.length > 512) {
    return err(res, 422, 'Invalid push subscription.');
  }
  const userAgent = String((req.body && req.body.userAgent) || req.headers['user-agent'] || '').slice(0, 300);
  // An endpoint belongs to the latest user who subscribed it (shared
  // devices): upsert by endpoint and hand the row to this account.
  await runWrite(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id, p256dh = excluded.p256dh,
       auth = excluded.auth, user_agent = excluded.user_agent,
       last_seen_at = datetime('now')`,
    [req.user.id, endpoint, p256dh, authKey, userAgent]
  );
  res.json({ ok: true });
}));

app.post('/api/push/unsubscribe', ah(auth), ah(async (req, res) => {
  const endpoint = req.body && typeof req.body.endpoint === 'string' ? req.body.endpoint.trim() : '';
  if (!endpoint) return err(res, 422, 'Invalid push subscription.');
  // Only the caller's own rows: nobody can delete someone else's device.
  await runWrite('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [req.user.id, endpoint]);
  res.json({ ok: true });
}));

app.post('/api/push/test', ah(auth), ah(async (req, res) => {
  if (!pushEnabled()) return res.json({ sent: 0, failed: 0, skipped: true });
  const counts = await deliverPush(req.user.id, {
    title: 'PieceWork Zambia',
    body: 'Test notification: push is working on this device.',
    url: '#/profile',
    tag: 'push-test',
  });
  res.json({ sent: counts.sent, failed: counts.failed, skipped: false });
}));

// ---------------------------------------------------------------- ads banner
// Owners promote a product, job or storefront into the rotating banner on
// Home and Marketplace. FREE during the growth phase (until ADS_FREE_UNTIL);
// every ad still records is_paid/amount so paid placements switch on later
// with no schema change. Real accounts only: tester accounts (is_tester)
// are excluded on the server, in the feed query and at creation, so a
// tester can never appear in the banner even if flagged after creating.
const ADS_FREE_UNTIL = process.env.ADS_FREE_UNTIL || '2027-01-23T00:00:00Z';
const AD_KINDS = ['product', 'job', 'business'];
const AD_PAY_LABEL = { per_job: 'per job', per_hour: 'per hour', per_day: 'per day', per_month: 'per month' };
function adsAreFree() { return Date.now() < Date.parse(ADS_FREE_UNTIL); }
function adStamp(d) { return d.toISOString().slice(0, 19).replace('T', ' '); }

function serializeAd(a) {
  return {
    id: a.id, owner_id: a.owner_id, kind: a.kind, ref_id: a.ref_id,
    status: a.status, is_paid: !!a.is_paid, amount: Number(a.amount || 0),
    starts_at: a.starts_at, ends_at: a.ends_at, created_at: a.created_at,
  };
}

// One joined read for the feed, /mine and detail checks: the ad row plus
// the live entity fields its slide is derived from, so titles, prices and
// photos are always current rather than copied at creation time.
const AD_SELECT = `
  SELECT a.*, u.is_tester AS owner_is_tester,
    p.title AS p_title, p.price AS p_price, p.city AS p_city, p.status AS p_status,
    (SELECT ph.id FROM product_photos ph WHERE ph.product_id = p.id ORDER BY ph.sort, ph.id LIMIT 1) AS p_photo_id,
    j.title AS j_title, j.pay_amount AS j_pay, j.pay_type AS j_pay_type, j.city AS j_city,
    j.status AS j_status, j.is_draft AS j_is_draft,
    (SELECT ph.id FROM job_photos ph WHERE ph.job_id = j.id ORDER BY ph.sort, ph.id LIMIT 1) AS j_photo_id,
    b.name AS b_name, b.tagline AS b_tagline, b.category AS b_category, b.city AS b_city,
    b.status AS b_status, b.slug AS b_slug, b.cover AS b_cover, b.logo AS b_logo
  FROM ads a JOIN users u ON u.id = a.owner_id
  LEFT JOIN products p ON a.kind = 'product' AND p.id = a.ref_id
  LEFT JOIN jobs j ON a.kind = 'job' AND j.id = a.ref_id
  LEFT JOIN businesses b ON a.kind = 'business' AND b.id = a.ref_id`;

/** Is the referenced entity still public (so the slide may be shown)? */
function adEntityPublic(r) {
  if (r.kind === 'product') return r.p_status === 'active';
  if (r.kind === 'job') return r.j_status === 'open' && !r.j_is_draft;
  if (r.kind === 'business') return r.b_status === 'active';
  return false;
}

/** Slide payload for one joined ad row, or null when the entity is gone. */
function adSlide(r) {
  if (r.kind === 'product') {
    if (r.p_title == null) return null;
    return {
      kind: 'product', ref_id: r.ref_id,
      title: r.p_title,
      subtitle: `K${Number(r.p_price || 0).toLocaleString('en-US')} · ${r.p_city || ''}`,
      image_url: r.p_photo_id ? `/api/products/${r.ref_id}/photos/${r.p_photo_id}` : null,
      url: `#/product/${r.ref_id}`,
    };
  }
  if (r.kind === 'job') {
    if (r.j_title == null) return null;
    return {
      kind: 'job', ref_id: r.ref_id,
      title: r.j_title,
      subtitle: `K${Number(r.j_pay || 0).toLocaleString('en-US')} ${AD_PAY_LABEL[r.j_pay_type] || ''} · ${r.j_city || ''}`,
      image_url: r.j_photo_id ? `/api/jobs/${r.ref_id}/photos/${r.j_photo_id}` : null,
      url: `#/job/${r.ref_id}`,
    };
  }
  if (r.kind === 'business') {
    if (r.b_name == null) return null;
    return {
      kind: 'business', ref_id: r.ref_id,
      title: r.b_name,
      subtitle: r.b_tagline || `${r.b_category || ''} · ${r.b_city || ''}`,
      image_url: r.b_cover ? `/api/businesses/${r.ref_id}/image/cover`
        : (r.b_logo ? `/api/businesses/${r.ref_id}/image/logo` : null),
      url: `#/business/${r.b_slug}`,
    };
  }
  return null;
}

/** The live ad (if any) for an entity, for the owner-facing detail views. */
async function activeAdFor(kind, refId) {
  const row = await getOne(
    `SELECT id, ends_at FROM ads
     WHERE kind = ? AND ref_id = ? AND status = 'active' AND ends_at > datetime('now')
     ORDER BY id DESC LIMIT 1`, [kind, refId]);
  return row ? { id: row.id, ends_at: row.ends_at } : null;
}

app.get('/api/ads', ah(async (req, res) => {
  const rows = await getAll(
    `${AD_SELECT}
     WHERE a.status = 'active' AND a.starts_at <= datetime('now') AND a.ends_at > datetime('now')
       AND COALESCE(u.is_tester, 0) = 0
     ORDER BY a.created_at DESC, a.id DESC LIMIT 25`, []);
  const ads = [];
  for (const r of rows) {
    if (!adEntityPublic(r)) continue;
    const slide = adSlide(r);
    if (slide) ads.push(slide);
    if (ads.length >= 10) break;
  }
  res.json({ ads });
}));

app.get('/api/ads/mine', ah(auth), ah(async (req, res) => {
  const rows = await getAll(
    `${AD_SELECT} WHERE a.owner_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 50`, [req.user.id]);
  const ads = rows.map((r) => {
    const slide = adSlide(r);
    return { ...serializeAd(r), ...(slide || { title: '', subtitle: '', image_url: null, url: '' }) };
  });
  res.json({ ads });
}));

app.post('/api/ads', ah(auth), ah(async (req, res) => {
  const b = req.body || {};
  const kind = b.kind;
  const refId = parseInt(b.ref_id, 10);
  if (!AD_KINDS.includes(kind) || !refId) {
    return err(res, 422, 'Choose what to promote: a product, a job or a business.');
  }
  let ownerId = null;
  if (kind === 'product') {
    const p = await getOne("SELECT seller_id FROM products WHERE id = ? AND status != 'removed'", [refId]);
    if (!p) return err(res, 404, 'Item not found.');
    ownerId = p.seller_id;
  } else if (kind === 'job') {
    const j = await getOne('SELECT poster_id, is_draft FROM jobs WHERE id = ?', [refId]);
    if (!j) return err(res, 404, 'Job not found.');
    if (j.is_draft) return err(res, 422, 'Publish the job before promoting it.');
    ownerId = j.poster_id;
  } else {
    const bz = await getOne('SELECT owner_id FROM businesses WHERE id = ?', [refId]);
    if (!bz) return err(res, 404, 'Business not found.');
    ownerId = bz.owner_id;
  }
  if (ownerId !== req.user.id) return err(res, 403, 'You can only promote your own listings.');
  if (req.user.is_tester) return err(res, 403, 'Ads are for real accounts only.');
  if (!adsAreFree()) return err(res, 403, 'Free ads have ended and paid ads are not open yet.');
  const dup = await getOne(
    `SELECT id FROM ads WHERE kind = ? AND ref_id = ? AND status = 'active' AND ends_at > datetime('now')`,
    [kind, refId]);
  if (dup) return err(res, 409, 'This listing is already in the ads banner.');
  const starts = new Date();
  const ends = new Date(starts.getTime() + 14 * 24 * 60 * 60 * 1000);
  const info = await runWrite(
    `INSERT INTO ads (owner_id, kind, ref_id, status, is_paid, amount, starts_at, ends_at)
     VALUES (?, ?, ?, 'active', 0, 0, ?, ?)`,
    [req.user.id, kind, refId, adStamp(starts), adStamp(ends)]);
  const ad = await getOne('SELECT * FROM ads WHERE id = ?', [insertId(info)]);
  res.status(201).json({ ad: serializeAd(ad) });
}));

app.delete('/api/ads/:id', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ad = await getOne('SELECT * FROM ads WHERE id = ?', [id || 0]);
  if (!ad) return err(res, 404, 'Ad not found.');
  if (ad.owner_id !== req.user.id) return err(res, 403, 'This is not your ad.');
  await runWrite("UPDATE ads SET status = 'ended' WHERE id = ?", [ad.id]);
  res.json({ ok: true, id: ad.id });
}));

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
        `Hi, this is Zac, your assistant. Here is your code: ${code}. It expires in ${RESET_CODE_TTL_MIN} minutes. Do not share it. PieceWork Zambia`);
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

// Admin: SMS notification log (newest first): what was sent, skipped (no
// gateway configured) or failed, and to whom.
app.get('/api/admin/sms-log', ah(auth), ah(async (req, res) => {
  if (!canModerate(req.user)) return err(res, 403, 'Not authorized.');
  const rows = await getAll(
    `SELECT id, user_id, phone, kind, body, status, error, created_at
     FROM sms_log ORDER BY id DESC LIMIT 50`
  );
  res.json({ sms_log: rows });
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
  logAdmin(req, 'password_reset.issue', 'user', row.user_id, row.user_name);
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
  if (!mine) conds.push('j.is_draft = 0'); // drafts are private to their poster
  if (mine) { conds.push('j.poster_id = ?'); params.push(req.user.id); }
  const payMin = parseInt(req.query.pay_min, 10);
  if (Number.isFinite(payMin) && payMin >= 0) { conds.push('j.pay_amount >= ?'); params.push(payMin); }
  const payMax = parseInt(req.query.pay_max, 10);
  if (Number.isFinite(payMax) && payMax > 0) { conds.push('j.pay_amount <= ?'); params.push(payMax); }
  if (req.query.duration && DURATIONS.includes(req.query.duration)) { conds.push('j.expected_duration = ?'); params.push(req.query.duration); }
  if (String(req.query.urgent || '') === '1') conds.push('j.is_urgent = 1');
  if (explicitCity) { conds.push('j.city = ?'); params.push(req.query.city); }
  if (req.query.category && categorySet.has(req.query.category)) { conds.push('j.category = ?'); params.push(req.query.category); }
  if (req.query.q && String(req.query.q).trim()) {
    // 2.0 M2: search also matches the category and city, so "plumbing"
    // finds Plumbing jobs even when the title never says the word.
    conds.push('(j.title LIKE ? OR j.description LIKE ? OR j.area LIKE ? OR j.category LIKE ? OR j.city LIKE ?)');
    const q = `%${String(req.query.q).trim()}%`;
    params.push(q, q, q, q, q);
  }
  const where = 'WHERE ' + conds.join(' AND ');

  // Pull a generous candidate set, then match by kilometres in JS so the
  // radius filter and nearest-first ordering stay consistent with pagination.
  const CANDIDATE_CAP = 500;
  const rows = await getAll(`
    SELECT j.*, u.name AS poster_name, u.city AS poster_city,
           u.rating_avg AS poster_rating, u.rating_count AS poster_rating_count,
           u.avatar AS poster_avatar, u.selfie_status AS poster_selfie_status,
           (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status != 'withdrawn') AS applicant_count,
           (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status = 'accepted') AS accepted_count,
           (SELECT COUNT(*) FROM job_photos p WHERE p.job_id = j.id) AS photo_count,
           (SELECT p.id FROM job_photos p WHERE p.job_id = j.id ORDER BY p.sort, p.id LIMIT 1) AS cover_photo_id
    FROM jobs j JOIN users u ON u.id = j.poster_id
    ${where} ORDER BY j.created_at DESC LIMIT ?
  `, [...params, CANDIDATE_CAP]);

  let jobs = rows.map((r) => {
    const job = serializeJob(r);
    delete job.instructions; // detail-only field; keep list payloads light
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

  const sortParam = String(req.query.sort || '');
  if (sortParam === 'pay_high' || sortParam === 'pay_low') {
    // Design alignment (Oct 22): explicit pay ordering beats distance.
    const dir = sortParam === 'pay_high' ? -1 : 1;
    if (Number.isFinite(maxKm) && viewer) jobs = jobs.filter((j) => j.distance_km != null && j.distance_km <= maxKm);
    jobs.sort((a, b) => dir * ((a.pay_amount || 0) - (b.pay_amount || 0)) || b.created_at.localeCompare(a.created_at));
  } else if (mine) {
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

// 2.0 M1: expected-duration options (form select + filter values).
const DURATIONS = ['A few hours', '1 day', '2-3 days', 'About a week', '2-4 weeks', '1 month or more'];
const MAX_JOB_PHOTOS = 3;

/** 2.0 M1: sanitize the optional Jobs 2.0 fields from a request body. */
function jobExtras(b) {
  return {
    expected_duration: DURATIONS.includes(b.expected_duration) ? b.expected_duration : '',
    start_time: String(b.start_time || '').trim().slice(0, 20),
    transport_provided: b.transport_provided === true || b.transport_provided === 1 || b.transport_provided === '1' ? 1 : 0,
    materials_provided: b.materials_provided === true || b.materials_provided === 1 || b.materials_provided === '1' ? 1 : 0,
    is_urgent: b.is_urgent === true || b.is_urgent === 1 || b.is_urgent === '1' ? 1 : 0,
    instructions: String(b.instructions || '').trim().slice(0, 1000),
  };
}

/** 2.0 M1: validate + store job photos (data URIs). Returns an error string or null. */
async function saveJobPhotos(jobId, photos) {
  if (!Array.isArray(photos)) return 'Photos must be a list.';
  if (photos.length > MAX_JOB_PHOTOS) return `Up to ${MAX_JOB_PHOTOS} photos per job.`;
  for (const p of photos) {
    if (typeof p !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(p)) return 'Each photo must be a JPG, PNG or WebP image.';
    if (p.length > 2_000_000) return 'Each photo must be under about 1.5 MB. Use a smaller photo.';
  }
  await runWrite('DELETE FROM job_photos WHERE job_id = ?', [jobId]);
  for (let i = 0; i < photos.length; i++) {
    const mime = photos[i].slice(5, photos[i].indexOf(';'));
    await runWrite('INSERT INTO job_photos (job_id, image, mime, sort) VALUES (?, ?, ?, ?)', [jobId, photos[i], mime, i]);
  }
  return null;
}

async function jobPhotoRows(jobId) {
  return getAll('SELECT id FROM job_photos WHERE job_id = ? ORDER BY sort, id', [jobId]);
}

function serializeJob(j) {
  return {
    id: j.id, title: j.title, category: j.category, description: j.description,
    city: j.city, area: j.area || '', date_needed: j.date_needed,
    pay_amount: j.pay_amount, pay_type: j.pay_type,
    workers_needed: j.workers_needed, status: j.status,
    created_at: j.created_at,
    is_draft: !!j.is_draft,
    expected_duration: j.expected_duration || '',
    start_time: j.start_time || '',
    transport_provided: !!j.transport_provided,
    materials_provided: !!j.materials_provided,
    is_urgent: !!j.is_urgent,
    instructions: j.instructions || '',
    photo_count: Number(j.photo_count || 0),
    cover_photo: j.cover_photo_id ? `/api/jobs/${j.id}/photos/${j.cover_photo_id}` : null,
    requires_food_license: !!j.requires_food_license,
    poster: {
      id: j.poster_id, name: j.poster_name, city: j.poster_city,
      rating_avg: j.poster_rating || 0, rating_count: j.poster_rating_count || 0,
      avatar: j.poster_avatar || '',
      verified: j.poster_selfie_status === 'approved',
    },
    applicant_count: j.applicant_count || 0,
    accepted_count: j.accepted_count || 0,
  };
}

// ---------------------------------------------------------------- 2.0 M1: recommendations
// Rules-based, no machine learning: same city, skills that mention the
// job's category, and distance when coordinates are known. Registered
// BEFORE /api/jobs/:id so 'recommended' is not captured as an id.
app.get('/api/jobs/recommended', ah(auth), ah(async (req, res) => {
  const me = await getOne('SELECT city, skills, lat, lng FROM users WHERE id = ?', [req.user.id]);
  const rows = await getAll(`
    SELECT j.*, u.name AS poster_name, u.city AS poster_city,
           u.rating_avg AS poster_rating, u.rating_count AS poster_rating_count,
           u.avatar AS poster_avatar, u.selfie_status AS poster_selfie_status,
           (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status != 'withdrawn') AS applicant_count,
           (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status = 'accepted') AS accepted_count,
           (SELECT COUNT(*) FROM job_photos p WHERE p.job_id = j.id) AS photo_count,
           (SELECT p.id FROM job_photos p WHERE p.job_id = j.id ORDER BY p.sort, p.id LIMIT 1) AS cover_photo_id
    FROM jobs j JOIN users u ON u.id = j.poster_id
    WHERE j.status = 'open' AND j.is_draft = 0 AND j.poster_id != ?
    ORDER BY j.created_at DESC LIMIT 200
  `, [req.user.id]);
  const skillTokens = String((me && me.skills) || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const myCity = String((me && me.city) || '').toLowerCase();
  const viewer = me ? resolveCoords(me) : null;
  const scored = [];
  for (const r of rows) {
    let score = 0;
    const reasons = [];
    if (myCity && String(r.city).toLowerCase() === myCity) { score += 3; reasons.push('In your city'); }
    const cat = String(r.category).toLowerCase();
    if (skillTokens.some((t) => t.includes(cat) || cat.includes(t))) { score += 2; reasons.push('Matches your skills'); }
    let distance = null;
    if (viewer) {
      const jc = resolveCoords(r);
      if (jc) {
        distance = Math.round(haversineKm(viewer.lat, viewer.lng, jc.lat, jc.lng) * 10) / 10;
        if (distance <= 25) { score += 1; if (!reasons.length) reasons.push('Near you'); }
      }
    }
    if (score > 0) {
      const job = serializeJob(r);
      delete job.instructions;
      job.distance_km = distance;
      job.recommend_reason = reasons.length ? reasons.join(' · ') : 'Recommended for you';
      scored.push({ score, job });
    }
  }
  scored.sort((a, b) => (b.score - a.score) || b.job.created_at.localeCompare(a.job.created_at));
  res.json({ jobs: scored.slice(0, 10).map((s) => s.job) });
}));

// ---------------------------------------------------------------- jobs: detail
app.get('/api/jobs/:id', ah(maybeAuth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return err(res, 404, 'Job not found.');
  const j = await getOne(`
    SELECT j.*, u.name AS poster_name, u.city AS poster_city,
           u.rating_avg AS poster_rating, u.rating_count AS poster_rating_count,
           u.avatar AS poster_avatar, u.selfie_status AS poster_selfie_status,
           (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status != 'withdrawn') AS applicant_count,
           (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status = 'accepted') AS accepted_count,
           (SELECT COUNT(*) FROM job_photos p WHERE p.job_id = j.id) AS photo_count,
           (SELECT p.id FROM job_photos p WHERE p.job_id = j.id ORDER BY p.sort, p.id LIMIT 1) AS cover_photo_id
    FROM jobs j JOIN users u ON u.id = j.poster_id WHERE j.id = ?
  `, [id]);
  if (!j) return err(res, 404, 'Job not found.');
  const isOwnerEarly = req.user && req.user.id === j.poster_id;
  if (j.is_draft && !isOwnerEarly) return err(res, 404, 'Job not found.');
  const job = serializeJob(j);
  job.photos = (await jobPhotoRows(id)).map((p) => ({ id: Number(p.id), url: `/api/jobs/${id}/photos/${p.id}` }));
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
  job.active_ad = isPoster ? await activeAdFor('job', id) : null;
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
      SELECT a.id, a.message, a.status, a.created_at, a.arrived_at, a.arrival_confirmed_at,
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
  if (!categorySet.has(b.category)) f.category = 'Choose a valid category.';
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

// 2.0 M1: serve one job photo. Job listings are public, so photos are too;
// the bytes never travel inside JSON payloads, which keeps lists light.
app.get('/api/jobs/:id/photos/:photoId', ah(async (req, res) => {
  const row = await getOne('SELECT image, mime FROM job_photos WHERE id = ? AND job_id = ?', [parseInt(req.params.photoId, 10), parseInt(req.params.id, 10)]);
  if (!row) return err(res, 404, 'Photo not found.');
  const comma = row.image.indexOf(',');
  const buf = Buffer.from(row.image.slice(comma + 1), 'base64');
  res.set('Content-Type', row.mime || 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(buf);
}));

app.post('/api/jobs', ah(auth), ah(async (req, res) => {
  const b = req.body || {};
  const isDraft = b.draft === true || b.draft === 1 || b.draft === '1';
  if (isDraft) {
    // Drafts: only a recognisable title is required. Everything else is
    // completed later; publishing runs the full validation.
    if (!b.title || String(b.title).trim().length < 5) {
      return err(res, 422, 'Give the draft a title first (5+ characters).', { title: 'Give the job a clear title (5+ characters).' });
    }
    const inDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const ex = jobExtras(b);
    const info = await runWrite(`
      INSERT INTO jobs (poster_id, title, category, description, city, area, date_needed,
                        pay_amount, pay_type, workers_needed, whatsapp, lat, lng, requires_food_license,
                        is_draft, expected_duration, start_time, transport_provided, materials_provided, is_urgent, instructions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    `, [
      req.user.id, String(b.title).trim(),
      categorySet.has(b.category) ? b.category : 'Other',
      String(b.description || '').trim(),
      CITIES.includes(b.city) ? b.city : (req.user.city || 'Lusaka'),
      String(b.area || '').trim(),
      /^\d{4}-\d{2}-\d{2}$/.test(b.date_needed || '') ? b.date_needed : inDays,
      Number.isInteger(parseInt(b.pay_amount, 10)) ? parseInt(b.pay_amount, 10) : 0,
      PAY_TYPES.includes(b.pay_type) ? b.pay_type : 'per_job',
      Number.isInteger(parseInt(b.workers_needed, 10)) ? Math.min(50, Math.max(1, parseInt(b.workers_needed, 10))) : 1,
      '', null, null, 0,
      ex.expected_duration, ex.start_time, ex.transport_provided, ex.materials_provided, ex.is_urgent, ex.instructions,
    ]);
    const newId = insertId(info);
    if (Array.isArray(b.photos) && b.photos.length) {
      const photoErr = await saveJobPhotos(newId, b.photos);
      if (photoErr) return err(res, 422, photoErr);
    }
    return res.status(201).json({ id: newId, draft: true });
  }
  const fields = validateJobInput(req.body);
  if (Object.keys(fields).length) return err(res, 422, 'Please fix the highlighted fields.', fields);
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
  const ex = jobExtras(b);
  const info = await runWrite(`
    INSERT INTO jobs (poster_id, title, category, description, city, area, date_needed,
                      pay_amount, pay_type, workers_needed, whatsapp, lat, lng, requires_food_license,
                      expected_duration, start_time, transport_provided, materials_provided, is_urgent, instructions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    req.user.id, String(b.title).trim(), b.category, String(b.description).trim(),
    b.city, String(b.area || '').trim(), b.date_needed,
    parseInt(b.pay_amount, 10), b.pay_type, parseInt(b.workers_needed, 10), whatsapp,
    coords ? coords.lat : null, coords ? coords.lng : null, requiresFoodLicense,
    ex.expected_duration, ex.start_time, ex.transport_provided, ex.materials_provided, ex.is_urgent, ex.instructions,
  ]);
  const newJobId = insertId(info);
  if (Array.isArray(b.photos) && b.photos.length) {
    const photoErr = await saveJobPhotos(newJobId, b.photos);
    if (photoErr) return err(res, 422, photoErr);
  }
  res.status(201).json({ id: newJobId });
}));

// 2.0 M1: publish a draft. Full validation runs here, including the terms
// gate, exactly as if the job were posted fresh.
app.post('/api/jobs/:id/publish', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const job = await getOne('SELECT * FROM jobs WHERE id = ?', [id]);
  if (!job) return err(res, 404, 'Job not found.');
  if (job.poster_id !== req.user.id) return err(res, 403, 'Only the poster can publish this job.');
  if (!job.is_draft) return err(res, 422, 'This job is already published.');
  const fields = validateJobInput(job);
  if (Object.keys(fields).length) return err(res, 422, 'Finish these details before publishing.', fields);
  const termsOk = req.user.terms_accepted_at || (req.body && (req.body.terms_accepted === '1' || req.body.terms_accepted === true));
  if (!termsOk) {
    return err(res, 422, 'Please read and accept the Terms and Conditions before posting.',
      { terms_accepted: 'You must accept the Terms and Conditions to post a job.' });
  }
  if (!req.user.terms_accepted_at) {
    await runWrite("UPDATE users SET terms_accepted_at = datetime('now') WHERE id = ?", [req.user.id]);
  }
  await runWrite('UPDATE jobs SET is_draft = 0 WHERE id = ?', [id]);
  res.json({ ok: true, id });
}));

// 2.0 M1: repost a previous job as a fresh listing with a new date.
// Everything else (including photos) is copied from the original.
app.post('/api/jobs/:id/repost', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const job = await getOne('SELECT * FROM jobs WHERE id = ?', [id]);
  if (!job) return err(res, 404, 'Job not found.');
  if (job.poster_id !== req.user.id) return err(res, 403, 'Only the poster can repost this job.');
  if (job.is_draft) return err(res, 422, 'Publish the draft first, then repost it.');
  const b = req.body || {};
  const probe = { ...job, date_needed: b.date_needed };
  const fields = validateJobInput(probe);
  if (fields.date_needed) return err(res, 422, fields.date_needed, { date_needed: fields.date_needed });
  const termsOk = req.user.terms_accepted_at || b.terms_accepted === '1' || b.terms_accepted === true;
  if (!termsOk) {
    return err(res, 422, 'Please read and accept the Terms and Conditions before posting.',
      { terms_accepted: 'You must accept the Terms and Conditions to post a job.' });
  }
  const info = await runWrite(`
    INSERT INTO jobs (poster_id, title, category, description, city, area, date_needed,
                      pay_amount, pay_type, workers_needed, whatsapp, lat, lng, requires_food_license,
                      expected_duration, start_time, transport_provided, materials_provided, is_urgent, instructions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    job.poster_id, job.title, job.category, job.description, job.city, job.area || '', b.date_needed,
    job.pay_amount, job.pay_type, job.workers_needed, job.whatsapp || '', job.lat, job.lng, job.requires_food_license ? 1 : 0,
    job.expected_duration || '', job.start_time || '', job.transport_provided ? 1 : 0, job.materials_provided ? 1 : 0, job.is_urgent ? 1 : 0, job.instructions || '',
  ]);
  const newId = insertId(info);
  const photos = await getAll('SELECT image, mime, sort FROM job_photos WHERE job_id = ? ORDER BY sort, id', [id]);
  for (const p of photos) {
    await runWrite('INSERT INTO job_photos (job_id, image, mime, sort) VALUES (?, ?, ?, ?)', [newId, p.image, p.mime, p.sort]);
  }
  res.status(201).json({ id: newId });
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
  const editable = ['title', 'description', 'category', 'city', 'area', 'date_needed', 'pay_amount', 'pay_type', 'workers_needed', 'whatsapp', 'requires_food_license', 'expected_duration', 'start_time', 'instructions'];
  const merged = { ...job, ...b };
  const fields = validateJobInput(merged);
  // Only surface errors for fields the poster actually tried to change.
  // A job's date_needed can pass while it stays open; the prefilled old date
  // must not block edits that leave the date untouched.
  const relevant = Object.keys(fields).filter(k => {
    if (!(k in b)) return false;
    if (k === 'date_needed' && String(b.date_needed) === String(job.date_needed)) return false;
    return true;
  });
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
  // 2.0 M1 boolean extras follow the same pattern.
  for (const k of ['transport_provided', 'materials_provided', 'is_urgent']) {
    if (k in b) {
      const v = b[k] === '1' || b[k] === true || b[k] === 1 ? 1 : 0;
      updates.push(`${k} = ?`); params.push(v);
    }
  }
  if ('expected_duration' in b && b.expected_duration && !DURATIONS.includes(b.expected_duration)) {
    return err(res, 422, 'Choose a valid expected duration.', { expected_duration: 'Choose a valid expected duration.' });
  }
  if ('photos' in b) {
    const photoErr = await saveJobPhotos(id, Array.isArray(b.photos) ? b.photos : []);
    if (photoErr) return err(res, 422, photoErr);
    if (!updates.length) return res.json({ ok: true }); // photos-only update
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
  if (job.is_draft) return err(res, 422, 'This job is not open for applications yet.');
  if (job.status !== 'open') return err(res, 422, 'This job is no longer open for applications.');
  if (job.poster_id === req.user.id) return err(res, 403, 'You cannot apply to your own job.');
  if (await blockExists(job.poster_id, req.user.id)) {
    return err(res, 403, 'You cannot apply to this job.');
  }
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
    if (job.poster_id !== req.user.id) {
      notifySms(job.poster_id, 'application', composeSms(
      (n, t) => `Hi, this is Zac, your assistant. ${n} applied for your job '${t}'. Open the app to review: pieceworkzambia.com`,
      req.user.name, job.title
    )).catch(() => {});
      notifyPush(job.poster_id, {
        title: 'PieceWork Zambia',
        body: `${req.user.name} applied for your job '${job.title}'.`,
        url: `#/job/${job.id}`,
        tag: `application-${job.id}`,
      }).catch(() => {});
    }
    return res.status(201).json({ id: dup.id });
  }
  const info = await runWrite(
    'INSERT INTO applications (job_id, worker_id, message) VALUES (?, ?, ?)',
    [id, req.user.id, message]
  );
  if (job.poster_id !== req.user.id) {
    notifySms(job.poster_id, 'application', composeSms(
      (n, t) => `Hi, this is Zac, your assistant. ${n} applied for your job '${t}'. Open the app to review: pieceworkzambia.com`,
      req.user.name, job.title
    )).catch(() => {});
    notifyPush(job.poster_id, {
      title: 'PieceWork Zambia',
      body: `${req.user.name} applied for your job '${job.title}'.`,
      url: `#/job/${job.id}`,
      tag: `application-${job.id}`,
    }).catch(() => {});
  }
  res.status(201).json({ id: insertId(info) });
}));

/** Jobs the signed-in user has applied to. */
app.get('/api/applications/mine', ah(auth), ah(async (req, res) => {
  const rows = await getAll(`
    SELECT a.id, a.status AS app_status, a.message, a.created_at AS applied_at, a.arrived_at, a.arrival_confirmed_at,
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
    SELECT a.id, a.message, a.status, a.created_at, a.arrived_at, a.arrival_confirmed_at,
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

  if (!isPoster) return err(res, 403, 'Only the poster can change this application.');
  // 2.0 M1: shortlisting. Posters can shortlist a pending application and
  // accept or decline from either pending or shortlisted.
  if (status === 'shortlisted' || status === 'pending') {
    const from = status === 'shortlisted' ? 'pending' : 'shortlisted';
    if (appRow.status !== from) return err(res, 422, `This application is already ${appRow.status}.`);
    await runWrite('UPDATE applications SET status = ? WHERE id = ?', [status, id]);
    return res.json({ ok: true });
  }
  if (!['accepted', 'declined'].includes(status)) return err(res, 422, 'Status must be accepted, declined, shortlisted or pending.');
  if (!['pending', 'shortlisted'].includes(appRow.status)) return err(res, 422, `This application is already ${appRow.status}.`);

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
  if (status === 'accepted' && appRow.worker_id !== req.user.id) {
    notifySms(appRow.worker_id, 'accepted', composeSms(
      (n, t) => `Hi, this is Zac, your assistant. Good news, you were accepted for '${t}'. Open the app for the poster's number: pieceworkzambia.com`,
      '', job.title
    )).catch(() => {});
    notifyPush(appRow.worker_id, {
      title: 'PieceWork Zambia',
      body: `Good news, you were accepted for '${job.title}'. Open the job to see the poster's number.`,
      url: `#/job/${job.id}`,
      tag: `accepted-${id}`,
    }).catch(() => {});
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

/** Poster confirms the worker's arrival — the job begins. */
app.post('/api/applications/:id/arrival-confirm', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const appRow = await getOne('SELECT * FROM applications WHERE id = ?', [id]);
  if (!appRow) return err(res, 404, 'Application not found.');
  const job = await getOne('SELECT id, poster_id, status FROM jobs WHERE id = ?', [appRow.job_id]);
  if (!job || job.poster_id !== req.user.id) return err(res, 403, 'Only the client can confirm the job started.');
  if (appRow.status !== 'accepted') return err(res, 422, 'Only a hired worker can start the job.');
  if (!appRow.arrived_at) return err(res, 422, 'The worker has not marked arrival yet.');
  await runWrite("UPDATE applications SET arrival_confirmed_at = datetime('now') WHERE id = ?", [id]);
  res.json({ ok: true });
}));

/** Poster says "not yet" — clears the arrival claim so the worker can tap again later. */
app.post('/api/applications/:id/arrival-reject', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const appRow = await getOne('SELECT * FROM applications WHERE id = ?', [id]);
  if (!appRow) return err(res, 404, 'Application not found.');
  const job = await getOne('SELECT id, poster_id, status FROM jobs WHERE id = ?', [appRow.job_id]);
  if (!job || job.poster_id !== req.user.id) return err(res, 403, 'Only the client can do this.');
  if (appRow.status !== 'accepted') return err(res, 422, 'Only a hired worker can start the job.');
  await runWrite('UPDATE applications SET arrived_at = NULL, arrival_confirmed_at = NULL WHERE id = ?', [id]);
  res.json({ ok: true });
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
  // Accept the number with or without slashes (phone keypads have no slash
  // key); normalize 9 digits to the stored 123456/11/1 format.
  const nrcDigits = String((req.body && req.body.nrc_number) || '').replace(/\D/g, '');
  const nrcNumber = nrcDigits.length === 9
    ? `${nrcDigits.slice(0, 6)}/${nrcDigits.slice(6, 8)}/${nrcDigits.slice(8)}`
    : String((req.body && req.body.nrc_number) || '').trim();
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
  // Access log: who viewed this NRC and when. The log survives the document.
  try {
    await runWrite(
      'INSERT INTO nrc_views (application_id, worker_id, viewer_id) VALUES (?, ?, ?)',
      [id, doc.worker_id, req.user.id]
    );
  } catch (e) { console.error('[nrc-view-log]', e.message); }
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
    getOne('SELECT COUNT(*) AS c FROM products'),
    getOne('SELECT COUNT(*) AS c FROM businesses'),
    getOne("SELECT COUNT(*) AS c FROM businesses WHERE status = 'pending'"),
    getOne("SELECT COUNT(*) AS c FROM reports WHERE status = 'open'"),
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
  logAdmin(req, 'verification.decision', 'user', userId, `selfie ${status}`);
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
  logAdmin(req, 'food_license.decision', 'user', userId, `food license ${status}`);
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
  let rows = await getAll(
    `SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT 100`, params
  );
  // 2.0 M2: global search filters people by name, skills, bio, or city.
  const q = (req.query.q || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter(r => [r.name, r.skills, r.bio, r.city]
      .map(v => String(v || '').toLowerCase()).join(' ').includes(q));
  }
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
    user: u, completed_jobs: completed, reviews, stats: await trackRecord(id),
    vouched_by: vouchedBy.map(r => r.name), viewer_vouched: viewerVouched,
  });
}));

// Track record counts, one definition shared by the own-profile stats, the
// public profile, and the marketplace seller card (the trust strip a tester
// asked for, Oct 23, 2026: show how credible and reliable a person is).
async function trackRecord(userId) {
  const one = async (sql) => { const r = await getOne(sql, [userId]); return r ? r.c : 0; };
  const posted = await one("SELECT COUNT(*) AS c FROM jobs WHERE poster_id = ? AND status = 'completed'");
  const worked = await getOne(
    `SELECT COUNT(*) AS c FROM applications a JOIN jobs j ON j.id = a.job_id
     WHERE a.worker_id = ? AND a.status = 'accepted' AND j.status = 'completed'`, [userId]);
  const sold = await one("SELECT COUNT(*) AS c FROM products WHERE seller_id = ? AND status = 'sold'");
  const postedAll = await one('SELECT COUNT(*) AS c FROM jobs WHERE poster_id = ?');
  const listed = await one("SELECT COUNT(*) AS c FROM products WHERE seller_id = ? AND status = 'active'");
  const u = await getOne('SELECT rating_avg, rating_count FROM users WHERE id = ?', [userId]);
  return {
    jobs_completed: posted + (worked ? worked.c : 0),
    items_sold: sold,
    jobs_posted: postedAll,
    items_listed: listed,
    rating_avg: u ? Number(u.rating_avg || 0) : 0,
    rating_count: u ? Number(u.rating_count || 0) : 0,
  };
}

app.get('/api/users/me/stats', ah(auth), ah(async (req, res) => {
  res.json(await trackRecord(req.user.id));
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

// ---------------------------------------------------------------- admin NRC access log
// Latest NRC views across the platform: who looked at whose ID, and when.
app.get('/api/admin/nrc-views', ah(auth), ah(async (req, res) => {
  if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const rows = await getAll(`
    SELECT v.viewed_at,
           vu.name AS viewer_name, vu.phone AS viewer_phone,
           wu.name AS worker_name, j.title AS job_title
    FROM nrc_views v
    LEFT JOIN users vu ON vu.id = v.viewer_id
    LEFT JOIN users wu ON wu.id = v.worker_id
    LEFT JOIN applications a ON a.id = v.application_id
    LEFT JOIN jobs j ON j.id = a.job_id
    ORDER BY v.viewed_at DESC, v.id DESC
    LIMIT 50`);
  res.json({
    views: rows.map((r) => ({
      viewed_at: r.viewed_at,
      viewer_name: r.viewer_name || 'Unknown user',
      viewer_phone: r.viewer_phone || '',
      worker_name: r.worker_name || 'Unknown worker',
      job_title: r.job_title || '',
    })),
  });
}));

// ---------------------------------------------------------------- 2.0 M0: categories (public + admin)
app.get('/api/categories', ah(async (req, res) => {
  const kind = req.query.kind === 'market' ? 'market' : 'job';
  const rows = await getAll('SELECT id, name FROM categories WHERE kind = ? AND active = 1 ORDER BY sort, name', [kind]);
  res.json({ categories: rows.map((r) => ({ id: Number(r.id), name: r.name })) });
}));

app.get('/api/admin/categories', ah(auth), ah(async (req, res) => {
  if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const rows = await getAll('SELECT id, name, kind, active, sort FROM categories ORDER BY kind, sort, name');
  res.json({ categories: rows.map((r) => ({ id: Number(r.id), name: r.name, kind: r.kind, active: !!r.active, sort: Number(r.sort) })) });
}));

app.post('/api/admin/categories', ah(auth), ah(async (req, res) => {
  if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const name = String((req.body && req.body.name) || '').trim();
  if (name.length < 2 || name.length > 60) return err(res, 422, 'Category name must be 2 to 60 characters.');
  const kind = req.body && req.body.kind === 'market' ? 'market' : 'job';
  try {
    const info = await runWrite('INSERT INTO categories (name, kind, sort) VALUES (?, ?, 99)', [name, kind]);
    await refreshCategories();
    await refreshMarketCategories();
    logAdmin(req, 'category.create', 'category', insertId(info), name);
    res.status(201).json({ id: insertId(info), name });
  } catch {
    return err(res, 409, 'That category already exists.');
  }
}));

app.patch('/api/admin/categories/:id', ah(auth), ah(async (req, res) => {
  if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const id = parseInt(req.params.id, 10);
  const row = await getOne('SELECT * FROM categories WHERE id = ?', [id]);
  if (!row) return err(res, 404, 'Category not found.');
  const active = req.body && req.body.active ? 1 : 0;
  await runWrite('UPDATE categories SET active = ? WHERE id = ?', [active, id]);
  await refreshCategories();
  await refreshMarketCategories();
  logAdmin(req, 'category.toggle', 'category', id, `${row.name} -> ${active ? 'active' : 'inactive'}`);
  res.json({ ok: true, id, active: !!active });
}));

// ---------------------------------------------------------------- 2.0 M0: abuse reports
const REPORT_TYPES = ['job', 'user', 'product', 'business', 'delivery'];
app.post('/api/reports', ah(auth), ah(async (req, res) => {
  const b = req.body || {};
  const type = String(b.target_type || '');
  const targetId = parseInt(b.target_id, 10);
  const reason = String(b.reason || '').trim();
  if (!REPORT_TYPES.includes(type)) return err(res, 422, 'Choose what you are reporting.');
  if (!Number.isFinite(targetId)) return err(res, 422, 'Missing report target.');
  if (reason.length < 3 || reason.length > 500) return err(res, 422, 'Give a short reason (3 to 500 characters).');
  if (type === 'user') {
    if (targetId === req.user.id) return err(res, 422, 'You cannot report yourself.');
    const u = await getOne('SELECT id FROM users WHERE id = ?', [targetId]);
    if (!u) return err(res, 404, 'User not found.');
  }
  if (type === 'job') {
    const j = await getOne('SELECT id, poster_id FROM jobs WHERE id = ?', [targetId]);
    if (!j) return err(res, 404, 'Job not found.');
    if (j.poster_id === req.user.id) return err(res, 422, 'You cannot report your own job.');
  }
  const existing = await getOne(
    "SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'open'",
    [req.user.id, type, targetId]
  );
  if (existing) return res.json({ id: Number(existing.id), duplicate: true });
  const info = await runWrite(
    'INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (?, ?, ?, ?)',
    [req.user.id, type, targetId, reason]
  );
  res.status(201).json({ id: insertId(info) });
}));

app.get('/api/admin/reports', ah(auth), ah(async (req, res) => {
  if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const status = String(req.query.status || '');
  const rows = await getAll(`
    SELECT r.*, ru.name AS reporter_name,
           j.title AS job_title, tu.name AS target_user_name
    FROM reports r
    JOIN users ru ON ru.id = r.reporter_id
    LEFT JOIN jobs j ON r.target_type = 'job' AND j.id = r.target_id
    LEFT JOIN users tu ON r.target_type = 'user' AND tu.id = r.target_id
    ${status ? 'WHERE r.status = ?' : ''}
    ORDER BY r.created_at DESC, r.id DESC LIMIT 100`, status ? [status] : []);
  res.json({
    reports: rows.map((r) => ({
      id: Number(r.id),
      reporter_id: Number(r.reporter_id),
      reporter_name: r.reporter_name,
      target_type: r.target_type,
      target_id: Number(r.target_id),
      target_label: r.job_title || r.target_user_name || '',
      reason: r.reason,
      status: r.status,
      admin_note: r.admin_note || '',
      created_at: r.created_at,
      resolved_at: r.resolved_at || null,
    })),
  });
}));

app.patch('/api/admin/reports/:id', ah(auth), ah(async (req, res) => {
  if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const id = parseInt(req.params.id, 10);
  const row = await getOne('SELECT * FROM reports WHERE id = ?', [id]);
  if (!row) return err(res, 404, 'Report not found.');
  const status = String((req.body && req.body.status) || '');
  if (!['open', 'resolved', 'dismissed'].includes(status)) return err(res, 422, 'Status must be open, resolved, or dismissed.');
  const note = String((req.body && req.body.note) || '').slice(0, 300);
  if (status === 'open') {
    await runWrite("UPDATE reports SET status = 'open', admin_note = ?, resolved_by = NULL, resolved_at = NULL WHERE id = ?", [note, id]);
  } else {
    await runWrite("UPDATE reports SET status = ?, admin_note = ?, resolved_by = ?, resolved_at = datetime('now') WHERE id = ?", [status, note, req.user.id, id]);
    logAdmin(req, status === 'resolved' ? 'report.resolve' : 'report.dismiss', 'report', id, `${row.target_type} #${row.target_id}: ${note || status}`);
  }
  res.json({ ok: true, id, status });
}));

// ---------------------------------------------------------------- 2.0 M0: blocking
app.post('/api/blocks/:userId', ah(auth), ah(async (req, res) => {
  const targetId = parseInt(req.params.userId, 10);
  if (!Number.isFinite(targetId)) return err(res, 400, 'Bad user id.');
  if (targetId === req.user.id) return err(res, 422, 'You cannot block yourself.');
  const u = await getOne('SELECT id FROM users WHERE id = ?', [targetId]);
  if (!u) return err(res, 404, 'User not found.');
  await runWrite('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)', [req.user.id, targetId]);
  res.status(201).json({ ok: true, blocked_id: targetId });
}));

app.delete('/api/blocks/:userId', ah(auth), ah(async (req, res) => {
  const targetId = parseInt(req.params.userId, 10);
  await runWrite('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [req.user.id, targetId]);
  res.json({ ok: true });
}));

app.get('/api/blocks', ah(auth), ah(async (req, res) => {
  const rows = await getAll(
    'SELECT u.id, u.name FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY u.name',
    [req.user.id]
  );
  res.json({ blocked: rows.map((r) => ({ id: Number(r.id), name: r.name })) });
}));

// ---------------------------------------------------------------- 2.0 M0: suspension
app.patch('/api/admin/users/:id/suspend', ah(auth), ah(async (req, res) => {
  if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const id = parseInt(req.params.id, 10);
  const target = await getOne('SELECT * FROM users WHERE id = ?', [id]);
  if (!target) return err(res, 404, 'User not found.');
  if (isAdmin(target)) return err(res, 422, 'Admin accounts cannot be suspended.');
  if (id === req.user.id) return err(res, 422, 'You cannot suspend yourself.');
  const reinstate = req.body && req.body.suspended === false;
  if (reinstate) {
    await runWrite('UPDATE users SET suspended_at = NULL, suspension_reason = NULL WHERE id = ?', [id]);
    logAdmin(req, 'user.reinstate', 'user', id, target.name);
    return res.json({ ok: true, id, suspended: false });
  }
  const reason = String((req.body && req.body.reason) || '').slice(0, 200);
  await runWrite("UPDATE users SET suspended_at = datetime('now'), suspension_reason = ? WHERE id = ?", [reason, id]);
  logAdmin(req, 'user.suspend', 'user', id, `${target.name}: ${reason}`);
  res.json({ ok: true, id, suspended: true });
}));

// ---------------------------------------------------------------- 2.0 M0: admin audit log
app.get('/api/admin/audit', ah(auth), ah(async (req, res) => {
  if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const rows = await getAll(`
    SELECT a.*, u.name AS admin_name
    FROM admin_audit a LEFT JOIN users u ON u.id = a.admin_id
    ORDER BY a.created_at DESC, a.id DESC LIMIT 100`);
  res.json({
    entries: rows.map((r) => ({
      id: Number(r.id),
      admin_id: Number(r.admin_id),
      admin_name: r.admin_name || '',
      action: r.action,
      target_type: r.target_type || '',
      target_id: r.target_id === null ? null : Number(r.target_id),
      detail: r.detail || '',
      created_at: r.created_at,
    })),
  });
}));

// ---------------------------------------------------------------- admin stats
// Simple self-serve dashboard for Zac: signups, applications, jobs, messages.
// Locked to ADMIN_PHONES.
app.get('/api/admin/stats', ah(auth), ah(async (req, res) => {
  if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const [
    userCount, signupsByDay, appCount, appsByStatus,
    jobsByStatus, convCount, msgCount, otwCount, selfiePending,
    productsTotal, businessesTotal, businessesPending, reportsOpen,
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
    getOne('SELECT COUNT(*) AS c FROM products'),
    getOne('SELECT COUNT(*) AS c FROM businesses'),
    getOne("SELECT COUNT(*) AS c FROM businesses WHERE status = 'pending'"),
    getOne("SELECT COUNT(*) AS c FROM reports WHERE status = 'open'"),
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
    products_total: Number(productsTotal.c || 0),
    businesses_total: Number(businessesTotal.c || 0),
    businesses_pending: Number(businessesPending.c || 0),
    reports_open: Number(reportsOpen.c || 0),
  });
}));

// ---------------------------------------------------------------- admin user activity
// Per-user activity board: when each user last opened the app (last_seen_at,
// touched by the auth middleware) plus what they actually did, counted from
// the applications / jobs / messages tables. Most recently active first;
// users who have never been seen since tracking started sort by their
// latest recorded action, then by signup. Admin only.
app.get('/api/admin/activity', ah(auth), ah(async (req, res) => {
  if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const rows = await getAll(`
    SELECT u.id, u.name, u.phone, u.city, u.created_at, u.last_seen_at,
           u.orientation_accepted_at, u.selfie_status, u.open_to_work, u.is_tester, u.suspended_at,
      (SELECT COUNT(*) FROM applications a
        WHERE a.worker_id = u.id AND a.status != 'withdrawn') AS applications,
      (SELECT COUNT(*) FROM jobs j WHERE j.poster_id = u.id) AS jobs_posted,
      (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id) AS messages_sent,
      (SELECT COUNT(*) FROM conversations c
        WHERE c.poster_id = u.id OR c.worker_id = u.id) AS conversations,
      (SELECT MAX(x.ts) FROM (
         SELECT MAX(a2.created_at) AS ts FROM applications a2 WHERE a2.worker_id = u.id
         UNION ALL
         SELECT MAX(j2.created_at) FROM jobs j2 WHERE j2.poster_id = u.id
         UNION ALL
         SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.sender_id = u.id
       ) x) AS last_action_at
    FROM users u
    ORDER BY COALESCE(u.last_seen_at, last_action_at, u.created_at) DESC
    LIMIT 300`);
  res.json({
    users: rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      phone: r.phone,
      city: r.city,
      signed_up_at: r.created_at,
      last_seen_at: r.last_seen_at || null,
      last_action_at: r.last_action_at || null,
      orientation_done: !!r.orientation_accepted_at,
      selfie_status: r.selfie_status || 'pending',
      open_to_work: !!r.open_to_work,
      is_tester: !!r.is_tester,
      suspended: !!r.suspended_at,
      applications: Number(r.applications || 0),
      jobs_posted: Number(r.jobs_posted || 0),
      messages_sent: Number(r.messages_sent || 0),
      conversations: Number(r.conversations || 0),
    })),
  });
}));

// ---------------------------------------------------------------- admin tester tracker
// Zac flags his Play Store testers (is_tester) and this board tracks them
// apart from everyone else: a day-by-day grid of who actually used the app.
// Days come from activity_days (opens, recorded from Oct 22, 2026) unioned
// with the days of their recorded actions (applications, jobs, messages),
// so real activity before opens were tracked still shows. Zambia days.
app.patch('/api/admin/users/:id/tester', ah(auth), ah(async (req, res) => {
  if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return err(res, 400, 'Bad user id.');
  const flag = req.body && req.body.is_tester ? 1 : 0;
  await runWrite('UPDATE users SET is_tester = ? WHERE id = ?', [flag, id]);
  logAdmin(req, 'user.tester_flag', 'user', id, flag ? 'flagged as tester' : 'tester flag removed');
  res.json({ ok: true, id, is_tester: !!flag });
}));

app.get('/api/admin/testers', ah(auth), ah(async (req, res) => {
  if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const rows = await getAll(`
    SELECT u.id, u.name, u.phone, u.city, u.created_at, u.last_seen_at,
           u.orientation_accepted_at, u.open_to_work,
      (SELECT COUNT(*) FROM applications a
        WHERE a.worker_id = u.id AND a.status != 'withdrawn') AS applications,
      (SELECT COUNT(*) FROM jobs j WHERE j.poster_id = u.id) AS jobs_posted,
      (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id) AS messages_sent
    FROM users u
    WHERE u.is_tester = 1
    ORDER BY COALESCE(u.last_seen_at, u.created_at) DESC
    LIMIT 100`);
  const testers = [];
  for (const r of rows) {
    const dayRows = await getAll(`
      SELECT DISTINCT d FROM (
        SELECT day AS d FROM activity_days
          WHERE user_id = ? AND day >= date('now', '+2 hours', '-20 days')
        UNION
        SELECT date(a.created_at, '+2 hours') FROM applications a WHERE a.worker_id = ?
        UNION
        SELECT date(j.created_at, '+2 hours') FROM jobs j WHERE j.poster_id = ?
        UNION
        SELECT date(m.created_at, '+2 hours') FROM messages m WHERE m.sender_id = ?
      ) WHERE d IS NOT NULL ORDER BY d`, [r.id, r.id, r.id, r.id]);
    testers.push({
      id: Number(r.id),
      name: r.name,
      phone: r.phone,
      city: r.city,
      signed_up_at: r.created_at,
      last_seen_at: r.last_seen_at || null,
      orientation_done: !!r.orientation_accepted_at,
      open_to_work: !!r.open_to_work,
      applications: Number(r.applications || 0),
      jobs_posted: Number(r.jobs_posted || 0),
      messages_sent: Number(r.messages_sent || 0),
      active_days: dayRows.map((x) => x.d),
    });
  }
  const todayRow = await getOne("SELECT date('now', '+2 hours') AS d");
  res.json({ today: todayRow.d, testers });
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
  logAdmin(req, 'giveaway.create', 'giveaway', insertId(info), `${String(title).trim()} K${prize}`);
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
  logAdmin(req, 'giveaway.draw', 'giveaway', Number(g.id), `winner ${entry.name}, ${total} entries`);
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

// ---------------------------------------------------------------- businesses (2.0 M4)
// Storefronts for formal businesses. Application plus admin approval
// makes a shop public. The Verified badge is separate: the owner
// uploads registration documents (PACRA, TPIN, trading licence) and
// an admin verifies them. Unverified shops stay public, labelled
// Unverified (decision recorded in the M4 milestone notes).
const businessLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true });
function slugifyName(name) {
  return String(name || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'business';
}

function serializeBusiness(b, viewer) {
  const isOwner = !!viewer && viewer.id === b.owner_id;
  const isAdm = !!viewer && isAdmin(viewer);
  return {
    id: b.id, owner_id: b.owner_id, owner_name: b.owner_name || '',
    name: b.name, slug: b.slug, tagline: b.tagline || '', description: b.description || '',
    logo: b.logo || null, cover: b.cover || null,
    category: b.category, city: b.city, area: b.area || '', address: b.address || '',
    phone: b.phone || '', whatsapp: b.whatsapp || '', email: b.email || '',
    hours_text: b.hours_text || '',
    status: b.status, verified: b.verification_status === 'verified',
    verification_status: b.verification_status,
    verification_note: (isOwner || isAdm) ? (b.verification_note || '') : '',
    product_count: b.product_count != null ? Number(b.product_count) : undefined,
    owner_rating: b.owner_rating != null ? Number(b.owner_rating) : null,
    owner_reviews: b.owner_reviews != null ? Number(b.owner_reviews) : 0,
    created_at: b.created_at,
  };
}

const BUSINESS_SELECT = `
  SELECT bz.*, u.name AS owner_name,
    (SELECT COUNT(*) FROM products p WHERE p.business_id = bz.id AND p.status = 'active') AS product_count,
    (SELECT AVG(r.rating) FROM reviews r WHERE r.reviewee_id = bz.owner_id) AS owner_rating,
    (SELECT COUNT(*) FROM reviews r WHERE r.reviewee_id = bz.owner_id) AS owner_reviews
  FROM businesses bz JOIN users u ON u.id = bz.owner_id`;

function validateBusinessInput(b) {
  const f = {};
  if (!b.name || String(b.name).trim().length < 3) f.name = 'Give the business a name (3+ characters).';
  if (b.category && !marketCategorySet.has(b.category)) f.category = 'Choose a valid category.';
  if (!CITIES.includes(b.city)) f.city = 'Choose a valid town.';
  if (!b.description || String(b.description).trim().length < 10) f.description = 'Describe the business (10+ characters).';
  for (const key of ['logo', 'cover']) {
    const v = b[key];
    if (v !== undefined && v !== null && v !== '') {
      if (typeof v !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(v)) f[key] = 'Use a JPG, PNG or WebP image.';
      else if (v.length > 2_000_000) f[key] = 'Image must be under about 1.5 MB.';
    }
  }
  return f;
}

app.post('/api/businesses', ah(auth), businessLimiter, ah(async (req, res) => {
  const b = req.body || {};
  const f = validateBusinessInput(b);
  if (Object.keys(f).length) return err(res, 422, Object.values(f)[0], f);
  const owned = await getOne('SELECT COUNT(*) AS c FROM businesses WHERE owner_id = ?', [req.user.id]);
  if (Number(owned.c || 0) >= 3) return err(res, 422, 'You can run up to 3 business storefronts.');
  const coords = parseLatLng(b);
  if (coords && coords.error) return err(res, 422, coords.error);
  const info = await runWrite(`
    INSERT INTO businesses (owner_id, name, slug, tagline, description, logo, cover, category,
      city, area, address, phone, whatsapp, email, hours_text, lat, lng)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    req.user.id, String(b.name).trim(), 'tmp-' + Date.now(),
    String(b.tagline || '').trim().slice(0, 120), String(b.description).trim(),
    b.logo || null, b.cover || null, b.category || 'Other',
    b.city, String(b.area || '').trim().slice(0, 80), String(b.address || '').trim().slice(0, 200),
    String(b.phone || '').trim().slice(0, 30), String(b.whatsapp || '').trim().slice(0, 30),
    String(b.email || '').trim().slice(0, 120), String(b.hours_text || '').trim().slice(0, 200),
    coords ? coords.lat : null, coords ? coords.lng : null,
  ]);
  const id = insertId(info);
  const slug = slugifyName(b.name) + '-' + id;
  await runWrite('UPDATE businesses SET slug = ? WHERE id = ?', [slug, id]);
  res.status(201).json({ id, slug, status: 'pending' });
}));

app.get('/api/businesses/mine', ah(auth), ah(async (req, res) => {
  const rows = await getAll(`${BUSINESS_SELECT} WHERE bz.owner_id = ? ORDER BY bz.created_at DESC`, [req.user.id]);
  res.json({ businesses: rows.map((r) => serializeBusiness(r, req.user)) });
}));

app.get('/api/businesses', ah(maybeAuth), ah(async (req, res) => {
  const conds = ["bz.status = 'active'"];
  const params = [];
  if (req.query.category && marketCategorySet.has(req.query.category)) { conds.push('bz.category = ?'); params.push(req.query.category); }
  if (req.query.city && CITIES.includes(req.query.city)) { conds.push('bz.city = ?'); params.push(req.query.city); }
  if (req.query.q && String(req.query.q).trim()) {
    conds.push('(bz.name LIKE ? OR bz.description LIKE ? OR bz.tagline LIKE ?)');
    const q = `%${String(req.query.q).trim()}%`;
    params.push(q, q, q);
  }
  const rows = await getAll(`${BUSINESS_SELECT} WHERE ${conds.join(' AND ')} ORDER BY bz.verification_status = 'verified' DESC, bz.created_at DESC LIMIT 100`, params);
  res.json({ businesses: rows.map((r) => serializeBusiness(r, req.user)) });
}));

app.get('/api/businesses/:slug', ah(maybeAuth), ah(async (req, res) => {
  const row = await getOne(`${BUSINESS_SELECT} WHERE bz.slug = ?`, [String(req.params.slug)]);
  if (!row) return err(res, 404, 'Business not found.');
  const isOwner = !!req.user && req.user.id === row.owner_id;
  if (row.status !== 'active' && !isOwner && !(req.user && isAdmin(req.user))) {
    return err(res, 404, 'Business not found.');
  }
  const business = serializeBusiness(row, req.user);
  business.active_ad = isOwner ? await activeAdFor('business', row.id) : null;
  const products = await getAll(
    `${PRODUCT_SELECT} WHERE p.business_id = ? AND p.status = 'active' ORDER BY p.created_at DESC LIMIT 50`, [row.id]
  );
  const jobs = await getAll(
    "SELECT * FROM jobs WHERE poster_id = ? AND status = 'open' AND is_draft = 0 ORDER BY created_at DESC LIMIT 20", [row.owner_id]
  );
  const reviews = await getAll(
    `SELECT r.rating, r.comment, r.created_at, u.name AS reviewer_name, u.avatar AS reviewer_avatar,
            j.title AS job_title
     FROM reviews r JOIN users u ON u.id = r.reviewer_id
     LEFT JOIN jobs j ON j.id = r.job_id
     WHERE r.reviewee_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 20`, [row.owner_id]
  );
  const fCount = await getOne('SELECT COUNT(*) AS c FROM business_follows WHERE business_id = ?', [row.id]);
  business.follower_count = fCount ? fCount.c : 0;
  business.following = false;
  if (req.user) {
    const f = await getOne('SELECT id FROM business_follows WHERE business_id = ? AND follower_id = ?', [row.id, req.user.id]);
    business.following = !!f;
  }
  res.json({
    business,
    products: products.map(serializeProduct),
    jobs: jobs.map(serializeJob),
    reviews: reviews.map((r) => ({
      rating: r.rating, comment: r.comment || '', created_at: r.created_at,
      reviewer_name: r.reviewer_name, reviewer_avatar: r.reviewer_avatar || '',
      job_title: r.job_title || '',
    })),
  });
}));

app.post('/api/businesses/:id/follow', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await getOne('SELECT id, owner_id, status FROM businesses WHERE id = ?', [id]);
  if (!row || row.status !== 'active') return err(res, 404, 'Business not found.');
  if (row.owner_id === req.user.id) return err(res, 422, 'You cannot follow your own business.');
  await runWrite('INSERT OR IGNORE INTO business_follows (business_id, follower_id) VALUES (?, ?)', [id, req.user.id]);
  const c = await getOne('SELECT COUNT(*) AS c FROM business_follows WHERE business_id = ?', [id]);
  res.json({ following: true, follower_count: c ? c.c : 0 });
}));

app.delete('/api/businesses/:id/follow', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await runWrite('DELETE FROM business_follows WHERE business_id = ? AND follower_id = ?', [id, req.user.id]);
  const c = await getOne('SELECT COUNT(*) AS c FROM business_follows WHERE business_id = ?', [id]);
  res.json({ following: false, follower_count: c ? c.c : 0 });
}));

app.patch('/api/businesses/:id', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await getOne('SELECT * FROM businesses WHERE id = ?', [id]);
  if (!row) return err(res, 404, 'Business not found.');
  if (row.owner_id !== req.user.id) return err(res, 403, 'This is not your business.');
  const b = req.body || {};
  const updates = {};
  for (const k of ['name', 'tagline', 'description', 'category', 'city', 'area', 'address', 'phone', 'whatsapp', 'email', 'hours_text']) {
    if (b[k] !== undefined) updates[k] = typeof b[k] === 'string' ? b[k].trim() : b[k];
  }
  if (b.logo !== undefined) updates.logo = b.logo || null;
  if (b.cover !== undefined) updates.cover = b.cover || null;
  const coords = parseLatLng(b);
  if (coords) { updates.lat = coords.lat; updates.lng = coords.lng; }
  if (Object.keys(updates).length) {
    const probe = { ...row, ...updates };
    const f = validateBusinessInput(probe);
    if (Object.keys(f).length) return err(res, 422, Object.values(f)[0], f);
    const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    await runWrite(`UPDATE businesses SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...Object.values(updates), id]);
  }
  res.json({ ok: true, id });
}));

app.post('/api/businesses/:id/documents', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await getOne('SELECT * FROM businesses WHERE id = ?', [id]);
  if (!row) return err(res, 404, 'Business not found.');
  if (row.owner_id !== req.user.id) return err(res, 403, 'This is not your business.');
  const b = req.body || {};
  const kind = ['pacra', 'tpin', 'licence', 'other'].includes(b.kind) ? b.kind : 'other';
  if (typeof b.image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(b.image)) {
    return err(res, 422, 'Upload a photo or scan of the document (JPG, PNG or WebP).');
  }
  if (b.image.length > 2_500_000) return err(res, 422, 'Document image must be under about 2 MB.');
  const info = await runWrite(
    'INSERT INTO business_documents (business_id, kind, image) VALUES (?, ?, ?)', [id, kind, b.image]
  );
  if (row.verification_status === 'unverified' || row.verification_status === 'rejected') {
    await runWrite("UPDATE businesses SET verification_status = 'pending', verification_note = '' WHERE id = ?", [id]);
  }
  res.status(201).json({ id: insertId(info) });
}));

app.get('/api/businesses/:id/documents', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await getOne('SELECT * FROM businesses WHERE id = ?', [id]);
  if (!row) return err(res, 404, 'Business not found.');
  if (row.owner_id !== req.user.id && !isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const docs = await getAll('SELECT id, kind, created_at FROM business_documents WHERE business_id = ? ORDER BY id', [id]);
  res.json({ documents: docs });
}));

app.get('/api/admin/businesses', ah(auth), ah(async (req, res) => {
  if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const status = String(req.query.status || '');
  const where = ['pending', 'active', 'rejected', 'suspended'].includes(status) ? 'WHERE bz.status = ?' : '';
  const rows = await getAll(
    `${BUSINESS_SELECT} ${where} ORDER BY bz.created_at DESC LIMIT 200`,
    where ? [status] : []);
  const withDocs = [];
  for (const r of rows) {
    const d = await getOne('SELECT COUNT(*) AS c FROM business_documents WHERE business_id = ?', [r.id]);
    withDocs.push({ ...serializeBusiness(r, req.user), doc_count: Number(d.c || 0) });
  }
  res.json({ businesses: withDocs });
}));

app.get('/api/admin/businesses/:id/documents', ah(auth), ah(async (req, res) => {
  if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const id = parseInt(req.params.id, 10);
  const docs = await getAll('SELECT id, kind, image, created_at FROM business_documents WHERE business_id = ? ORDER BY id', [id]);
  res.json({ documents: docs });
}));

app.patch('/api/admin/businesses/:id', ah(auth), ah(async (req, res) => {
  if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const id = parseInt(req.params.id, 10);
  const row = await getOne('SELECT * FROM businesses WHERE id = ?', [id]);
  if (!row) return err(res, 404, 'Business not found.');
  const status = String((req.body || {}).status || '');
  if (!['active', 'rejected', 'suspended', 'pending'].includes(status)) return err(res, 422, 'Invalid status.');
  await runWrite('UPDATE businesses SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
  logAdmin(req, 'business.status', 'business', id, `${row.name}: ${row.status} -> ${status}`);
  res.json({ ok: true, id, status });
}));

app.patch('/api/admin/businesses/:id/verification', ah(auth), ah(async (req, res) => {
  if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  const id = parseInt(req.params.id, 10);
  const row = await getOne('SELECT * FROM businesses WHERE id = ?', [id]);
  if (!row) return err(res, 404, 'Business not found.');
  const decision = String((req.body || {}).decision || '');
  if (!['verified', 'rejected'].includes(decision)) return err(res, 422, 'Decision must be verified or rejected.');
  const note = String((req.body || {}).note || '').trim().slice(0, 300);
  await runWrite('UPDATE businesses SET verification_status = ?, verification_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [decision, note, id]);
  logAdmin(req, 'business.verification', 'business', id, `${row.name}: ${decision}${note ? ' (' + note + ')' : ''}`);
  res.json({ ok: true, id, verification_status: decision });
}));

// ---------------------------------------------------------------- marketplace (2.0 M3)
// Peer-to-peer listings. PieceWork never touches the money: buyers and
// sellers agree and pay each other directly, exactly like jobs.
const PRODUCT_CONDITIONS = ['New', 'Like new', 'Good', 'Fair'];
const MAX_PRODUCT_PHOTOS = 5;
const MAX_ACTIVE_LISTINGS = 30;
const productLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 40, standardHeaders: true });

function serializeProduct(p) {
  return {
    id: p.id, seller_id: p.seller_id,
    seller_name: p.seller_name || '', seller_avatar: p.seller_avatar || '',
    seller_city: p.seller_city || '', seller_verified: p.seller_selfie_status === 'approved',
    seller_since: p.seller_created_at || null,
    title: p.title, description: p.description || '',
    price: Number(p.price || 0), negotiable: !!p.negotiable, category: p.category, condition: p.condition,
    seller_rating: p.seller_rating != null ? Number(p.seller_rating) : 0,
    seller_rating_count: Number(p.seller_rating_count || 0),
    city: p.city, area: p.area || '', status: p.status,
    view_count: Number(p.view_count || 0),
    business: p.business_name ? {
      id: p.business_id, name: p.business_name, slug: p.business_slug,
      verified: p.business_verification === 'verified',
    } : null,
    created_at: p.created_at, updated_at: p.updated_at,
    photo_count: Number(p.photo_count || 0),
    cover_photo: p.cover_photo_id ? `/api/products/${p.id}/photos/${p.cover_photo_id}` : null,
  };
}

async function saveProductPhotos(productId, photos) {
  if (!Array.isArray(photos)) return 'Photos must be a list.';
  if (photos.length > MAX_PRODUCT_PHOTOS) return `Up to ${MAX_PRODUCT_PHOTOS} photos per item.`;
  for (const p of photos) {
    if (typeof p !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(p)) return 'Each photo must be a JPG, PNG or WebP image.';
    if (p.length > 2_000_000) return 'Each photo must be under about 1.5 MB. Use a smaller photo.';
  }
  await runWrite('DELETE FROM product_photos WHERE product_id = ?', [productId]);
  for (let i = 0; i < photos.length; i++) {
    const mime = photos[i].slice(5, photos[i].indexOf(';'));
    await runWrite('INSERT INTO product_photos (product_id, image, mime, sort) VALUES (?, ?, ?, ?)', [productId, photos[i], mime, i]);
  }
  return null;
}

function validateProductInput(b) {
  const f = {};
  if (!b.title || String(b.title).trim().length < 4) f.title = 'Give the item a clear title (4+ characters).';
  if (!marketCategorySet.has(b.category)) f.category = 'Choose a valid category.';
  if (!b.description || String(b.description).trim().length < 10) f.description = 'Describe the item (10+ characters).';
  if (!CITIES.includes(b.city)) f.city = 'Choose a valid city.';
  const price = Number(b.price);
  if (!Number.isInteger(price) || price < 1 || price > 10000000) f.price = 'Set a price in Kwacha (whole numbers).';
  if (b.condition && !PRODUCT_CONDITIONS.includes(b.condition)) f.condition = 'Choose the item condition.';
  return f;
}

const PRODUCT_SELECT = `
  SELECT p.*, u.name AS seller_name, u.avatar AS seller_avatar, u.city AS seller_city,
         u.selfie_status AS seller_selfie_status, u.created_at AS seller_created_at,
         u.rating_avg AS seller_rating, u.rating_count AS seller_rating_count,
         bz.name AS business_name, bz.slug AS business_slug,
         bz.verification_status AS business_verification,
         (SELECT COUNT(*) FROM product_photos ph WHERE ph.product_id = p.id) AS photo_count,
         (SELECT ph.id FROM product_photos ph WHERE ph.product_id = p.id ORDER BY ph.sort, ph.id LIMIT 1) AS cover_photo_id
  FROM products p JOIN users u ON u.id = p.seller_id
  LEFT JOIN businesses bz ON bz.id = p.business_id AND bz.status = 'active'`;

app.get('/api/products', ah(maybeAuth), ah(async (req, res) => {
  const mine = req.query.mine === '1' && req.user;
  const conds = [];
  const params = [];
  if (mine) {
    conds.push('p.seller_id = ?'); params.push(req.user.id);
    conds.push("p.status != 'removed'");
  } else {
    conds.push("p.status = 'active'");
    if (req.query.seller) { conds.push('p.seller_id = ?'); params.push(parseInt(req.query.seller, 10) || 0); }
  }
  if (req.query.category && marketCategorySet.has(req.query.category)) { conds.push('p.category = ?'); params.push(req.query.category); }
  if (req.query.city && CITIES.includes(req.query.city)) { conds.push('p.city = ?'); params.push(req.query.city); }
  if (req.query.condition && PRODUCT_CONDITIONS.includes(req.query.condition)) { conds.push('p.condition = ?'); params.push(req.query.condition); }
  if (String(req.query.used || '') === '1') { conds.push("p.condition != 'New'"); }
  const pmin = parseInt(req.query.price_min, 10);
  if (Number.isInteger(pmin) && pmin >= 0) { conds.push('p.price >= ?'); params.push(pmin); }
  const pmax = parseInt(req.query.price_max, 10);
  if (Number.isInteger(pmax) && pmax > 0) { conds.push('p.price <= ?'); params.push(pmax); }
  if (req.query.q && String(req.query.q).trim()) {
    conds.push('(p.title LIKE ? OR p.description LIKE ? OR p.category LIKE ? OR p.city LIKE ?)');
    const q = `%${String(req.query.q).trim()}%`;
    params.push(q, q, q, q);
  }
  const sort = String(req.query.sort || 'newest');
  const order = sort === 'price_low' ? 'p.price ASC, p.id DESC'
    : sort === 'price_high' ? 'p.price DESC, p.id DESC' : 'p.created_at DESC, p.id DESC';
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const limit = 24;
  const rows = await getAll(`${PRODUCT_SELECT} WHERE ${conds.join(' AND ')} ORDER BY ${order} LIMIT 500`, params);
  let out = rows.map(serializeProduct);
  // Nearby: when the viewer shares a location, compute distances and
  // optionally sort nearest-first (products carry optional coordinates).
  const viewer = req.user ? resolveCoords(req.user) : null;
  if (viewer) {
    const rawById = Object.fromEntries(rows.map((r) => [r.id, r]));
    for (const prod of out) {
      const pc = resolveCoords(rawById[prod.id]);
      if (pc) prod.distance_km = Math.round(haversineKm(viewer.lat, viewer.lng, pc.lat, pc.lng) * 10) / 10;
    }
    if (sort === 'nearby') out.sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9));
  }
  const total = out.length;
  const slice = out.slice((page - 1) * limit, page * limit);
  res.json({ products: slice, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
}));

app.post('/api/products', ah(auth), productLimiter, ah(async (req, res) => {
  const b = req.body || {};
  const f = validateProductInput(b);
  if (Object.keys(f).length) return err(res, 422, Object.values(f)[0], f);
  // Spam guards: a per-seller active cap and an exact-duplicate block.
  const active = await getOne("SELECT COUNT(*) AS c FROM products WHERE seller_id = ? AND status = 'active'", [req.user.id]);
  if (Number(active.c || 0) >= MAX_ACTIVE_LISTINGS) {
    return err(res, 422, `You already have ${MAX_ACTIVE_LISTINGS} active listings. Mark something sold or remove it first.`);
  }
  const title = String(b.title).trim();
  const dup = await getOne(
    "SELECT id FROM products WHERE seller_id = ? AND status != 'removed' AND LOWER(title) = LOWER(?)",
    [req.user.id, title]
  );
  if (dup) return err(res, 409, 'You already have a listing with this title. Edit that one instead.');
  const coords = parseLatLng(b);
  if (coords && coords.error) return err(res, 422, coords.error);
  let businessId = null;
  if (b.business_id) {
    const biz = await getOne('SELECT id FROM businesses WHERE id = ? AND owner_id = ? AND status = ?',
      [parseInt(b.business_id, 10) || 0, req.user.id, 'active']);
    if (!biz) return err(res, 422, 'That business is not yours or is not live yet.');
    businessId = biz.id;
  }
  const info = await runWrite(`
    INSERT INTO products (seller_id, title, description, price, category, condition, city, area, lat, lng, business_id, negotiable)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    req.user.id, title, String(b.description).trim(), Number(b.price), b.category,
    b.condition || 'Good', b.city, String(b.area || '').trim().slice(0, 80),
    coords ? coords.lat : null, coords ? coords.lng : null, businessId, b.negotiable ? 1 : 0,
  ]);
  const id = insertId(info);
  if (Array.isArray(b.photos) && b.photos.length) {
    const photoErr = await saveProductPhotos(id, b.photos);
    if (photoErr) return err(res, 422, photoErr, { photos: photoErr });
  }
  res.status(201).json({ id });
}));

app.get('/api/products/:id/photos/:photoId', ah(async (req, res) => {
  const pid = parseInt(req.params.id, 10);
  const phid = parseInt(req.params.photoId, 10);
  if (!pid || !phid) return err(res, 404, 'Photo not found.');
  const row = await getOne('SELECT image, mime FROM product_photos WHERE id = ? AND product_id = ?', [phid, pid]);
  if (!row) return err(res, 404, 'Photo not found.');
  const comma = String(row.image).indexOf(',');
  const buf = Buffer.from(String(row.image).slice(comma + 1), 'base64');
  res.set('Content-Type', row.mime || 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(buf);
}));

app.get('/api/products/:id', ah(maybeAuth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return err(res, 404, 'Item not found.');
  const row = await getOne(`${PRODUCT_SELECT} WHERE p.id = ?`, [id]);
  if (!row || row.status === 'removed') return err(res, 404, 'Item not found.');
  const isOwner = !!req.user && req.user.id === row.seller_id;
  if (row.status === 'hidden' && !isOwner && !(req.user && isAdmin(req.user))) {
    return err(res, 404, 'Item not found.');
  }
  if (!isOwner) runWrite('UPDATE products SET view_count = view_count + 1 WHERE id = ?', [id]).catch(() => {});
  const product = serializeProduct(row);
  product.active_ad = isOwner ? await activeAdFor('product', id) : null;
  const photos = await getAll('SELECT id FROM product_photos WHERE product_id = ? ORDER BY sort, id', [id]);
  product.photos = photos.map((ph) => ({ id: ph.id, url: `/api/products/${id}/photos/${ph.id}` }));
  let myOffer = null;
  let offers = undefined;
  if (req.user && !isOwner) {
    const o = await getOne(
      'SELECT id, amount, message, status, created_at FROM offers WHERE product_id = ? AND buyer_id = ? ORDER BY id DESC LIMIT 1',
      [id, req.user.id]
    );
    if (o) myOffer = { id: o.id, amount: Number(o.amount), message: o.message || '', status: o.status, created_at: o.created_at };
  }
  if (isOwner) {
    const rows = await getAll(`
      SELECT o.*, u.name AS buyer_name, u.avatar AS buyer_avatar, u.city AS buyer_city
      FROM offers o JOIN users u ON u.id = o.buyer_id
      WHERE o.product_id = ? ORDER BY o.created_at DESC, o.id DESC LIMIT 50
    `, [id]);
    offers = rows.map((o) => ({
      id: o.id, buyer_id: o.buyer_id, buyer_name: o.buyer_name, buyer_avatar: o.buyer_avatar,
      buyer_city: o.buyer_city, amount: Number(o.amount), message: o.message || '',
      status: o.status, created_at: o.created_at,
    }));
  }
  product.seller_stats = await trackRecord(product.seller_id);
  res.json({ product, my_offer: myOffer, ...(offers ? { offers } : {}) });
}));

app.patch('/api/products/:id', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await getOne('SELECT * FROM products WHERE id = ?', [id]);
  if (!row || row.status === 'removed') return err(res, 404, 'Item not found.');
  if (row.seller_id !== req.user.id) return err(res, 403, 'This is not your listing.');
  const b = req.body || {};
  const updates = {};
  if (b.title !== undefined) updates.title = String(b.title).trim();
  if (b.description !== undefined) updates.description = String(b.description).trim();
  if (b.price !== undefined) updates.price = Number(b.price);
  if (b.category !== undefined) updates.category = b.category;
  if (b.condition !== undefined) updates.condition = b.condition;
  if (b.city !== undefined) updates.city = b.city;
  if (b.area !== undefined) updates.area = String(b.area).trim().slice(0, 80);
  if (b.negotiable !== undefined) updates.negotiable = b.negotiable ? 1 : 0;
  if (b.status !== undefined) {
    if (!['active', 'hidden', 'sold'].includes(b.status)) return err(res, 422, 'Invalid status.');
    updates.status = b.status;
  }
  if (b.business_id !== undefined) {
    if (!b.business_id) {
      updates.business_id = null;
    } else {
      const biz = await getOne('SELECT id FROM businesses WHERE id = ? AND owner_id = ? AND status = ?',
        [parseInt(b.business_id, 10) || 0, req.user.id, 'active']);
      if (!biz) return err(res, 422, 'That business is not yours or is not live yet.');
      updates.business_id = biz.id;
    }
  }
  if (Object.keys(updates).length) {
    const probe = { ...row, ...updates };
    const f = validateProductInput(probe);
    if (Object.keys(f).length) return err(res, 422, Object.values(f)[0], f);
    const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    await runWrite(`UPDATE products SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...Object.values(updates), id]);
  }
  if (b.photos !== undefined) {
    const photoErr = await saveProductPhotos(id, Array.isArray(b.photos) ? b.photos : []);
    if (photoErr) return err(res, 422, photoErr, { photos: photoErr });
  }
  res.json({ ok: true, id });
}));

app.delete('/api/products/:id', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await getOne('SELECT * FROM products WHERE id = ?', [id]);
  if (!row || row.status === 'removed') return err(res, 404, 'Item not found.');
  const isOwner = row.seller_id === req.user.id;
  if (!isOwner && !isAdmin(req.user)) return err(res, 403, 'Not authorized.');
  await runWrite("UPDATE products SET status = 'removed', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
  if (!isOwner) logAdmin(req, 'product.remove', 'product', id, row.title);
  res.json({ ok: true, id });
}));

app.post('/api/products/:id/offers', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const product = await getOne('SELECT * FROM products WHERE id = ?', [id]);
  if (!product || product.status === 'removed') return err(res, 404, 'Item not found.');
  if (product.status !== 'active') return err(res, 422, 'This item is not on sale right now.');
  if (product.seller_id === req.user.id) return err(res, 422, 'You cannot make an offer on your own item.');
  if (await blockExists(req.user.id, product.seller_id)) return err(res, 403, 'You cannot contact this seller.');
  const amount = Number((req.body || {}).amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > 10000000) {
    return err(res, 422, 'Enter an offer amount in Kwacha (whole numbers).');
  }
  const message = String((req.body || {}).message || '').trim().slice(0, 500);
  // One live offer per buyer per item: a new offer updates the pending one.
  const existing = await getOne(
    "SELECT id FROM offers WHERE product_id = ? AND buyer_id = ? AND status = 'pending'",
    [id, req.user.id]
  );
  if (existing) {
    await runWrite('UPDATE offers SET amount = ?, message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [amount, message, existing.id]);
    if (product.seller_id !== req.user.id) {
      notifySms(product.seller_id, 'offer', composeSms(
      (n, t) => `Hi, this is Zac, your assistant. ${n} offered K${amount.toLocaleString('en-US')} for your item '${t}'. Open the app to reply: pieceworkzambia.com`,
      req.user.name, product.title
    )).catch(() => {});
      notifyPush(product.seller_id, {
        title: 'PieceWork Zambia',
        body: `${req.user.name} offered K${amount.toLocaleString('en-US')} for your item '${product.title}'.`,
        url: `#/product/${product.id}`,
        tag: `offer-${existing.id}`,
      }).catch(() => {});
    }
    return res.json({ ok: true, id: existing.id, updated: true });
  }
  const info = await runWrite(
    'INSERT INTO offers (product_id, buyer_id, seller_id, amount, message) VALUES (?, ?, ?, ?, ?)',
    [id, req.user.id, product.seller_id, amount, message]
  );
  if (product.seller_id !== req.user.id) {
    notifySms(product.seller_id, 'offer', composeSms(
      (n, t) => `Hi, this is Zac, your assistant. ${n} offered K${amount.toLocaleString('en-US')} for your item '${t}'. Open the app to reply: pieceworkzambia.com`,
      req.user.name, product.title
    )).catch(() => {});
    notifyPush(product.seller_id, {
      title: 'PieceWork Zambia',
      body: `${req.user.name} offered K${amount.toLocaleString('en-US')} for your item '${product.title}'.`,
      url: `#/product/${product.id}`,
      tag: `offer-${insertId(info)}`,
    }).catch(() => {});
  }
  res.status(201).json({ id: insertId(info) });
}));

app.get('/api/products/:id/offers', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const product = await getOne('SELECT * FROM products WHERE id = ?', [id]);
  if (!product) return err(res, 404, 'Item not found.');
  if (product.seller_id === req.user.id) {
    const rows = await getAll(`
      SELECT o.*, u.name AS buyer_name, u.avatar AS buyer_avatar, u.city AS buyer_city
      FROM offers o JOIN users u ON u.id = o.buyer_id
      WHERE o.product_id = ? ORDER BY o.created_at DESC, o.id DESC LIMIT 50
    `, [id]);
    return res.json({ offers: rows.map((o) => ({
      id: o.id, buyer_id: o.buyer_id, buyer_name: o.buyer_name, buyer_avatar: o.buyer_avatar,
      buyer_city: o.buyer_city, amount: Number(o.amount), message: o.message || '',
      status: o.status, created_at: o.created_at,
    })) });
  }
  const rows = await getAll(
    'SELECT id, amount, message, status, created_at FROM offers WHERE product_id = ? AND buyer_id = ? ORDER BY id DESC LIMIT 10',
    [id, req.user.id]
  );
  res.json({ offers: rows.map((o) => ({ id: o.id, amount: Number(o.amount), message: o.message || '', status: o.status, created_at: o.created_at })) });
}));

app.patch('/api/offers/:id', ah(auth), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const offer = await getOne('SELECT * FROM offers WHERE id = ?', [id]);
  if (!offer) return err(res, 404, 'Offer not found.');
  const status = String((req.body || {}).status || '');
  if (offer.seller_id === req.user.id && ['accepted', 'declined'].includes(status)) {
    if (offer.status !== 'pending') return err(res, 422, 'This offer is no longer pending.');
    await runWrite('UPDATE offers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
    return res.json({ ok: true, id, status });
  }
  if (offer.buyer_id === req.user.id && status === 'withdrawn') {
    if (!['pending', 'accepted'].includes(offer.status)) return err(res, 422, 'This offer cannot be withdrawn now.');
    await runWrite("UPDATE offers SET status = 'withdrawn', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
    return res.json({ ok: true, id, status });
  }
  return err(res, 403, 'Not your offer to change.');
}));

app.get('/api/selling/summary', ah(auth), ah(async (req, res) => {
  const me = req.user.id;
  const counts = await getOne(`
    SELECT
      (SELECT COUNT(*) FROM products WHERE seller_id = ? AND status = 'active') AS active,
      (SELECT COUNT(*) FROM products WHERE seller_id = ? AND status = 'sold') AS sold,
      (SELECT COUNT(*) FROM products WHERE seller_id = ? AND status = 'hidden') AS hidden,
      (SELECT COUNT(*) FROM offers WHERE seller_id = ? AND status = 'pending') AS offers_pending,
      (SELECT COUNT(*) FROM offers WHERE buyer_id = ? AND status = 'pending') AS my_offers_pending
  `, [me, me, me, me, me]);
  res.json({
    active: Number(counts.active || 0), sold: Number(counts.sold || 0),
    hidden: Number(counts.hidden || 0), offers_pending: Number(counts.offers_pending || 0),
    my_offers_pending: Number(counts.my_offers_pending || 0),
  });
}));

app.get('/api/selling/offers', ah(auth), ah(async (req, res) => {
  const me = req.user.id;
  const received = await getAll(`
    SELECT o.*, p.title AS product_title, u.name AS buyer_name, u.avatar AS buyer_avatar
    FROM offers o JOIN products p ON p.id = o.product_id JOIN users u ON u.id = o.buyer_id
    WHERE o.seller_id = ? ORDER BY o.created_at DESC, o.id DESC LIMIT 50
  `, [me]);
  const made = await getAll(`
    SELECT o.*, p.title AS product_title, p.status AS product_status, u.name AS seller_name
    FROM offers o JOIN products p ON p.id = o.product_id JOIN users u ON u.id = o.seller_id
    WHERE o.buyer_id = ? ORDER BY o.created_at DESC, o.id DESC LIMIT 50
  `, [me]);
  const mapR = (o) => ({
    id: o.id, product_id: o.product_id, product_title: o.product_title,
    amount: Number(o.amount), message: o.message || '', status: o.status, created_at: o.created_at,
  });
  res.json({
    received: received.map((o) => ({ ...mapR(o), buyer_id: o.buyer_id, buyer_name: o.buyer_name, buyer_avatar: o.buyer_avatar })),
    made: made.map((o) => ({ ...mapR(o), seller_id: o.seller_id, seller_name: o.seller_name, product_status: o.product_status })),
  });
}));

app.post('/api/conversations/product', ah(auth), ah(async (req, res) => {
  const me = req.user.id;
  const pid = parseInt((req.body || {}).product_id, 10);
  if (!pid) return err(res, 422, 'Item is required.');
  const product = await getOne('SELECT id, seller_id, status FROM products WHERE id = ?', [pid]);
  if (!product || product.status === 'removed') return err(res, 404, 'Item not found.');
  if (product.seller_id === me) return err(res, 422, 'This is your own item.');
  if (await blockExists(me, product.seller_id)) return err(res, 403, 'You cannot contact this seller.');
  let conv = await getOne('SELECT id FROM conversations WHERE product_id = ? AND worker_id = ?', [pid, me]);
  if (!conv) {
    const info = await runWrite(
      'INSERT INTO conversations (product_id, poster_id, worker_id) VALUES (?, ?, ?)',
      [pid, product.seller_id, me]
    );
    conv = { id: insertId(info) };
  }
  res.status(201).json({ conversation_id: conv.id });
}));

// Presence: ported from production v52 (Oct 22, 2026) so the 2.0 line
// keeps the feature testers asked for. last_seen_at is touched on
// signed-in activity (throttled to 5 minutes), so "online" means seen
// within the last 6 minutes.
function presenceOf(ts) {
  if (!ts) return { other_last_seen_at: null, other_online: false };
  const t = new Date(String(ts).replace(' ', 'T') + 'Z').getTime();
  return {
    other_last_seen_at: ts,
    other_online: Number.isFinite(t) && (Date.now() - t) < 6 * 60 * 1000,
  };
}

function convSummary(c, meId) {
  const otherIsPoster = c.poster_id === meId;
  return {
    id: c.id, job_id: c.job_id || null, product_id: c.product_id || null,
    kind: c.product_id ? 'product' : 'job',
    job_title: c.job_title || c.product_title || '',
    other_id: otherIsPoster ? c.worker_id : c.poster_id,
    other_name: otherIsPoster ? c.worker_name : c.poster_name,
    other_avatar: otherIsPoster ? c.worker_avatar : c.poster_avatar,
    ...presenceOf(otherIsPoster ? c.poster_last_seen : c.worker_last_seen),
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
    SELECT c.*, j.title AS job_title, pr.title AS product_title,
      p.name AS poster_name, p.avatar AS poster_avatar, p.last_seen_at AS poster_last_seen,
      w.name AS worker_name, w.avatar AS worker_avatar, w.last_seen_at AS worker_last_seen,
      (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
      (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at,
      (SELECT sender_id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_sender,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.read_at IS NULL) AS unread
    FROM conversations c
    LEFT JOIN jobs j ON j.id = c.job_id
    LEFT JOIN products pr ON pr.id = c.product_id
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
  if (await blockExists(job.poster_id, wid)) {
    return err(res, 403, 'Messaging is not available between you and this user.');
  }
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
    SELECT c.*, j.title AS job_title, pr.title AS product_title,
      p.name AS poster_name, p.avatar AS poster_avatar, p.last_seen_at AS poster_last_seen,
      w.name AS worker_name, w.avatar AS worker_avatar, w.last_seen_at AS worker_last_seen,
      CASE WHEN c.product_id IS NOT NULL THEN
             CASE WHEN EXISTS (SELECT 1 FROM offers o
                               WHERE o.product_id = c.product_id AND o.buyer_id = c.worker_id
                                 AND o.seller_id = c.poster_id AND o.status = 'accepted')
                  THEN CASE WHEN c.poster_id = ? THEN w.phone ELSE p.phone END
                  ELSE NULL END
           WHEN EXISTS (SELECT 1 FROM applications a
                        WHERE a.job_id = c.job_id AND a.worker_id = c.worker_id
                          AND a.status = 'accepted')
           THEN CASE WHEN c.poster_id = ? THEN w.phone ELSE p.phone END
           ELSE NULL END AS other_phone
    FROM conversations c
    LEFT JOIN jobs j ON j.id = c.job_id
    LEFT JOIN products pr ON pr.id = c.product_id
    JOIN users p ON p.id = c.poster_id
    JOIN users w ON w.id = c.worker_id
    WHERE c.id = ?
  `, [me, me, cid]);
  if (!conv) return err(res, 404, 'Conversation not found.');
  if (conv.poster_id !== me && conv.worker_id !== me) return err(res, 403, 'Not your conversation.');
  const otherParty = conv.poster_id === me ? conv.worker_id : conv.poster_id;
  if (await blockExists(me, otherParty)) {
    return err(res, 403, 'Messaging is not available between you and this user.');
  }
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
  const otherParty = conv.poster_id === me ? conv.worker_id : conv.poster_id;
  if (await blockExists(me, otherParty)) {
    return err(res, 403, 'Messaging is not available between you and this user.');
  }
  const info = await runWrite(
    'INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)',
    [cid, me, body]
  );
  await runWrite('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [cid]);
  const msg = await getOne('SELECT id, sender_id, body, created_at FROM messages WHERE id = ?', [insertId(info)]);
  res.status(201).json({ message: msg });
}));


// ---------------------------------------------------------------- share previews
// Social apps (WhatsApp, Facebook) do not run the SPA and cannot read hash
// routes, so every shared link used to preview with one static promo image
// (the old hiring artwork). These /s/ pages carry per-item Open Graph tags:
// the shop's own cover or logo, the product's own photo, the member's own
// profile picture, the job's own photo. Real visitors are sent straight on
// to the matching in-app page. Zac, Oct 23, 2026.
const SHARE_ORIGIN = 'https://pieceworkzambia.com';
const BRAND_OG_IMAGE = SHARE_ORIGIN + '/img/og-brand.jpg';
const escHtml = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const excerpt = (v, n) => { const t = String(v || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '...' : t; };

function sharePreviewPage(res, { title, desc, image, target }) {
  const t = escHtml(title); const d = escHtml(desc); const img = escHtml(image); const url = escHtml(target);
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${t}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="PieceWork Zambia">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0; url=${url}">
</head><body style="font-family:sans-serif;background:#101B35;color:#F5F7FB;text-align:center;padding:40px">
<p>${t}</p><p><a href="${url}" style="color:#FFB547">Open on PieceWork Zambia</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`);
}

function genericShare(res, target) {
  return sharePreviewPage(res, {
    title: 'PieceWork Zambia: Quick jobs. Quick cash.',
    desc: 'Find piece work, hire trusted help, buy and sell in the Marketplace, all across Zambia.',
    image: BRAND_OG_IMAGE,
    target,
  });
}

function sendDataImage(res, value) {
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([\s\S]+)$/.exec(String(value || ''));
  if (!m) return err(res, 404, 'No image.');
  res.set('Content-Type', m[1]);
  res.set('Cache-Control', 'public, max-age=86400');
  return res.send(Buffer.from(m[2], 'base64'));
}

// A member's public profile picture (the avatar already shown across the
// app). The verification selfie is never served here.
app.get('/api/users/:id/avatar', ah(async (req, res) => {
  const u = await getOne('SELECT avatar FROM users WHERE id = ?', [req.params.id]);
  if (!u || !u.avatar) return err(res, 404, 'No profile picture.');
  return sendDataImage(res, u.avatar);
}));

// A storefront's own logo or cover, for link previews.
app.get('/api/businesses/:id/image/:kind', ah(async (req, res) => {
  const kind = req.params.kind === 'cover' ? 'cover' : 'logo';
  const b = await getOne(`SELECT ${kind} AS img FROM businesses WHERE id = ?`, [req.params.id]);
  if (!b || !b.img) return err(res, 404, 'No image.');
  return sendDataImage(res, b.img);
}));

app.get('/s/business/:slug', ah(async (req, res) => {
  const b = await getOne('SELECT * FROM businesses WHERE slug = ?', [req.params.slug]);
  if (!b || b.status !== 'active') return genericShare(res, SHARE_ORIGIN + '/#/businesses');
  const image = b.cover
    ? `${SHARE_ORIGIN}/api/businesses/${b.id}/image/cover`
    : (b.logo ? `${SHARE_ORIGIN}/api/businesses/${b.id}/image/logo` : BRAND_OG_IMAGE);
  return sharePreviewPage(res, {
    title: `${b.name} · Storefront on PieceWork Zambia`,
    desc: excerpt(b.tagline || b.description, 180) || `Visit ${b.name} on PieceWork Zambia.`,
    image,
    target: `${SHARE_ORIGIN}/#/business/${encodeURIComponent(b.slug)}`,
  });
}));

app.get('/s/product/:id', ah(async (req, res) => {
  const p = await getOne(`SELECT pr.*, (SELECT ph.id FROM product_photos ph WHERE ph.product_id = pr.id ORDER BY ph.sort, ph.id LIMIT 1) AS cover_photo_id FROM products pr WHERE pr.id = ?`, [req.params.id]);
  if (!p || p.status !== 'active') return genericShare(res, SHARE_ORIGIN + '/#/market');
  return sharePreviewPage(res, {
    title: `${p.title} · K${Number(p.price || 0).toLocaleString('en-US')} on PieceWork Zambia`,
    desc: excerpt(p.description, 180) || `${p.condition || ''} · ${p.city || ''} · See it on PieceWork Zambia.`,
    image: p.cover_photo_id ? `${SHARE_ORIGIN}/api/products/${p.id}/photos/${p.cover_photo_id}` : BRAND_OG_IMAGE,
    target: `${SHARE_ORIGIN}/#/product/${p.id}`,
  });
}));

app.get('/s/user/:id', ah(async (req, res) => {
  const u = await getOne('SELECT id, name, city, avatar, suspended_at FROM users WHERE id = ?', [req.params.id]);
  if (!u || u.suspended_at) return genericShare(res, SHARE_ORIGIN + '/');
  let statsLine = '';
  try {
    const st = await trackRecord(u.id);
    statsLine = ` · ${st.jobs_completed} jobs completed · ${st.items_sold} items sold`;
  } catch { /* stats are a bonus, never block the preview */ }
  return sharePreviewPage(res, {
    title: `${u.name} · PieceWork Zambia`,
    desc: `${u.city || 'Zambia'}${statsLine}. See the profile, ratings and reviews on PieceWork Zambia.`,
    image: u.avatar ? `${SHARE_ORIGIN}/api/users/${u.id}/avatar` : BRAND_OG_IMAGE,
    target: `${SHARE_ORIGIN}/#/user/${u.id}`,
  });
}));

app.get('/s/job/:id', ah(async (req, res) => {
  const j = await getOne(`SELECT jb.*, (SELECT ph.id FROM job_photos ph WHERE ph.job_id = jb.id ORDER BY ph.sort, ph.id LIMIT 1) AS cover_photo_id FROM jobs jb WHERE jb.id = ?`, [req.params.id]);
  if (!j || j.is_draft) return genericShare(res, SHARE_ORIGIN + '/#/jobs');
  return sharePreviewPage(res, {
    title: `${j.title} · ${j.city} on PieceWork Zambia`,
    desc: excerpt(j.description, 180) || `${j.category} piece work in ${j.city}. Apply on PieceWork Zambia.`,
    image: j.cover_photo_id ? `${SHARE_ORIGIN}/api/jobs/${j.id}/photos/${j.cover_photo_id}` : BRAND_OG_IMAGE,
    target: `${SHARE_ORIGIN}/#/job/${j.id}`,
  });
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
  .then(async () => {
    await seedCategories();
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

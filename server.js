'use strict';
/**
 * PieceWork Zambia — Express API + static frontend.
 */
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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
app.use(express.json({ limit: '400kb' }));
app.use(cookieParser());

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
const PAY_TYPES = ['per_job', 'per_hour', 'per_day'];
const JOB_STATUSES = ['open', 'filled', 'completed', 'cancelled'];

// ---------------------------------------------------------------- helpers
const err = (res, code, message, fields) =>
  res.status(code).json(fields ? { error: message, fields } : { error: message });

/**
 * Wrap async route handlers/middleware so rejected promises reach Express 4's
 * error middleware instead of becoming unhandled rejections.
 */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, phone: row.phone, city: row.city,
    bio: row.bio || '', skills: row.skills || '', avatar: row.avatar || '',
    rating_avg: row.rating_avg || 0, rating_count: row.rating_count || 0,
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    created_at: row.created_at,
  };
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
  const { name, phone, password, city } = req.body || {};
  const fields = {};
  if (!name || String(name).trim().length < 2) fields.name = 'Please enter your full name.';
  const normPhone = normalizePhone(phone);
  if (!normPhone) fields.phone = 'Enter a valid phone number, e.g. 0977 123 456.';
  if (!password || String(password).length < 8) fields.password = 'Password must be at least 8 characters.';
  if (!city || !CITIES.includes(city)) fields.city = 'Please choose your city.';
  if (Object.keys(fields).length) return err(res, 422, 'Please fix the highlighted fields.', fields);

  const exists = await getOne('SELECT id FROM users WHERE phone = ?', [normPhone]);
  if (exists) return err(res, 409, 'This number is already registered. Try signing in.');

  const hash = bcrypt.hashSync(String(password), 12);
  const info = await runWrite(
    'INSERT INTO users (name, phone, password_hash, city) VALUES (?, ?, ?, ?)',
    [String(name).trim(), normPhone, hash, city]
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
    whatsapp: j.whatsapp || '', created_at: j.created_at,
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
  if (isPoster) {
    job.applications = await getAll(`
      SELECT a.id, a.message, a.status, a.created_at,
             u.id AS worker_id, u.name AS worker_name, u.city AS worker_city,
             u.rating_avg AS worker_rating, u.rating_count AS worker_rating_count,
             u.phone AS worker_phone, u.avatar AS worker_avatar
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
  const whatsapp = b.whatsapp ? normalizePhone(b.whatsapp) : '';
  const coords = parseLatLng(b);
  const info = await runWrite(`
    INSERT INTO jobs (poster_id, title, category, description, city, area, date_needed,
                      pay_amount, pay_type, workers_needed, whatsapp, lat, lng)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    req.user.id, String(b.title).trim(), b.category, String(b.description).trim(),
    b.city, String(b.area || '').trim(), b.date_needed,
    parseInt(b.pay_amount, 10), b.pay_type, parseInt(b.workers_needed, 10), whatsapp,
    coords ? coords.lat : null, coords ? coords.lng : null,
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
  const editable = ['title', 'description', 'city', 'area', 'date_needed', 'pay_amount', 'pay_type', 'workers_needed', 'whatsapp'];
  const merged = { ...job, ...b };
  const fields = validateJobInput(merged);
  // Only surface errors for fields the poster actually tried to change.
  const relevant = Object.keys(fields).filter(k => k in b);
  if (relevant.length) {
    const rf = {}; relevant.forEach(k => rf[k] = fields[k]);
    return err(res, 422, 'Please fix the highlighted fields.', rf);
  }
  for (const k of editable) {
    if (k in b) {
      let v = b[k];
      if (k === 'pay_amount' || k === 'workers_needed') v = parseInt(v, 10);
      if (k === 'whatsapp') v = v ? normalizePhone(v) : '';
      if (typeof v === 'string') v = v.trim();
      updates.push(`${k} = ?`); params.push(v);
    }
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
    SELECT a.id, a.status AS app_status, a.message, a.created_at AS applied_at,
           j.id AS job_id, j.title, j.city, j.area, j.date_needed, j.pay_amount, j.pay_type,
           j.status AS job_status, j.category,
           u.name AS poster_name
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
    SELECT a.id, a.message, a.status, a.created_at,
           u.id AS worker_id, u.name AS worker_name, u.city AS worker_city,
           u.bio AS worker_bio, u.skills AS worker_skills,
           u.rating_avg AS worker_rating, u.rating_count AS worker_rating_count,
           u.phone AS worker_phone
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

// ---------------------------------------------------------------- users
app.get('/api/users/:id', ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = await getOne('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) return err(res, 404, 'User not found.');
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
  res.json({ user: publicUser(user), completed_jobs: completed, reviews });
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
  if ('avatar' in b) {
    const av = String(b.avatar || '');
    if (av && !/^data:image\/(jpeg|png|webp);base64,/.test(av)) fields.avatar = 'Avatar must be a JPEG, PNG or WebP image.';
    else if (av.length > 300000) fields.avatar = 'That photo is too large. Try a smaller one.';
    else { updates.push('avatar = ?'); params.push(av); }
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

// ---------------------------------------------------------------- frontend
app.use(express.static(path.join(__dirname, 'public'), { maxAge: IS_PROD ? '1h' : 0 }));
// SPA fallback: anything that isn't /api serves index.html.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
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
  })
  .catch((e) => {
    console.error('FATAL: database init failed:', e && e.message ? e.message : e);
    process.exit(1);
  });

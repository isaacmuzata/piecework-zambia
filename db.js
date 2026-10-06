'use strict';
/**
 * Database layer (@libsql/client, async — Turso-compatible).
 * - Production: set TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) to use a Turso cloud
 *   database. Required on Render's free plan, which cannot attach a persistent disk.
 * - Local dev: falls back to a local SQLite file (DB_PATH or data/piecework.db).
 * Schema creation is idempotent: safe to run on every boot.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@libsql/client');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, 'piecework.db');

const client = process.env.TURSO_DATABASE_URL
  ? createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    })
  : createClient({ url: 'file:' + dbPath });

// Single statements only — libsql execute() does not accept multi-statement SQL.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
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
  )`,
  `CREATE TABLE IF NOT EXISTS jobs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    poster_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title          TEXT NOT NULL,
    category       TEXT NOT NULL,
    description    TEXT NOT NULL,
    city           TEXT NOT NULL,
    area           TEXT DEFAULT '',
    date_needed    TEXT NOT NULL,
    pay_amount     INTEGER NOT NULL,
    pay_type       TEXT NOT NULL CHECK (pay_type IN ('per_job', 'per_hour', 'per_day', 'per_month')),
    workers_needed INTEGER NOT NULL DEFAULT 1,
    status         TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'filled', 'completed', 'cancelled')),
    whatsapp       TEXT DEFAULT '',
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS applications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    worker_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message    TEXT DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (job_id, worker_id)
  )`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment     TEXT DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (job_id, reviewer_id, reviewee_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_city ON jobs(city)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category)`,
  `CREATE INDEX IF NOT EXISTS idx_apps_job ON applications(job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_apps_worker ON applications(worker_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id)`,
  // Messaging between posters and workers, scoped to a job application.
  `CREATE TABLE IF NOT EXISTS conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    poster_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    worker_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (job_id, worker_id)
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body            TEXT NOT NULL,
    read_at         TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_conv_poster ON conversations(poster_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_conv_worker ON conversations(worker_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS giveaways (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT NOT NULL,
    prize_kwacha  INTEGER NOT NULL,
    starts_at     TEXT NOT NULL,
    ends_at       TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'active',
    winner_user_id INTEGER NULL REFERENCES users(id),
    drawn_at      TEXT NULL,
    drawn_by      TEXT NULL,
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS giveaway_draws (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    giveaway_id    INTEGER NOT NULL REFERENCES giveaways(id),
    winner_user_id INTEGER NOT NULL REFERENCES users(id),
    total_entries  INTEGER NOT NULL,
    entries_json   TEXT NOT NULL,
    drawn_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    drawn_by       TEXT NOT NULL
  )`,
  // NRC identity docs: worker uploads when hired; visible only to the hiring
  // poster for 10 days, then auto-deleted by the sweeper in server.js.
  `CREATE TABLE IF NOT EXISTS nrc_docs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
    worker_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id         INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    poster_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image          TEXT NOT NULL,
    uploaded_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at     TEXT NOT NULL
  )`,
  // Vouches: a verified member publicly stands behind someone they
  // personally know. One vouch per pair; powers the "Vouched" trust badge.
  `CREATE TABLE IF NOT EXISTS vouches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vouchee_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (voucher_id, vouchee_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_vouches_vouchee ON vouches(vouchee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_vouches_voucher ON vouches(voucher_id)`,
  // Password reset codes (2026-10-05): one active code per user, hashed at
  // rest, single use, short expiry. Delivered by the admin over WhatsApp
  // until an SMS gateway is wired up.
  `CREATE TABLE IF NOT EXISTS password_resets (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash      TEXT NOT NULL,
    expires_at     TEXT NOT NULL,
    used_at        TEXT,
    attempts       INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets(user_id)`,
];

// Distance matching: precise coordinates are optional on users and jobs.
// When absent, the city centre is used as the fallback location.
const OPTIONAL_COLUMNS = [
  ['users', 'lat', 'REAL'],
  ['users', 'lng', 'REAL'],
  ['jobs', 'lat', 'REAL'],
  ['jobs', 'lng', 'REAL'],
  ['users', 'avatar', 'TEXT'],
  ['users', 'open_to_work', 'INTEGER DEFAULT 0'],
  ['users', 'referral_code', 'TEXT'],
  ['users', 'referred_by', 'INTEGER'],
  ['users', 'device_id', 'TEXT'],
  ['users', 'signup_ip', 'TEXT'],
  ['users', 'ip_duplicate', 'INTEGER DEFAULT 0'],
  ['users', 'selfie', 'TEXT'],
  ['users', 'selfie_status', "TEXT DEFAULT 'pending'"],
  ['users', 'terms_accepted_at', 'TEXT'],
  ['users', 'nrc_verified', 'INTEGER DEFAULT 0'],
  ['users', 'intro_video', 'TEXT'],
  ['users', 'orientation_accepted_at', 'TEXT'],
  ['users', 'food_license_image', 'TEXT'],
  ['users', 'food_license_status', "TEXT DEFAULT 'none'"],
  ['users', 'food_license_number', 'TEXT'],
  ['users', 'food_license_expires_at', 'TEXT'],
  ['jobs', 'requires_food_license', 'INTEGER DEFAULT 0'],
  ['nrc_docs', 'nrc_number', 'TEXT'],
];

async function init() {
  // Enforce foreign keys on the connection.
  await client.execute('PRAGMA foreign_keys = ON');
  await client.batch(SCHEMA.map((sql) => ({ sql })));
  for (const [table, column, type] of OPTIONAL_COLUMNS) {
    const cols = (await client.execute(`PRAGMA table_info(${table})`)).rows.map((c) => c.name);
    if (!cols.includes(column)) {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
  // Migration (2026-09-27): allow pay_type='per_month'. SQLite cannot ALTER a
  // CHECK constraint, so rebuild the jobs table when the old constraint is
  // still present. Idempotent: skipped once the new constraint exists.
  const jobsSql = (await client.execute(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'jobs'`
  )).rows[0]?.sql || '';
  if (jobsSql.includes("'per_day'") && !jobsSql.includes("'per_month'")) {
    await client.execute('DROP TABLE IF EXISTS jobs_new');
    await client.execute('PRAGMA foreign_keys = OFF');
    try {
      await client.execute(`CREATE TABLE jobs_new (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        poster_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title          TEXT NOT NULL,
        category       TEXT NOT NULL,
        description    TEXT NOT NULL,
        city           TEXT NOT NULL,
        area           TEXT DEFAULT '',
        date_needed    TEXT NOT NULL,
        pay_amount     INTEGER NOT NULL,
        pay_type       TEXT NOT NULL CHECK (pay_type IN ('per_job', 'per_hour', 'per_day', 'per_month')),
        workers_needed INTEGER NOT NULL DEFAULT 1,
        status         TEXT NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'filled', 'completed', 'cancelled')),
        whatsapp       TEXT DEFAULT '',
        created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        lat            REAL,
        lng            REAL
      )`);
      await client.execute(`INSERT INTO jobs_new
        (id, poster_id, title, category, description, city, area, date_needed,
         pay_amount, pay_type, workers_needed, status, whatsapp, created_at, lat, lng)
        SELECT id, poster_id, title, category, description, city, area, date_needed,
         pay_amount, pay_type, workers_needed, status, whatsapp, created_at, lat, lng
        FROM jobs`);
      await client.execute('DROP TABLE jobs');
      await client.execute('ALTER TABLE jobs_new RENAME TO jobs');
      for (const idx of [
        `CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_jobs_city ON jobs(city)`,
        `CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category)`,
      ]) await client.execute(idx);
    } finally {
      await client.execute('PRAGMA foreign_keys = ON');
    }
  }
  // Data fix (2026-09-27): the two Virtual Assistant jobs were posted with
  // pay_type='per_job' but their descriptions say "K6,000 per month".
  // Idempotent: only touches jobs whose text still says per month.
  await client.execute(
    `UPDATE jobs SET pay_type = 'per_month'
     WHERE pay_type = 'per_job' AND description LIKE '%per month%'`
  );
  // Migration (2026-10-01): referral codes for the giveaway system.
  // Backfill a unique 6-char code for every user that lacks one.
  // Idempotent: skipped once all users have codes.
  const missing = await client.execute(`SELECT id FROM users WHERE referral_code IS NULL`);
  if (missing.rows.length) {
    const used = new Set(
      (await client.execute(`SELECT referral_code AS c FROM users WHERE referral_code IS NOT NULL`))
        .rows.map((r) => r.c)
    );
    const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const gen = () =>
      Array.from(crypto.randomBytes(6), (b) => ALPH[b % ALPH.length]).join('');
    for (const row of missing.rows) {
      let code = gen();
      while (used.has(code)) code = gen();
      used.add(code);
      await client.execute(`UPDATE users SET referral_code = ? WHERE id = ?`, [code, row.id]);
    }
  }
  await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by)`);
}

module.exports = { client, init };

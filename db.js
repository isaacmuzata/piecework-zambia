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
];

// Distance matching: precise coordinates are optional on users and jobs.
// When absent, the city centre is used as the fallback location.
const OPTIONAL_COLUMNS = [
  ['users', 'lat', 'REAL'],
  ['users', 'lng', 'REAL'],
  ['jobs', 'lat', 'REAL'],
  ['jobs', 'lng', 'REAL'],
  ['users', 'avatar', 'TEXT'],
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
}

module.exports = { client, init };

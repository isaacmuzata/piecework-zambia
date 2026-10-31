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
               CHECK (status IN ('pending', 'shortlisted', 'accepted', 'declined', 'withdrawn')),
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
    job_id     INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    poster_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    worker_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (job_id, worker_id),
    UNIQUE (product_id, worker_id)
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
  `CREATE TABLE IF NOT EXISTS activity_days (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day     TEXT NOT NULL,
    PRIMARY KEY (user_id, day)
  )`,
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
  // 2.0 M0 foundations: moderation, blocking, audit, managed categories.
  `CREATE TABLE IF NOT EXISTS reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    target_id   INTEGER NOT NULL,
    reason      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'open',
    admin_note  TEXT DEFAULT '',
    resolved_by INTEGER,
    resolved_at TEXT,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS blocks (
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (blocker_id, blocked_id)
  )`,
  `CREATE TABLE IF NOT EXISTS admin_audit (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id    INTEGER NOT NULL,
    action      TEXT NOT NULL,
    target_type TEXT DEFAULT '',
    target_id   INTEGER,
    detail      TEXT DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'job',
    active     INTEGER NOT NULL DEFAULT 1,
    sort       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name, kind)
  )`,
  // 2.0 M1: job photos. Stored as data URIs like the other images, but
  // served through a dedicated endpoint so list payloads stay light.
  `CREATE TABLE IF NOT EXISTS job_photos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    image      TEXT NOT NULL,
    mime       TEXT NOT NULL DEFAULT 'image/jpeg',
    sort       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // 2.0 M3: marketplace. Products are sold peer to peer; PieceWork never
  // handles the money. Photos mirror job_photos (data URIs, served via a
  // dedicated endpoint). Offers are proposals, not payments.
  `CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price       INTEGER NOT NULL DEFAULT 0,
    category    TEXT NOT NULL,
    condition   TEXT NOT NULL DEFAULT 'Good'
                CHECK (condition IN ('New', 'Like new', 'Good', 'Fair')),
    city        TEXT NOT NULL,
    area        TEXT DEFAULT '',
    lat         REAL,
    lng         REAL,
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'sold', 'hidden', 'removed')),
    view_count  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS product_photos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image      TEXT NOT NULL,
    mime       TEXT NOT NULL DEFAULT 'image/jpeg',
    sort       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS offers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    buyer_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount     INTEGER NOT NULL,
    message    TEXT DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // 2.0 M4: business storefronts. A business applies, an admin
  // approves it live, and the Verified badge is earned separately by
  // uploading registration documents (PACRA, TPIN, trading licence)
  // that an admin reviews. Until then the storefront is labelled
  // Unverified, it is never hidden for lacking documents.
  `CREATE TABLE IF NOT EXISTS businesses (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    slug                TEXT NOT NULL UNIQUE,
    tagline             TEXT DEFAULT '',
    description         TEXT DEFAULT '',
    logo                TEXT,
    cover               TEXT,
    category            TEXT NOT NULL DEFAULT 'Other',
    city                TEXT NOT NULL,
    area                TEXT DEFAULT '',
    address             TEXT DEFAULT '',
    phone               TEXT DEFAULT '',
    whatsapp            TEXT DEFAULT '',
    email               TEXT DEFAULT '',
    hours_text          TEXT DEFAULT '',
    lat                 REAL,
    lng                 REAL,
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'active', 'rejected', 'suspended')),
    verification_status TEXT NOT NULL DEFAULT 'unverified'
                        CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
    verification_note   TEXT DEFAULT '',
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS business_documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL DEFAULT 'other'
                CHECK (kind IN ('pacra', 'tpin', 'licence', 'other')),
    image       TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS business_follows (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (business_id, follower_id)
  )`,
  // NRC access log: every successful view of an NRC photo is recorded.
  // No foreign keys on purpose: the log must survive the document itself,
  // which is deleted 10 days after upload.
  `CREATE TABLE IF NOT EXISTS nrc_views (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    worker_id      INTEGER NOT NULL,
    viewer_id      INTEGER NOT NULL,
    viewed_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  // Delivery tracking: when a delivery worker collects the parcel they start
  // sharing live GPS; the poster watches it until marked delivered. Coords are
  // cleared on completion — no location history is kept.
  `CREATE TABLE IF NOT EXISTS delivery_tracking (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id      INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    worker_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    poster_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'active',
    lat         REAL,
    lng         REAL,
    updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
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
  // Signup phone verification (v97): registration is stored here first and
  // only becomes a users row after the code texted to the phone is redeemed.
  // The code itself is sha256-hashed, single use, short-lived and limited to
  // five attempts, mirroring password_resets. One pending signup per phone;
  // starting again for the same phone overwrites the previous attempt.
  `CREATE TABLE IF NOT EXISTS pending_registrations (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pending_registrations_phone ON pending_registrations(phone)`,
  // SMS notification log (2026-10-23): every event notification attempt is
  // recorded. 'skipped' when no Africa's Talking creds are configured,
  // 'sent'/'failed' from the provider result when they are.
  `CREATE TABLE IF NOT EXISTS sms_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    phone      TEXT,
    kind       TEXT NOT NULL,
    body       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'skipped',
    error      TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sms_log_user ON sms_log(user_id)`,
  // Web Push subscriptions (2026-10-23): one row per browser endpoint.
  // An endpoint belongs to whoever subscribed it most recently (shared
  // devices), so subscribing upserts by endpoint. Stale endpoints are
  // pruned by the sender when the push service answers 404/410.
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint     TEXT NOT NULL UNIQUE,
    p256dh       TEXT NOT NULL,
    auth         TEXT NOT NULL,
    user_agent   TEXT DEFAULT '',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)`,
  // Ads banner (2026-10-23): owners promote a product, job or storefront
  // into the rotating Home/Marketplace banner. Free during the growth
  // phase; is_paid/amount are recorded from day one so paid placements
  // (switch-on around 2027-01-23) need no schema change.
  `CREATE TABLE IF NOT EXISTS ads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL CHECK (kind IN ('product', 'job', 'business')),
    ref_id     INTEGER NOT NULL,
    status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
    is_paid    INTEGER NOT NULL DEFAULT 0,
    amount     INTEGER NOT NULL DEFAULT 0,
    starts_at  TEXT NOT NULL DEFAULT (datetime('now')),
    ends_at    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ads_status_ends ON ads(status, ends_at)`,
  `CREATE INDEX IF NOT EXISTS idx_ads_owner ON ads(owner_id)`,
  // Support hub (2026-10-29): tickets, live chat queue and the FAQ bot's
  // unanswered-question log. Guests are phone-identified (PieceWork
  // accounts are phone-based, no email is collected), so user_id is
  // nullable and guest_name/guest_phone carry the contact instead.
  `CREATE TABLE IF NOT EXISTS support_tickets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    guest_name  TEXT NOT NULL DEFAULT '',
    guest_phone TEXT NOT NULL DEFAULT '',
    category    TEXT NOT NULL DEFAULT 'Other',
    subject     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id)`,
  `CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id  INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender     TEXT NOT NULL CHECK (sender IN ('member', 'admin')),
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_support_ticket_msgs ON support_ticket_messages(ticket_id, id)`,
  `CREATE TABLE IF NOT EXISTS support_chats (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    guest_name  TEXT NOT NULL DEFAULT '',
    guest_phone TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'ended')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    started_at  TEXT,
    ended_at    TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_support_chats_status ON support_chats(status, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_support_chats_user ON support_chats(user_id)`,
  `CREATE TABLE IF NOT EXISTS support_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id    INTEGER NOT NULL REFERENCES support_chats(id) ON DELETE CASCADE,
    sender     TEXT NOT NULL CHECK (sender IN ('user', 'admin', 'system')),
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_support_msgs ON support_messages(chat_id, id)`,
  // Single-row presence flag for live chat: admins heartbeat while the
  // support console is open; "online" also needs a fresh heartbeat.
  `CREATE TABLE IF NOT EXISTS support_presence (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    online     INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS bot_questions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    question   TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
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
  ['applications', 'arrived_at', 'TEXT'],
  ['applications', 'arrival_confirmed_at', 'TEXT'],
  ['users', 'device_id', 'TEXT'],
  ['users', 'selfie_resubmitted_at', 'TEXT'],
  ['businesses', 'pacra_number', 'TEXT'],
  ['businesses', 'tpin', 'TEXT'],
  ['businesses', 'owner_legal_name', 'TEXT'],
  ['users', 'signup_ip', 'TEXT'],
  ['users', 'ip_duplicate', 'INTEGER DEFAULT 0'],
  ['users', 'selfie', 'TEXT'],
  ['users', 'selfie_status', "TEXT DEFAULT 'pending'"],
  ['users', 'terms_accepted_at', 'TEXT'],
  ['users', 'nrc_verified', 'INTEGER DEFAULT 0'],
  ['users', 'intro_video', 'TEXT'],
  ['users', 'orientation_accepted_at', 'TEXT'],
  ['users', 'last_seen_at', 'TEXT'],
  ['users', 'is_tester', 'INTEGER DEFAULT 0'],
  ['users', 'suspended_at', 'TEXT'],
  ['users', 'deactivated_at', 'TEXT'],
  ['users', 'suspension_reason', 'TEXT'],
  ['users', 'food_license_image', 'TEXT'],
  ['users', 'food_license_status', "TEXT DEFAULT 'none'"],
  ['users', 'food_license_number', 'TEXT'],
  ['users', 'food_license_expires_at', 'TEXT'],
  ['jobs', 'requires_food_license', 'INTEGER DEFAULT 0'],
  ['products', 'business_id', 'INTEGER'],
  ['products', 'negotiable', 'INTEGER NOT NULL DEFAULT 0'],
  ['jobs', 'is_draft', 'INTEGER DEFAULT 0'],
  ['jobs', 'expected_duration', "TEXT DEFAULT ''"],
  ['jobs', 'start_time', "TEXT DEFAULT ''"],
  ['jobs', 'transport_provided', 'INTEGER DEFAULT 0'],
  ['jobs', 'materials_provided', 'INTEGER DEFAULT 0'],
  ['jobs', 'instructions', "TEXT DEFAULT ''"],
  ['jobs', 'is_urgent', 'INTEGER DEFAULT 0'],
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
  // Migration (2.0 M3, 2026-10-22): categories uniqueness becomes
  // per-kind, so a name like "Other" can exist for both jobs and the
  // marketplace. Nothing references categories by id, so the rebuild
  // is safe. Idempotent: skipped once the composite constraint exists.
  const catSql = (await client.execute(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'categories'`
  )).rows[0]?.sql || '';
  if (catSql && !catSql.includes('UNIQUE (name, kind)')) {
    await client.execute('DROP TABLE IF EXISTS categories_new');
    await client.execute('PRAGMA foreign_keys = OFF');
    try {
      await client.execute(`CREATE TABLE categories_new (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        kind       TEXT NOT NULL DEFAULT 'job',
        active     INTEGER NOT NULL DEFAULT 1,
        sort       INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (name, kind)
      )`);
      await client.execute(`INSERT OR IGNORE INTO categories_new
        (id, name, kind, active, sort, created_at)
        SELECT id, name, kind, active, sort, created_at FROM categories`);
      await client.execute('DROP TABLE categories');
      await client.execute('ALTER TABLE categories_new RENAME TO categories');
    } finally {
      await client.execute('PRAGMA foreign_keys = ON');
    }
  }
  // Migration (2.0 M3, 2026-10-22): conversations gain product threads.
  // job_id becomes nullable and product_id is added, so one chat stack
  // serves job chats and marketplace chats. Same rebuild pattern as the
  // applications migration below. Idempotent: skipped once product_id
  // exists in the table definition.
  const convSql = (await client.execute(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'conversations'`
  )).rows[0]?.sql || '';
  if (convSql && !convSql.includes('product_id')) {
    await client.execute('DROP TABLE IF EXISTS conversations_new');
    await client.execute('PRAGMA foreign_keys = OFF');
    try {
      await client.execute(`CREATE TABLE conversations_new (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id     INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        poster_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        worker_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (job_id, worker_id),
        UNIQUE (product_id, worker_id)
      )`);
      await client.execute(`INSERT INTO conversations_new
        (id, job_id, poster_id, worker_id, created_at, updated_at)
        SELECT id, job_id, poster_id, worker_id, created_at, updated_at
        FROM conversations`);
      await client.execute('DROP TABLE conversations');
      await client.execute('ALTER TABLE conversations_new RENAME TO conversations');
    } finally {
      await client.execute('PRAGMA foreign_keys = ON');
    }
  }
  // Migration (2.0 M1, 2026-10-22): allow applications.status='shortlisted'.
  // Same table-rebuild pattern as the jobs pay_type migration above:
  // SQLite cannot ALTER a CHECK constraint. Idempotent: skipped once the
  // new constraint exists. Includes the OPTIONAL_COLUMNS added earlier in
  // init (arrived_at, arrival_confirmed_at) so no data is lost.
  const appsSql = (await client.execute(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'applications'`
  )).rows[0]?.sql || '';
  if (appsSql && !appsSql.includes("'shortlisted'")) {
    await client.execute('DROP TABLE IF EXISTS applications_new');
    await client.execute('PRAGMA foreign_keys = OFF');
    try {
      await client.execute(`CREATE TABLE applications_new (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        worker_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message    TEXT DEFAULT '',
        status     TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'shortlisted', 'accepted', 'declined', 'withdrawn')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        arrived_at TEXT,
        arrival_confirmed_at TEXT,
        UNIQUE (job_id, worker_id)
      )`);
      await client.execute(`INSERT INTO applications_new
        (id, job_id, worker_id, message, status, created_at, arrived_at, arrival_confirmed_at)
        SELECT id, job_id, worker_id, message, status, created_at, arrived_at, arrival_confirmed_at
        FROM applications`);
      await client.execute('DROP TABLE applications');
      await client.execute('ALTER TABLE applications_new RENAME TO applications');
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

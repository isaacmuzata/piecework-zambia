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
    email         TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0,
    email_verify_token_hash TEXT,
    email_verify_expires TEXT,
    reset_token_hash TEXT,
    reset_token_expires TEXT,
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
  // 2.0 M3: marketplace. Products are sold peer to peer; 2911 Jobs never
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
    email          TEXT DEFAULT '',
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
  // unanswered-question log. Guests are phone-identified (2911 Jobs
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
  // 2911 Experiences Phase 2 (2026-11-08): location system, categories,
  // listing data model. Additive only, FK-ordered (DB Design 6.2 steps
  // 1, 4, 5, 6). Phase 3 tables (experience_hosts, experience_businesses,
  // verifications) are created below, after the Phase 2 tables.
  // NOTE on experience_listings.host_id (Phase 3, 2026-11-08): it now
  // carries REFERENCES experience_hosts(id) ON DELETE CASCADE. In Phase 2
  // it was a plain INTEGER with no REFERENCES clause because the parent
  // table did not exist yet. Existing Phase 2 databases are migrated by
  // the experience_listings rebuild in init() below (idempotent guard:
  // skipped once approval_status exists on the table).
  `CREATE TABLE IF NOT EXISTS experience_categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('stay', 'transport', 'tour', 'event', 'experience')),
    active     INTEGER NOT NULL DEFAULT 1,
    sort       INTEGER NOT NULL DEFAULT 0,
    icon       TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name, kind)
  )`,
  `CREATE TABLE IF NOT EXISTS experience_locations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id  INTEGER REFERENCES experience_locations(id) ON DELETE CASCADE,
    level      TEXT NOT NULL CHECK (level IN ('country', 'province', 'district', 'town', 'area')),
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL,
    lat        REAL,
    lng        REAL,
    active     INTEGER NOT NULL DEFAULT 1,
    sort       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (parent_id, slug)
  )`,
  `CREATE TABLE IF NOT EXISTS experience_listings (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_type   TEXT NOT NULL CHECK (listing_type IN ('stay', 'vehicle', 'tour', 'event', 'experience')),
    category_id    INTEGER REFERENCES experience_categories(id) ON DELETE SET NULL,
    host_id        INTEGER REFERENCES experience_hosts(id) ON DELETE CASCADE,
    business_id    INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    location_id    INTEGER REFERENCES experience_locations(id) ON DELETE SET NULL,
    title          TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    city           TEXT NOT NULL,
    area           TEXT DEFAULT '',
    address        TEXT DEFAULT '',
    lat            REAL,
    lng            REAL,
    price_from     INTEGER NOT NULL DEFAULT 0,
    currency       TEXT NOT NULL DEFAULT 'ZMW',
    status         TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'active', 'paused', 'removed', 'suspended')),
    view_count     INTEGER NOT NULL DEFAULT 0,
    price_unit     TEXT NOT NULL DEFAULT 'per_person'
                   CHECK (price_unit IN ('per_person', 'per_group', 'per_night', 'per_day', 'per_hour', 'per_trip', 'per_event', 'quote')),
    capacity_max   INTEGER NOT NULL DEFAULT 1,
    instant_book   INTEGER NOT NULL DEFAULT 0,
    cancellation_policy TEXT NOT NULL DEFAULT 'Flexible'
                   CHECK (cancellation_policy IN ('Flexible', 'Moderate', 'Strict', 'Event')),
    inclusions     TEXT DEFAULT '',
    exclusions     TEXT DEFAULT '',
    safety_requirements TEXT DEFAULT '',
    approval_status TEXT NOT NULL DEFAULT 'draft'
                   CHECK (approval_status IN ('draft', 'submitted', 'under_review', 'additional_info', 'approved', 'rejected')),
    approval_note  TEXT DEFAULT '',
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((host_id IS NULL) != (business_id IS NULL))
  )`,
  `CREATE TABLE IF NOT EXISTS experience_listing_media (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL REFERENCES experience_listings(id) ON DELETE CASCADE,
    image      TEXT NOT NULL,
    mime       TEXT NOT NULL DEFAULT 'image/jpeg',
    sort       INTEGER NOT NULL DEFAULT 0,
    caption    TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS experience_properties (
    listing_id     INTEGER PRIMARY KEY REFERENCES experience_listings(id) ON DELETE CASCADE,
    property_type  TEXT NOT NULL CHECK (property_type IN ('hotel', 'lodge', 'guesthouse', 'homestay', 'campsite', 'apartment')),
    star_rating    INTEGER CHECK (star_rating BETWEEN 1 AND 5),
    check_in_time  TEXT DEFAULT '',
    check_out_time TEXT DEFAULT '',
    max_guests     INTEGER NOT NULL DEFAULT 2,
    bedrooms       INTEGER DEFAULT 0,
    bathrooms      INTEGER DEFAULT 0,
    amenities      TEXT DEFAULT '',
    house_rules    TEXT DEFAULT '',
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS experience_vehicles (
    listing_id       INTEGER PRIMARY KEY REFERENCES experience_listings(id) ON DELETE CASCADE,
    vehicle_type     TEXT NOT NULL CHECK (vehicle_type IN ('sedan', 'suv', 'minibus', 'bus', 'truck', 'motorbike', 'other')),
    make             TEXT DEFAULT '',
    model            TEXT DEFAULT '',
    year             INTEGER,
    seats            INTEGER NOT NULL DEFAULT 4,
    transmission     TEXT DEFAULT '' CHECK (transmission IN ('', 'manual', 'automatic')),
    fuel             TEXT DEFAULT '' CHECK (fuel IN ('', 'petrol', 'diesel', 'electric', 'hybrid')),
    driver_included  INTEGER NOT NULL DEFAULT 0,
    price_per_day    INTEGER NOT NULL,
    created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS experience_tours (
    listing_id      INTEGER PRIMARY KEY REFERENCES experience_listings(id) ON DELETE CASCADE,
    duration_hours  REAL,
    duration_days   INTEGER DEFAULT 0,
    group_size_max  INTEGER NOT NULL DEFAULT 10,
    group_size_min  INTEGER NOT NULL DEFAULT 1,
    meeting_point   TEXT DEFAULT '',
    meeting_lat     REAL,
    meeting_lng     REAL,
    itinerary       TEXT DEFAULT '',
    included        TEXT DEFAULT '',
    excluded        TEXT DEFAULT '',
    price_per_person INTEGER NOT NULL,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS experience_events (
    listing_id      INTEGER PRIMARY KEY REFERENCES experience_listings(id) ON DELETE CASCADE,
    venue_name      TEXT DEFAULT '',
    event_date      TEXT NOT NULL,
    doors_time      TEXT DEFAULT '',
    ends_at         TEXT,
    ticket_capacity INTEGER NOT NULL DEFAULT 0,
    age_limit       INTEGER,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS experience_property_units (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id     INTEGER NOT NULL REFERENCES experience_properties(listing_id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    unit_type       TEXT NOT NULL CHECK (unit_type IN ('room', 'bed', 'tent', 'house', 'dorm_bed')),
    sleeps          INTEGER NOT NULL DEFAULT 1,
    quantity        INTEGER NOT NULL DEFAULT 1,
    price_per_night INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'removed')),
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // 2911 Experiences Phase 3 (2026-11-08): host onboarding, verification,
  // listing creation (DB Design 2.1, Implementation Plan Phase 3).
  // FK-ordered: hosts and businesses first, then staff, then
  // verifications, then document views. Additive only, except for the
  // experience_listings rebuild in init() below.
  // DEVIATION (experience_hosts.status): DB Design 2.1 said
  // pending/active/suspended. The seven-status vocabulary below (draft,
  // submitted, under_review, additional_info, approved, rejected,
  // suspended) is used instead, per UI Spec 6.2, because the Phase 3
  // acceptance criteria require the host to see each of the seven
  // statuses with the admin note verbatim.
  // BUILD ADDITIONS (experience_hosts): payout_method, payout_reference,
  // languages, response_time, meeting_point, provinces. DB Design 2.1
  // had no payout store on hosts and no wizard fields; UI Spec wizard
  // steps 2, 3 and 6 require them. payout_method/payout_reference mirror
  // the experience_businesses payout columns.
  `CREATE TABLE IF NOT EXISTS experience_hosts (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    display_name       TEXT NOT NULL,
    bio                TEXT DEFAULT '',
    languages          TEXT DEFAULT '[]',
    response_time      TEXT DEFAULT '',
    phone_public       TEXT DEFAULT '',
    city               TEXT NOT NULL,
    area               TEXT DEFAULT '',
    meeting_point      TEXT DEFAULT '',
    provinces          TEXT DEFAULT '[]',
    lat                REAL,
    lng                REAL,
    payout_method      TEXT DEFAULT '' CHECK (payout_method IN ('', 'mobile_money', 'bank')),
    payout_reference   TEXT DEFAULT '',
    status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'submitted', 'under_review', 'additional_info', 'approved', 'rejected', 'suspended')),
    verification_status TEXT NOT NULL DEFAULT 'unverified'
                       CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
    verification_note  TEXT DEFAULT '',
    created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS experience_businesses (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id               INTEGER NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
    commission_rate_override  INTEGER CHECK (commission_rate_override IS NULL OR (commission_rate_override BETWEEN 0 AND 100)),
    payout_method             TEXT DEFAULT '' CHECK (payout_method IN ('', 'mobile_money', 'bank')),
    payout_reference          TEXT DEFAULT '',
    experiences_status        TEXT NOT NULL DEFAULT 'active' CHECK (experiences_status IN ('active', 'paused', 'suspended')),
    created_at                TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // DEVIATIONS (experience_business_staff): role set is manager/staff
  // per DB Design 2.1. The Architecture 2.3 owner/manager/agent/viewer
  // set plus scope column is NOT built: the table is Experiences-only
  // so it is tourism-scoped by definition; flag for Zac's confirmation.
  // 'invited' status added (DB Design had active/revoked only) to
  // support the invite-and-accept flow UI Spec 7.2.7 requires.
  `CREATE TABLE IF NOT EXISTS experience_business_staff (
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('manager', 'staff')),
    invited_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status      TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'revoked')),
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (business_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS experience_host_verifications (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id      INTEGER REFERENCES experience_hosts(id) ON DELETE CASCADE,
    business_id  INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    submitted_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL CHECK (kind IN ('nrc', 'passport', 'drivers_licence', 'tourism_licence', 'selfie', 'other')),
    image        TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    review_note  TEXT DEFAULT '',
    expires_at   TEXT,
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((host_id IS NULL) != (business_id IS NULL))
  )`,
  // DB Design 4.3: verification document reads must be logged, same
  // spirit as nrc_views. Unlike nrc_views (deliberately FK-free so the
  // log survives deletion), this log references the document with
  // ON DELETE CASCADE: a verification document deleted by admin takes
  // its view log with it, so no orphan view rows point at documents
  // that no longer exist.
  `CREATE TABLE IF NOT EXISTS experience_document_views (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES experience_host_verifications(id) ON DELETE CASCADE,
    viewer_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    viewed_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_exp_hosts_status_verification ON experience_hosts(status, verification_status)`,
  `CREATE INDEX IF NOT EXISTS idx_exp_staff_business ON experience_business_staff(business_id)`,
  `CREATE INDEX IF NOT EXISTS idx_exp_verifications_host ON experience_host_verifications(host_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_exp_verifications_business ON experience_host_verifications(business_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_exp_doc_views_doc ON experience_document_views(document_id)`,
  `CREATE INDEX IF NOT EXISTS idx_exp_categories_kind_sort ON experience_categories(kind, sort)`,
  `CREATE INDEX IF NOT EXISTS idx_exp_locations_parent_sort ON experience_locations(parent_id, sort)`,
  `CREATE INDEX IF NOT EXISTS idx_exp_locations_active_name ON experience_locations(active, name)`,
  `CREATE INDEX IF NOT EXISTS idx_exp_listings_status_type_created ON experience_listings(status, listing_type, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_exp_listings_location_status ON experience_listings(location_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_exp_listings_category_status ON experience_listings(category_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_exp_listings_city_status ON experience_listings(city, status)`,
  `CREATE INDEX IF NOT EXISTS idx_exp_listings_host_status ON experience_listings(host_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_exp_listings_business_status ON experience_listings(business_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_exp_listings_lat_lng ON experience_listings(lat, lng)`,
  `CREATE INDEX IF NOT EXISTS idx_exp_media_listing_sort ON experience_listing_media(listing_id, sort, id)`,
  `CREATE INDEX IF NOT EXISTS idx_exp_units_property_status ON experience_property_units(property_id, status)`,
  // 2911 Hustle ("What's Your Hustle?" K10,000 Business Challenge, Phase 1,
  // 2026-11-13): 12 new hustle_ tables + hustle_announcements (Database
  // Design sections 1-13, migration order 14.2). Additive only; FK-ordered.
  // Business representatives: Hustle-scoped, NOT experience_business_staff
  // (that table is tourism-scoped; reusing it would grant Experiences
  // powers). One active rep per business at launch (enforced in code).
  `CREATE TABLE IF NOT EXISTS hustle_business_reps (
    business_id   INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role          TEXT NOT NULL DEFAULT 'representative'
                  CHECK (role IN ('representative', 'manager')),
    invited_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status        TEXT NOT NULL DEFAULT 'invited'
                  CHECK (status IN ('invited', 'active', 'revoked')),
    invited_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at   TEXT,
    revoked_at    TEXT,
    revoked_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (business_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_reps_user ON hustle_business_reps(user_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_reps_business ON hustle_business_reps(business_id, status)`,
  // Who opened a PACRA/verification document (mirrors experience_document_views).
  `CREATE TABLE IF NOT EXISTS hustle_document_views (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES business_documents(id) ON DELETE CASCADE,
    viewer_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    viewed_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_doc_views_doc ON hustle_document_views(document_id, viewed_at)`,
  // Competitions: generic container, one row per contest. Dates are UTC
  // TEXT; status is the source of truth for what is open right now.
  // No winner columns here: the winner lives in hustle_results.
  `CREATE TABLE IF NOT EXISTS hustle_competitions (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    name                  TEXT NOT NULL,
    slug                  TEXT NOT NULL UNIQUE,
    tagline               TEXT DEFAULT '',
    description           TEXT NOT NULL DEFAULT '',
    rules_text            TEXT NOT NULL DEFAULT '',
    prize_kwacha          INTEGER NOT NULL DEFAULT 10000,
    prize_currency        TEXT NOT NULL DEFAULT 'ZMW',
    eligibility_json      TEXT NOT NULL DEFAULT '{}',
    applications_open_at  TEXT,
    applications_close_at TEXT,
    voting_open_at        TEXT,
    voting_close_at       TEXT,
    freeze_at             TEXT,
    winner_at             TEXT,
    status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'applications_open', 'applications_closed',
                                           'voting_open', 'voting_closed', 'frozen',
                                           'winner_announced', 'archived')),
    created_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_competitions_status ON hustle_competitions(status, voting_open_at)`,
  // One application per business per competition (UNIQUE). The 10
  // questions live as JSON; the K10,000 breakdown as child rows.
  `CREATE TABLE IF NOT EXISTS hustle_applications (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id    INTEGER NOT NULL REFERENCES hustle_competitions(id) ON DELETE CASCADE,
    business_id       INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    submitted_by      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    answers_json      TEXT NOT NULL DEFAULT '{}',
    questions_version INTEGER NOT NULL DEFAULT 1,
    pitch_summary     TEXT NOT NULL DEFAULT '',
    status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'submitted', 'under_review', 'changes_requested',
                                       'approved', 'rejected', 'disqualified', 'withdrawn')),
    reviewed_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at       TEXT,
    review_note       TEXT DEFAULT '',
    disqualified_reason TEXT DEFAULT '',
    submitted_at      TEXT,
    approved_at       TEXT,
    withdrawn_at      TEXT,
    created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // One LIVE entry per business: a withdrawn or rejected application does
  // not block a fresh one (the UI offers "Apply again" after a rejection,
  // and deleting a draft must not lock the business out). The partial
  // index, not a table UNIQUE, is what enforces this.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_hustle_apps_one_live ON hustle_applications(competition_id, business_id) WHERE status NOT IN ('withdrawn', 'rejected')`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_apps_competition ON hustle_applications(competition_id, status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_apps_business ON hustle_applications(business_id, competition_id)`,
  `CREATE TABLE IF NOT EXISTS hustle_spend_items (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES hustle_applications(id) ON DELETE CASCADE,
    label          TEXT NOT NULL,
    amount         INTEGER NOT NULL,
    note           TEXT DEFAULT '',
    sort           INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_spend_app ON hustle_spend_items(application_id, sort, id)`,
  // Pitch photos: base64 in Turso like product_photos, max 5 per
  // application. Video is a social media LINK only, never bytes, never
  // a duration/size (Database Design section 7).
  `CREATE TABLE IF NOT EXISTS hustle_pitch_photos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES hustle_applications(id) ON DELETE CASCADE,
    image          TEXT NOT NULL,
    mime           TEXT NOT NULL DEFAULT 'image/jpeg',
    sort           INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_pitch_photos_app ON hustle_pitch_photos(application_id, sort, id)`,
  `CREATE TABLE IF NOT EXISTS hustle_pitch_videos (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id   INTEGER NOT NULL UNIQUE REFERENCES hustle_applications(id) ON DELETE CASCADE,
    video_url        TEXT NOT NULL,
    video_platform   TEXT NOT NULL
                     CHECK (video_platform IN ('facebook', 'tiktok', 'youtube', 'instagram')),
    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected', 'changes_requested')),
    reviewed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at      TEXT,
    review_note      TEXT DEFAULT '',
    uploaded_by      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // Votes: one per voter per competition (UNIQUE). No counter column
  // anywhere: counts are always COUNT(*) on read.
  `CREATE TABLE IF NOT EXISTS hustle_votes (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id              INTEGER NOT NULL REFERENCES hustle_competitions(id) ON DELETE CASCADE,
    application_id              INTEGER NOT NULL REFERENCES hustle_applications(id) ON DELETE CASCADE,
    business_id                 INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    voter_id                    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    voter_selfie_status_at_vote TEXT NOT NULL,
    ip_hash                     TEXT NOT NULL DEFAULT '',
    device_fingerprint          TEXT NOT NULL DEFAULT '',
    after_freeze                INTEGER NOT NULL DEFAULT 0,
    is_valid                    INTEGER NOT NULL DEFAULT 1,
    invalidated_by              INTEGER REFERENCES users(id) ON DELETE SET NULL,
    invalidated_at              TEXT,
    invalidation_reason         TEXT DEFAULT '',
    created_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (voter_id, competition_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_votes_competition ON hustle_votes(competition_id, application_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_votes_application ON hustle_votes(application_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_votes_voter ON hustle_votes(voter_id, created_at DESC)`,
  // Fraud flags: a review record, never an auto-invalidation. vote_id is
  // SET NULL so the flag survives the vote it refers to.
  `CREATE TABLE IF NOT EXISTS hustle_vote_flags (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    vote_id        INTEGER REFERENCES hustle_votes(id) ON DELETE SET NULL,
    voter_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    application_id INTEGER REFERENCES hustle_applications(id) ON DELETE SET NULL,
    competition_id INTEGER NOT NULL REFERENCES hustle_competitions(id) ON DELETE CASCADE,
    reason         TEXT NOT NULL,
    detector       TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'reviewing', 'confirmed_fraud', 'dismissed')),
    reviewed_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at    TEXT,
    resolution     TEXT DEFAULT '',
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_flags_competition ON hustle_vote_flags(competition_id, status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_flags_vote ON hustle_vote_flags(vote_id)`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_flags_voter ON hustle_vote_flags(voter_id, status)`,
  // Results: winner + every finalist, frozen vote counts snapshotted at
  // freeze time. Exactly one winner per competition (enforced in code).
  `CREATE TABLE IF NOT EXISTS hustle_results (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id          INTEGER NOT NULL REFERENCES hustle_competitions(id) ON DELETE CASCADE,
    application_id          INTEGER NOT NULL REFERENCES hustle_applications(id) ON DELETE CASCADE,
    business_id             INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    rank                    INTEGER NOT NULL,
    final_vote_count        INTEGER NOT NULL,
    is_winner               INTEGER NOT NULL DEFAULT 0,
    verified_at             TEXT,
    verified_by             INTEGER REFERENCES users(id) ON DELETE SET NULL,
    published_at            TEXT,
    prize_payment_status    TEXT NOT NULL DEFAULT 'unpaid'
                            CHECK (prize_payment_status IN ('unpaid', 'processing', 'paid', 'failed')),
    prize_paid_at           TEXT,
    prize_payment_reference TEXT DEFAULT '',
    prize_payment_method    TEXT DEFAULT '',
    created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (competition_id, application_id),
    UNIQUE (competition_id, rank)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_results_competition ON hustle_results(competition_id, rank)`,
  // In-app notification inbox (no inbox existed before Hustle).
  `CREATE TABLE IF NOT EXISTS hustle_notifications (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind           TEXT NOT NULL,
    title          TEXT NOT NULL,
    body           TEXT NOT NULL,
    link           TEXT DEFAULT '',
    related_type   TEXT DEFAULT '',
    related_id     INTEGER,
    read_at        TEXT,
    sent_via       TEXT NOT NULL DEFAULT 'in_app',
    delivery_status TEXT NOT NULL DEFAULT 'sent'
                   CHECK (delivery_status IN ('pending', 'sent', 'failed', 'skipped')),
    sent_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_notifications_user ON hustle_notifications(user_id, read_at, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_notifications_related ON hustle_notifications(related_type, related_id)`,
  // Storefront analytics events. No number is ever shown unless an event
  // row backs it. Vote casts are NOT events (votes are counted from
  // hustle_votes, so a second count can never disagree).
  `CREATE TABLE IF NOT EXISTS hustle_events (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id    INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    event_type     TEXT NOT NULL
                   CHECK (event_type IN ('storefront_view', 'product_view', 'contact_click',
                                        'whatsapp_click', 'pitch_view', 'application_view')),
    actor_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ref_type       TEXT DEFAULT '',
    ref_id         INTEGER,
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_events_business ON hustle_events(business_id, event_type, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_events_ref ON hustle_events(ref_type, ref_id, created_at)`,
  // Announcements: ONE row per announcement, shown in every member's
  // inbox by union. No per-user fan-out (Architecture 6.3).
  `CREATE TABLE IF NOT EXISTS hustle_announcements (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER REFERENCES hustle_competitions(id) ON DELETE CASCADE,
    kind           TEXT NOT NULL,
    title          TEXT NOT NULL,
    body           TEXT NOT NULL,
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hustle_announcements_competition ON hustle_announcements(competition_id, created_at DESC)`,
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
  // Email confirmation (v110, 2026-11-09): optional email at signup,
  // verified by a hashed one-time token; a verified email is also the
  // password-reset channel, with SMS staying as the fallback.
  ['users', 'email', 'TEXT'],
  ['users', 'email_verified', 'INTEGER DEFAULT 0'],
  ['users', 'email_verify_token_hash', 'TEXT'],
  ['users', 'email_verify_expires', 'TEXT'],
  ['users', 'reset_token_hash', 'TEXT'],
  ['users', 'reset_token_expires', 'TEXT'],
  ['pending_registrations', 'email', 'TEXT'],
  ['users', 'food_license_image', 'TEXT'],
  ['users', 'food_license_status', "TEXT DEFAULT 'none'"],
  ['users', 'food_license_number', 'TEXT'],
  ['users', 'food_license_expires_at', 'TEXT'],
  ['jobs', 'requires_food_license', 'INTEGER DEFAULT 0'],
  ['products', 'business_id', 'INTEGER'],
  ['products', 'negotiable', 'INTEGER NOT NULL DEFAULT 0'],
  // Hustle business profile extension (Database Design section 1):
  // trading name, province/district, optional location link, business
  // type, year started, website, social links, registration number,
  // draft flag, plus the two pinned columns the completeness check
  // needs (structured hours, products/services list).
  ['businesses', 'trading_name', "TEXT DEFAULT ''"],
  ['businesses', 'province', "TEXT DEFAULT ''"],
  ['businesses', 'district', "TEXT DEFAULT ''"],
  ['businesses', 'location_id', 'INTEGER REFERENCES experience_locations(id) ON DELETE SET NULL'],
  ['businesses', 'business_type', "TEXT DEFAULT ''"],
  ['businesses', 'year_started', 'INTEGER'],
  ['businesses', 'website', "TEXT DEFAULT ''"],
  ['businesses', 'social_links', "TEXT DEFAULT '[]'"],
  ['businesses', 'registration_number', "TEXT DEFAULT ''"],
  ['businesses', 'is_draft', 'INTEGER NOT NULL DEFAULT 0'],
  ['businesses', 'hours_json', "TEXT DEFAULT ''"],
  ['businesses', 'services_text', "TEXT DEFAULT ''"],
  // Hustle per-document review state (Database Design section 3). The
  // CHECK sits on a NEW column, so no table rebuild is needed; the
  // business-level verification_status CHECK is deliberately untouched.
  ['business_documents', 'status', "TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'changes_requested'))"],
  ['business_documents', 'reviewed_by', 'INTEGER'],
  ['business_documents', 'reviewed_at', 'TEXT'],
  ['business_documents', 'review_note', "TEXT DEFAULT ''"],
  ['business_documents', 'mime', "TEXT DEFAULT ''"],
  ['business_documents', 'size_bytes', 'INTEGER NOT NULL DEFAULT 0'],
  ['business_documents', 'filename', "TEXT DEFAULT ''"],
  // Hustle goods/service split (Database Design section 4). Services
  // ignore the untouched condition CHECK; the CHECK is not widened.
  ['products', 'listing_type', "TEXT NOT NULL DEFAULT 'goods' CHECK (listing_type IN ('goods', 'service'))"],
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
  // Hustle indexes on the new business/product columns (Database Design
  // sections 1 and 4). Created here, after OPTIONAL_COLUMNS, because the
  // SCHEMA batch above runs before the columns exist.
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_hustle_businesses_province ON businesses(province, status)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_hustle_businesses_district ON businesses(district, status)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_hustle_products_business ON products(business_id, status, created_at DESC)`);
  // Hustle backfills (Database Design section 14.2, order 12). Each is
  // idempotent: it only touches rows whose new column is still at its
  // default. No backfill fabricates a value: province/district come
  // from the city lookup, location_id from a town name match, and
  // is_draft is 0 for every pre-existing (submitted) business.
  // city = 'Other' stays blank on province/district/location_id.
  const CITY_PROVINCE = {
    Lusaka: ['Lusaka Province', 'Lusaka District'],
    Kitwe: ['Copperbelt', 'Kitwe District'],
    Ndola: ['Copperbelt', 'Ndola District'],
    Kabwe: ['Central', 'Kabwe District'],
    Chipata: ['Eastern', 'Chipata District'],
    Livingstone: ['Southern', 'Livingstone District'],
    Chingola: ['Copperbelt', 'Chingola District'],
    Luanshya: ['Copperbelt', 'Luanshya District'],
    Kasama: ['Northern', 'Kasama District'],
    Solwezi: ['North-Western', 'Solwezi District'],
    Mongu: ['Western', 'Mongu District'],
    Choma: ['Southern', 'Choma District'],
  };
  for (const [city, [province, district]] of Object.entries(CITY_PROVINCE)) {
    await client.execute(
      `UPDATE businesses SET province = ?, district = ? WHERE city = ? AND (province IS NULL OR province = '')`,
      [province, district, city]
    );
  }
  await client.execute(
    `UPDATE businesses SET location_id = (
       SELECT id FROM experience_locations
       WHERE level = 'town' AND name = businesses.city AND active = 1 LIMIT 1)
     WHERE location_id IS NULL AND city != 'Other'`
  );
  // Document review-state backfill from the parent business (section 3):
  // approved/rejected follow verification_status, everything else stays
  // pending. The note marks backfilled rows so a later reader can tell
  // them from a real per-document review.
  await client.execute(
    `UPDATE business_documents SET status = 'approved',
       review_note = 'Backfilled from business verification_status at migration.'
     WHERE status = 'pending' AND business_id IN
       (SELECT id FROM businesses WHERE verification_status = 'verified')`
  );
  await client.execute(
    `UPDATE business_documents SET status = 'rejected',
       review_note = 'Backfilled from business verification_status at migration.'
     WHERE status = 'pending' AND business_id IN
       (SELECT id FROM businesses WHERE verification_status = 'rejected')`
  );
  // mime/size_bytes backfill from the stored data URI (exact byte size).
  const undocd = await client.execute(
    `SELECT id, image FROM business_documents WHERE mime IS NULL OR mime = ''`
  );
  for (const d of undocd.rows) {
    const raw = String(d.image || '');
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(raw);
    const mime = m ? m[1] : '';
    let size = 0;
    if (m) { try { size = Buffer.from(m[2], 'base64').length; } catch { size = 0; } }
    await client.execute(
      `UPDATE business_documents SET mime = ?, size_bytes = ? WHERE id = ?`,
      [mime, size, d.id]
    );
  }
  // products.business_id backfill (section 4): only where the seller
  // owns exactly one active storefront. Zero or 2-3 storefronts stay
  // NULL for the owner to assign by hand.
  await client.execute(
    `UPDATE products SET business_id = (
       SELECT id FROM businesses
       WHERE owner_id = products.seller_id AND status = 'active' LIMIT 1)
     WHERE business_id IS NULL AND (
       SELECT COUNT(*) FROM businesses
       WHERE owner_id = products.seller_id AND status = 'active') = 1`
  );
  // Email uniqueness (v110): one account per address, case-insensitive
  // (addresses are stored lowercased). Partial so the many members with
  // no email at all are unaffected.
  await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL AND email != ''`);
  // Migration (Experiences Phase 3, 2026-11-08): experience_listings gains
  // a real FK on host_id (REFERENCES experience_hosts(id)), approval
  // columns (approval_status, approval_note), and 'suspended' in the
  // status CHECK. SQLite cannot ALTER a CHECK or add a REFERENCES clause,
  // so rebuild the table. Same pattern as the jobs pay_type migration
  // above: create experience_listings_new, copy rows with an explicit
  // column list, drop old, rename, PRAGMA foreign_keys = OFF during the
  // copy, back ON in finally. Runs AFTER the SCHEMA batch above, so
  // experience_hosts already exists when the new FK is declared.
  // Idempotent: skipped once approval_status exists on the table.
  // All 7 listing indexes are recreated after the rename (dropping the
  // table drops its indexes).
  const expListSql = (await client.execute(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'experience_listings'`
  )).rows[0]?.sql || '';
  if (expListSql && !expListSql.includes('approval_status')) {
    await client.execute('DROP TABLE IF EXISTS experience_listings_new');
    await client.execute('PRAGMA foreign_keys = OFF');
    try {
      await client.execute(`CREATE TABLE experience_listings_new (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        listing_type   TEXT NOT NULL CHECK (listing_type IN ('stay', 'vehicle', 'tour', 'event', 'experience')),
        category_id    INTEGER REFERENCES experience_categories(id) ON DELETE SET NULL,
        host_id        INTEGER REFERENCES experience_hosts(id) ON DELETE CASCADE,
        business_id    INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
        location_id    INTEGER REFERENCES experience_locations(id) ON DELETE SET NULL,
        title          TEXT NOT NULL,
        description    TEXT NOT NULL DEFAULT '',
        city           TEXT NOT NULL,
        area           TEXT DEFAULT '',
        address        TEXT DEFAULT '',
        lat            REAL,
        lng            REAL,
        price_from     INTEGER NOT NULL DEFAULT 0,
        currency       TEXT NOT NULL DEFAULT 'ZMW',
        status         TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'active', 'paused', 'removed', 'suspended')),
        view_count     INTEGER NOT NULL DEFAULT 0,
        price_unit     TEXT NOT NULL DEFAULT 'per_person'
                       CHECK (price_unit IN ('per_person', 'per_group', 'per_night', 'per_day', 'per_hour', 'per_trip', 'per_event', 'quote')),
        capacity_max   INTEGER NOT NULL DEFAULT 1,
        instant_book   INTEGER NOT NULL DEFAULT 0,
        cancellation_policy TEXT NOT NULL DEFAULT 'Flexible'
                       CHECK (cancellation_policy IN ('Flexible', 'Moderate', 'Strict', 'Event')),
        inclusions     TEXT DEFAULT '',
        exclusions     TEXT DEFAULT '',
        safety_requirements TEXT DEFAULT '',
        approval_status TEXT NOT NULL DEFAULT 'draft'
                       CHECK (approval_status IN ('draft', 'submitted', 'under_review', 'additional_info', 'approved', 'rejected')),
        approval_note  TEXT DEFAULT '',
        created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK ((host_id IS NULL) != (business_id IS NULL))
      )`);
      await client.execute(`INSERT INTO experience_listings_new
        (id, listing_type, category_id, host_id, business_id, location_id,
         title, description, city, area, address, lat, lng, price_from,
         currency, status, view_count, price_unit, capacity_max,
         instant_book, cancellation_policy, inclusions, exclusions,
         safety_requirements, created_at, updated_at)
        SELECT id, listing_type, category_id, host_id, business_id, location_id,
         title, description, city, area, address, lat, lng, price_from,
         currency, status, view_count, price_unit, capacity_max,
         instant_book, cancellation_policy, inclusions, exclusions,
         safety_requirements, created_at, updated_at
        FROM experience_listings`);
      await client.execute('DROP TABLE experience_listings');
      await client.execute('ALTER TABLE experience_listings_new RENAME TO experience_listings');
      for (const idx of [
        `CREATE INDEX IF NOT EXISTS idx_exp_listings_status_type_created ON experience_listings(status, listing_type, created_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_exp_listings_location_status ON experience_listings(location_id, status)`,
        `CREATE INDEX IF NOT EXISTS idx_exp_listings_category_status ON experience_listings(category_id, status)`,
        `CREATE INDEX IF NOT EXISTS idx_exp_listings_city_status ON experience_listings(city, status)`,
        `CREATE INDEX IF NOT EXISTS idx_exp_listings_host_status ON experience_listings(host_id, status)`,
        `CREATE INDEX IF NOT EXISTS idx_exp_listings_business_status ON experience_listings(business_id, status)`,
        `CREATE INDEX IF NOT EXISTS idx_exp_listings_lat_lng ON experience_listings(lat, lng)`,
      ]) await client.execute(idx);
    } finally {
      await client.execute('PRAGMA foreign_keys = ON');
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

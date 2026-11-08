'use strict';
/**
 * Phase 3 migration test: experience_hosts / experience_businesses /
 * experience_business_staff / experience_host_verifications /
 * experience_document_views (new tables) + experience_listings rebuild
 * (host_id FK, approval_status/approval_note, status 'suspended').
 *
 * Method (Prerequisites 5.2): build the OLD schema by running the Phase 2
 * db.js (git show HEAD:db.js into a temp copy) against a throwaway local
 * file, insert representative rows, snapshot, then run the NEW db.js
 * init() against that file and verify preservation + new behaviour.
 *
 * Run:  rm -f /tmp/pwz3-mig.db* && env -u TURSO_DATABASE_URL \
 *         -u TURSO_AUTH_TOKEN node scripts/test-phase3-migrations.js
 * from ~/workspace/piecework-zambia-2.0. Never touches Turso, never
 * touches the dev/prod trees' data/ files, never touches production.
 *
 * HARNESS GOTCHA (Prerequisites 5.2): do NOT delete the throwaway DB
 * file after db.js is required. @libsql/client opens the file at require
 * time; unlinking it afterwards fails with SQLITE_IOERR_FSTAT. The file
 * is removed BEFORE starting node (see the Run line above) and before
 * any require of db.js below.
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const DEV = path.join(__dirname, '..');
const DB = '/tmp/pwz3-mig.db';
const OLD_DIR = '/tmp/pwz3-old-schema';

// Remove the throwaway file BEFORE any db.js is required (see header).
for (const suffix of ['', '-journal', '-wal', '-shm']) {
  try { fs.unlinkSync(DB + suffix); } catch { /* fresh */ }
}
fs.rmSync(OLD_DIR, { recursive: true, force: true });
fs.mkdirSync(OLD_DIR, { recursive: true });

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { passed++; console.log('PASS  ' + name); }
  else { failed++; failures.push(name); console.log('FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

const LISTING_COLS_OLD = 'id, listing_type, category_id, host_id, business_id, location_id, title, description, city, area, address, lat, lng, price_from, currency, status, view_count, price_unit, capacity_max, instant_book, cancellation_policy, inclusions, exclusions, safety_requirements, created_at, updated_at';

(async () => {
  // 1. Old schema: Phase 2 db.js from git HEAD into a temp copy.
  execSync(`git -C ${DEV} show HEAD:db.js > ${path.join(OLD_DIR, 'db.js')}`, { stdio: 'pipe' });
  fs.symlinkSync(path.join(DEV, 'node_modules'), path.join(OLD_DIR, 'node_modules'));
  const oldHead = execSync(`git -C ${DEV} rev-parse --short HEAD`, { encoding: 'utf8' }).trim();
  check('old-schema source is Phase 2 db.js from git HEAD (' + oldHead + ')', true);

  // 2. Child process: run OLD init() + insert representative rows + snapshot.
  const setupJs = `
'use strict';
const fs = require('fs');
process.env.DB_PATH = ${JSON.stringify(DB)};
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
const { client, init } = require('./db.js');
(async () => {
  await init();
  const ex = (sql, args) => client.execute({ sql, args: args || [] });
  await ex("INSERT INTO users (id, name, phone, password_hash, city) VALUES (1, 'TEST Host User', '+260970000011', 'hash', 'Lusaka'), (2, 'TEST Biz Owner', '+260970000012', 'hash', 'Livingstone'), (3, 'TEST Guest', '+260970000013', 'hash', 'Kitwe'), (4, 'TEST Staff', '+260970000014', 'hash', 'Ndola')");
  await ex("INSERT INTO businesses (id, owner_id, name, slug, city, status, verification_status) VALUES (1, 2, 'TEST Lodge Co', 'test-lodge-co-1', 'Livingstone', 'active', 'verified')");
  await ex("INSERT INTO experience_categories (id, name, kind, sort) VALUES (1, 'TEST Tours', 'tour', 0), (2, 'TEST Stays', 'stay', 1)");
  await ex("INSERT INTO experience_locations (id, parent_id, level, name, slug, lat, lng) VALUES (1, NULL, 'country', 'Zambia', 'zambia', -13.1339, 27.8493), (2, 1, 'province', 'Eastern', 'eastern', -13.5, 32.5), (3, 2, 'town', 'Mfuwe', 'mfuwe', -13.0972, 31.7875)");
  // Host-side listing: host_id is a PLAIN INTEGER in Phase 2 (no FK).
  // Value 1 is deliberate: after migration an experience_hosts row with
  // id 1 is created for it, so the new FK resolves (see step 4).
  await ex("INSERT INTO experience_listings (${LISTING_COLS_OLD}) VALUES (1, 'tour', 1, 1, NULL, 3, 'TEST ''Quoted'' Walking Safari', 'Guided walk\\nsecond line, unicode: Chishimba Falls \\u2014 TEST', 'Mfuwe', '', 'Mfuwe Lodge car park', -13.0972, 31.7875, 350, 'ZMW', 'active', 7, 'per_person', 12, 0, 'Moderate', '[\\"Guide\\"]', '[]', 'Closed shoes required.', '2026-11-08 10:00:00', '2026-11-08 10:00:00')");
  // Business-side listing.
  await ex("INSERT INTO experience_listings (${LISTING_COLS_OLD}) VALUES (2, 'stay', 2, NULL, 1, 3, 'TEST Riverside Guesthouse', 'Quiet guesthouse by the river.', 'Livingstone', '', '1 River Rd', -17.8419, 25.8549, 450, 'ZMW', 'active', 3, 'per_night', 4, 0, 'Flexible', '[\\"Wi-Fi\\"]', '[]', '', '2026-11-08 10:05:00', '2026-11-08 10:05:00')");
  // Draft listing on the host side, to prove drafts survive too.
  await ex("INSERT INTO experience_listings (${LISTING_COLS_OLD}) VALUES (3, 'tour', 1, 1, NULL, 3, 'TEST Draft Tour', 'Draft, never public.', 'Mfuwe', '', '', NULL, NULL, 50, 'ZMW', 'draft', 0, 'per_person', 2, 0, 'Flexible', '', '', '', '2026-11-08 10:10:00', '2026-11-08 10:10:00')");
  await ex("INSERT INTO experience_tours (listing_id, duration_hours, group_size_max, group_size_min, meeting_point, price_per_person) VALUES (1, 4, 12, 2, 'Mfuwe Lodge car park', 350), (3, 2, 6, 1, 'Mfuwe airstrip', 50)");
  await ex("INSERT INTO experience_properties (listing_id, property_type, max_guests, bedrooms, bathrooms, amenities, check_in_time, check_out_time) VALUES (2, 'guesthouse', 4, 2, 1, '[\\"Wi-Fi\\"]', '14:00', '11:00')");
  await ex("INSERT INTO experience_property_units (id, property_id, name, unit_type, sleeps, quantity, price_per_night) VALUES (1, 2, 'Double Room', 'room', 2, 2, 450)");
  await ex("INSERT INTO experience_listing_media (id, listing_id, image, mime, sort, caption) VALUES (1, 1, 'data:image/jpeg;base64,TESTAAA', 'image/jpeg', 0, 'Safari ''sunset''\\nTEST unicode: \\u2603'), (2, 2, 'data:image/jpeg;base64,TESTBBB', 'image/jpeg', 0, 'Riverside view'), (3, 2, 'data:image/jpeg;base64,TESTCCC', 'image/jpeg', 1, 'Room')");
  const dump = async (sql) => JSON.stringify((await ex(sql)).rows);
  const snap = {
    listings: await dump('SELECT ${LISTING_COLS_OLD} FROM experience_listings ORDER BY id'),
    tours: await dump('SELECT * FROM experience_tours ORDER BY listing_id'),
    properties: await dump('SELECT * FROM experience_properties ORDER BY listing_id'),
    units: await dump('SELECT * FROM experience_property_units ORDER BY id'),
    media: await dump('SELECT * FROM experience_listing_media ORDER BY id'),
    categories: await dump('SELECT * FROM experience_categories ORDER BY id'),
    locations: await dump('SELECT * FROM experience_locations ORDER BY id'),
    users: await dump('SELECT id, name, phone, city FROM users ORDER BY id'),
    businesses: await dump('SELECT id, owner_id, name, slug, city, status FROM businesses ORDER BY id'),
    listingsSql: (await ex("SELECT sql FROM sqlite_master WHERE type='table' AND name='experience_listings'")).rows[0].sql,
  };
  fs.writeFileSync(${JSON.stringify(path.join(OLD_DIR, 'snapshot.json'))}, JSON.stringify(snap));
  process.exit(0);
})().catch((e) => { console.error('OLD SETUP ERROR', e); process.exit(2); });
`;
  fs.writeFileSync(path.join(OLD_DIR, 'setup-old.js'), setupJs);
  const child = spawnSync('node', ['setup-old.js'], {
    cwd: OLD_DIR,
    env: { ...process.env, DB_PATH: DB, TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: '' },
    encoding: 'utf8',
  });
  if (child.status !== 0) {
    console.log(child.stdout);
    console.log(child.stderr);
    throw new Error('old-schema setup child failed with status ' + child.status);
  }
  const snap = JSON.parse(fs.readFileSync(path.join(OLD_DIR, 'snapshot.json'), 'utf8'));
  check('old schema built, 3 listings snapshotted', JSON.parse(snap.listings).length === 3);
  check('old listings SQL has no approval_status', !snap.listingsSql.includes('approval_status'));
  check('old listings host_id has no REFERENCES', !/host_id[^,]*REFERENCES/.test(snap.listingsSql));
  check('snapshot: 2 tours, 1 property, 1 unit, 3 media rows',
    JSON.parse(snap.tours).length === 2 && JSON.parse(snap.properties).length === 1
    && JSON.parse(snap.units).length === 1 && JSON.parse(snap.media).length === 3);

  // 3. NEW db.js init() against the old-schema file.
  process.env.DB_PATH = DB;
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  const { client, init } = require(path.join(DEV, 'db.js'));
  await init();
  const ex = (sql, args) => client.execute({ sql, args: args || [] });
  const dump = async (sql) => JSON.stringify((await ex(sql)).rows);
  const schemaOf = async (t) => (await ex(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '${t}'`)).rows[0]?.sql || '';
  const colsOf = async (t) => (await ex(`PRAGMA table_info(${t})`)).rows.map((r) => r.name);

  // (a) Every old row preserved byte-for-byte on the old column set.
  check('listings rows identical after rebuild',
    (await dump(`SELECT ${LISTING_COLS_OLD} FROM experience_listings ORDER BY id`)) === snap.listings);
  check('tours rows identical after rebuild', (await dump('SELECT * FROM experience_tours ORDER BY listing_id')) === snap.tours);
  check('properties rows identical after rebuild', (await dump('SELECT * FROM experience_properties ORDER BY listing_id')) === snap.properties);
  check('units rows identical after rebuild', (await dump('SELECT * FROM experience_property_units ORDER BY id')) === snap.units);
  check('media rows identical after rebuild', (await dump('SELECT * FROM experience_listing_media ORDER BY id')) === snap.media);
  check('categories rows identical after rebuild', (await dump('SELECT * FROM experience_categories ORDER BY id')) === snap.categories);
  check('locations rows identical after rebuild', (await dump('SELECT * FROM experience_locations ORDER BY id')) === snap.locations);
  check('awkward text survived (quotes/newline/unicode)',
    (await dump("SELECT title, description FROM experience_listings WHERE id = 1")).includes('Chishimba Falls'));

  // (b) New tables exist with correct columns and CHECKs.
  for (const t of ['experience_hosts', 'experience_businesses', 'experience_business_staff', 'experience_host_verifications', 'experience_document_views']) {
    check('new table exists: ' + t, (await schemaOf(t)).length > 0);
  }
  const hostCols = await colsOf('experience_hosts');
  check('hosts has all Phase 3 columns',
    ['id', 'user_id', 'display_name', 'bio', 'languages', 'response_time', 'phone_public', 'city', 'area', 'meeting_point', 'provinces', 'lat', 'lng', 'payout_method', 'payout_reference', 'status', 'verification_status', 'verification_note', 'created_at', 'updated_at'].every((c) => hostCols.includes(c)),
    hostCols.join(','));
  check('hosts status CHECK has the seven statuses',
    (await schemaOf('experience_hosts')).includes("'draft', 'submitted', 'under_review', 'additional_info', 'approved', 'rejected', 'suspended'"));
  check('hosts verification_status CHECK matches businesses vocabulary',
    (await schemaOf('experience_hosts')).includes("'unverified', 'pending', 'verified', 'rejected'"));
  check('hosts payout_method CHECK is mobile_money/bank',
    (await schemaOf('experience_hosts')).includes("payout_method IN ('', 'mobile_money', 'bank')"));
  check('businesses table has commission override CHECK 0-100',
    (await schemaOf('experience_businesses')).includes('commission_rate_override BETWEEN 0 AND 100'));
  check('staff PK is (business_id, user_id)',
    (await schemaOf('experience_business_staff')).includes('PRIMARY KEY (business_id, user_id)'));
  check('staff role CHECK is manager/staff, status includes invited',
    (await schemaOf('experience_business_staff')).includes("role IN ('manager', 'staff')")
    && (await schemaOf('experience_business_staff')).includes("'invited', 'active', 'revoked'"));
  check('verifications kind CHECK + exactly-one-host-side CHECK',
    (await schemaOf('experience_host_verifications')).includes("'nrc', 'passport', 'drivers_licence', 'tourism_licence', 'selfie', 'other'")
    && (await schemaOf('experience_host_verifications')).includes("CHECK ((host_id IS NULL) != (business_id IS NULL))"));
  check('document_views has viewed_at default datetime(now)',
    (await schemaOf('experience_document_views')).includes("DEFAULT (datetime('now'))"));
  check('no experience_reviews / experience_messages tables (deferred to Phases 4-5)',
    (await schemaOf('experience_reviews')) === '' && (await schemaOf('experience_messages')) === '');
  for (const idx of ['idx_exp_hosts_status_verification', 'idx_exp_staff_business', 'idx_exp_verifications_host', 'idx_exp_verifications_business', 'idx_exp_doc_views_doc']) {
    const r = await ex(`SELECT name FROM sqlite_master WHERE type='index' AND name='${idx}'`);
    check('new index exists: ' + idx, r.rows.length === 1);
  }
  for (const idx of ['idx_exp_listings_status_type_created', 'idx_exp_listings_location_status', 'idx_exp_listings_category_status', 'idx_exp_listings_city_status', 'idx_exp_listings_host_status', 'idx_exp_listings_business_status', 'idx_exp_listings_lat_lng']) {
    const r = await ex(`SELECT name FROM sqlite_master WHERE type='index' AND name='${idx}'`);
    check('listing index recreated after rebuild: ' + idx, r.rows.length === 1);
  }

  // (c) New columns present with defaults on migrated rows.
  const migrated = JSON.parse(await dump('SELECT id, approval_status, approval_note FROM experience_listings ORDER BY id'));
  check('migrated listings default approval_status draft, approval_note empty',
    migrated.every((r) => r.approval_status === 'draft' && r.approval_note === ''));

  // New listings SQL now carries the FK + widened status CHECK.
  const newListSql = await schemaOf('experience_listings');
  check('new listings host_id REFERENCES experience_hosts(id)',
    /host_id\s+INTEGER REFERENCES experience_hosts\(id\) ON DELETE CASCADE/.test(newListSql));
  check('new listings status CHECK includes suspended',
    newListSql.includes("'draft', 'active', 'paused', 'removed', 'suspended'"));
  check('new listings approval_status CHECK has the six values',
    newListSql.includes("'draft', 'submitted', 'under_review', 'additional_info', 'approved', 'rejected'"));

  // Remediation for the copied host-side rows: Phase 2 stored a USER id
  // in host_id; Phase 3 host_id is an experience_hosts id. Create the
  // host profile row with id 1 for TEST user 1, so the copied rows
  // resolve. (Production has no Phase 2 listings, so no such rows exist
  // there; the backend worker must do this remap for any pre-Phase 3
  // host-side listing before relying on the FK.)
  await ex("INSERT INTO experience_hosts (id, user_id, display_name, city, status) VALUES (1, 1, 'TEST Host User', 'Lusaka', 'approved')");
  await ex("INSERT INTO experience_businesses (business_id, commission_rate_override, payout_method, payout_reference) VALUES (1, NULL, 'mobile_money', '+260970000012')");
  await ex("INSERT INTO experience_business_staff (business_id, user_id, role, invited_by, status) VALUES (1, 4, 'manager', 2, 'active')");
  await ex("INSERT INTO experience_host_verifications (host_id, business_id, submitted_by, kind, image, status) VALUES (1, NULL, 1, 'nrc', 'data:image/jpeg;base64,TESTNRC', 'pending')");
  await ex("INSERT INTO experience_host_verifications (host_id, business_id, submitted_by, kind, image, status) VALUES (NULL, 1, 2, 'tourism_licence', 'data:image/jpeg;base64,TESTLIC', 'approved')");
  await ex("INSERT INTO experience_document_views (document_id, viewer_id) VALUES (1, 2)");
  check('host/business/staff/verification/doc-view rows insert', true);

  // (d) The host_id FK is enforced (FKs are ON on this connection).
  let badHostRejected = false;
  try { await ex("INSERT INTO experience_listings (listing_type, category_id, host_id, business_id, location_id, title, city, status) VALUES ('tour', 1, 99999, NULL, 3, 'TEST Bad Host', 'Mfuwe', 'draft')"); } catch { badHostRejected = true; }
  check('insert with nonexistent host_id rejected', badHostRejected);
  let goodHostWorks = false;
  try { await ex("INSERT INTO experience_listings (listing_type, category_id, host_id, business_id, location_id, title, city, status) VALUES ('tour', 1, 1, NULL, 3, 'TEST Good Host', 'Mfuwe', 'draft')"); goodHostWorks = true; } catch (e) { goodHostWorks = false; }
  check('insert with valid host_id works', goodHostWorks);
  let bizSideWorks = false;
  try { await ex("INSERT INTO experience_listings (listing_type, category_id, host_id, business_id, location_id, title, city, status) VALUES ('stay', 2, NULL, 1, 3, 'TEST Biz Side', 'Livingstone', 'draft')"); bizSideWorks = true; } catch { bizSideWorks = false; }
  check('business-side insert still works', bizSideWorks);

  // (e) Exactly-one-host-side CHECK still enforced.
  let bothRejected = false;
  try { await ex("INSERT INTO experience_listings (listing_type, host_id, business_id, title, city) VALUES ('tour', 1, 1, 'x', 'Lusaka')"); } catch { bothRejected = true; }
  check('listing CHECK rejects both host sides set', bothRejected);
  let neitherRejected = false;
  try { await ex("INSERT INTO experience_listings (listing_type, host_id, business_id, title, city) VALUES ('tour', NULL, NULL, 'x', 'Lusaka')"); } catch { neitherRejected = true; }
  check('listing CHECK rejects neither host side set', neitherRejected);

  // (f) Status 'suspended' accepted.
  let suspWorks = false;
  try { await ex("UPDATE experience_listings SET status = 'suspended' WHERE id = 2"); suspWorks = true; } catch { suspWorks = false; }
  check("status 'suspended' accepted on listings", suspWorks);
  await ex("UPDATE experience_listings SET status = 'active' WHERE id = 2");

  // New-table CHECK enforcement spot checks.
  let badPayoutRejected = false;
  try { await ex("UPDATE experience_hosts SET payout_method = 'cash' WHERE id = 1"); } catch { badPayoutRejected = true; }
  check('hosts payout_method rejects values outside mobile_money/bank', badPayoutRejected);
  let badOverrideRejected = false;
  try { await ex("UPDATE experience_businesses SET commission_rate_override = 101 WHERE business_id = 1"); } catch { badOverrideRejected = true; }
  check('commission override rejects 101', badOverrideRejected);
  let badVerifRejected = false;
  try { await ex("INSERT INTO experience_host_verifications (host_id, business_id, submitted_by, kind, image) VALUES (1, 1, 1, 'nrc', 'data:image/jpeg;base64,X')"); } catch { badVerifRejected = true; }
  check('verification rejects both host_id and business_id set', badVerifRejected);
  let badVerif2Rejected = false;
  try { await ex("INSERT INTO experience_host_verifications (host_id, business_id, submitted_by, kind, image) VALUES (NULL, NULL, 1, 'selfie', 'data:image/jpeg;base64,X')"); } catch { badVerif2Rejected = true; }
  check('verification rejects neither host side set', badVerif2Rejected);
  let badRoleRejected = false;
  try { await ex("INSERT INTO experience_business_staff (business_id, user_id, role) VALUES (1, 3, 'owner')"); } catch { badRoleRejected = true; }
  check('staff role rejects owner (manager/staff only)', badRoleRejected);
  let dupStaffRejected = false;
  try { await ex("INSERT INTO experience_business_staff (business_id, user_id, role) VALUES (1, 4, 'staff')"); } catch { dupStaffRejected = true; }
  check('staff composite PK rejects duplicate (business_id, user_id)', dupStaffRejected);
  let badHostStatusRejected = false;
  try { await ex("UPDATE experience_hosts SET status = 'pending' WHERE id = 1"); } catch { badHostStatusRejected = true; }
  check("hosts status rejects old DB Design value 'pending'", badHostStatusRejected);

  // (g) PRAGMA foreign_key_check clean.
  const fkCheck = await ex('PRAGMA foreign_key_check');
  check('PRAGMA foreign_key_check clean', fkCheck.rows.length === 0, JSON.stringify(fkCheck.rows));
  const fk = await ex('PRAGMA foreign_keys');
  check('foreign_keys back ON after migration', fk.rows[0] && fk.rows[0].foreign_keys === 1, JSON.stringify(fk.rows));

  // (h)+(i) init() runs cleanly twice; second run skips rebuild, data unchanged.
  const beforeSecond = await dump(`SELECT ${LISTING_COLS_OLD} FROM experience_listings ORDER BY id`);
  const sqlBeforeSecond = await schemaOf('experience_listings');
  await init();
  check('init() runs cleanly a second time on the migrated file', true);
  await init();
  check('init() runs cleanly a third time on the migrated file', true);
  check('second/third init() left listings data unchanged',
    (await dump(`SELECT ${LISTING_COLS_OLD} FROM experience_listings ORDER BY id`)) === beforeSecond);
  check('second/third init() left listings SQL unchanged',
    (await schemaOf('experience_listings')) === sqlBeforeSecond);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) console.log('Failures: ' + failures.join(' | '));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });

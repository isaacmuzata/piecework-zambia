'use strict';
/**
 * Hustle migration test: 12 new hustle_ tables + hustle_announcements,
 * new columns on businesses / business_documents / products, and the
 * three backfills (province/district/location_id, document review state,
 * products.business_id).
 *
 * Method (copied from scripts/test-phase3-migrations.js): build the OLD
 * schema by running the pre-Hustle db.js (git show <pinned ref>:db.js
 * into a temp copy) against a throwaway local file, insert
 * representative rows, snapshot, then run the NEW db.js init() against
 * that file and verify preservation + new behaviour.
 *
 * The pre-Hustle ref is pinned to 82c36da ("Experiences Phase 3 fix
 * pass"), the HEAD commit before any Hustle change landed in the dev
 * tree. Do NOT point this at HEAD blindly: once Hustle is committed,
 * HEAD is post-Hustle and the "old" schema would already contain it.
 *
 * Run:  rm -rf ~/workspace/hustle-mig-test/mig && \
 *         env -u TURSO_DATABASE_URL -u TURSO_AUTH_TOKEN \
 *         node scripts/test-hustle-migrations.js
 * from ~/workspace/piecework-zambia-2.0. Never touches Turso, never
 * touches the dev/prod trees' data/ files, never touches production.
 * Scratch state lives under ~/workspace/hustle-mig-test/ (home disk),
 * NOT /tmp.
 *
 * HARNESS GOTCHA (copied from the Phase 3 script): do NOT delete the
 * throwaway DB file after db.js is required. @libsql/client opens the
 * file at require time; unlinking it afterwards fails with
 * SQLITE_IOERR_FSTAT. The file is removed BEFORE starting node (see the
 * Run line above) and before any require of db.js below.
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const DEV = path.join(__dirname, '..');
const HOME = process.env.HOME || '/home/hatch';
const WORK = path.join(HOME, 'workspace', 'hustle-mig-test');
const DB = path.join(WORK, 'mig', 'pwz-hustle-mig.db');
const OLD_DIR = path.join(WORK, 'mig', 'old-schema');
const PRE_HUSTLE_REF = '82c36da';

// Remove the throwaway file BEFORE any db.js is required (see header).
for (const suffix of ['', '-journal', '-wal', '-shm']) {
  try { fs.unlinkSync(DB + suffix); } catch { /* fresh */ }
}
fs.rmSync(OLD_DIR, { recursive: true, force: true });
fs.mkdirSync(OLD_DIR, { recursive: true });
fs.mkdirSync(path.dirname(DB), { recursive: true });

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { passed++; console.log('PASS  ' + name); }
  else { failed++; failures.push(name); console.log('FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

const BUSINESS_COLS_OLD = 'id, owner_id, name, slug, tagline, description, logo, cover, category, city, area, address, phone, whatsapp, email, hours_text, lat, lng, status, verification_status, verification_note, created_at, updated_at, pacra_number, tpin, owner_legal_name';
const DOC_COLS_OLD = 'id, business_id, kind, image, created_at';
const PRODUCT_COLS_OLD = 'id, seller_id, title, description, price, category, condition, city, area, lat, lng, status, view_count, created_at, updated_at, business_id, negotiable';

(async () => {
  // 1. Old schema: pre-Hustle db.js from the pinned ref into a temp copy.
  execSync(`git -C ${DEV} show ${PRE_HUSTLE_REF}:db.js > ${path.join(OLD_DIR, 'db.js')}`, { stdio: 'pipe' });
  fs.symlinkSync(path.join(DEV, 'node_modules'), path.join(OLD_DIR, 'node_modules'));
  const refSubject = execSync(`git -C ${DEV} log -1 --format=%s ${PRE_HUSTLE_REF}`, { encoding: 'utf8' }).trim();
  check('old-schema source is pre-Hustle db.js at ' + PRE_HUSTLE_REF + ' (' + refSubject + ')', true);
  const oldHasHustle = execSync(`git -C ${DEV} show ${PRE_HUSTLE_REF}:db.js | grep -c hustle_ || true`, { encoding: 'utf8' }).trim();
  check('pinned ref has no hustle_ tables', oldHasHustle === '0', 'grep count ' + oldHasHustle);

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
  await ex("INSERT INTO users (id, name, phone, password_hash, city) VALUES (1, 'TEST Biz Owner One', '+260970000011', 'hash', 'Lusaka'), (2, 'TEST Biz Owner Two', '+260970000012', 'hash', 'Kitwe'), (3, 'TEST Seller No Shop', '+260970000013', 'hash', 'Ndola'), (4, 'TEST Seller Two Shops', '+260970000014', 'hash', 'Livingstone'), (5, 'TEST Voter', '+260970000015', 'hash', 'Lusaka')");
  // Locations: Lusaka town exists (location_id match), Solwezi town does not.
  await ex("INSERT INTO experience_locations (id, parent_id, level, name, slug, lat, lng) VALUES (1, NULL, 'country', 'Zambia', 'zambia', -13.1339, 27.8493), (2, 1, 'province', 'Lusaka', 'lusaka', -15.3875, 28.3228), (3, 2, 'town', 'Lusaka', 'lusaka-town', -15.3875, 28.3228), (4, 1, 'province', 'Copperbelt', 'copperbelt', -12.8, 28.2), (5, 4, 'town', 'Kitwe', 'kitwe-town', -12.8, 28.2)");
  // Businesses: verified (Lusaka), pending (Kitwe), unverified in 'Other' city, rejected (Solwezi).
  await ex("INSERT INTO businesses (id, owner_id, name, slug, city, status, verification_status, pacra_number, tpin, owner_legal_name) VALUES (1, 1, 'TEST Lusaka Shop', 'test-lusaka-shop-1', 'Lusaka', 'active', 'verified', 'PACRA1', '1234567890', 'Owner One'), (2, 2, 'TEST Kitwe Shop', 'test-kitwe-shop-2', 'Kitwe', 'active', 'pending', 'PACRA2', '1234567891', 'Owner Two'), (3, 2, 'TEST Other Town Shop', 'test-other-town-shop-3', 'Other', 'active', 'unverified', 'PACRA3', '1234567892', 'Owner Two'), (4, 1, 'TEST Solwezi Shop', 'test-solwezi-shop-4', 'Solwezi', 'active', 'rejected', 'PACRA4', '1234567893', 'Owner One'), (5, 4, 'TEST Second Livingstone Shop', 'test-second-livingstone-5', 'Livingstone', 'active', 'verified', 'PACRA5', '1234567894', 'Owner Four'), (6, 4, 'TEST First Livingstone Shop', 'test-first-livingstone-6', 'Livingstone', 'rejected', 'verified', 'PACRA6', '1234567895', 'Owner Four')");
  // Documents: image for the verified shop, PDF for the pending shop, image for the rejected shop.
  await ex("INSERT INTO business_documents (id, business_id, kind, image) VALUES (1, 1, 'pacra', 'data:image/jpeg;base64,QUJD'), (2, 2, 'pacra', 'data:application/pdf;base64,QUJDREU='), (3, 4, 'pacra', 'data:image/png;base64,QUJD'), (4, 1, 'tpin', 'data:image/jpeg;base64,QUJD')");
  // Products: seller 1 owns two ACTIVE storefronts (biz 1 Lusaka, biz 4
  // Solwezi) and must stay NULL. Seller 3 owns none. Seller 4 owns two
  // (biz 5 active, biz 6 rejected) so exactly one ACTIVE -> backfilled.
  // Seller 2 owns two ACTIVE storefronts (biz 2 Kitwe, biz 3 Other) and
  // must stay NULL.
  await ex("INSERT INTO products (id, seller_id, title, description, price, category, condition, city, status) VALUES (1, 1, 'TEST Item One Shop Owner', 'Item from the two-active-shop owner.', 100, 'Electronics', 'Good', 'Lusaka', 'active'), (2, 3, 'TEST Item No Shop', 'Item from a seller with no shop.', 200, 'Electronics', 'Good', 'Ndola', 'active'), (3, 4, 'TEST Item One Active Shop', 'Item from a seller with exactly one active shop.', 300, 'Electronics', 'Good', 'Livingstone', 'active'), (4, 2, 'TEST Item Kitwe Owner', 'Item from an owner of two active shops.', 400, 'Electronics', 'Good', 'Kitwe', 'active')");
  const dump = async (sql) => JSON.stringify((await ex(sql)).rows);
  const snap = {
    businesses: await dump('SELECT ${BUSINESS_COLS_OLD} FROM businesses ORDER BY id'),
    docs: await dump('SELECT ${DOC_COLS_OLD} FROM business_documents ORDER BY id'),
    products: await dump('SELECT ${PRODUCT_COLS_OLD} FROM products ORDER BY id'),
    users: await dump('SELECT id, name, phone, city FROM users ORDER BY id'),
    locations: await dump('SELECT * FROM experience_locations ORDER BY id'),
    businessesSql: (await ex("SELECT sql FROM sqlite_master WHERE type='table' AND name='businesses'")).rows[0].sql,
    productsSql: (await ex("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'")).rows[0].sql,
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
  check('old schema built, 6 businesses + 4 docs + 4 products snapshotted',
    JSON.parse(snap.businesses).length === 6 && JSON.parse(snap.docs).length === 4 && JSON.parse(snap.products).length === 4);
  check('old businesses SQL has no trading_name', !snap.businessesSql.includes('trading_name'));
  check('old products SQL has no listing_type', !snap.productsSql.includes('listing_type'));

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

  // (a) Every old row preserved on the old column set.
  check('businesses rows identical on old columns after migration',
    (await dump(`SELECT ${BUSINESS_COLS_OLD} FROM businesses ORDER BY id`)) === snap.businesses);
  check('business_documents rows identical on old columns after migration',
    (await dump(`SELECT ${DOC_COLS_OLD} FROM business_documents ORDER BY id`)) === snap.docs);
  const stripBizId = (rows) => rows.map(({ business_id: _b, ...rest }) => rest);
  check('products rows identical on old columns after migration (business_id excluded: the backfill legitimately sets it)',
    JSON.stringify(stripBizId(JSON.parse(await dump(`SELECT ${PRODUCT_COLS_OLD} FROM products ORDER BY id`)))) ===
    JSON.stringify(stripBizId(JSON.parse(snap.products))));
  check('users rows identical after migration',
    (await dump('SELECT id, name, phone, city FROM users ORDER BY id')) === snap.users);
  check('experience_locations rows identical after migration',
    (await dump('SELECT * FROM experience_locations ORDER BY id')) === snap.locations);

  // (b) New tables exist with correct columns and CHECKs.
  for (const t of ['hustle_business_reps', 'hustle_document_views', 'hustle_competitions',
    'hustle_applications', 'hustle_spend_items', 'hustle_pitch_photos', 'hustle_pitch_videos',
    'hustle_votes', 'hustle_vote_flags', 'hustle_results', 'hustle_notifications',
    'hustle_events', 'hustle_announcements']) {
    check('new table exists: ' + t, (await schemaOf(t)).length > 0);
  }
  check('competitions status CHECK has the 8 states',
    (await schemaOf('hustle_competitions')).includes("'draft', 'applications_open', 'applications_closed'") &&
    (await schemaOf('hustle_competitions')).includes("'voting_open', 'voting_closed', 'frozen'") &&
    (await schemaOf('hustle_competitions')).includes("'winner_announced', 'archived'"));
  check('competitions has NO winner column (winner lives in hustle_results)',
    !(await colsOf('hustle_competitions')).some((c) => c.startsWith('winner_') && c !== 'winner_at') &&
    !(await colsOf('hustle_competitions')).includes('winner_application_id'));
  check('votes UNIQUE is (voter_id, competition_id)',
    (await schemaOf('hustle_votes')).includes('UNIQUE (voter_id, competition_id)'));
  const oneLiveSql = (await ex(`SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_hustle_apps_one_live'`)).rows[0];
  check('applications have one LIVE entry per business (partial unique index, withdrawn/rejected excluded)',
    !!oneLiveSql && /CREATE UNIQUE INDEX/i.test(oneLiveSql.sql) &&
    oneLiveSql.sql.includes('(competition_id, business_id)') &&
    oneLiveSql.sql.includes("status NOT IN ('withdrawn', 'rejected')"),
    oneLiveSql ? oneLiveSql.sql : 'index missing');
  check('results has both UNIQUEs (competition+application, competition+rank)',
    (await schemaOf('hustle_results')).includes('UNIQUE (competition_id, application_id)') &&
    (await schemaOf('hustle_results')).includes('UNIQUE (competition_id, rank)'));
  check('pitch videos CHECK is the 4 platforms, no duration/size column',
    (await schemaOf('hustle_pitch_videos')).includes("'facebook', 'tiktok', 'youtube', 'instagram'") &&
    !(await colsOf('hustle_pitch_videos')).some((c) => /duration|size/.test(c)));
  check('reps PK is (business_id, user_id), status includes invited',
    (await schemaOf('hustle_business_reps')).includes('PRIMARY KEY (business_id, user_id)') &&
    (await schemaOf('hustle_business_reps')).includes("'invited', 'active', 'revoked'"));
  check('businesses verification_status CHECK untouched (no changes_requested)',
    (await schemaOf('businesses')).includes("'unverified', 'pending', 'verified', 'rejected'") &&
    !(await schemaOf('businesses')).includes('changes_requested'));
  check('products condition CHECK untouched',
    (await schemaOf('products')).includes("CHECK (condition IN ('New', 'Like new', 'Good', 'Fair'))"));
  for (const idx of ['idx_hustle_businesses_province', 'idx_hustle_businesses_district',
    'idx_hustle_products_business', 'idx_hustle_competitions_status', 'idx_hustle_apps_competition',
    'idx_hustle_apps_one_live',
    'idx_hustle_votes_competition', 'idx_hustle_results_competition', 'idx_hustle_notifications_user',
    'idx_hustle_events_business', 'idx_hustle_announcements_competition']) {
    const r = await ex(`SELECT name FROM sqlite_master WHERE type='index' AND name='${idx}'`);
    check('new index exists: ' + idx, r.rows.length === 1);
  }

  // (c) New columns present with defaults on migrated rows.
  for (const c of ['trading_name', 'province', 'district', 'location_id', 'business_type',
    'year_started', 'website', 'social_links', 'registration_number', 'is_draft',
    'hours_json', 'services_text']) {
    check('businesses has column: ' + c, (await colsOf('businesses')).includes(c));
  }
  for (const c of ['status', 'reviewed_by', 'reviewed_at', 'review_note', 'mime', 'size_bytes', 'filename']) {
    check('business_documents has column: ' + c, (await colsOf('business_documents')).includes(c));
  }
  check('products has column: listing_type', (await colsOf('products')).includes('listing_type'));
  const migratedBiz = JSON.parse(await dump('SELECT id, is_draft, social_links, hours_json, services_text FROM businesses ORDER BY id'));
  check('migrated businesses default is_draft 0, social_links [], hours/services empty',
    migratedBiz.every((r) => r.is_draft === 0 && r.social_links === '[]' && r.hours_json === '' && r.services_text === ''));
  const migratedProd = JSON.parse(await dump('SELECT id, listing_type FROM products ORDER BY id'));
  check("migrated products default listing_type 'goods'",
    migratedProd.every((r) => r.listing_type === 'goods'));

  // (d) Backfills.
  const b1 = JSON.parse(await dump('SELECT province, district, location_id FROM businesses WHERE id = 1'))[0];
  check('Lusaka business backfilled to Lusaka Province / Lusaka District + town location_id',
    b1.province === 'Lusaka Province' && b1.district === 'Lusaka District' && b1.location_id === 3,
    JSON.stringify(b1));
  const b2 = JSON.parse(await dump('SELECT province, district, location_id FROM businesses WHERE id = 2'))[0];
  check('Kitwe business backfilled to Copperbelt / Kitwe District + town location_id',
    b2.province === 'Copperbelt' && b2.district === 'Kitwe District' && b2.location_id === 5,
    JSON.stringify(b2));
  const b3 = JSON.parse(await dump('SELECT province, district, location_id FROM businesses WHERE id = 3'))[0];
  check("'Other' city business stays blank on province/district/location_id",
    b3.province === '' && b3.district === '' && b3.location_id === null, JSON.stringify(b3));
  const b4 = JSON.parse(await dump('SELECT province, district, location_id FROM businesses WHERE id = 4'))[0];
  check('Solwezi business backfilled province/district but NO location_id (town outside seed)',
    b4.province === 'North-Western' && b4.district === 'Solwezi District' && b4.location_id === null,
    JSON.stringify(b4));
  const docs = JSON.parse(await dump('SELECT id, status, mime, size_bytes, review_note FROM business_documents ORDER BY id'));
  check('verified business doc backfilled approved with mime + size',
    docs[0].status === 'approved' && docs[0].mime === 'image/jpeg' && docs[0].size_bytes > 0 &&
    docs[0].review_note.includes('Backfilled'), JSON.stringify(docs[0]));
  check('pending business PDF doc backfilled pending with mime application/pdf',
    docs[1].status === 'pending' && docs[1].mime === 'application/pdf' && docs[1].size_bytes > 0,
    JSON.stringify(docs[1]));
  check('rejected business doc backfilled rejected',
    docs[2].status === 'rejected', JSON.stringify(docs[2]));
  check('second doc of verified business backfilled approved too',
    docs[3].status === 'approved', JSON.stringify(docs[3]));
  const prods = JSON.parse(await dump('SELECT id, business_id FROM products ORDER BY id'));
  check('two-active-shop owner product stays NULL (ambiguous)',
    prods[0].business_id === null, JSON.stringify(prods[0]));
  check('no-shop seller product stays NULL',
    prods[1].business_id === null, JSON.stringify(prods[1]));
  check('exactly-one-active-shop seller product backfilled to that shop',
    prods[2].business_id === 5, JSON.stringify(prods[2]));
  check('two-active-shop Kitwe owner product stays NULL (ambiguous)',
    prods[3].business_id === null, JSON.stringify(prods[3]));

  // (e) Constraint enforcement spot checks on the new tables.
  await ex("INSERT INTO hustle_competitions (id, name, slug, prize_kwacha) VALUES (1, 'TEST Hustle', 'test-hustle', 10000)");
  await ex("INSERT INTO hustle_applications (id, competition_id, business_id, submitted_by) VALUES (1, 1, 1, 1)");
  await ex("INSERT INTO hustle_votes (competition_id, application_id, business_id, voter_id, voter_selfie_status_at_vote) VALUES (1, 1, 1, 5, 'approved')");
  let dupVoteRejected = false;
  try { await ex("INSERT INTO hustle_votes (competition_id, application_id, business_id, voter_id, voter_selfie_status_at_vote) VALUES (1, 1, 1, 5, 'approved')"); } catch { dupVoteRejected = true; }
  check('second vote by same voter in same competition rejected (UNIQUE)', dupVoteRejected);
  let dupAppRejected = false;
  try { await ex("INSERT INTO hustle_applications (competition_id, business_id, submitted_by) VALUES (1, 1, 2)"); } catch { dupAppRejected = true; }
  check('second application for same business+competition rejected (UNIQUE)', dupAppRejected);
  // A withdrawn application frees the business to apply again.
  await ex("UPDATE hustle_applications SET status = 'withdrawn' WHERE id = 1");
  let reapplyOk = false;
  try { await ex("INSERT INTO hustle_applications (competition_id, business_id, submitted_by) VALUES (1, 1, 2)"); reapplyOk = true; } catch { reapplyOk = false; }
  check('application after a withdraw is allowed (partial unique index)', reapplyOk);
  let badStatusRejected = false;
  try { await ex("UPDATE hustle_competitions SET status = 'completed' WHERE id = 1"); } catch { badStatusRejected = true; }
  check("competition status rejects non-listed value 'completed'", badStatusRejected);
  let badPlatformRejected = false;
  try { await ex("INSERT INTO hustle_pitch_videos (application_id, video_url, video_platform, uploaded_by) VALUES (1, 'https://example.com/x', 'vimeo', 1)"); } catch { badPlatformRejected = true; }
  check("pitch video rejects platform outside the 4 allowlisted", badPlatformRejected);
  let badListingRejected = false;
  try { await ex("UPDATE products SET listing_type = 'rental' WHERE id = 1"); } catch { badListingRejected = true; }
  check("products listing_type rejects values outside goods/service", badListingRejected);
  let badDocStatusRejected = false;
  try { await ex("UPDATE business_documents SET status = 'verified' WHERE id = 1"); } catch { badDocStatusRejected = true; }
  check("business_documents status rejects values outside pending/approved/rejected/changes_requested", badDocStatusRejected);
  let fkRejected = false;
  try { await ex("INSERT INTO hustle_votes (competition_id, application_id, business_id, voter_id, voter_selfie_status_at_vote) VALUES (999, 1, 1, 5, 'approved')"); } catch { fkRejected = true; }
  check('vote with nonexistent competition rejected (FK)', fkRejected);

  // (f) PRAGMA foreign_key_check clean.
  const fkCheck = await ex('PRAGMA foreign_key_check');
  check('PRAGMA foreign_key_check clean', fkCheck.rows.length === 0, JSON.stringify(fkCheck.rows));
  const fk = await ex('PRAGMA foreign_keys');
  check('foreign_keys back ON after migration', fk.rows[0] && fk.rows[0].foreign_keys === 1, JSON.stringify(fk.rows));

  // (g) init() runs cleanly twice more; data unchanged.
  const beforeSecond = await dump(`SELECT ${BUSINESS_COLS_OLD} FROM businesses ORDER BY id`);
  const docsBefore = await dump('SELECT id, status, mime, size_bytes FROM business_documents ORDER BY id');
  const prodsBefore = await dump('SELECT id, business_id, listing_type FROM products ORDER BY id');
  await init();
  check('init() runs cleanly a second time on the migrated file', true);
  await init();
  check('init() runs cleanly a third time on the migrated file', true);
  check('second/third init() left businesses data unchanged',
    (await dump(`SELECT ${BUSINESS_COLS_OLD} FROM businesses ORDER BY id`)) === beforeSecond);
  check('second/third init() left document backfill unchanged',
    (await dump('SELECT id, status, mime, size_bytes FROM business_documents ORDER BY id')) === docsBefore);
  check('second/third init() left product backfill unchanged',
    (await dump('SELECT id, business_id, listing_type FROM products ORDER BY id')) === prodsBefore);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) console.log('Failures: ' + failures.join(' | '));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });

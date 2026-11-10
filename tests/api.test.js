'use strict';
/**
 * 2911 Jobs API end-to-end tests.
 *
 * Boots the real server against a throwaway local database (synthetic
 * users only, never production data), then walks the full user journeys
 * over HTTP: registration, orientation, jobs, applications, the NRC flow,
 * admin boards, and the M0 safety pack (reports, blocking, suspension,
 * audit log, managed categories).
 *
 * Run: npm test   (exit code 0 = all passed)
 */
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

const APP = path.join(__dirname, '..');
const DB = '/tmp/pwz2-test.db';
const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_PHONE_INPUT = '0970000001';
const ADMIN_PHONE_NORM = '+260970000001';
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

let server;
let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, extra) {
  if (cond) { passed++; console.log('PASS  ' + name); }
  else { failed++; failures.push(name); console.log('FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

async function call(method, p, body, cookie) {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  const all = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  const tok = all.find(c => c.startsWith('pw_token='));
  return { status: r.status, json, cookie: tok ? tok.split(';')[0] : null };
}

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/'); if (r.status) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('server did not come up');
}

// Direct read/write access to the throwaway test database. The signup
// OTP suite uses it the way the reset-code checks use sms_log: the code
// itself only ever exists in the logged SMS body and the hashed pending
// row, so tests read the code back out of sms_log.
// Created lazily on first use: the suite deletes and recreates the DB
// file while booting, so an early client would hold the unlinked inode.
let testDb = null;
function getTestDb() {
  if (!testDb) testDb = createClient({ url: 'file:' + DB });
  return testDb;
}

function normalizedTestPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('260')) return '+' + digits;
  if (digits.startsWith('0')) return '+260' + digits.slice(1);
  return '+' + digits;
}

async function dbExecute(sql, args = []) {
  let lastErr;
  for (let i = 0; i < 12; i++) {
    try { return await getTestDb().execute({ sql, args }); }
    catch (e) {
      lastErr = e;
      if (!/locked|busy/i.test(String(e && e.message))) throw e;
      await new Promise(r => setTimeout(r, 100));
    }
  }
  throw lastErr;
}

async function dbOne(sql, args = []) {
  const rs = await dbExecute(sql, args);
  return rs.rows[0] || null;
}

async function latestSignupCode(phone) {
  const norm = normalizedTestPhone(phone);
  for (let i = 0; i < 20; i++) {
    const row = await dbOne(
      "SELECT body FROM sms_log WHERE phone = ? AND kind = 'signup_code' ORDER BY id DESC LIMIT 1",
      [norm]
    );
    const m = row && String(row.body || '').match(/signup code is (\d{6})/);
    if (m) return m[1];
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('no signup code found in sms_log for ' + norm);
}

async function registerUser(name, phone, city) {
  const start = await call('POST', '/api/auth/register', { name, phone, password: 'test-pass-123', city, avatar: IMG, selfie: IMG });
  if (!(start.status === 200 && start.json.verification_required)) {
    throw new Error('register start failed for ' + name + ': ' + JSON.stringify(start.json).slice(0, 200));
  }
  const code = await latestSignupCode(phone);
  const verify = await call('POST', '/api/auth/register/verify', { phone, code });
  if (!(verify.status === 201 && verify.cookie)) {
    throw new Error('register verify failed for ' + name + ': ' + JSON.stringify(verify.json).slice(0, 200));
  }
  return { cookie: verify.cookie, id: verify.json.user.id, name };
}

(async () => {
  try { fs.unlinkSync(DB); } catch { /* fresh db */ }
  server = spawn('node', ['server.js'], {
    cwd: APP,
    env: { ...process.env, DB_PATH: DB, PORT: String(PORT), ADMIN_PHONES: ADMIN_PHONE_NORM, VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', MAIL_TRANSPORT: 'stream', BREVO_SMTP_USER: 'test@smtp-brevo.com', BREVO_SMTP_PASS: 'test-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', d => process.stderr.write('[server] ' + d));
  await waitUp();

  // ---------- Baseline: accounts, jobs, applications ----------
  const admin = await registerUser('Admin Tester', ADMIN_PHONE_INPUT, 'Lusaka');
  const worker = await registerUser('Worker Tester', '0970000002', 'Kitwe');
  const third = await registerUser('Third Tester', '0970000003', 'Ndola');
  check('register + login three synthetic users', true);

  const ori = await call('PATCH', '/api/users/me', { orientation_accepted: true }, worker.cookie);
  check('worker completes orientation', ori.status === 200);

  const jobRes = await call('POST', '/api/jobs', {
    title: 'Test gardening job', category: 'Gardening', description: 'Cut the grass and tidy the yard.',
    city: 'Lusaka', area: 'Kabulonga', date_needed: '2026-11-20', pay_amount: 150, pay_type: 'per_day',
    workers_needed: 1, terms_accepted: true,
  }, admin.cookie);
  check('poster creates a job', jobRes.status === 200 || jobRes.status === 201, JSON.stringify(jobRes.json).slice(0, 160));
  const jobId = jobRes.json.job ? jobRes.json.job.id : jobRes.json.id;

  const apply = await call('POST', `/api/jobs/${jobId}/apply`, { message: 'I can do this job.' }, worker.cookie);
  check('worker applies', apply.status === 200 || apply.status === 201, JSON.stringify(apply.json).slice(0, 160));
  const appId = apply.json.id;

  const dup = await call('POST', `/api/jobs/${jobId}/apply`, { message: 'Again.' }, worker.cookie);
  check('duplicate application rejected', dup.status >= 400, 'status ' + dup.status);

  // ---------- Baseline: admin boards ----------
  const forbidden = await call('GET', '/api/admin/activity', null, worker.cookie);
  check('non-admin blocked from activity board (403)', forbidden.status === 403);
  const act = await call('GET', '/api/admin/activity', null, admin.cookie);
  const wRow = (act.json.users || []).find(u => u.id === worker.id);
  check('activity board lists worker with last seen + 1 application', !!wRow && !!wRow.last_seen_at && wRow.applications === 1);
  const byName = await call('GET', '/api/admin/activity?q=' + encodeURIComponent('worker test'), null, admin.cookie);
  check('member search finds by name, any case', (byName.json.users || []).some(u => u.id === worker.id));
  const byPhone = await call('GET', '/api/admin/activity?q=970000002', null, admin.cookie);
  check('member search finds by phone digits', (byPhone.json.users || []).some(u => u.id === worker.id));
  const byLocal = await call('GET', '/api/admin/activity?q=0970000002', null, admin.cookie);
  check('member search finds by local phone form', (byLocal.json.users || []).some(u => u.id === worker.id));
  const noMatch = await call('GET', '/api/admin/activity?q=zzzz-nomatch', null, admin.cookie);
  check('member search with no match returns empty', noMatch.status === 200 && (noMatch.json.users || []).length === 0);
  const memberSearch = await call('GET', '/api/admin/activity?q=worker', null, third.cookie);
  check('member search stays admin-only (403)', memberSearch.status === 403);
  const badEdit = await call('PATCH', '/api/admin/users/' + worker.id + '/profile', { name: 'W', city: 'Kitwe' }, admin.cookie);
  check('ADMIN EDIT: too-short name rejected (422)', badEdit.status === 422, 'status ' + badEdit.status);
  const edit = await call('PATCH', '/api/admin/users/' + worker.id + '/profile', { name: 'Worker Tester II', city: 'Ndola', phone: '+260999999999' }, admin.cookie);
  check('ADMIN EDIT: admin can fix name and city', edit.status === 200 && edit.json.name === 'Worker Tester II' && edit.json.city === 'Ndola', JSON.stringify(edit.json).slice(0, 120));
  const relogin = await call('POST', '/api/auth/login', { phone: '0970000002', password: 'test-pass-123' });
  check('ADMIN EDIT: phone sign-in untouched by the edit', relogin.status === 200 && !!relogin.cookie, 'status ' + relogin.status);
  await call('PATCH', '/api/admin/users/' + worker.id + '/profile', { name: 'Worker Tester', city: 'Kitwe' }, admin.cookie);
  const editDenied = await call('PATCH', '/api/admin/users/' + worker.id + '/profile', { name: 'Nope Nope', city: 'Lusaka' }, third.cookie);
  check('ADMIN EDIT: members cannot edit other profiles (403)', editDenied.status === 403, 'status ' + editDenied.status);
  const docBad = await call('POST', '/api/admin/users/' + worker.id + '/request-doc', { kind: 'passport' }, admin.cookie);
  check('DOC REQUEST: unknown document kind rejected (422)', docBad.status === 422, 'status ' + docBad.status);
  const docDenied = await call('POST', '/api/admin/users/' + worker.id + '/request-doc', { kind: 'selfie' }, third.cookie);
  check('DOC REQUEST: members cannot request documents (403)', docDenied.status === 403, 'status ' + docDenied.status);
  const forgot = await call('POST', '/api/auth/forgot', { phone: '0970000003' });
  check('RESET LOG: forgot-password finds the account', forgot.status === 200 && forgot.json.account_found === true, JSON.stringify(forgot.json).slice(0, 120));
  let resetRow = {};
  for (let i = 0; i < 16 && !resetRow.kind; i++) {
    const slog = await call('GET', '/api/admin/sms-log', null, admin.cookie);
    resetRow = (slog.json.sms_log || []).find(r => r.user_id === third.id && r.kind === 'password_reset') || {};
    if (!resetRow.kind) await new Promise(r => setTimeout(r, 250));
  }
  check('RESET LOG: the reset send is written to the admin SMS log', resetRow.kind === 'password_reset' && (resetRow.status === 'sent' || resetRow.status === 'skipped'), JSON.stringify(resetRow).slice(0, 140));

  // ---------- Baseline: hire + NRC flow ----------
  const acc = await call('PATCH', `/api/applications/${appId}`, { status: 'accepted' }, admin.cookie);
  check('poster accepts application', acc.status === 200);
  const up = await call('POST', `/api/applications/${appId}/nrc`, { image: IMG, nrc_number: '123456/11/1' }, worker.cookie);
  check('worker uploads NRC after hire', up.status === 200 || up.status === 201, JSON.stringify(up.json).slice(0, 160));
  const viewByWorker = await call('GET', `/api/applications/${appId}/nrc`, null, worker.cookie);
  check('worker cannot use the poster NRC view (403)', viewByWorker.status === 403);
  const view1 = await call('GET', `/api/applications/${appId}/nrc`, null, admin.cookie);
  check('poster views NRC, number normalized', view1.status === 200 && view1.json.nrc_number === '123456/11/1');
  const nrcLog = await call('GET', '/api/admin/nrc-views', null, admin.cookie);
  check('NRC view is in the admin access log', (nrcLog.json.views || []).length >= 1);

  // ---------- Baseline: tester tracker ----------
  const flag = await call('PATCH', `/api/admin/users/${worker.id}/tester`, { is_tester: true }, admin.cookie);
  check('admin flags a tester', flag.status === 200 && flag.json.is_tester === true);
  const trackers = await call('GET', '/api/admin/testers', null, admin.cookie);
  const tRow = (trackers.json.testers || []).find(u => u.id === worker.id);
  check('tester tracker shows the tester active today', !!tRow && tRow.active_days.includes(trackers.json.today));

  // ---------- M0: managed categories ----------
  const cats = await call('GET', '/api/categories');
  const catNames = (cats.json.categories || []).map(c => c.name);
  check('categories endpoint lists the seeded job categories', catNames.includes('Gardening') && catNames.includes('Carpentry'), catNames.join(','));
  const tradesJob = await call('POST', '/api/jobs', {
    title: 'Fix a leaking tap', category: 'Plumbing', description: 'Bathroom tap leaks steadily.',
    city: 'Lusaka', area: 'Chelston', date_needed: '2026-11-21', pay_amount: 200, pay_type: 'per_job',
    workers_needed: 1, terms_accepted: true,
  }, admin.cookie);
  check('job in a trades category (Plumbing) posts successfully', tradesJob.status === 200 || tradesJob.status === 201, JSON.stringify(tradesJob.json).slice(0, 160));
  const newCat = await call('POST', '/api/admin/categories', { name: 'Solar Installation' }, admin.cookie);
  check('admin adds a category', newCat.status === 200 || newCat.status === 201, JSON.stringify(newCat.json).slice(0, 160));
  const cats2 = await call('GET', '/api/categories');
  check('new category appears in the public list', (cats2.json.categories || []).some(c => c.name === 'Solar Installation'));
  const catByWorker = await call('POST', '/api/admin/categories', { name: 'Nope' }, worker.cookie);
  check('non-admin cannot add categories (403)', catByWorker.status === 403);

  // ---------- M0: abuse reports ----------
  const rep = await call('POST', '/api/reports', { target_type: 'job', target_id: jobId, reason: 'Looks like a scam posting.' }, third.cookie);
  check('user reports a job', rep.status === 200 || rep.status === 201, JSON.stringify(rep.json).slice(0, 160));
  const repQueue = await call('GET', '/api/admin/reports?status=open', null, admin.cookie);
  const repRow = (repQueue.json.reports || []).find(r => r.id === (rep.json.id || rep.json.report_id));
  check('report lands in the admin queue with reporter + target', !!repRow && repRow.reason.includes('scam'));
  const repResolve = await call('PATCH', `/api/admin/reports/${rep.json.id || rep.json.report_id}`, { status: 'resolved', note: 'Checked, poster verified.' }, admin.cookie);
  check('admin resolves the report', repResolve.status === 200);
  const repSelf = await call('POST', '/api/reports', { target_type: 'user', target_id: third.id, reason: 'Self report.' }, third.cookie);
  check('cannot report yourself', repSelf.status >= 400, 'status ' + repSelf.status);

  // ---------- M0: blocking ----------
  const tradesJobId = tradesJob.json.job ? tradesJob.json.job.id : tradesJob.json.id;
  await call('PATCH', '/api/users/me', { orientation_accepted: true }, third.cookie);
  const apply3 = await call('POST', `/api/jobs/${tradesJobId}/apply`, { message: 'I can fix taps.' }, third.cookie);
  check('third user applies to the trades job', apply3.status === 200 || apply3.status === 201, JSON.stringify(apply3.json).slice(0, 160));
  const block = await call('POST', `/api/blocks/${third.id}`, {}, admin.cookie);
  check('poster blocks the third user', block.status === 200 || block.status === 201, JSON.stringify(block.json).slice(0, 160));
  const convBlocked = await call('POST', '/api/conversations', { job_id: tradesJobId, worker_id: third.id }, admin.cookie);
  check('a block stops conversation creation between the two users', convBlocked.status === 403, 'status ' + convBlocked.status);
  const job3 = await call('POST', '/api/jobs', {
    title: 'Paint a fence', category: 'Painting', description: 'Two panels, white paint provided.',
    city: 'Lusaka', area: 'Woodlands', date_needed: '2026-11-22', pay_amount: 300, pay_type: 'per_job',
    workers_needed: 1, terms_accepted: true,
  }, admin.cookie);
  const job3Id = job3.json.job ? job3.json.job.id : job3.json.id;
  const applyBlocked = await call('POST', `/api/jobs/${job3Id}/apply`, { message: 'I paint.' }, third.cookie);
  check('blocked user cannot apply to the blocker\u2019s jobs', applyBlocked.status === 403, 'status ' + applyBlocked.status + ' ' + JSON.stringify(applyBlocked.json).slice(0, 120));
  const unblock = await call('DELETE', `/api/blocks/${third.id}`, null, admin.cookie);
  check('unblock works', unblock.status === 200);
  const convOk = await call('POST', '/api/conversations', { job_id: tradesJobId, worker_id: third.id }, admin.cookie);
  check('conversation works again after unblock', convOk.status === 200 || convOk.status === 201, 'status ' + convOk.status);

  // ---------- M0: suspension ----------
  const suspend = await call('PATCH', `/api/admin/users/${third.id}/suspend`, { reason: 'Test suspension' }, admin.cookie);
  check('admin suspends a user', suspend.status === 200, JSON.stringify(suspend.json).slice(0, 160));
  const loginSuspended = await call('POST', '/api/auth/login', { phone: '0970000003', password: 'test-pass-123' });
  check('suspended user cannot log in', loginSuspended.status === 403, 'status ' + loginSuspended.status);
  const apiSuspended = await call('GET', '/api/auth/me', null, third.cookie);
  check('suspended user session is rejected by the API', apiSuspended.status === 403, 'status ' + apiSuspended.status);
  const reinstate = await call('PATCH', `/api/admin/users/${third.id}/suspend`, { suspended: false }, admin.cookie);
  check('admin reinstates the user', reinstate.status === 200);
  const loginAgain = await call('POST', '/api/auth/login', { phone: '0970000003', password: 'test-pass-123' });
  check('reinstated user can log in again', !!loginAgain.cookie);

  // ---------- M0: audit log ----------
  const audit = await call('GET', '/api/admin/audit', null, admin.cookie);
  const actions = (audit.json.entries || []).map(e => e.action);
  check('audit log records suspension', actions.includes('user.suspend'), actions.join(','));
  check('audit log records category creation', actions.includes('category.create'), actions.join(','));
  check('audit log records report resolution', actions.includes('report.resolve'), actions.join(','));
  const auditByWorker = await call('GET', '/api/admin/audit', null, worker.cookie);
  check('non-admin blocked from audit log (403)', auditByWorker.status === 403);

  // ---------- 2.0 M1: Jobs 2.0 ----------
  const p2 = await registerUser('M1 Poster', '0970000011', 'Lusaka');
  const w2 = await registerUser('M1 Worker', '0970000012', 'Lusaka');
  await call('PATCH', '/api/users/me', { orientation_accepted: true }, w2.cookie);
  await call('PATCH', '/api/users/me', { skills: ['Plumbing'] }, w2.cookie);
  const w3 = await registerUser('M1 Distant', '0970000013', 'Livingstone');

  const j1 = await call('POST', '/api/jobs', {
    title: 'Fix a leaking kitchen sink', category: 'Plumbing',
    description: 'Kitchen sink leaks under the cabinet, needs a proper fix.',
    city: 'Lusaka', area: 'Kabulonga', date_needed: '2026-11-23', pay_amount: 450,
    pay_type: 'per_job', workers_needed: 1, terms_accepted: true,
    expected_duration: '1 day', start_time: '08:00', transport_provided: '1',
    materials_provided: '0', is_urgent: '1', instructions: 'Call when you arrive at the gate.',
    photos: [IMG, IMG],
  }, p2.cookie);
  check('M1: job with photos + extras creates', j1.status === 201, JSON.stringify(j1.json).slice(0, 160));
  const j1id = j1.json.id;
  const d1 = await call('GET', '/api/jobs/' + j1id, null, w2.cookie);
  const d1j = d1.json.job || {};
  check('M1: detail carries photos + extras', (d1j.photos || []).length === 2
    && d1j.expected_duration === '1 day' && d1j.is_urgent === true
    && d1j.transport_provided === true && d1j.materials_provided === false
    && (d1j.instructions || '').includes('gate'), JSON.stringify(d1.json).slice(0, 220));
  const lst = await call('GET', '/api/jobs?category=Plumbing', null, w2.cookie);
  const lrow = (lst.json.jobs || []).find(x => x.id === j1id) || {};
  check('M1: list has photo_count + cover, hides instructions', lrow.photo_count === 2
    && typeof lrow.cover_photo === 'string' && lrow.cover_photo.includes('/photos/')
    && lrow.instructions === undefined, JSON.stringify(lrow).slice(0, 200));
  const photoRes = await fetch(BASE + (d1j.photos && d1j.photos[0] ? d1j.photos[0].url : '/missing'));
  check('M1: photo endpoint serves image bytes', photoRes.status === 200
    && (photoRes.headers.get('content-type') || '').startsWith('image/'), 'status ' + photoRes.status);

  const fMin = await call('GET', '/api/jobs?category=Plumbing&pay_min=500', null, w2.cookie);
  check('M1: pay_min filter excludes K450 job', !(fMin.json.jobs || []).some(x => x.id === j1id));
  const fMax = await call('GET', '/api/jobs?category=Plumbing&pay_max=500', null, w2.cookie);
  check('M1: pay_max filter includes K450 job', (fMax.json.jobs || []).some(x => x.id === j1id));
  const fDur = await call('GET', '/api/jobs?category=Plumbing&duration=' + encodeURIComponent('About a week'), null, w2.cookie);
  check('M1: duration filter excludes 1-day job', !(fDur.json.jobs || []).some(x => x.id === j1id));
  const fUrg = await call('GET', '/api/jobs?urgent=1', null, w2.cookie);
  check('M1: urgent filter returns only urgent jobs', (fUrg.json.jobs || []).length > 0
    && (fUrg.json.jobs || []).every(x => x.is_urgent === true)
    && (fUrg.json.jobs || []).some(x => x.id === j1id));

  const dr = await call('POST', '/api/jobs', { title: 'Half-written job idea', draft: true }, p2.cookie);
  check('M1: draft creates with title only', dr.status === 201 && dr.json.draft === true, JSON.stringify(dr.json).slice(0, 160));
  const drId = dr.json.id;
  const drPublic = await call('GET', '/api/jobs?q=' + encodeURIComponent('Half-written'), null, w2.cookie);
  check('M1: draft hidden from public list', !(drPublic.json.jobs || []).some(x => x.id === drId));
  const drMine = await call('GET', '/api/jobs?mine=1', null, p2.cookie);
  check('M1: draft visible in poster mine list', (drMine.json.jobs || []).some(x => x.id === drId));
  const drOther = await call('GET', '/api/jobs/' + drId, null, w2.cookie);
  check('M1: draft detail is 404 to others', drOther.status === 404, 'status ' + drOther.status);
  const drApply = await call('POST', `/api/jobs/${drId}/apply`, { message: 'Early?' }, w2.cookie);
  check('M1: cannot apply to a draft', drApply.status === 422, 'status ' + drApply.status);
  const pubEarly = await call('POST', `/api/jobs/${drId}/publish`, { terms_accepted: true }, p2.cookie);
  check('M1: publish blocked while fields are missing', pubEarly.status === 422, 'status ' + pubEarly.status);
  const complete = await call('PATCH', '/api/jobs/' + drId, {
    category: 'Cleaning', description: 'Deep clean a two bedroom flat before tenants move in.',
    city: 'Lusaka', date_needed: '2026-11-24', pay_amount: 300, pay_type: 'per_day',
  }, p2.cookie);
  check('M1: draft can be completed by edit', complete.status === 200, JSON.stringify(complete.json).slice(0, 160));
  const pub = await call('POST', `/api/jobs/${drId}/publish`, { terms_accepted: true }, p2.cookie);
  const pubDetail = await call('GET', '/api/jobs/' + drId, null, w2.cookie);
  check('M1: completed draft publishes', pub.status === 200 && pub.json.ok === true
    && pubDetail.status === 200 && (pubDetail.json.job || {}).is_draft === false,
    JSON.stringify(pub.json).slice(0, 160));

  const appM1 = await call('POST', `/api/jobs/${j1id}/apply`, { message: 'Plumber, ready.' }, w2.cookie);
  const appM1Id = appM1.json.id;
  check('M1: worker applies to photo job', (appM1.status === 200 || appM1.status === 201) && !!appM1Id, JSON.stringify(appM1.json).slice(0, 160));
  async function appStatus() {
    const r = await call('GET', `/api/jobs/${j1id}/applications`, null, p2.cookie);
    const row = (r.json.applications || []).find(a => a.id === appM1Id) || {};
    return row.status;
  }
  const sl = await call('PATCH', `/api/applications/${appM1Id}`, { status: 'shortlisted' }, p2.cookie);
  check('M1: poster shortlists application', sl.status === 200 && (await appStatus()) === 'shortlisted', JSON.stringify(sl.json).slice(0, 160));
  const unsl = await call('PATCH', `/api/applications/${appM1Id}`, { status: 'pending' }, p2.cookie);
  check('M1: poster moves back to pending', unsl.status === 200 && (await appStatus()) === 'pending');
  await call('PATCH', `/api/applications/${appM1Id}`, { status: 'shortlisted' }, p2.cookie);
  const accFromSl = await call('PATCH', `/api/applications/${appM1Id}`, { status: 'accepted' }, p2.cookie);
  check('M1: accept works from shortlisted', accFromSl.status === 200 && (await appStatus()) === 'accepted');
  const wSl = await call('PATCH', `/api/applications/${appM1Id}`, { status: 'shortlisted' }, w2.cookie);
  check('M1: worker cannot shortlist (not the poster)', wSl.status >= 400, 'status ' + wSl.status);

  const rp = await call('POST', `/api/jobs/${j1id}/repost`, { date_needed: '2026-11-27', terms_accepted: true }, p2.cookie);
  check('M1: repost creates a new job', rp.status === 201 && rp.json.id && rp.json.id !== j1id, JSON.stringify(rp.json).slice(0, 160));
  const rpDetail = await call('GET', '/api/jobs/' + rp.json.id, null, p2.cookie);
  const rpj = rpDetail.json.job || {};
  check('M1: repost copies photos + extras', (rpj.photos || []).length === 2
    && rpj.expected_duration === '1 day' && rpj.is_urgent === true);
  const rpPast = await call('POST', `/api/jobs/${j1id}/repost`, { date_needed: '2020-01-01', terms_accepted: true }, p2.cookie);
  check('M1: repost rejects a past date', rpPast.status === 422, 'status ' + rpPast.status);

  await call('POST', '/api/jobs', {
    title: 'Livingstone falls guide needed', category: 'Tourism & Hospitality',
    description: 'Guide needed for a day trip group at the falls entrance.',
    city: 'Livingstone', area: 'Falls', date_needed: '2026-11-25', pay_amount: 500,
    pay_type: 'per_day', workers_needed: 1, terms_accepted: true,
  }, p2.cookie);
  const rec = await call('GET', '/api/jobs/recommended', null, w2.cookie);
  const recIds = (rec.json.jobs || []).map(x => x.id);
  // Note: j1 itself is 'filled' by now (its one worker was accepted above),
  // so the open match to assert on is its repost, same city + category.
  const recRow = (rec.json.jobs || []).find(x => x.id === rp.json.id) || {};
  check('M1: recommendations include same-city skills match with reason', recIds.includes(rp.json.id)
    && typeof recRow.recommend_reason === 'string' && recRow.recommend_reason.includes('Matches your skills'),
    JSON.stringify(rec.json).slice(0, 200));
  check('M1: recommendations exclude own jobs', !(rec.json.jobs || []).some(x => x.poster_id === w2.id));
  const recDistant = await call('GET', '/api/jobs/recommended', null, w3.cookie);
  check('M1: recommendations still answer for distant user', recDistant.status === 200 && Array.isArray(recDistant.json.jobs));

  // ---------- 2.0 M2: global search people filter ----------
  await call('PATCH', '/api/users/me', { open_to_work: true }, w2.cookie);
  const wq = await call('GET', '/api/workers?q=' + encodeURIComponent('plumbing'), null, p2.cookie);
  check('M2: workers search finds the plumber by skill', (wq.json.workers || []).some(x => x.id === w2.id),
    JSON.stringify(wq.json).slice(0, 160));
  const wq2 = await call('GET', '/api/workers?q=' + encodeURIComponent('zzzz-nomatch'), null, p2.cookie);
  check('M2: workers search with no match returns empty', (wq2.json.workers || []).length === 0);

  // List payloads must not embed profile photos as base64 (v82): the
  // workers list alone shipped ~2.3 MB in production and crawled on
  // mobile data. Avatars travel as the cached /api/users/:id/avatar URL.
  const wqWorker = (wq.json.workers || []).find(x => x.id === w2.id) || {};
  check('PAYLOAD: worker avatar is an image URL, not base64', String(wqWorker.avatar || '').startsWith('/api/users/') && !JSON.stringify(wq.json).includes('data:image'), String(wqWorker.avatar).slice(0, 60));
  check('PAYLOAD: workers feed carries no embedded file data at all', !JSON.stringify(wq.json).includes('base64,'), 'the slim read behind the Oct 27 crash fix (v84)');
  const jq = await call('GET', '/api/jobs?q=' + encodeURIComponent('plumbing'), null, w2.cookie);
  // j1 itself is filled by now; its open repost (same title, no "plumbing"
  // in title or description) is the category-match proof.
  check('M2: job search matches by category word', (jq.json.jobs || []).some(x => x.id === rp.json.id),
    JSON.stringify(jq.json).slice(0, 160));

  // ---------- 2.0 M3: Marketplace ----------
  const mcats = await call('GET', '/api/categories?kind=market', null, p2.cookie);
  check('M3: 16 market categories seeded', (mcats.json.categories || []).length === 16
    && (mcats.json.categories || []).some(c => c.name === 'Electronics'),
    JSON.stringify(mcats.json).slice(0, 160));
  const badProd = await call('POST', '/api/products', {
    title: 'Ok', category: 'Nonsense', description: 'short', city: 'Lusaka', price: -5,
  }, p2.cookie);
  check('M3: invalid product rejected (422)', badProd.status === 422, 'status ' + badProd.status);
  const prod = await call('POST', '/api/products', {
    title: 'Samsung Galaxy A15 phone', category: 'Phones & Tablets',
    description: 'Clean Samsung Galaxy A15, 128GB, small crack on the back cover.',
    city: 'Lusaka', area: 'Kamwala', price: 2800, condition: 'Good', photos: [IMG, IMG],
  }, p2.cookie);
  check('M3: seller lists a product with photos', prod.status === 201 && !!prod.json.id, JSON.stringify(prod.json).slice(0, 160));
  const prodId = prod.json.id;
  const dupProd = await call('POST', '/api/products', {
    title: 'samsung galaxy a15 PHONE', category: 'Phones & Tablets',
    description: 'Same title again, different case, should be blocked.',
    city: 'Lusaka', price: 2500,
  }, p2.cookie);
  check('M3: duplicate title blocked (409)', dupProd.status === 409, 'status ' + dupProd.status);
  const mlist = await call('GET', '/api/products?category=' + encodeURIComponent('Phones & Tablets'), null, w2.cookie);
  const mrow = (mlist.json.products || []).find(x => x.id === prodId) || {};
  check('M3: market list filters by category, has cover', !!mrow.id && mrow.photo_count === 2
    && typeof mrow.cover_photo === 'string' && mrow.seller_name === 'M1 Poster');
  const msearch = await call('GET', '/api/products?q=' + encodeURIComponent('galaxy'), null, w2.cookie);
  check('M3: market search finds by title word', (msearch.json.products || []).some(x => x.id === prodId));
  const mprice = await call('GET', '/api/products?price_max=1000', null, w2.cookie);
  check('M3: price filter excludes the K2,800 phone', !(mprice.json.products || []).some(x => x.id === prodId));
  const pdetail = await call('GET', '/api/products/' + prodId, null, w2.cookie);
  check('M3: product detail has photos + seller block', (pdetail.json.product || {}).photos
    && pdetail.json.product.photos.length === 2 && pdetail.json.product.seller_name === 'M1 Poster'
    && typeof pdetail.json.product.seller_verified === 'boolean',
    JSON.stringify(pdetail.json).slice(0, 200));
  const pphoto = await fetch(BASE + '/api/products/' + prodId + '/photos/' + pdetail.json.product.photos[0].id);
  check('M3: product photo endpoint serves image', pphoto.status === 200
    && (pphoto.headers.get('content-type') || '').startsWith('image/'));
  const ownOffer = await call('POST', `/api/products/${prodId}/offers`, { amount: 2500 }, p2.cookie);
  check('M3: cannot offer on own item (422)', ownOffer.status === 422, 'status ' + ownOffer.status);
  const offer = await call('POST', `/api/products/${prodId}/offers`, { amount: 2400, message: 'Cash today.' }, w2.cookie);
  check('M3: buyer makes an offer', offer.status === 201 && !!offer.json.id, JSON.stringify(offer.json).slice(0, 120));
  const offerId = offer.json.id;
  const offer2 = await call('POST', `/api/products/${prodId}/offers`, { amount: 2500 }, w2.cookie);
  check('M3: second offer updates the pending one', offer2.status === 200 && offer2.json.updated === true && offer2.json.id === offerId);
  const sellerOffers = await call('GET', `/api/products/${prodId}/offers`, null, p2.cookie);
  const so = (sellerOffers.json.offers || [])[0] || {};
  check('M3: seller sees the offer at the updated amount', so.amount === 2500 && so.buyer_name === 'M1 Worker');
  const wAccept = await call('PATCH', `/api/offers/${offerId}`, { status: 'accepted' }, w2.cookie);
  check('M3: buyer cannot accept own offer (403)', wAccept.status === 403, 'status ' + wAccept.status);
  const accOffer = await call('PATCH', `/api/offers/${offerId}`, { status: 'accepted' }, p2.cookie);
  check('M3: seller accepts the offer', accOffer.status === 200 && accOffer.json.status === 'accepted');
  const pconv = await call('POST', '/api/conversations/product', { product_id: prodId }, w2.cookie);
  check('M3: buyer opens a product chat', pconv.status === 201 && !!pconv.json.conversation_id, JSON.stringify(pconv.json).slice(0, 120));
  const pconvId = pconv.json.conversation_id;
  const pmsg = await call('POST', `/api/conversations/${pconvId}/messages`, { body: 'Hi, is the phone still available?' }, w2.cookie);
  check('M3: product chat messaging works', pmsg.status === 201, 'status ' + pmsg.status);
  const pchat = await call('GET', `/api/conversations/${pconvId}`, null, p2.cookie);
  const pc = pchat.json.conversation || {};
  check('M3: chat is a product thread, phone revealed after accepted offer',
    pc.kind === 'product' && pc.job_title === 'Samsung Galaxy A15 phone' && !!pc.other_phone,
    JSON.stringify(pc).slice(0, 200));
  const convList = await call('GET', '/api/conversations', null, w2.cookie);
  const lc = (convList.json.conversations || []).find(x => x.id === pconvId) || {};
  check('M3: conversation list carries product kind + presence', lc.kind === 'product'
    && lc.other_name === 'M1 Poster' && typeof lc.other_online === 'boolean');
  const sum = await call('GET', '/api/selling/summary', null, p2.cookie);
  check('M3: selling summary counts', sum.json.active === 1 && sum.json.offers_pending === 0,
    JSON.stringify(sum.json));
  const hide = await call('PATCH', `/api/products/${prodId}`, { status: 'hidden' }, p2.cookie);
  const hiddenList = await call('GET', '/api/products', null, w2.cookie);
  check('M3: hidden item leaves the public list', hide.status === 200
    && !(hiddenList.json.products || []).some(x => x.id === prodId));
  const hiddenDetail = await call('GET', '/api/products/' + prodId, null, w2.cookie);
  check('M3: hidden item is 404 to other users', hiddenDetail.status === 404, 'status ' + hiddenDetail.status);
  const soldPatch = await call('PATCH', `/api/products/${prodId}`, { status: 'sold' }, p2.cookie);
  check('M3: owner marks sold', soldPatch.status === 200);
  const sum2 = await call('GET', '/api/selling/summary', null, p2.cookie);
  check('M3: summary reflects the sale', sum2.json.sold === 1 && sum2.json.active === 0, JSON.stringify(sum2.json));

  // ---------- 2.0 M3b: seller messages the buyer from a received offer ----------
  // The buyer-side product chat only lets the buyer write first; a seller
  // holding an offer needs the first move too (the accept toast already
  // tells sellers to "Message the buyer").
  const scSeller = await registerUser('Seller Chat Seller', '0970000021', 'Lusaka');
  const scBuyer = await registerUser('Seller Chat Buyer', '0970000022', 'Kitwe');
  const scOther = await registerUser('Seller Chat Other', '0970000023', 'Ndola');
  const scProd = await call('POST', '/api/products', {
    title: 'Seller chat test phone', category: 'Phones & Tablets',
    description: 'Listed only to exercise seller-first messaging on offers.',
    city: 'Lusaka', price: 1500, condition: 'Good', photos: [IMG],
  }, scSeller.cookie);
  check('M3b: seller lists an item for the offer-chat test', scProd.status === 201 && !!scProd.json.id, JSON.stringify(scProd.json).slice(0, 120));
  const scProdId = scProd.json.id;
  const scOffer = await call('POST', `/api/products/${scProdId}/offers`, { amount: 1400, message: 'Can we meet in town?' }, scBuyer.cookie);
  check('M3b: buyer makes an offer', scOffer.status === 201 && !!scOffer.json.id, JSON.stringify(scOffer.json).slice(0, 120));
  const scOfferId = scOffer.json.id;
  const scBuyerTry = await call('POST', `/api/offers/${scOfferId}/conversation`, null, scBuyer.cookie);
  check('M3b: the buyer cannot open the thread from the offer (403)', scBuyerTry.status === 403, 'status ' + scBuyerTry.status);
  const scOtherTry = await call('POST', `/api/offers/${scOfferId}/conversation`, null, scOther.cookie);
  check('M3b: a user with no offer relationship gets 403', scOtherTry.status === 403, 'status ' + scOtherTry.status);
  const scMissing = await call('POST', '/api/offers/999999/conversation', null, scSeller.cookie);
  check('M3b: a missing offer is 404', scMissing.status === 404, 'status ' + scMissing.status);
  const scConv = await call('POST', `/api/offers/${scOfferId}/conversation`, null, scSeller.cookie);
  check('M3b: seller opens a conversation from the pending offer', scConv.status === 201 && !!scConv.json.conversation_id, JSON.stringify(scConv.json).slice(0, 120));
  const scConvId = scConv.json.conversation_id;
  const scMsg = await call('POST', `/api/conversations/${scConvId}/messages`, { body: 'Hello, thanks for your offer. The item is still available.' }, scSeller.cookie);
  check('M3b: seller sends the first message', scMsg.status === 201, 'status ' + scMsg.status);
  const scBuyerList = await call('GET', '/api/conversations', null, scBuyer.cookie);
  const scSeen = (scBuyerList.json.conversations || []).find(x => x.id === scConvId) || {};
  check('M3b: buyer sees the seller-started thread in their list', scSeen.kind === 'product'
    && scSeen.other_name === 'Seller Chat Seller'
    && scSeen.last_body === 'Hello, thanks for your offer. The item is still available.',
    JSON.stringify(scSeen).slice(0, 200));
  const scThread = await call('GET', `/api/conversations/${scConvId}`, null, scBuyer.cookie);
  check('M3b: buyer opens the thread and reads the seller message', scThread.status === 200
    && (scThread.json.messages || []).some(m => m.sender_id === scSeller.id),
    'status ' + scThread.status);
  const scReply = await call('POST', `/api/conversations/${scConvId}/messages`, { body: 'Great, I can come by tomorrow morning.' }, scBuyer.cookie);
  check('M3b: buyer replies in the seller-started thread', scReply.status === 201, 'status ' + scReply.status);
  const scConv2 = await call('POST', `/api/offers/${scOfferId}/conversation`, null, scSeller.cookie);
  const scSellerList = await call('GET', '/api/conversations', null, scSeller.cookie);
  check('M3b: opening again returns the same conversation, no duplicate', scConv2.status === 201
    && scConv2.json.conversation_id === scConvId
    && (scSellerList.json.conversations || []).filter(x => x.product_id === scProdId).length === 1,
    JSON.stringify(scConv2.json).slice(0, 120));
  const scAccept = await call('PATCH', `/api/offers/${scOfferId}`, { status: 'accepted' }, scSeller.cookie);
  const scConv3 = await call('POST', `/api/offers/${scOfferId}/conversation`, null, scSeller.cookie);
  check('M3b: accepted offer still opens the same thread', scAccept.status === 200
    && scConv3.status === 201 && scConv3.json.conversation_id === scConvId,
    'accept ' + scAccept.status + ', conv ' + scConv3.status);

  // ---------- 2.0 M4: Business storefronts ----------
  const bizApply = await call('POST', '/api/businesses', {
    pacra_number: '120200012345', tpin: '1000000001', owner_legal_name: 'Test Owner', address: 'Plot 1, Test Road', certificate: IMG,
    name: 'Kamwala Phone Repairs', category: 'Phones & Tablets', city: 'Lusaka',
    area: 'Kamwala', description: 'Phone repairs, screens, batteries and accessories, same day service.',
    tagline: 'Fixed today, working tonight', hours_text: 'Mon to Sat, 8:00 to 17:30',
  }, p2.cookie);
  check('M4: business application accepted as pending', bizApply.status === 201 && bizApply.json.status === 'pending'
    && String(bizApply.json.slug || '').startsWith('kamwala-phone-repairs-'), JSON.stringify(bizApply.json).slice(0, 160));
  const bizId = bizApply.json.id;
  const bizSlug = bizApply.json.slug;
  const bizPublic0 = await call('GET', '/api/businesses', null, w2.cookie);
  check('M4: pending business is not public yet', !(bizPublic0.json.businesses || []).some(x => x.id === bizId));
  const bizDetail0 = await call('GET', '/api/businesses/' + bizSlug, null, w2.cookie);
  check('M4: pending storefront is 404 to the public', bizDetail0.status === 404, 'status ' + bizDetail0.status);
  const docUp = await call('POST', `/api/businesses/${bizId}/documents`, { kind: 'pacra', image: IMG }, p2.cookie);
  check('M4: owner uploads a PACRA document', docUp.status === 201, 'status ' + docUp.status);
  const mine1 = await call('GET', '/api/businesses/mine', null, p2.cookie);
  const myBiz = (mine1.json.businesses || [])[0] || {};
  check('M4: verification becomes pending after upload', myBiz.verification_status === 'pending'
    && myBiz.verified === false && myBiz.slug === bizSlug);
  const adminList = await call('GET', '/api/admin/businesses?status=pending', null, admin.cookie);
  const ab = (adminList.json.businesses || []).find(x => x.id === bizId) || {};
  // v76: the PACRA certificate filed at apply is document 1; the upload above is document 2.
  check('M4: admin queue shows the application with doc count', ab.doc_count === 2 && ab.name === 'Kamwala Phone Repairs');
  const adminDocs = await call('GET', `/api/admin/businesses/${bizId}/documents`, null, admin.cookie);
  check('M4: admin can view the uploaded document', (adminDocs.json.documents || []).length === 2
    && typeof adminDocs.json.documents[0].image === 'string');
  const approve = await call('PATCH', `/api/admin/businesses/${bizId}`, { status: 'active' }, admin.cookie);
  check('M4: admin approves the storefront', approve.status === 200 && approve.json.status === 'active');
  const verify = await call('PATCH', `/api/admin/businesses/${bizId}/verification`, { decision: 'verified', note: 'PACRA checked' }, admin.cookie);
  check('M4: admin verifies the business', verify.status === 200 && verify.json.verification_status === 'verified');
  const shopProduct = await call('POST', '/api/products', {
    title: 'Phone screen replacement service stock', category: 'Phones & Tablets',
    description: 'Replacement screens for Samsung and Tecno, fitted in store.',
    city: 'Lusaka', price: 650, business_id: bizId,
  }, p2.cookie);
  check('M4: owner links a product to the business', shopProduct.status === 201, JSON.stringify(shopProduct.json).slice(0, 120));
  const shopDetail = await call('GET', '/api/products/' + shopProduct.json.id, null, w2.cookie);
  const sb = (shopDetail.json.product || {}).business || {};
  check('M4: product shows the verified shop', sb.name === 'Kamwala Phone Repairs' && sb.slug === bizSlug && sb.verified === true);
  const notMyBiz = await call('POST', '/api/products', {
    title: 'Sneaky linked item', category: 'Electronics',
    description: 'Trying to link to a business that is not mine at all.',
    city: 'Lusaka', price: 100, business_id: bizId,
  }, w2.cookie);
  check("M4: cannot link a product to someone else's business (422)", notMyBiz.status === 422, 'status ' + notMyBiz.status);
  const store = await call('GET', '/api/businesses/' + bizSlug, null, w2.cookie);
  const stB = store.json.business || {};
  check('M4: public storefront is verified with catalogue', stB.verified === true
    && (store.json.products || []).some(x => x.id === shopProduct.json.id)
    && Array.isArray(store.json.jobs), JSON.stringify(stB).slice(0, 200));
  const bizPublic1 = await call('GET', '/api/businesses?q=' + encodeURIComponent('kamwala'), null, w2.cookie);
  check('M4: directory search finds the shop', (bizPublic1.json.businesses || []).some(x => x.id === bizId));
  const hackEdit = await call('PATCH', `/api/businesses/${bizId}`, { tagline: 'hacked' }, w2.cookie);
  check('M4: non-owner cannot edit the business (403)', hackEdit.status === 403, 'status ' + hackEdit.status);

  // ---------- Design alignment D: admin dashboard stats ----------
  const ddStats = await call('GET', '/api/admin/stats', null, admin.cookie);
  check('DD: stats carry dashboard counts', ddStats.status === 200 && typeof ddStats.json.products_total === 'number' && typeof ddStats.json.businesses_pending === 'number' && typeof ddStats.json.reports_open === 'number', JSON.stringify(ddStats.json).slice(0, 120));
  const ddDenied = await call('GET', '/api/admin/stats', null, worker.cookie);
  check('DD: stats stay admin-only (403)', ddDenied.status === 403, 'status ' + ddDenied.status);

  // ---------- Design alignment C: follows, storefront reviews, profile stats ----------
  const dcOwner = await registerUser('DC Owner', '0970000961', 'Lusaka');
  const dcFan = await registerUser('DC Fan', '0970000962', 'Kitwe');
  const dcBiz = await call('POST', '/api/businesses', {
    pacra_number: '120200012345', tpin: '1000000001', owner_legal_name: 'Test Owner', address: 'Plot 1, Test Road', certificate: IMG, name: 'DC Follow Shop', category: 'Electronics', city: 'Lusaka', description: 'A shop for follow tests and reviews.' }, dcOwner.cookie);
  const dcBizId = dcBiz.json.id;
  await call('PATCH', '/api/admin/businesses/' + dcBizId, { status: 'active' }, admin.cookie);
  const dcFollow = await call('POST', '/api/businesses/' + dcBizId + '/follow', {}, dcFan.cookie);
  check('DC: follow works with a count', dcFollow.status === 200 && dcFollow.json.following === true && dcFollow.json.follower_count === 1, JSON.stringify(dcFollow.json));
  const dcStore = await call('GET', '/api/businesses/dc-follow-shop-' + dcBizId, null, dcFan.cookie);
  check('DC: storefront shows following state and reviews list', dcStore.json.business && dcStore.json.business.following === true && dcStore.json.business.follower_count === 1 && Array.isArray(dcStore.json.reviews));
    const folList = await call('GET', '/api/businesses?following=1', null, dcFan.cookie);
    check('FOLLOWING LIST: a follower sees the followed business', (folList.json.businesses || []).some(b => b.id === dcBizId), JSON.stringify(folList.json).slice(0, 120));
    const folOwner = await call('GET', '/api/businesses?following=1', null, dcOwner.cookie);
    check('FOLLOWING LIST: a non-follower does not', !(folOwner.json.businesses || []).some(b => b.id === dcBizId));
    const folAnon = await call('GET', '/api/businesses?following=1');
    check('FOLLOWING LIST: signed out gets an empty list', folAnon.status === 200 && (folAnon.json.businesses || []).length === 0);
  const dcOwn = await call('POST', '/api/businesses/' + dcBizId + '/follow', {}, dcOwner.cookie);
  check('DC: cannot follow your own business (422)', dcOwn.status === 422, 'status ' + dcOwn.status);
  const dcUn = await call('DELETE', '/api/businesses/' + dcBizId + '/follow', null, dcFan.cookie);
  check('DC: unfollow works', dcUn.status === 200 && dcUn.json.following === false && dcUn.json.follower_count === 0);
  const dcStats = await call('GET', '/api/users/me/stats', null, dcFan.cookie);
  check('DC: profile stats shape', dcStats.status === 200 && typeof dcStats.json.jobs_completed === 'number' && typeof dcStats.json.items_sold === 'number' && typeof dcStats.json.rating_count === 'number', JSON.stringify(dcStats.json));

  // ---------- Design alignment B: negotiable + used filter ----------
  const dbSeller = await registerUser('DB Seller', '0970000951', 'Lusaka');
  const dbNew = await call('POST', '/api/products', { title: 'DB brand new phone', category: 'Phones & Tablets', description: 'Sealed in the box with warranty.', price: 4500, condition: 'New', city: 'Lusaka', negotiable: true }, dbSeller.cookie);
  const dbUsed = await call('POST', '/api/products', { title: 'DB used sofa', category: 'Home & Furniture', description: 'Used sofa in good shape.', price: 3000, condition: 'Good', city: 'Lusaka' }, dbSeller.cookie);
  check('DB: products created', dbNew.status === 201 && dbUsed.status === 201, dbNew.status + '/' + dbUsed.status);
  const dbDetail = await call('GET', '/api/products/' + dbNew.json.id, null, dbSeller.cookie);
  check('DB: negotiable flag round-trips', dbDetail.json.product && dbDetail.json.product.negotiable === true && typeof dbDetail.json.product.seller_rating === 'number');
  const dbUsedList = await call('GET', '/api/products?used=1&category=Phones%20%26%20Tablets', null, dbSeller.cookie);
  check('DB: used=1 excludes New items', !(dbUsedList.json.products || []).some(x => x.id === dbNew.json.id));
  const dbPatch = await call('PATCH', '/api/products/' + dbNew.json.id, { negotiable: false }, dbSeller.cookie);
  const dbDetail2 = await call('GET', '/api/products/' + dbNew.json.id, null, dbSeller.cookie);
  check('DB: negotiable can be switched off', dbPatch.status === 200 && dbDetail2.json.product.negotiable === false);

  // ---------- Design alignment A: pay sort + poster verified ----------
  const daRich = await registerUser('DA Rich', '0970000901', 'Lusaka');
  const daCheap = await registerUser('DA Cheap', '0970000902', 'Lusaka');
  const daR = await call('POST', '/api/jobs', { title: 'DA high pay job', category: 'Painting', description: 'High pay test job for the sort.', city: 'Lusaka', date_needed: '2027-11-05', pay_amount: 900, pay_type: 'per_job', workers_needed: 1, terms_accepted: true }, daRich.cookie);
  const daC = await call('POST', '/api/jobs', { title: 'DA low pay job', category: 'Painting', description: 'Low pay test job for the sort.', city: 'Lusaka', date_needed: '2027-11-05', pay_amount: 90, pay_type: 'per_job', workers_needed: 1, terms_accepted: true }, daCheap.cookie);
  check('DA: sort fixture jobs created', (daR.status === 200 || daR.status === 201) && (daC.status === 200 || daC.status === 201), daR.status + '/' + daC.status);
  const daSorted = await call('GET', '/api/jobs?sort=pay_high&category=Painting', null, daRich.cookie);
  const daIds = (daSorted.json.jobs || []).map(j => j.id);
  const daRId = daR.json.job ? daR.json.job.id : daR.json.id;
  const daCId = daC.json.job ? daC.json.job.id : daC.json.id;
  check('DA: pay_high orders K900 before K90', daIds.indexOf(daRId) > -1 && daIds.indexOf(daCId) > -1 && daIds.indexOf(daRId) < daIds.indexOf(daCId), daIds.join(','));
  const daDetail = await call('GET', '/api/jobs/' + daRId, null, daCheap.cookie);
  check('DA: detail poster has a boolean verified flag', !!(daDetail.json.job && daDetail.json.job.poster && typeof daDetail.json.job.poster.verified === 'boolean'));

  await bigPhotoTests();
  await trustTests();
  await selfieAndLogoTests(admin.cookie, w3);
  await kycTests(admin.cookie, w3, w2);
// v76: storefront KYC. Applying requires a PACRA number, a 10-digit
// TPIN, a street address, the owner/director legal name, and a PACRA
// certificate photo, which is filed as the first verification document.
// The numbers are visible to the owner and admins only. Runs on the
// M1 Distant account (w3): the suite sits at the register-per-hour cap.
async function kycTests(adminCookie, u, other) {
  const base = {
    name: 'KYC Check Trading', category: 'Electronics', city: 'Lusaka',
    description: 'A storefront created by the KYC test flow.',
    pacra_number: '120200099988', tpin: '1001234567',
    owner_legal_name: 'KYC Test Owner', address: 'Plot 9, Cairo Road', certificate: IMG,
  };
  const post = (body, cookie) => call('POST', '/api/businesses', body, cookie || u.cookie);
  check('KYC: apply without a PACRA number is refused (422)', (await post({ ...base, pacra_number: '' })).status === 422);
  check('KYC: apply without a TPIN is refused (422)', (await post({ ...base, tpin: '' })).status === 422);
  check('KYC: a short TPIN is refused (422)', (await post({ ...base, tpin: '12345' })).status === 422);
  check('KYC: a TPIN with letters is refused (422)', (await post({ ...base, tpin: '100123456A' })).status === 422);
  check('KYC: apply without an owner legal name is refused (422)', (await post({ ...base, owner_legal_name: '' })).status === 422);
  check('KYC: apply without a street address is refused (422)', (await post({ ...base, address: '' })).status === 422);
  check('KYC: apply without the certificate photo is refused (422)', (await post({ ...base, certificate: undefined })).status === 422);

  const ok = await post(base);
  check('KYC: a complete application is created (201)', ok.status === 201, JSON.stringify(ok.json));
  const id = ok.json && ok.json.id;
  const mine = await call('GET', '/api/businesses/mine', null, u.cookie);
  const mineBiz = (mine.json.businesses || []).find((x) => x.id === id) || {};
  check('KYC: the owner sees the stored PACRA number, TPIN and legal name',
    mineBiz.pacra_number === '120200099988' && mineBiz.tpin === '1001234567' && mineBiz.owner_legal_name === 'KYC Test Owner',
    JSON.stringify(mineBiz).slice(0, 200));
  check('KYC: the certificate queued the shop for verification', mineBiz.verification_status === 'pending', String(mineBiz.verification_status));
  const docs = await call('GET', '/api/businesses/' + id + '/documents', null, u.cookie);
  check('KYC: the certificate is filed as a pacra document',
    docs.status === 200 && (docs.json.documents || []).some((d) => d.kind === 'pacra'), JSON.stringify(docs.json).slice(0, 160));

  const patch = await call('PATCH', '/api/businesses/' + id, { tagline: 'KYC patched tagline' }, u.cookie);
  check('KYC: the owner can edit without re-sending the numbers (200)', patch.status === 200, JSON.stringify(patch.json).slice(0, 160));

  await call('PATCH', '/api/admin/businesses/' + id, { status: 'active' }, adminCookie);
  const pub = await call('GET', '/api/businesses/' + mineBiz.slug, null, other.cookie);
  const pubBiz = (pub.json && pub.json.business) || {};
  check('KYC: other members never see the TPIN or PACRA number',
    pub.status === 200 && pubBiz.tpin === undefined && pubBiz.pacra_number === undefined, JSON.stringify(pubBiz).slice(0, 200));
  const adm = await call('GET', '/api/admin/businesses?status=active', null, adminCookie);
  const admBiz = ((adm.json && adm.json.businesses) || []).find((x) => x.id === id) || {};
  check('KYC: admins see the numbers for review', admBiz.tpin === '1001234567' && admBiz.pacra_number === '120200099988');
}


async function accountLifecycleTests(adminCookie) {
  const a = await registerUser('Lifecycle Worker A', '0970000971', 'Lusaka');
  const b = await registerUser('Lifecycle Poster B', '0970000972', 'Lusaka');
  await call('PATCH', '/api/users/me', { open_to_work: true }, a.cookie);
  await call('PATCH', '/api/users/me', { orientation_accepted: true }, a.cookie);
  const jobRes = await call('POST', '/api/jobs', {
    title: 'Lifecycle test job', category: 'Gardening', description: 'A job used by the account lifecycle tests.',
    city: 'Lusaka', area: 'Kabulonga', date_needed: '2027-06-15', pay_amount: 150, pay_type: 'per_day',
    workers_needed: 1, terms_accepted: true,
  }, b.cookie);
  const jobId = jobRes.json.job ? jobRes.json.job.id : jobRes.json.id;
  check('ACCOUNT: poster B creates a job', !!jobId, JSON.stringify(jobRes.json).slice(0, 140));
  const apply = await call('POST', `/api/jobs/${jobId}/apply`, { message: 'I can do this job.' }, a.cookie);
  check('ACCOUNT: worker A applies', apply.status === 200 || apply.status === 201, 'status ' + apply.status);
  const prod = await call('POST', '/api/products', {
    title: 'Lifecycle test phone', category: 'Phones & Tablets',
    description: 'A product listed by worker A for the lifecycle tests.',
    city: 'Lusaka', area: 'Kamwala', price: 900, condition: 'Good', photos: [IMG],
  }, a.cookie);
  check('ACCOUNT: worker A lists a product', prod.status === 201 && !!prod.json.id, JSON.stringify(prod.json).slice(0, 140));

  const workersBefore = await call('GET', '/api/workers', null, b.cookie);
  check('ACCOUNT: A appears in the workers list while active', (workersBefore.json.workers || []).some(w => w.id === a.id));

  const noPw = await call('POST', '/api/users/me/deactivate', {}, a.cookie);
  check('ACCOUNT: deactivate without a password is refused (422)', noPw.status === 422, 'status ' + noPw.status);
  const wrongPw = await call('POST', '/api/users/me/deactivate', { password: 'not-the-password' }, a.cookie);
  check('ACCOUNT: deactivate with a wrong password is refused (403)', wrongPw.status === 403, 'status ' + wrongPw.status);
  const deact = await call('POST', '/api/users/me/deactivate', { password: 'test-pass-123' }, a.cookie);
  check('ACCOUNT: deactivate with the right password works (200)', deact.status === 200, 'status ' + deact.status);

  const loginDeact = await call('POST', '/api/auth/login', { phone: '0970000971', password: 'test-pass-123' });
  check('ACCOUNT: login is blocked while deactivated, with the reactivate code', loginDeact.status === 403 && loginDeact.json.code === 'ACCOUNT_DEACTIVATED', JSON.stringify(loginDeact.json).slice(0, 140));
  const staleCookie = await call('GET', '/api/users/me/stats', null, a.cookie);
  check('ACCOUNT: an existing session is blocked while deactivated (403)', staleCookie.status === 403, 'status ' + staleCookie.status);
  const workersHidden = await call('GET', '/api/workers', null, b.cookie);
  check('ACCOUNT: A disappears from the workers list while deactivated', !(workersHidden.json.workers || []).some(w => w.id === a.id));
  const prodsHidden = await call('GET', '/api/products', null, b.cookie);
  check('ACCOUNT: A product disappears from the marketplace while deactivated', !(prodsHidden.json.products || []).some(p => p.id === (prod.json && prod.json.id)));
  const regDup = await call('POST', '/api/auth/register', { name: 'Copy Cat', phone: '0970000971', password: 'test-pass-123', city: 'Lusaka', avatar: IMG, selfie: IMG });
  check('ACCOUNT: the deactivated number cannot register a second account (409)', regDup.status === 409, 'status ' + regDup.status);

  const reactWrong = await call('POST', '/api/auth/reactivate', { phone: '0970000971', password: 'not-the-password' });
  check('ACCOUNT: reactivate with a wrong password is refused (401)', reactWrong.status === 401, 'status ' + reactWrong.status);
  const react = await call('POST', '/api/auth/reactivate', { phone: '0970000971', password: 'test-pass-123' });
  check('ACCOUNT: reactivate with the right password signs back in (200)', react.status === 200 && !!react.cookie, 'status ' + react.status);
  const loginAfter = await call('POST', '/api/auth/login', { phone: '0970000971', password: 'test-pass-123' });
  check('ACCOUNT: normal login works again after reactivation (200)', loginAfter.status === 200 && !!loginAfter.cookie, 'status ' + loginAfter.status);
  const aCookie2 = loginAfter.cookie;
  const workersBack = await call('GET', '/api/workers', null, b.cookie);
  check('ACCOUNT: A is back in the workers list after reactivation', (workersBack.json.workers || []).some(w => w.id === a.id));

  const delNoPw = await call('DELETE', '/api/users/me', {}, aCookie2);
  check('ACCOUNT: delete without a password is refused (422)', delNoPw.status === 422, 'status ' + delNoPw.status);
  const delWrong = await call('DELETE', '/api/users/me', { password: 'not-the-password' }, aCookie2);
  check('ACCOUNT: delete with a wrong password is refused (403)', delWrong.status === 403, 'status ' + delWrong.status);
  const del = await call('DELETE', '/api/users/me', { password: 'test-pass-123' }, aCookie2);
  check('ACCOUNT: delete with the right password works (200)', del.status === 200, 'status ' + del.status + ' ' + JSON.stringify(del.json).slice(0, 120));

  const loginGone = await call('POST', '/api/auth/login', { phone: '0970000971', password: 'test-pass-123' });
  check('ACCOUNT: login after deletion is a plain wrong-number 401', loginGone.status === 401, 'status ' + loginGone.status);
  const profileGone = await call('GET', '/api/users/' + a.id, null, b.cookie);
  check('ACCOUNT: the deleted profile is gone (404)', profileGone.status === 404, 'status ' + profileGone.status);
  const jobAlive = await call('GET', '/api/jobs/' + jobId, null, b.cookie);
  check('ACCOUNT: poster B job survives worker A deletion', jobAlive.status === 200, 'status ' + jobAlive.status);
  const appsView = await call('GET', `/api/jobs/${jobId}/applications`, null, b.cookie);
  check('ACCOUNT: B can still open the applicant list, and A application is gone', appsView.status === 200 && !(appsView.json.applications || []).some(x => x.worker_id === a.id), 'status ' + appsView.status);
  const admSearch = await call('GET', '/api/admin/activity?q=0970000971', null, adminCookie);
  check('ACCOUNT: admin member search no longer finds the deleted member', admSearch.status === 200 && !JSON.stringify(admSearch.json).includes('Lifecycle Worker A'), 'status ' + admSearch.status);
  const reReg = await call('POST', '/api/auth/register', { name: 'Lifecycle Worker A2', phone: '0970000971', password: 'test-pass-123', city: 'Lusaka', avatar: IMG, selfie: IMG });
  check('ACCOUNT: the freed number can register a fresh account (201)', reReg.status === 201 || reReg.status === 200, 'status ' + reReg.status);
  const bLogin = await call('POST', '/api/auth/login', { phone: '0970000972', password: 'test-pass-123' });
  check('ACCOUNT: an untouched member still signs in normally (200)', bLogin.status === 200 && !!bLogin.cookie, 'status ' + bLogin.status);
}

async function signupOtpTests() {
  const start = (name, phone) => call('POST', '/api/auth/register', {
    name, phone, password: 'test-pass-123', city: 'Lusaka', avatar: IMG, selfie: IMG,
  });
  const verify = (phone, code) => call('POST', '/api/auth/register/verify', { phone, code });
  const userCount = async (phone) => Number((await dbOne(
    'SELECT COUNT(*) AS n FROM users WHERE phone = ?', [normalizedTestPhone(phone)]))?.n || 0);
  const pendingCount = async (phone) => Number((await dbOne(
    'SELECT COUNT(*) AS n FROM pending_registrations WHERE phone = ?', [normalizedTestPhone(phone)]))?.n || 0);
  const signupSmsCount = async (phone) => Number((await dbOne(
    "SELECT COUNT(*) AS n FROM sms_log WHERE phone = ? AND kind = 'signup_code'", [normalizedTestPhone(phone)]))?.n || 0);

  // Happy path: start sends a code but creates NO account; a wrong code
  // fails; the right code creates the account and signs the member in;
  // the same code can never be used twice.
  const p1 = '0970000601';
  const s1 = await start('OTP Success', p1);
  check('OTP: start returns the verification step', s1.status === 200 && s1.json.verification_required === true && s1.json.phone === normalizedTestPhone(p1), 'status ' + s1.status + ' ' + JSON.stringify(s1.json).slice(0, 140));
  check('OTP: start sends a signup code by SMS (logged)', (await signupSmsCount(p1)) >= 1);
  check('OTP: start creates no user, only a pending signup', (await userCount(p1)) === 0 && (await pendingCount(p1)) === 1);
  const code1 = await latestSignupCode(p1);
  const wrong1 = await verify(p1, '000000');
  check('OTP: a wrong code is rejected and creates no user', wrong1.status === 401 && (await userCount(p1)) === 0, 'status ' + wrong1.status);
  const good1 = await verify(p1, code1);
  check('OTP: the correct code creates the account and signs in', good1.status === 201 && !!good1.cookie && good1.json.user.phone === normalizedTestPhone(p1), 'status ' + good1.status + ' ' + JSON.stringify(good1.json).slice(0, 140));
  const again1 = await verify(p1, code1);
  check('OTP: the code is single use', again1.status === 401 && (await userCount(p1)) === 1 && (await pendingCount(p1)) === 0, 'status ' + again1.status);

  // No bypass: a started-but-unverified signup cannot sign in and never
  // becomes a users row.
  const p2 = '0970000602';
  const s2 = await start('OTP Bypass', p2);
  const bypassLogin = await call('POST', '/api/auth/login', { phone: p2, password: 'test-pass-123' });
  check('OTP: no-verification bypass attempt cannot sign in', s2.status === 200 && bypassLogin.status === 401 && (await userCount(p2)) === 0, 'login status ' + bypassLogin.status);

  // Expired code: rejected even when the digits are right.
  const p3 = '0970000603';
  await start('OTP Expired', p3);
  const code3 = await latestSignupCode(p3);
  await dbExecute("UPDATE pending_registrations SET expires_at = datetime('now', '-1 day') WHERE phone = ?", [normalizedTestPhone(p3)]);
  const expired = await verify(p3, code3);
  check('OTP: an expired code is rejected', expired.status === 401 && String(expired.json.error || '').includes('expired') && (await userCount(p3)) === 0, 'status ' + expired.status + ' ' + JSON.stringify(expired.json).slice(0, 140));

  // Attempt limit: five wrong tries burn the code, so even the correct
  // code is refused afterwards.
  const p4 = '0970000604';
  await start('OTP Attempts', p4);
  const code4 = await latestSignupCode(p4);
  let lastWrong = null;
  for (let i = 0; i < 5; i++) lastWrong = await verify(p4, '000000');
  check('OTP: the fifth wrong try burns the code', !!lastWrong && lastWrong.status === 401 && String(lastWrong.json.error || '').includes('Too many'), 'status ' + (lastWrong && lastWrong.status));
  const burned = await verify(p4, code4);
  check('OTP: the correct code is refused after the attempt limit', burned.status === 401 && (await userCount(p4)) === 0, 'status ' + burned.status);

  // Duplicate phone: refused at start, before any code is sent.
  const dupSmsBefore = await signupSmsCount(p1);
  const dup = await start('OTP Duplicate', p1);
  check('OTP: a registered number is refused at start with no code sent', dup.status === 409 && (await signupSmsCount(p1)) === dupSmsBefore, 'status ' + dup.status);

  // Resend: cooldown first, then a fresh code that invalidates the old.
  const p5 = '0970000605';
  await start('OTP Resend', p5);
  const oldCode = await latestSignupCode(p5);
  const earlyResend = await call('POST', '/api/auth/register/resend', { phone: p5 });
  check('OTP: resend inside the cooldown is refused (429)', earlyResend.status === 429, 'status ' + earlyResend.status);
  let newCode = oldCode;
  let resend = null;
  for (let i = 0; i < 4 && newCode === oldCode; i++) {
    await dbExecute("UPDATE pending_registrations SET last_sent_at = datetime('now', '-2 minutes') WHERE phone = ?", [normalizedTestPhone(p5)]);
    resend = await call('POST', '/api/auth/register/resend', { phone: p5 });
    if (resend.status !== 200) break;
    newCode = await latestSignupCode(p5);
  }
  check('OTP: resend issues a fresh code', !!resend && resend.status === 200 && newCode !== oldCode, 'status ' + (resend && resend.status));
  const oldAttempt = await verify(p5, oldCode);
  check('OTP: the old code no longer works after resend', oldAttempt.status === 401 && (await userCount(p5)) === 0, 'status ' + oldAttempt.status);
  const newGood = await verify(p5, newCode);
  check('OTP: the resent code creates the account', newGood.status === 201 && !!newGood.cookie && (await userCount(p5)) === 1, 'status ' + newGood.status);
}

// Nov 9, 2026 (v110): optional email confirmation at signup + email-first
// password reset, so SMS is reserved for job alerts. The test server runs
// with MAIL_TRANSPORT=stream and dummy Brevo vars, so the mailer is
// configured but nothing is ever sent; email tokens are seeded directly
// into the DB (sha256 of a known token) because the raw token only ever
// travels inside the email itself.
async function emailTests() {
  const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
  const start = (name, phone, email) => call('POST', '/api/auth/register', {
    name, phone, password: 'test-pass-123', city: 'Lusaka', avatar: IMG, selfie: IMG,
    ...(email !== undefined ? { email } : {}),
  });
  const verify = (phone, code) => call('POST', '/api/auth/register/verify', { phone, code });
  const userByPhone = async (phone) => dbOne(
    'SELECT * FROM users WHERE phone = ?', [normalizedTestPhone(phone)]);
  const resetRows = async (userId) => Number((await dbOne(
    'SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND used_at IS NULL', [userId]))?.n || 0);
  const resetSmsRows = async (phone) => Number((await dbOne(
    "SELECT COUNT(*) AS n FROM sms_log WHERE phone = ? AND kind = 'password_reset'", [normalizedTestPhone(phone)]))?.n || 0);

  // Signup WITHOUT email: works exactly as before, emailSent false.
  const n1 = '0970000701';
  const s1 = await start('Email None', n1);
  const c1 = await latestSignupCode(n1);
  const v1 = await verify(n1, c1);
  const u1 = await userByPhone(n1);
  check('EMAIL: signup without email works, emailSent false, no email stored',
    s1.status === 200 && v1.status === 201 && v1.json.emailSent === false
    && !u1.email && Number(u1.email_verified) === 0, 'status ' + v1.status + ' ' + JSON.stringify(v1.json).slice(0, 120));

  // Signup WITH email: stored lowercased and unverified, emailSent true.
  const n2 = '0970000702';
  const s2 = await start('Email User', n2, 'Test@Example.COM');
  const c2 = await latestSignupCode(n2);
  const v2 = await verify(n2, c2);
  const u2 = await userByPhone(n2);
  check('EMAIL: signup with email stores it lowercased, unverified, emailSent true',
    s2.status === 200 && v2.status === 201 && v2.json.emailSent === true
    && u2.email === 'test@example.com' && Number(u2.email_verified) === 0
    && !!u2.email_verify_token_hash && !!u2.email_verify_expires,
    'status ' + v2.status + ' ' + JSON.stringify(v2.json).slice(0, 120));

  // Invalid email is rejected at start with a field error.
  const bad = await start('Email Bad', '0970000703', 'not-an-email');
  check('EMAIL: an invalid email is rejected at signup (422, fields.email)',
    bad.status === 422 && !!(bad.json.fields && bad.json.fields.email), 'status ' + bad.status);

  // Duplicate email is refused at start, case-insensitively.
  const dup = await start('Email Dup', '0970000704', 'TEST@example.com');
  check('EMAIL: a duplicate email is refused at signup (409)',
    dup.status === 409, 'status ' + dup.status);

  // Resend verification: works while unverified, and rotates the token.
  const hashBefore = u2.email_verify_token_hash;
  const resend = await call('POST', '/api/auth/resend-verification', {}, v2.cookie);
  const u2r = await userByPhone(n2);
  check('EMAIL: resend-verification sends a fresh token while unverified',
    resend.status === 200 && resend.json.emailSent === true
    && u2r.email_verify_token_hash !== hashBefore, 'status ' + resend.status + ' ' + JSON.stringify(resend.json).slice(0, 120));

  // Verify the token: a seeded known token confirms the address, the
  // token is cleared, and the link cannot be reused.
  const token = 'verify-token-' + Date.now();
  await dbExecute("UPDATE users SET email_verify_token_hash = ?, email_verify_expires = datetime('now', '+24 hours') WHERE phone = ?",
    [sha(token), normalizedTestPhone(n2)]);
  const page = await fetch(BASE + '/api/auth/verify-email?token=' + encodeURIComponent(token));
  const pageText = await page.text();
  const u2v = await userByPhone(n2);
  check('EMAIL: the confirmation link verifies the email and burns the token',
    page.status === 200 && pageText.includes('Email confirmed')
    && Number(u2v.email_verified) === 1 && !u2v.email_verify_token_hash,
    'status ' + page.status);
  const again = await fetch(BASE + '/api/auth/verify-email?token=' + encodeURIComponent(token));
  check('EMAIL: the confirmation link cannot be reused',
    again.status === 400, 'status ' + again.status);
  const noToken = await fetch(BASE + '/api/auth/verify-email');
  check('EMAIL: verify-email without a token is rejected (400)',
    noToken.status === 400, 'status ' + noToken.status);

  // An expired token is rejected.
  const tokenExp = 'verify-token-expired';
  await dbExecute("UPDATE users SET email_verify_token_hash = ?, email_verify_expires = datetime('now', '-1 hour') WHERE phone = ?",
    [sha(tokenExp), normalizedTestPhone(n2)]);
  const expPage = await fetch(BASE + '/api/auth/verify-email?token=' + encodeURIComponent(tokenExp));
  check('EMAIL: an expired confirmation token is rejected (400)',
    expPage.status === 400, 'status ' + expPage.status);

  // Resend after verification, and for an account with no email: refused.
  const resendDone = await call('POST', '/api/auth/resend-verification', {}, v2.cookie);
  check('EMAIL: resend-verification is refused once the email is confirmed (422)',
    resendDone.status === 422, 'status ' + resendDone.status);
  const resendNone = await call('POST', '/api/auth/resend-verification', {}, v1.cookie);
  check('EMAIL: resend-verification is refused with no email on the account (422)',
    resendNone.status === 422, 'status ' + resendNone.status);

  // Password reset with a VERIFIED email: a reset link by email, NO SMS
  // code row and no SMS log entry; the token is stored on the user.
  const fgEmail = await call('POST', '/api/auth/forgot', { phone: n2 });
  const u2f = await userByPhone(n2);
  check('EMAIL: forgot-password with a verified email sends a link, no SMS code',
    fgEmail.status === 200 && fgEmail.json.email_sent === true && fgEmail.json.sms_sent === false
    && (await resetRows(u2.id)) === 0 && (await resetSmsRows(n2)) === 0
    && !!u2f.reset_token_hash && !!u2f.reset_token_expires,
    'status ' + fgEmail.status + ' ' + JSON.stringify(fgEmail.json).slice(0, 140));

  // The reset form page renders for a live token and rejects a bad one.
  const resetToken = 'reset-token-' + Date.now();
  await dbExecute("UPDATE users SET reset_token_hash = ?, reset_token_expires = datetime('now', '+1 hours') WHERE phone = ?",
    [sha(resetToken), normalizedTestPhone(n2)]);
  const formPage = await fetch(BASE + '/api/auth/reset-password?token=' + encodeURIComponent(resetToken));
  const formText = await formPage.text();
  check('EMAIL: the reset form page renders for a live token',
    formPage.status === 200 && formText.includes('Choose a new password'), 'status ' + formPage.status);
  const formBad = await fetch(BASE + '/api/auth/reset-password?token=nope');
  check('EMAIL: the reset form page rejects a bad token (400)',
    formBad.status === 400, 'status ' + formBad.status);

  // Redeem the email reset token: new password works, token is cleared,
  // and the link cannot be reused.
  const redeem = await call('POST', '/api/auth/reset-by-email', { token: resetToken, new_password: 'new-pass-456' });
  const u2x = await userByPhone(n2);
  const loginNew = await call('POST', '/api/auth/login', { phone: n2, password: 'new-pass-456' });
  check('EMAIL: the email reset link sets a new password and signs in',
    redeem.status === 200 && !!redeem.cookie && loginNew.status === 200 && !u2x.reset_token_hash,
    'status ' + redeem.status + ' login ' + loginNew.status);
  const redeemAgain = await call('POST', '/api/auth/reset-by-email', { token: resetToken, new_password: 'new-pass-789' });
  check('EMAIL: the email reset link cannot be reused',
    redeemAgain.status === 401, 'status ' + redeemAgain.status);

  // An expired email reset token is rejected.
  const resetExp = 'reset-token-expired';
  await dbExecute("UPDATE users SET reset_token_hash = ?, reset_token_expires = datetime('now', '-1 hour') WHERE phone = ?",
    [sha(resetExp), normalizedTestPhone(n2)]);
  const redeemExp = await call('POST', '/api/auth/reset-by-email', { token: resetExp, new_password: 'new-pass-789' });
  check('EMAIL: an expired email reset token is rejected (401)',
    redeemExp.status === 401, 'status ' + redeemExp.status);

  // Password reset with NO verified email: the SMS-code flow runs exactly
  // as before (a password_resets row is created, no email is sent).
  const fgSms = await call('POST', '/api/auth/forgot', { phone: n1 });
  check('EMAIL: forgot-password without a verified email still uses the SMS code flow',
    fgSms.status === 200 && !fgSms.json.email_sent && (await resetRows(u1.id)) === 1,
    'status ' + fgSms.status + ' ' + JSON.stringify(fgSms.json).slice(0, 140));
}

  await accountLifecycleTests(admin.cookie);
  await signupOtpTests();
  await emailTests();
  await supportTests(admin.cookie, worker.cookie, third.cookie);
  await sharePreviewTests();
  await smsTests();
  await pushTests(admin.cookie);
  await adsTests({ admin, third, p2, bizId, bizSlug });
  await experiencesTests(admin.cookie, worker.cookie, worker.id, third.id);
  await experiencesPhase3Tests(admin.cookie, worker.cookie, worker.id, third.id, third.cookie);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) console.log('Failures: ' + failures.join(' | '));
  server.kill();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); if (server) server.kill(); process.exit(1); });


// Oct 29, 2026: support hub. Tickets (guest + member), the live chat
// queue with wait positions, presence heartbeat, and the bot-miss log.
async function supportTests(adminCookie, memberCookie, otherCookie) {
  const g = await call('POST', '/api/support/tickets', { name: 'Guest Sup', phone: '0970000951', category: 'Account help', subject: 'Cannot sign in', message: 'The code never arrives on my phone.' });
  check('SUPPORT: guest can create a ticket (201)', g.status === 201 && /^PWZ-/.test(g.json.ref || ''), 'status ' + g.status + ' ' + JSON.stringify(g.json).slice(0, 120));
  const bad = await call('POST', '/api/support/tickets', { name: 'Guest Sup', phone: '0970000951', category: 'Jobs', subject: 'no', message: 'short' });
  check('SUPPORT: a too-short ticket is refused (422)', bad.status === 422, 'status ' + bad.status);
  const wrongPhone = await call('POST', '/api/support/tickets/lookup', { ref: g.json.ref, phone: '0970000999' });
  check('SUPPORT: lookup with the wrong phone is refused (404)', wrongPhone.status === 404, 'status ' + wrongPhone.status);
  const look = await call('POST', '/api/support/tickets/lookup', { ref: g.json.ref, phone: '0970000951' });
  check('SUPPORT: guest lookup returns the thread', look.status === 200 && look.json.messages.length === 1 && look.json.ticket.ref === g.json.ref, 'status ' + look.status);

  const m = await call('POST', '/api/support/tickets', { category: 'Verification', subject: 'Selfie rejected twice', message: 'Please check my selfie, I used good light.' }, memberCookie);
  check('SUPPORT: member can create a ticket (201)', m.status === 201, 'status ' + m.status);
  const mine = await call('GET', '/api/support/tickets/mine', null, memberCookie);
  check('SUPPORT: member ticket list includes the new ticket', mine.status === 200 && mine.json.tickets.some(t => t.id === m.json.id), 'status ' + mine.status);
  const notMine = await call('GET', '/api/support/tickets/' + m.json.id, null, otherCookie);
  check('SUPPORT: another member cannot read the ticket (403)', notMine.status === 403, 'status ' + notMine.status);

  const admList = await call('GET', '/api/admin/support/tickets?status=open', null, adminCookie);
  check('SUPPORT: admin open-ticket list includes both tickets', admList.status === 200 && admList.json.tickets.some(t => t.id === m.json.id) && admList.json.tickets.some(t => t.id === g.json.id), 'status ' + admList.status);
  const admReply = await call('POST', '/api/admin/support/tickets/' + m.json.id + '/messages', { body: 'We reviewed it, please upload once more in daylight.' }, adminCookie);
  check('SUPPORT: admin reply works (200)', admReply.status === 200, 'status ' + admReply.status);
  const memberView = await call('GET', '/api/support/tickets/' + m.json.id, null, memberCookie);
  check('SUPPORT: ticket shows answered with both messages', memberView.status === 200 && memberView.json.ticket.status === 'answered' && memberView.json.messages.length === 2, 'status ' + memberView.status);
  const memReply = await call('POST', '/api/support/tickets/' + m.json.id + '/messages', { body: 'Done, uploaded again now.' }, memberCookie);
  check('SUPPORT: member reply reopens the ticket', memReply.status === 200, 'status ' + memReply.status);
  const memberView2 = await call('GET', '/api/support/tickets/' + m.json.id, null, memberCookie);
  check('SUPPORT: status flips back to open after member reply', memberView2.json.ticket.status === 'open', 'status ' + memberView2.json.ticket.status);
  const close = await call('POST', '/api/admin/support/tickets/' + m.json.id + '/status', { status: 'closed' }, adminCookie);
  check('SUPPORT: admin can close a ticket', close.status === 200, 'status ' + close.status);
  const replyClosed = await call('POST', '/api/support/tickets/' + m.json.id + '/messages', { body: 'hello?' }, memberCookie);
  check('SUPPORT: replying to a closed ticket is refused (422)', replyClosed.status === 422, 'status ' + replyClosed.status);

  const miss = await call('POST', '/api/support/bot-miss', { question: 'Do you deliver firewood to Chongwe?' }, memberCookie);
  check('SUPPORT: bot-miss is recorded (200)', miss.status === 200, 'status ' + miss.status);
  const ov = await call('GET', '/api/admin/support/overview', null, adminCookie);
  check('SUPPORT: admin overview carries counts and bot misses', ov.status === 200 && typeof ov.json.openTickets === 'number' && (ov.json.botMisses || []).some(x => x.question.includes('firewood')), 'status ' + ov.status);
  const ovDenied = await call('GET', '/api/admin/support/overview', null, memberCookie);
  check('SUPPORT: non-admin cannot open the support console APIs (403)', ovDenied.status === 403, 'status ' + ovDenied.status);

  const st0 = await call('GET', '/api/support/status');
  check('SUPPORT: live chat starts offline', st0.status === 200 && st0.json.online === false, 'status ' + st0.status);
  const joinClosed = await call('POST', '/api/support/chats', { name: 'Guest One', phone: '0970000952' });
  check('SUPPORT: joining while closed is refused (409)', joinClosed.status === 409, 'status ' + joinClosed.status);
  const hb = await call('POST', '/api/admin/support/heartbeat', { online: true }, adminCookie);
  check('SUPPORT: admin heartbeat works (200)', hb.status === 200 && hb.json.online === true, 'status ' + hb.status);
  const st1 = await call('GET', '/api/support/status');
  check('SUPPORT: live chat shows online after heartbeat', st1.json.online === true, 'online ' + st1.json.online);

  const j1 = await call('POST', '/api/support/chats', { name: 'Guest One', phone: '0970000952' });
  check('SUPPORT: first guest joins the queue at position 1', j1.status === 201 && j1.json.position === 1, 'status ' + j1.status + ' ' + JSON.stringify(j1.json).slice(0, 120));
  const j2 = await call('POST', '/api/support/chats', { name: 'Guest Two', phone: '0970000953' });
  check('SUPPORT: second guest queues at position 2', j2.status === 201 && j2.json.position === 2, 'status ' + j2.status);
  const j1again = await call('POST', '/api/support/chats', { name: 'Guest One', phone: '0970000952' });
  check('SUPPORT: rejoining returns the same chat', j1again.status === 200 && j1again.json.id === j1.json.id, 'status ' + j1again.status);
  const queue = await call('GET', '/api/admin/support/queue', null, adminCookie);
  check('SUPPORT: admin queue shows both waiting chats', queue.status === 200 && queue.json.chats.length === 2, 'status ' + queue.status);
  const acc = await call('POST', '/api/admin/support/chats/' + j1.json.id + '/accept', {}, adminCookie);
  check('SUPPORT: admin can accept the first chat', acc.status === 200, 'status ' + acc.status);
  const poll1 = await call('GET', '/api/support/chats/' + j1.json.id + '?phone=0970000952');
  check('SUPPORT: accepted chat polls as active', poll1.status === 200 && poll1.json.chat.status === 'active', 'status ' + poll1.status);
  const poll2 = await call('GET', '/api/support/chats/' + j2.json.id + '?phone=0970000953');
  check('SUPPORT: second guest moves up to position 1', poll2.json.position === 1, 'position ' + poll2.json.position);
  const gm = await call('POST', '/api/support/chats/' + j1.json.id + '/messages', { body: 'Hi, my payment is stuck', phone: '0970000952' });
  check('SUPPORT: guest can message in an active chat', gm.status === 200, 'status ' + gm.status);
  const admChat = await call('GET', '/api/admin/support/chats/' + j1.json.id, null, adminCookie);
  check('SUPPORT: admin sees the guest message', admChat.status === 200 && admChat.json.messages.some(x => x.body.includes('payment is stuck')), 'status ' + admChat.status);
  const am = await call('POST', '/api/admin/support/chats/' + j1.json.id + '/messages', { body: 'Let me check that for you now.' }, adminCookie);
  check('SUPPORT: admin can reply in the chat', am.status === 200, 'status ' + am.status);
  const poll3 = await call('GET', '/api/support/chats/' + j1.json.id + '?phone=0970000952');
  check('SUPPORT: guest sees the admin reply', poll3.json.messages.some(x => x.body.includes('check that for you')), 'messages ' + poll3.json.messages.length);
  const end = await call('POST', '/api/admin/support/chats/' + j1.json.id + '/end', {}, adminCookie);
  check('SUPPORT: admin can end the chat', end.status === 200, 'status ' + end.status);
  const poll4 = await call('GET', '/api/support/chats/' + j1.json.id + '?phone=0970000952');
  check('SUPPORT: ended chat polls as ended', poll4.json.chat.status === 'ended', 'status ' + poll4.json.chat.status);
  const off = await call('POST', '/api/admin/support/heartbeat', { online: false }, adminCookie);
  const st2 = await call('GET', '/api/support/status');
  check('SUPPORT: going offline closes live chat again', off.status === 200 && st2.json.online === false, 'status ' + st2.status);
}

// Oct 23, 2026 regression: real phone photos (hundreds of KB as base64) were
// rejected by the 400 KB body cap before validation ever saw them. A ~900 KB
// photo payload must now be accepted on the photo-carrying routes.

// Oct 23, 2026: shared links must preview with the item's own picture.
// Social crawlers cannot read hash routes, so /s/ pages carry per-item
// Open Graph tags and send real visitors to the in-app page.
async function sharePreviewTests() {
  const raw = async (p) => { const r = await fetch(BASE + p); return { status: r.status, type: r.headers.get('content-type') || '', text: await r.text() }; };
  const seller = await registerUser('Share Preview Seller', '0975550031', 'Lusaka');
  const adminLogin = await call('POST', '/api/auth/login', { phone: ADMIN_PHONE_INPUT, password: 'test-pass-123' });
  const adminC = adminLogin.cookie;
  check('SHARE: admin login for fixtures', !!adminC);

  const prof = await raw('/s/user/' + seller.id);
  check('SHARE: profile preview names the member', prof.status === 200 && prof.text.includes('Share Preview Seller'), 'status ' + prof.status);
  check('SHARE: profile preview uses the member avatar route', prof.text.includes('/api/users/' + seller.id + '/avatar'));
  check('SHARE: profile preview redirects to the in-app profile', prof.text.includes('/#/user/' + seller.id));
  const av = await fetch(BASE + '/api/users/' + seller.id + '/avatar');
  check('SHARE: avatar route serves the profile picture bytes', av.status === 200 && (av.headers.get('content-type') || '').startsWith('image/'), 'status ' + av.status);

  const prod = await call('POST', '/api/products', { title: 'Share Preview Sofa', category: 'Home & Furniture', description: 'A sofa for share preview tests.', price: 800, condition: 'Good', city: 'Lusaka', photos: [IMG] }, seller.cookie);
  const sp = await raw('/s/product/' + prod.json.id);
  check('SHARE: product preview names the item and price', sp.status === 200 && sp.text.includes('Share Preview Sofa') && sp.text.includes('K800'), 'status ' + sp.status);
  check('SHARE: product preview uses the product photo', sp.text.includes('/api/products/' + prod.json.id + '/photos/'));
  // Facebook strips the #fragment from og:url, so og:url must be the
  // /s/ address itself; pointing it at the in-app # link made Facebook
  // show the generic brand preview instead of the product (Oct 26).
  check('SHARE: product og:url is the /s/ address itself', sp.text.includes('og:url" content="https://pieceworkzambia.com/s/product/' + prod.json.id + '"'), sp.text.slice(0, 300));

  // List cache (Oct 27 speed fix): a repeat anonymous list view inside
  // the TTL is served from memory, marked X-Cache: HIT, same body.
  const lcR1 = await fetch(BASE + '/api/products'); const lcT1 = await lcR1.text();
  const lcR2 = await fetch(BASE + '/api/products'); const lcT2 = await lcR2.text();
  check('CACHE: second identical list view is a cache hit', (lcR2.headers.get('x-cache') || '') === 'HIT' && lcT1 === lcT2, 'x-cache=' + lcR2.headers.get('x-cache'));

  // A write to the same family busts its cached lists at once, then the
  // next read re-caches (v81: unrelated writes no longer wipe everything).
  const bustProd = await call('POST', '/api/products', { title: 'Cache Bust Chair', category: 'Home & Furniture', description: 'A chair for cache bust tests.', price: 150, condition: 'Good', city: 'Lusaka', photos: [IMG] }, seller.cookie);
  check('CACHE: fixture product for the bust check created', !!bustProd.json.id, JSON.stringify(bustProd.json).slice(0, 120));
  const lcR3 = await fetch(BASE + '/api/products'); await lcR3.text();
  check('CACHE: a products write busts the products cache', (lcR3.headers.get('x-cache') || '') === 'MISS', 'x-cache=' + lcR3.headers.get('x-cache'));
  const lcR4 = await fetch(BASE + '/api/products'); await lcR4.text();
  check('CACHE: list re-caches after a bust', (lcR4.headers.get('x-cache') || '') === 'HIT', 'x-cache=' + lcR4.headers.get('x-cache'));
  check('PAYLOAD: products list carries no embedded base64 photos', !lcT2.includes('data:image;base64'), 'seller avatars ship as image URLs since v82');

  // ---- v85: auth limits are per connection AND account, so one
  // person's retries (or a whole carrier NAT neighbourhood) cannot
  // lock another member out; the block message is friendly JSON.
  const rlPhone = '+260977100001';
  const rlReg = await call('POST', '/api/auth/register', { name: 'Rate Limit Tester', phone: rlPhone, password: 'test-pass-123', city: 'Lusaka', avatar: IMG, selfie: IMG });
  check('LIMIT: fixture member registered', rlReg.status === 200 || rlReg.status === 201, 'status ' + rlReg.status);
  let lastLogin = null;
  for (let i = 0; i < 40; i++) lastLogin = await call('POST', '/api/auth/login', { phone: rlPhone, password: 'wrong-pass' });
  check('LIMIT: 40 wrong passwords are plain 401s', !!lastLogin && lastLogin.status === 401, 'status ' + (lastLogin && lastLogin.status));
  const blockedLogin = await call('POST', '/api/auth/login', { phone: rlPhone, password: 'wrong-pass' });
  check('LIMIT: the 41st try is a friendly JSON 429', blockedLogin.status === 429 && String(blockedLogin.json.error || '').includes('Too many tries'), 'status ' + blockedLogin.status + ' body ' + JSON.stringify(blockedLogin.json).slice(0, 90));
  await call('POST', '/api/auth/register', { name: 'Rate Limit Neighbour', phone: '+260977100002', password: 'test-pass-123', city: 'Lusaka', avatar: IMG, selfie: IMG });
  const otherLogin = await call('POST', '/api/auth/login', { phone: '+260977100002', password: 'wrong-pass' });
  check('LIMIT: a different member on the same connection is NOT locked out', otherLogin.status === 401, 'status ' + otherLogin.status);

  const biz = await call('POST', '/api/businesses', {
    pacra_number: '120200012345', tpin: '1000000001', owner_legal_name: 'Test Owner', address: 'Plot 1, Test Road', certificate: IMG, name: 'Share Preview Shop', category: 'Electronics', city: 'Lusaka', tagline: 'Preview tagline for the shop.', description: 'A shop for share preview tests.', logo: IMG, cover: IMG }, seller.cookie);
  const bizId = biz.json.id || (biz.json.business || {}).id;
  await call('PATCH', '/api/admin/businesses/' + bizId, { status: 'active' }, adminC);
  const bizSlug = 'share-preview-shop-' + bizId;
  const sb = await raw('/s/business/' + bizSlug);
  check('SHARE: storefront preview names the shop', sb.status === 200 && sb.text.includes('Share Preview Shop'), 'status ' + sb.status);
  check('SHARE: storefront preview uses the shop own image', sb.text.includes('/api/businesses/' + bizId + '/image/'), sb.text.slice(0, 200));
  const logoRes = await fetch(BASE + '/api/businesses/' + bizId + '/image/logo');
  check('SHARE: business image route serves image bytes', logoRes.status === 200 && (logoRes.headers.get('content-type') || '').startsWith('image/'), 'status ' + logoRes.status);

  const job = await call('POST', '/api/jobs', { title: 'Share Preview Job', category: 'Cleaning', description: 'A job for share preview tests.', city: 'Lusaka', date_needed: '2026-11-10', pay_amount: 100, pay_type: 'per_job', workers_needed: 1, terms_accepted: true, photos: [IMG] }, seller.cookie);
  const jobId = job.json.job ? job.json.job.id : job.json.id;
  const sj = await raw('/s/job/' + jobId);
  check('SHARE: job preview names the job and uses its photo', sj.status === 200 && sj.text.includes('Share Preview Job') && sj.text.includes('/api/jobs/' + jobId + '/photos/'), 'status ' + sj.status);

  const missing = await raw('/s/product/999999');
  check('SHARE: unknown item falls back to the brand preview', missing.status === 200 && missing.text.includes('/img/og-brand.jpg'));
}


// Oct 23, 2026: SMS event notifications. No Africa's Talking creds in the
// test env, so every attempt must land in sms_log as 'skipped' while the
// triggering requests themselves succeed exactly as before. Actors are
// existing suite accounts re-logged-in (the admin sells + posts, the M1
// worker buys + applies): the suite already sits at the register/login
// rate limits, so this block may only spend two logins.
async function smsTests() {
  const adminLogin = await call('POST', '/api/auth/login', { phone: ADMIN_PHONE_INPUT, password: 'test-pass-123' });
  const adminC = adminLogin.cookie;
  const adminId = adminLogin.json.user && adminLogin.json.user.id;
  const workerLogin = await call('POST', '/api/auth/login', { phone: '0970000012', password: 'test-pass-123' });
  const workerC = workerLogin.cookie;
  const workerId = workerLogin.json.user && workerLogin.json.user.id;
  check('SMS: actor logins for the flows', !!adminC && !!workerC && !!adminId && !!workerId);

  // Offer -> SMS to the seller (the admin).
  const prod = await call('POST', '/api/products', { title: 'SMS Test Item', category: 'Electronics', description: 'An item for SMS notification tests.', price: 2000, condition: 'Good', city: 'Lusaka' }, adminC);
  check('SMS: product created for offer flow', prod.status === 201, 'status ' + prod.status);
  const offer = await call('POST', `/api/products/${prod.json.id}/offers`, { amount: 1500 }, workerC);
  check('SMS: offer request still succeeds', offer.status === 201 && !!offer.json.id, 'status ' + offer.status);

  // Application -> SMS to the poster (the admin); accept -> SMS to the worker.
  const job = await call('POST', '/api/jobs', { title: 'SMS Test Job', category: 'Cleaning', description: 'A job for SMS notification tests.', city: 'Lusaka', date_needed: '2026-11-12', pay_amount: 200, pay_type: 'per_job', workers_needed: 1, terms_accepted: true }, adminC);
  check('SMS: job created for application flow', job.status === 200 || job.status === 201, 'status ' + job.status);
  const jobId = job.json.job ? job.json.job.id : job.json.id;
  const appRes = await call('POST', `/api/jobs/${jobId}/apply`, { message: 'I can start today.' }, workerC);
  check('SMS: application request still succeeds', appRes.status === 200 || appRes.status === 201, 'status ' + appRes.status);
  const acc = await call('PATCH', `/api/applications/${appRes.json.id}`, { status: 'accepted' }, adminC);
  check('SMS: accept request still succeeds', acc.status === 200, 'status ' + acc.status);

  // notifySms is fire-and-forget: poll the admin log until this block's
  // three rows (scoped by kind + recipient) have landed.
  let rows = [];
  for (let i = 0; i < 24; i++) {
    const log = await call('GET', '/api/admin/sms-log', null, adminC);
    rows = log.json.sms_log || [];
    const has = (kind, uid, frag) => rows.some(r => r.kind === kind && r.user_id === uid && r.body.includes(frag));
    if (has('offer', adminId, 'SMS Test Item') && has('application', adminId, 'SMS Test Job') && has('accepted', workerId, 'SMS Test Job')) break;
    await new Promise(r => setTimeout(r, 250));
  }
  const offerRow = rows.find(r => r.kind === 'offer' && r.user_id === adminId && r.body.includes('SMS Test Item'));
  check('SMS: offer notification logged for the seller as skipped', !!offerRow && offerRow.status === 'skipped' && offerRow.phone === '+260970000001', JSON.stringify(offerRow || {}));
  check('SMS: offer text names buyer, formatted amount and item', !!offerRow && offerRow.body.includes('M1 Worker') && offerRow.body.includes('K1,500') && offerRow.body.includes('SMS Test Item'), offerRow ? offerRow.body : '');
  const appRow = rows.find(r => r.kind === 'application' && r.user_id === adminId && r.body.includes('SMS Test Job'));
  check('SMS: application notification logged for the poster as skipped', !!appRow && appRow.status === 'skipped', JSON.stringify(appRow || {}));
  check('SMS: application text names worker and job', !!appRow && appRow.body.includes('M1 Worker') && appRow.body.includes('SMS Test Job'), appRow ? appRow.body : '');
  const accRow = rows.find(r => r.kind === 'accepted' && r.user_id === workerId && r.body.includes('SMS Test Job'));
  check('SMS: accepted notification logged for the worker as skipped', !!accRow && accRow.status === 'skipped', JSON.stringify(accRow || {}));
  check('SMS: accepted text names the job', !!accRow && accRow.body.includes('SMS Test Job'), accRow ? accRow.body : '');
  check('SMS: every logged body fits one SMS segment (160 chars)', rows.length > 0 && rows.every(r => r.body.length <= 160));
  const denied = await call('GET', '/api/admin/sms-log', null, workerC);
  check('SMS: log endpoint is admin-only (403)', denied.status === 403, 'status ' + denied.status);
  // Registration confirmation: signups earlier in the suite (e.g. the M1
  // worker) must each have a welcome text logged. (No fresh registration
  // here: the suite already sits at the register rate limit.) Read it
  // from the test DB directly: the admin endpoint only returns the
  // latest 50 rows, and signup-code sends now share that log.
  const wRow = await dbOne(
    "SELECT * FROM sms_log WHERE kind = 'welcome' AND user_id = ? ORDER BY id DESC LIMIT 1",
    [workerId]
  ) || rows.find(r => r.kind === 'welcome' && r.user_id === workerId);
  check('SMS: registration confirmation logged for a new user as skipped', !!wRow && wRow.status === 'skipped' && wRow.phone === '+260970000012', JSON.stringify(wRow || {}));
  check('SMS: welcome text opens as Zac and names the user', !!wRow && wRow.body.startsWith('Hi, this is Zac, your assistant.') && wRow.body.includes('Welcome to 2911 Jobs, M1 Worker'), wRow ? wRow.body : '');
}

// Oct 23, 2026: Web Push subscriptions. The test env sets no VAPID keys,
// so push is disabled: the public key must read null, /test must report
// skipped, and subscribe/unsubscribe still validate and store rows
// (storage is proven via the endpoint upsert: a plain INSERT would fail
// the UNIQUE constraint on the second subscribe). No fresh login here,
// like the SMS block: the suite sits at the login rate limit, so the
// main flow's admin session is passed in.
async function pushTests(adminC) {
  check('PUSH: actor session for the flows', !!adminC);

  const pk = await call('GET', '/api/push/public-key', null, adminC);
  check('PUSH: public key is null while push is not configured', pk.status === 200 && pk.json.publicKey === null, JSON.stringify(pk.json));

  const sub = {
    endpoint: 'https://push.example.com/sub/push-test-1',
    keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' },
  };
  const noAuth = await call('POST', '/api/push/subscribe', { subscription: sub, userAgent: 'push-test' });
  check('PUSH: subscribe without sign-in is 401', noAuth.status === 401, 'status ' + noAuth.status);
  const malformed = await call('POST', '/api/push/subscribe', { subscription: { endpoint: 'not-a-url' } }, adminC);
  check('PUSH: malformed subscription is 422', malformed.status === 422, 'status ' + malformed.status);
  const noKeys = await call('POST', '/api/push/subscribe', { subscription: { endpoint: sub.endpoint, keys: {} } }, adminC);
  check('PUSH: subscription without keys is 422', noKeys.status === 422, 'status ' + noKeys.status);

  const ok1 = await call('POST', '/api/push/subscribe', { subscription: sub, userAgent: 'push-test' }, adminC);
  check('PUSH: subscribe stores the subscription', ok1.status === 200 && ok1.json.ok === true, 'status ' + ok1.status);
  const ok2 = await call('POST', '/api/push/subscribe', { subscription: { ...sub, keys: { p256dh: sub.keys.p256dh, auth: 'uBHItJI5svbpez7KI4CCXh' } }, userAgent: 'push-test' }, adminC);
  check('PUSH: re-subscribing the same endpoint upserts (no UNIQUE failure)', ok2.status === 200 && ok2.json.ok === true, 'status ' + ok2.status);

  const tst = await call('POST', '/api/push/test', {}, adminC);
  check('PUSH: test send reports skipped while push is disabled', tst.status === 200 && tst.json.skipped === true && tst.json.sent === 0 && tst.json.failed === 0, JSON.stringify(tst.json));

  const un = await call('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint }, adminC);
  check('PUSH: unsubscribe removes the subscription', un.status === 200 && un.json.ok === true, 'status ' + un.status);
  const ok3 = await call('POST', '/api/push/subscribe', { subscription: sub, userAgent: 'push-test' }, adminC);
  check('PUSH: subscribing again after unsubscribe works', ok3.status === 200 && ok3.json.ok === true, 'status ' + ok3.status);
  const unBad = await call('POST', '/api/push/unsubscribe', {}, adminC);
  check('PUSH: unsubscribe without an endpoint is 422', unBad.status === 422, 'status ' + unBad.status);
}

// Oct 23, 2026: Ads banner. Owners promote a product, job or storefront
// into the rotating Home/Marketplace banner, free during the growth
// phase, recorded pay-ready (is_paid/amount). Real accounts only: the
// block reuses existing suite accounts (the register rate limit is
// spent) and proves the tester exclusion twice over: a flagged owner
// cannot create ads, and an ad created before flagging vanishes from
// the public feed the moment the owner is flagged.
async function adsTests(fx) {
  const { admin, third, p2, bizId, bizSlug } = fx;

  const prod = await call('POST', '/api/products', { title: 'ADS Test Item', category: 'Electronics', description: 'An item for ads banner tests.', price: 1500, condition: 'Good', city: 'Lusaka', photos: [IMG] }, admin.cookie);
  check('ADS: fixture product created', prod.status === 201, 'status ' + prod.status);
  const prodId = prod.json.id;
  const job = await call('POST', '/api/jobs', { title: 'ADS Test Job', category: 'Cleaning', description: 'A job for ads banner tests.', city: 'Lusaka', date_needed: '2026-11-15', pay_amount: 300, pay_type: 'per_job', workers_needed: 1, terms_accepted: true }, admin.cookie);
  const jobId = job.json.job ? job.json.job.id : job.json.id;
  check('ADS: fixture job created', (job.status === 200 || job.status === 201) && !!jobId, 'status ' + job.status);
  const cover = await call('PATCH', '/api/businesses/' + bizId, { cover: IMG }, p2.cookie);
  check('ADS: fixture business cover set', cover.status === 200, 'status ' + cover.status);

  const noAuth = await call('POST', '/api/ads', { kind: 'product', ref_id: prodId });
  check('ADS: creating an ad requires sign-in (401)', noAuth.status === 401, 'status ' + noAuth.status);
  const badKind = await call('POST', '/api/ads', { kind: 'user', ref_id: prodId }, admin.cookie);
  check('ADS: unknown kind is 422', badKind.status === 422, 'status ' + badKind.status);
  const missing = await call('POST', '/api/ads', { kind: 'product', ref_id: 999999 }, admin.cookie);
  check('ADS: missing item is 404', missing.status === 404, 'status ' + missing.status);
  const notMine = await call('POST', '/api/ads', { kind: 'product', ref_id: prodId }, third.cookie);
  check('ADS: non-owner cannot promote (403)', notMine.status === 403, 'status ' + notMine.status);

  const ad1 = await call('POST', '/api/ads', { kind: 'product', ref_id: prodId }, admin.cookie);
  check('ADS: owner promotes own product (201, recorded free)', ad1.status === 201 && !!ad1.json.ad && ad1.json.ad.is_paid === false && ad1.json.ad.amount === 0, JSON.stringify(ad1.json).slice(0, 160));
  const span = ad1.json.ad ? (Date.parse(String(ad1.json.ad.ends_at).replace(' ', 'T') + 'Z') - Date.parse(String(ad1.json.ad.starts_at).replace(' ', 'T') + 'Z')) : 0;
  check('ADS: ad runs for 14 days', span > 13.9 * 24 * 3600 * 1000 && span <= 14.1 * 24 * 3600 * 1000, 'span ' + span);
  const dup = await call('POST', '/api/ads', { kind: 'product', ref_id: prodId }, admin.cookie);
  check('ADS: duplicate active ad is 409', dup.status === 409, 'status ' + dup.status);

  const adJob = await call('POST', '/api/ads', { kind: 'job', ref_id: jobId }, admin.cookie);
  check('ADS: owner promotes own job (201)', adJob.status === 201 && !!adJob.json.ad, 'status ' + adJob.status);
  const adBiz = await call('POST', '/api/ads', { kind: 'business', ref_id: bizId }, p2.cookie);
  check('ADS: owner promotes own storefront (201)', adBiz.status === 201 && !!adBiz.json.ad, 'status ' + adBiz.status);

  const feed = await call('GET', '/api/ads');
  const fAds = feed.json.ads || [];
  const fProd = fAds.find(a => a.kind === 'product' && a.ref_id === prodId);
  check('ADS: feed shows the product ad with title, price and route', !!fProd && fProd.title === 'ADS Test Item' && fProd.subtitle === 'K1,500 · Lusaka' && fProd.url === '#/product/' + prodId, JSON.stringify(fProd || {}));
  check('ADS: product ad slide uses the product photo', !!fProd && typeof fProd.image_url === 'string' && fProd.image_url.startsWith('/api/products/' + prodId + '/photos/'), String(fProd && fProd.image_url));
  const fJob = fAds.find(a => a.kind === 'job' && a.ref_id === jobId);
  check('ADS: feed shows the job ad with pay label and route', !!fJob && fJob.title === 'ADS Test Job' && fJob.subtitle === 'K300 per job · Lusaka' && fJob.url === '#/job/' + jobId && fJob.image_url === null, JSON.stringify(fJob || {}));
  const fBiz = fAds.find(a => a.kind === 'business' && a.ref_id === bizId);
  check('ADS: feed shows the business ad with tagline, cover and route', !!fBiz && fBiz.title === 'Kamwala Phone Repairs' && fBiz.subtitle === 'Fixed today, working tonight' && fBiz.image_url === '/api/businesses/' + bizId + '/image/cover' && fBiz.url === '#/business/' + bizSlug, JSON.stringify(fBiz || {}));

  const dOwner = await call('GET', '/api/products/' + prodId, null, admin.cookie);
  check('ADS: product detail gives the owner the active ad', !!(dOwner.json.product && dOwner.json.product.active_ad && dOwner.json.product.active_ad.id === ad1.json.ad.id && dOwner.json.product.active_ad.ends_at === ad1.json.ad.ends_at), JSON.stringify((dOwner.json.product || {}).active_ad));
  const dOther = await call('GET', '/api/products/' + prodId, null, third.cookie);
  check('ADS: product detail hides active_ad from non-owners', !!dOther.json.product && dOther.json.product.active_ad === null);
  const jOwner = await call('GET', '/api/jobs/' + jobId, null, admin.cookie);
  check('ADS: job detail gives the poster the active ad', !!(jOwner.json.job && jOwner.json.job.active_ad && jOwner.json.job.active_ad.id === adJob.json.ad.id));
  const bOwner = await call('GET', '/api/businesses/' + bizSlug, null, p2.cookie);
  check('ADS: business detail gives the owner the active ad', !!(bOwner.json.business && bOwner.json.business.active_ad && bOwner.json.business.active_ad.id === adBiz.json.ad.id));

  const mine = await call('GET', '/api/ads/mine', null, admin.cookie);
  const mAds = mine.json.ads || [];
  check('ADS: /mine lists my ads with entity titles', mAds.some(a => a.kind === 'product' && a.ref_id === prodId && a.title === 'ADS Test Item' && a.status === 'active') && mAds.some(a => a.kind === 'job' && a.ref_id === jobId), JSON.stringify(mAds).slice(0, 200));

  const delOther = await call('DELETE', '/api/ads/' + adJob.json.ad.id, null, third.cookie);
  check('ADS: non-owner cannot end an ad (403)', delOther.status === 403, 'status ' + delOther.status);
  const del = await call('DELETE', '/api/ads/' + adJob.json.ad.id, null, admin.cookie);
  check('ADS: owner ends the ad', del.status === 200 && del.json.ok === true, 'status ' + del.status);
  const feed2 = await call('GET', '/api/ads');
  check('ADS: ended ad leaves the feed', !(feed2.json.ads || []).some(a => a.kind === 'job' && a.ref_id === jobId));
  const mine2 = await call('GET', '/api/ads/mine', null, admin.cookie);
  const ended = (mine2.json.ads || []).find(a => a.id === adJob.json.ad.id);
  check('ADS: ended ad still listed in /mine as ended', !!ended && ended.status === 'ended');

  const sold = await call('PATCH', '/api/products/' + prodId, { status: 'sold' }, admin.cookie);
  check('ADS: owner marks the product sold', sold.status === 200, 'status ' + sold.status);
  const feed3 = await call('GET', '/api/ads');
  check('ADS: sold product leaves the feed', !(feed3.json.ads || []).some(a => a.kind === 'product' && a.ref_id === prodId));

  const tProd = await call('POST', '/api/products', { title: 'ADS Tester Item', category: 'Electronics', description: 'Owned by an account about to be flagged.', price: 100, condition: 'Good', city: 'Lusaka' }, third.cookie);
  check('ADS: tester-fixture product created', tProd.status === 201, 'status ' + tProd.status);
  const tAd = await call('POST', '/api/ads', { kind: 'product', ref_id: tProd.json.id }, third.cookie);
  check('ADS: real account can promote before any tester flag', tAd.status === 201, 'status ' + tAd.status);
  const feedT0 = await call('GET', '/api/ads');
  check('ADS: unflagged owner ad shows in the feed', (feedT0.json.ads || []).some(a => a.kind === 'product' && a.ref_id === tProd.json.id));
  const flag = await call('PATCH', `/api/admin/users/${third.id}/tester`, { is_tester: true }, admin.cookie);
  check('ADS: admin flags the owner as a tester', flag.status === 200 && flag.json.is_tester === true, 'status ' + flag.status);
  const feedT1 = await call('GET', '/api/ads');
  check('ADS: tester owner ad never appears in the feed', !(feedT1.json.ads || []).some(a => a.kind === 'product' && a.ref_id === tProd.json.id));
  const tProd2 = await call('POST', '/api/products', { title: 'ADS Tester Item Two', category: 'Electronics', description: 'Second item from the flagged account.', price: 120, condition: 'Good', city: 'Lusaka' }, third.cookie);
  const tAd2 = await call('POST', '/api/ads', { kind: 'product', ref_id: tProd2.json.id }, third.cookie);
  check('ADS: tester cannot create ads (403)', tAd2.status === 403 && String(tAd2.json.error || '').includes('real accounts'), 'status ' + tAd2.status + ' ' + JSON.stringify(tAd2.json).slice(0, 120));
  const unflag = await call('PATCH', `/api/admin/users/${third.id}/tester`, { is_tester: false }, admin.cookie);
  check('ADS: tester flag removed after the checks', unflag.status === 200 && unflag.json.is_tester === false, 'status ' + unflag.status);
}

async function bigPhotoTests() {
  const big = 'data:image/jpeg;base64,' + 'A'.repeat(900000);
  const u = await registerUser('Big Photo Seller', '0975550011', 'Lusaka');
  const p = await call('POST', '/api/products', { title: 'Big photo item', category: 'Electronics', description: 'Listed with a full-size phone photo.', price: 100, condition: 'Good', city: 'Lusaka', photos: [big] }, u.cookie);
  check('BIG: product with a ~900 KB photo is created', p.status === 201, 'status ' + p.status);
  const got = await call('GET', '/api/products/' + p.json.id, null, u.cookie);
  check('BIG: the large photo is stored and served back', got.status === 200 && (got.json.product.photos || []).length === 1);
  const j = await call('POST', '/api/jobs', { title: 'Big photo job', category: 'Cleaning', description: 'A job posted with a full-size phone photo.', city: 'Lusaka', date_needed: '2027-11-05', pay_amount: 100, pay_type: 'per_job', workers_needed: 1, terms_accepted: true, photos: [big] }, u.cookie);
  check('BIG: job with a ~900 KB photo is created', j.status === 201, 'status ' + j.status);
}

// Oct 23, 2026: trust strip (Donald's suggestion). Track-record counts ride
// on the product detail (seller card) and the public profile.
async function trustTests() {
  const seller = await registerUser('Trust Seller', '0975550021', 'Lusaka');
  const a = await call('POST', '/api/products', { title: 'Trust item A', category: 'Electronics', description: 'First trust item.', price: 100, condition: 'Good', city: 'Lusaka' }, seller.cookie);
  const b = await call('POST', '/api/products', { title: 'Trust item B', category: 'Electronics', description: 'Second trust item.', price: 200, condition: 'Good', city: 'Lusaka' }, seller.cookie);
  check('TRUST: seed products created', a.status === 201 && b.status === 201, a.status + '/' + b.status);
  const sold = await call('PATCH', '/api/products/' + a.json.id, { status: 'sold' }, seller.cookie);
  check('TRUST: owner can mark an item sold', sold.status === 200, 'status ' + sold.status);
  const detail = await call('GET', '/api/products/' + b.json.id, null, seller.cookie);
  const ss = detail.json.product && detail.json.product.seller_stats;
  check('TRUST: product detail carries seller_stats', !!ss, JSON.stringify(detail.json).slice(0, 120));
  check('TRUST: seller_stats counts 1 sold, 1 listed', !!ss && ss.items_sold === 1 && ss.items_listed === 1, JSON.stringify(ss));
  const buyer = await registerUser('Trust Buyer', '0975550022', 'Kitwe');
  const prof = await call('GET', '/api/users/' + seller.id, null, buyer.cookie);
  check('TRUST: public profile carries stats with items_sold 1', !!(prof.json.stats && prof.json.stats.items_sold === 1), JSON.stringify(prof.json.stats || {}));
  const mine = await call('GET', '/api/users/me/stats', null, seller.cookie);
  check('TRUST: /me/stats agrees (same definition)', mine.json.items_sold === 1 && mine.json.items_listed === 1, JSON.stringify(mine.json));
}

// Oct 24, 2026: selfie rejection notice + re-upload + admin counts, and
// business logos round-tripping as uploaded (v75). notifySms is
// fire-and-forget, so the SMS assertions poll the admin log.
async function selfieAndLogoTests(adminCookie, u) {
  // Subject: the M1 Distant user from the main flow, reused on purpose.
  // The suite already sits exactly at the 15/hour register cap, so a
  // fresh registration here starved the share-preview section (Oct 24).
  const smsRows = async () => {
    const log = await call('GET', '/api/admin/sms-log', null, adminCookie);
    return (log.json.sms_log || []).filter(r => r.user_id === u.id && r.kind === 'selfie_rejected');
  };
  const waitSms = async (n) => {
    let rows = [];
    for (let i = 0; i < 24; i++) {
      rows = await smsRows();
      if (rows.length >= n) break;
      await new Promise(r => setTimeout(r, 250));
    }
    return rows;
  };
  let v = await call('GET', '/api/admin/verifications', null, adminCookie);
  // The queue ships selfie image URLs, not embedded photos (v83): the
  // page used to carry ~4.4 MB of base64 and re-downloaded after every
  // decision. The image route is moderator-only.
  const queueRow = (v.json.pending || []).find((x) => x.id === u.id) || {};
  check('SELFIE QUEUE: pending rows carry an image URL, not base64', String(queueRow.selfie || '').startsWith('/api/admin/verifications/') && !JSON.stringify(v.json.pending || []).includes('data:image;base64'), String(queueRow.selfie).slice(0, 60));
  const selfieImg = await fetch(BASE + '/api/admin/verifications/' + u.id + '/selfie', { headers: { Cookie: adminCookie } });
  check('SELFIE QUEUE: moderator can load the selfie image', selfieImg.status === 200 && (selfieImg.headers.get('content-type') || '').startsWith('image/'), 'status ' + selfieImg.status);
  const selfieDenied = await fetch(BASE + '/api/admin/verifications/' + u.id + '/selfie', { headers: { Cookie: u.cookie } });
  check('SELFIE QUEUE: members cannot load the selfie image route', selfieDenied.status === 403, 'status ' + selfieDenied.status);
  const docReq = await call('POST', '/api/admin/users/' + u.id + '/request-doc', { kind: 'food_license' }, adminCookie);
  check('DOC REQUEST: admin can request a document', docReq.status === 200 && docReq.json.ok === true, 'status ' + docReq.status);
  let docSmsRow = {};
  for (let i = 0; i < 16 && !docSmsRow.kind; i++) {
    const docLog = await call('GET', '/api/admin/sms-log', null, adminCookie);
    docSmsRow = (docLog.json.sms_log || []).find(r => r.user_id === u.id && r.kind === 'doc_request_food_license') || {};
    if (!docSmsRow.kind) await new Promise(r => setTimeout(r, 250));
  }
  check('DOC REQUEST: the ask goes out as an SMS in Zac voice', docSmsRow.kind === 'doc_request_food_license' && String(docSmsRow.body || '').includes('food handlers licence'), JSON.stringify(docSmsRow).slice(0, 160));
  check('SELFIE: new signup waits in the pending queue', v.status === 200 && (v.json.pending || []).some(x => x.id === u.id), 'status ' + v.status);
  check('SELFIE: dashboard counts ride along', typeof v.json.rejected_count === 'number' && typeof v.json.redone_count === 'number' && typeof v.json.approved_count === 'number', JSON.stringify(v.json).slice(0, 120));
  const denied = await call('GET', '/api/admin/verifications', null, u.cookie);
  check('SELFIE: non-admin cannot read the queue (403)', denied.status === 403, 'status ' + denied.status);
  const rej = await call('POST', '/api/admin/verifications/' + u.id, { status: 'rejected' }, adminCookie);
  check('SELFIE: admin can reject', rej.status === 200, 'status ' + rej.status);
  const rows1 = await waitSms(1);
  check('SELFIE: rejection sends the standard SMS (logged, skipped without AT)', rows1.length === 1 && rows1[0].status === 'skipped' && rows1[0].body.includes('blocking recruiters') && rows1[0].body.length <= 160, JSON.stringify(rows1).slice(0, 160));
  v = await call('GET', '/api/admin/verifications', null, adminCookie);
  check('SELFIE: rejected list and count include the user', (v.json.rejected || []).some(x => x.id === u.id) && v.json.rejected_count >= 1, 'count ' + v.json.rejected_count);
  const notify = await call('POST', '/api/admin/verifications/' + u.id + '/notify', {}, adminCookie);
  check('SELFIE: admin can resend the notice', notify.status === 200, 'status ' + notify.status);
  const rows2 = await waitSms(2);
  check('SELFIE: resend logs a second SMS', rows2.length === 2, 'rows ' + rows2.length);
  const notifyDenied = await call('POST', '/api/admin/verifications/' + u.id + '/notify', {}, u.cookie);
  check('SELFIE: non-admin cannot resend (403)', notifyDenied.status === 403, 'status ' + notifyDenied.status);
  const bad = await call('PATCH', '/api/users/me', { selfie: 'not-an-image' }, u.cookie);
  check('SELFIE: invalid selfie is refused (422)', bad.status === 422, 'status ' + bad.status);
  const fix = await call('PATCH', '/api/users/me', { selfie: IMG }, u.cookie);
  check('SELFIE: re-upload returns the user to pending', fix.status === 200 && fix.json.user.selfie_status === 'pending', 'status ' + fix.status + ' ' + JSON.stringify(fix.json).slice(0, 140));
  v = await call('GET', '/api/admin/verifications', null, adminCookie);
  check('SELFIE: re-done user is back in the queue and counted as re-did', (v.json.pending || []).some(x => x.id === u.id) && v.json.redone_count >= 1 && !(v.json.rejected || []).some(x => x.id === u.id), 'redone ' + v.json.redone_count);
  const av = await call('PATCH', '/api/users/me', { avatar: IMG }, u.cookie);
  check('PROFILE: avatar change saves on its own and leaves the selfie status untouched (still pending here)',
    av.status === 200 && av.json.user.avatar === IMG && av.json.user.selfie_status === 'pending', (av.json.user || {}).selfie_status || '');
  const okRes = await call('POST', '/api/admin/verifications/' + u.id, { status: 'approved' }, adminCookie);
  await new Promise(r => setTimeout(r, 700));
  const rows3 = await smsRows();
  check('SELFIE: approval sends no rejection SMS', okRes.status === 200 && rows3.length === 2, 'rows ' + rows3.length);
  const biz = await call('POST', '/api/businesses', {
    pacra_number: '120200012345', tpin: '1000000001', owner_legal_name: 'Test Owner', address: 'Plot 1, Test Road', certificate: IMG, name: 'Logo Check Crafts', category: 'Other', city: 'Lusaka', description: 'Checking that a PNG logo is stored as uploaded.', logo: IMG }, u.cookie);
  check('LOGO: business created with a PNG logo', biz.status === 201 || biz.status === 200, 'status ' + biz.status);
  const mine = await call('GET', '/api/businesses/mine', null, u.cookie);
  const mineBiz = (mine.json.businesses || [])[0];
  check('LOGO: logo comes back as the PNG data URL', !!mineBiz && typeof mineBiz.logo === 'string' && mineBiz.logo.startsWith('data:image/png'), mineBiz ? String(mineBiz.logo).slice(0, 30) : 'none');
  const badLogo = await call('POST', '/api/businesses', {
    pacra_number: '120200012345', tpin: '1000000001', owner_legal_name: 'Test Owner', address: 'Plot 1, Test Road', certificate: IMG, name: 'Bad Logo Crafts', category: 'Other', city: 'Lusaka', description: 'This one carries a broken logo value.', logo: 'not-a-data-url' }, u.cookie);
  check('LOGO: a non-image logo is refused (422)', badLogo.status === 422, 'status ' + badLogo.status);
}

// 2911 Experiences Phase 2 backend (2026-11-08): location system,
// categories, listing data model, public browse API. No write endpoints
// exist in this phase, so fixtures are inserted directly into the
// throwaway test database (the suite's dbExecute helper), exactly like
// the OTP suite reads sms_log directly. Runs last: it inserts a verified
// business of its own and must not disturb earlier suites.
async function experiencesTests(adminCookie, memberCookie, memberId, otherId) {
  const exp = require('../routes/experiences');
  check('EXP: Zambia bounds helper accepts Lusaka/Mfuwe, rejects London and far lng',
    exp.isInZambia(-15.3875, 28.3228) && exp.isInZambia(-13.0972, 31.7875)
    && !exp.isInZambia(51.5074, -0.1278) && !exp.isInZambia(-15.3875, 150.0)
    && exp.EXP_PRICE_MAX === 10000000 && exp.EXP_MAX_PHOTOS === 8
    && exp.EXP_CANCELLATION_POLICIES.join(',') === 'Flexible,Moderate,Strict,Event');
  check('EXP: listing CHECK rejects both host sides set',
    await (async () => { try { await dbExecute("INSERT INTO experience_listings (listing_type, host_id, business_id, title, city) VALUES ('tour', 1, 1, 'x', 'Lusaka')"); return false; } catch { return true; } })());
  check('EXP: listing CHECK rejects neither host side set',
    await (async () => { try { await dbExecute("INSERT INTO experience_listings (listing_type, host_id, business_id, title, city) VALUES ('tour', NULL, NULL, 'x', 'Lusaka')"); return false; } catch { return true; } })());

  // Whole-page empty state (UI Spec 3.6): no approved listings at all.
  const empty = await call('GET', '/api/experiences');
  check('EXP: empty browse returns total 0 (the "Experiences are coming soon" condition)',
    empty.status === 200 && empty.json.total === 0 && Array.isArray(empty.json.experiences) && empty.json.experiences.length === 0,
    JSON.stringify(empty.json).slice(0, 120));

  // Seeds: 6 provisional categories, 10 provinces, ancestor chains.
  const cats = await call('GET', '/api/experiences/categories');
  const catNames = (cats.json.categories || []).map((c) => c.name + ':' + c.kind).join(',');
  check('EXP: categories seed is the six launch categories with kind mapping',
    cats.status === 200 && (cats.json.categories || []).length === 6
    && catNames === 'Tours:tour,Stays:stay,Transport:transport,Adventure:experience,Cultural:experience,Events:event',
    catNames);
  const provs = await call('GET', '/api/experiences/locations');
  check('EXP: locations without q returns the 10 provinces',
    provs.status === 200 && (provs.json.locations || []).length === 10
    && (provs.json.locations || []).every((l) => l.level === 'province'), JSON.stringify(provs.json).slice(0, 120));
  const mfu = await call('GET', '/api/experiences/locations?q=Mfu');
  const mfuRow = (mfu.json.locations || [])[0] || {};
  check('EXP: autocomplete returns the full ancestor chain',
    mfu.status === 200 && mfuRow.name === 'Mfuwe'
    && mfuRow.chain === 'Mfuwe, Mambwe District, Eastern Province'
    && (mfuRow.ancestors || []).map((a) => a.name).join('/') === 'Zambia/Eastern/Mambwe',
    JSON.stringify(mfuRow).slice(0, 200));
  const noLoc = await call('GET', '/api/experiences/locations?q=zzz-nomatch');
  check('EXP: autocomplete with no match returns an empty list',
    noLoc.status === 200 && (noLoc.json.locations || []).length === 0);

  // Fixtures: 4 active listings (stay, tour, event, transport) + 1 draft.
  const locId = async (level, name) => (await dbOne(
    'SELECT id FROM experience_locations WHERE level = ? AND name = ?', [level, name])).id;
  const catId = async (name) => (await dbOne(
    'SELECT id FROM experience_categories WHERE name = ?', [name])).id;
  const livingstone = await locId('town', 'Livingstone');
  const mfuwe = await locId('town', 'Mfuwe');
  const lusaka = await locId('town', 'Lusaka');
  const staysCat = await catId('Stays');
  const toursCat = await catId('Tours');
  const eventsCat = await catId('Events');
  const transportCat = await catId('Transport');
  const biz = await dbExecute(
    "INSERT INTO businesses (owner_id, name, slug, city, status, verification_status) VALUES (?, 'Exp Verified Lodge Co', 'exp-verified-lodge-co-1', 'Livingstone', 'active', 'verified')",
    [otherId]);
  const bizId = Number(biz.lastInsertRowid);
  // Phase 3 (2026-11-08): experience_listings.host_id is now a FK to
  // experience_hosts(id), NOT a user id as in the Phase 2 fixtures.
  // Create the member's host profile with an id (9001) deliberately
  // DIFFERENT from the member's user id, so the suite genuinely tests
  // the rewired join (listings -> experience_hosts -> users): the old
  // join (users on host_id) would find no user 9001 and the host card
  // would come back nameless.
  const hostRow = await dbExecute(
    "INSERT INTO experience_hosts (id, user_id, display_name, city, status, verification_status) VALUES (?, ?, 'Worker Tester', 'Kitwe', 'approved', 'unverified')",
    [9001, memberId]);
  const hostId = Number(hostRow.lastInsertRowid);
  const mkListing = async (sql, args) => Number((await dbExecute(sql, args)).lastInsertRowid);
  const stayId = await mkListing(
    `INSERT INTO experience_listings (listing_type, category_id, host_id, business_id, location_id, title, description, city, price_from, price_unit, capacity_max, instant_book, cancellation_policy, inclusions, exclusions, safety_requirements, status)
     VALUES ('stay', ?, NULL, ?, ?, 'EXP Riverside Guesthouse', 'A quiet guesthouse by the river in Livingstone.', 'Livingstone', 450, 'per_night', 4, 0, 'Flexible', ?, ?, 'Check in with the host on arrival.', 'active')`,
    [staysCat, bizId, livingstone, JSON.stringify(['Wi-Fi', 'Breakfast']), JSON.stringify(['Airport transfer'])]);
  await dbExecute(
    `INSERT INTO experience_properties (listing_id, property_type, max_guests, bedrooms, bathrooms, amenities, check_in_time, check_out_time)
     VALUES (?, 'guesthouse', 4, 2, 1, ?, '14:00', '11:00')`,
    [stayId, JSON.stringify(['Wi-Fi', 'Parking'])]);
  await dbExecute(
    "INSERT INTO experience_property_units (property_id, name, unit_type, sleeps, quantity, price_per_night) VALUES (?, 'Double Room', 'room', 2, 2, 450)",
    [stayId]);
  await dbExecute("INSERT INTO experience_listing_media (listing_id, image, mime, sort) VALUES (?, ?, 'image/png', 0)", [stayId, IMG]);
  await dbExecute("INSERT INTO experience_listing_media (listing_id, image, mime, sort) VALUES (?, ?, 'image/png', 1)", [stayId, IMG]);
  const tourId = await mkListing(
    `INSERT INTO experience_listings (listing_type, category_id, host_id, business_id, location_id, title, description, city, price_from, price_unit, capacity_max, instant_book, cancellation_policy, inclusions, exclusions, safety_requirements, status)
     VALUES ('tour', ?, ?, NULL, ?, 'EXP South Luangwa Walking Safari', 'A guided walking safari in South Luangwa.', 'Mfuwe', 350, 'per_person', 12, 0, 'Moderate', ?, ?, 'Closed shoes required.', 'active')`,
    [toursCat, hostId, mfuwe, JSON.stringify(['Guide', 'Park fees']), JSON.stringify([])]);
  await dbExecute(
    "INSERT INTO experience_tours (listing_id, duration_hours, group_size_max, group_size_min, meeting_point, price_per_person) VALUES (?, 4, 12, 2, 'Mfuwe Lodge car park', 350)",
    [tourId]);
  await dbExecute("INSERT INTO experience_listing_media (listing_id, image, mime, sort) VALUES (?, ?, 'image/png', 0)", [tourId, IMG]);
  const eventId = await mkListing(
    `INSERT INTO experience_listings (listing_type, category_id, host_id, business_id, location_id, title, description, city, price_from, price_unit, capacity_max, instant_book, cancellation_policy, status)
     VALUES ('event', ?, NULL, ?, ?, 'EXP Traditional Music Evening', 'An evening of traditional Zambian music.', 'Lusaka', 100, 'per_person', 200, 0, 'Event', 'active')`,
    [eventsCat, bizId, lusaka]);
  await dbExecute(
    "INSERT INTO experience_events (listing_id, venue_name, event_date, ticket_capacity) VALUES (?, 'Lusaka Showgrounds', '2027-03-15', 200)",
    [eventId]);
  const vehicleId = await mkListing(
    `INSERT INTO experience_listings (listing_type, category_id, host_id, business_id, location_id, title, description, city, price_from, price_unit, capacity_max, instant_book, cancellation_policy, status)
     VALUES ('vehicle', ?, ?, NULL, ?, 'EXP 4x4 Hire with Driver', 'A 4x4 with driver for day trips.', 'Lusaka', 1200, 'per_day', 5, 1, 'Strict', 'active')`,
    [transportCat, hostId, lusaka]);
  await dbExecute(
    "INSERT INTO experience_vehicles (listing_id, vehicle_type, seats, driver_included, price_per_day) VALUES (?, 'suv', 5, 1, 1200)",
    [vehicleId]);
  const draftId = await mkListing(
    `INSERT INTO experience_listings (listing_type, category_id, host_id, business_id, location_id, title, description, city, price_from, price_unit, capacity_max, status)
     VALUES ('tour', ?, ?, NULL, ?, 'EXP Draft Tour Nobody Sees', 'A draft that must never appear.', 'Lusaka', 50, 'per_person', 2, 'draft')`,
    [toursCat, hostId, lusaka]);

  // The pre-fixture empty GET is cached for 60s; a write to the family
  // busts it (this also proves the bust wiring before the cache test).
  // Phase 3: POST /api/experiences exists now (create, auth-gated), so an
  // unauthenticated write is 401, not the old 404 — the bust still fires
  // because the bust middleware runs before auth.
  const bust0 = await call('POST', '/api/experiences', {});
  check('EXP: a write to the family busts the list cache (401 route, cache dropped)',
    bust0.status === 401, 'status ' + bust0.status);

  const all = await call('GET', '/api/experiences');
  const allIds = (all.json.experiences || []).map((e) => e.id);
  check('EXP: signed-out browse lists the 4 active listings, never the draft',
    all.status === 200 && all.json.total === 4 && allIds.includes(stayId) && allIds.includes(tourId)
    && allIds.includes(eventId) && allIds.includes(vehicleId) && !allIds.includes(draftId),
    JSON.stringify(all.json).slice(0, 200));
  check('EXP: no phone number appears anywhere in a public list response',
    !JSON.stringify(all.json).includes('phone') && !JSON.stringify(all.json).includes('0970')
    && !JSON.stringify(all.json).includes('+260'), JSON.stringify(all.json).slice(0, 200));
  check('EXP: list cards carry cover photo, price with unit, host card, location chain',
    (all.json.experiences || []).every((e) => e.price_from >= 0 && e.currency === 'ZMW'
      && e.host && e.host.name && e.host.verified !== undefined
      && e.location && typeof e.location.chain === 'string'
      && e.rating_avg === null && e.rating_count === 0),
    JSON.stringify((all.json.experiences || [])[0]).slice(0, 300));

  const provEast = await call('GET', '/api/experiences?province=Eastern');
  check('EXP: province filter (Eastern) returns only the Mfuwe tour',
    provEast.json.total === 1 && (provEast.json.experiences || [])[0].id === tourId, JSON.stringify(provEast.json).slice(0, 120));
  const provSouth = await call('GET', '/api/experiences?province=Southern');
  check('EXP: province filter (Southern) returns only the Livingstone stay',
    provSouth.json.total === 1 && (provSouth.json.experiences || [])[0].id === stayId, JSON.stringify(provSouth.json).slice(0, 120));
  const destLiv = await call('GET', '/api/experiences?destination=Livingstone');
  check('EXP: destination filter (Livingstone) returns only the stay',
    destLiv.json.total === 1 && (destLiv.json.experiences || [])[0].id === stayId, JSON.stringify(destLiv.json).slice(0, 120));
  // Radius rule: a Lusaka viewer searching Livingstone still sees the
  // result; the jobs 50 km default radius is NOT inherited. Straight-line
  // distance is ~379 km (the ~470 km figure is the road distance).
  const far = await call('GET', '/api/experiences?destination=Livingstone&lat=-15.3875&lng=28.3228');
  const farItem = (far.json.experiences || [])[0] || {};
  check('EXP: radius rule, Livingstone from Lusaka (~379 km straight line) still returns',
    far.json.total === 1 && farItem.id === stayId && typeof farItem.distance_km === 'number' && farItem.distance_km > 300,
    JSON.stringify(farItem).slice(0, 160));
  const catTours = await call('GET', '/api/experiences?category=Tours');
  check('EXP: category filter by name returns only tours',
    catTours.json.total === 1 && (catTours.json.experiences || [])[0].id === tourId, JSON.stringify(catTours.json).slice(0, 120));
  const catStaysById = await call('GET', '/api/experiences?category=' + staysCat);
  check('EXP: category filter by id returns only stays',
    catStaysById.json.total === 1 && (catStaysById.json.experiences || [])[0].id === stayId, JSON.stringify(catStaysById.json).slice(0, 120));
  const catBogus = await call('GET', '/api/experiences?category=Bogus');
  check('EXP: unknown category matches nothing (never silently shows everything)',
    catBogus.json.total === 0, JSON.stringify(catBogus.json).slice(0, 120));
  const price = await call('GET', '/api/experiences?min=400&max=500');
  check('EXP: price filter (400-500 ZMW) returns only the K450 stay',
    price.json.total === 1 && (price.json.experiences || [])[0].id === stayId, JSON.stringify(price.json).slice(0, 120));
  const guests = await call('GET', '/api/experiences?guests=5');
  const guestIds = (guests.json.experiences || []).map((e) => e.id);
  check('EXP: guests filter (5) returns tour, event and transport, not the 4-sleeper stay',
    guests.json.total === 3 && guestIds.includes(tourId) && guestIds.includes(eventId)
    && guestIds.includes(vehicleId) && !guestIds.includes(stayId), JSON.stringify(guests.json).slice(0, 160));
  const ver = await call('GET', '/api/experiences?verified=1');
  const verIds = (ver.json.experiences || []).map((e) => e.id);
  check('EXP: verified-hosts-only returns the verified-business listings',
    ver.json.total === 2 && verIds.includes(stayId) && verIds.includes(eventId)
    && !verIds.includes(tourId) && !verIds.includes(vehicleId), JSON.stringify(ver.json).slice(0, 160));
  const inst = await call('GET', '/api/experiences?instant=1');
  check('EXP: instant-booking-only returns the 4x4',
    inst.json.total === 1 && (inst.json.experiences || [])[0].id === vehicleId, JSON.stringify(inst.json).slice(0, 120));
  const inRange = await call('GET', '/api/experiences?from=2027-03-01&to=2027-03-31');
  check('EXP: date range keeps the March event (non-events pass: no calendar until Phase 4)',
    inRange.json.total === 4 && (inRange.json.experiences || []).some((e) => e.id === eventId),
    JSON.stringify(inRange.json).slice(0, 120));
  const outRange = await call('GET', '/api/experiences?from=2027-04-01&to=2027-04-30');
  const outIds = (outRange.json.experiences || []).map((e) => e.id);
  check('EXP: date range outside the event excludes the event only',
    outRange.json.total === 3 && !outIds.includes(eventId), JSON.stringify(outRange.json).slice(0, 120));
  const badDate = await call('GET', '/api/experiences?from=2027-13-40');
  check('EXP: invalid date is refused (422)', badDate.status === 422, 'status ' + badDate.status);
  const low = await call('GET', '/api/experiences?sort=price_low');
  check('EXP: sort price_low puts the K100 event first',
    (low.json.experiences || [])[0] && (low.json.experiences || [])[0].id === eventId, JSON.stringify((low.json.experiences || [])[0]).slice(0, 120));
  const high = await call('GET', '/api/experiences?sort=price_high');
  check('EXP: sort price_high puts the K1200 4x4 first',
    (high.json.experiences || [])[0] && (high.json.experiences || [])[0].id === vehicleId, JSON.stringify((high.json.experiences || [])[0]).slice(0, 120));
  const newest = await call('GET', '/api/experiences?sort=newest');
  check('EXP: sort newest puts the last-inserted active listing first',
    (newest.json.experiences || [])[0] && (newest.json.experiences || [])[0].id === vehicleId,
    JSON.stringify((newest.json.experiences || [])[0]).slice(0, 120));
  const p1 = await call('GET', '/api/experiences?limit=2&page=1');
  check('EXP: pagination page 1 carries total, totalPages and remaining for Load more',
    p1.json.total === 4 && p1.json.totalPages === 2 && p1.json.remaining === 2 && (p1.json.experiences || []).length === 2,
    JSON.stringify(p1.json).slice(0, 160));
  const p2 = await call('GET', '/api/experiences?limit=2&page=2');
  check('EXP: pagination page 2 returns the rest with 0 remaining',
    (p2.json.experiences || []).length === 2 && p2.json.remaining === 0, JSON.stringify(p2.json).slice(0, 160));

  const tour = await call('GET', '/api/experiences/' + tourId);
  const t = tour.json.experience || {};
  check('EXP: detail shows gallery, price with unit, host card, subtype rows, policy',
    tour.status === 200 && t.title === 'EXP South Luangwa Walking Safari'
    && t.price_from === 350 && t.price_unit === 'per_person'
    && Array.isArray(t.photos) && t.photos.length === 1
    && String(t.photos[0].url || '').startsWith('/api/experiences/' + tourId + '/photos/')
    && t.host && t.host.type === 'individual' && t.host.verified === false
    && t.details && t.details.group_size_max === 12 && t.details.meeting_point === 'Mfuwe Lodge car park'
    && t.cancellation_policy === 'Moderate'
    && Array.isArray(t.inclusions) && t.inclusions.includes('Guide')
    && t.safety_requirements === 'Closed shoes required.',
    JSON.stringify(t).slice(0, 300));
  check('EXP: detail shows no rating where there are no reviews, and no phone',
    t.reviews && t.reviews.rating_avg === null && t.reviews.rating_count === 0
    && Array.isArray(t.reviews.reviews) && t.reviews.reviews.length === 0
    && t.availability_text === null && !JSON.stringify(tour.json).includes('phone'),
    JSON.stringify(t.reviews).slice(0, 120));
  const stay = await call('GET', '/api/experiences/' + stayId);
  const s = stay.json.experience || {};
  check('EXP: business-hosted detail shows verified host, property rows, units, amenities',
    stay.status === 200 && s.host && s.host.type === 'business' && s.host.verified === true
    && s.details && s.details.property_type === 'guesthouse' && s.details.max_guests === 4
    && Array.isArray(s.details.amenities) && s.details.amenities.includes('Wi-Fi')
    && Array.isArray(s.details.units) && s.details.units.length === 1
    && s.details.units[0].name === 'Double Room'
    && Array.isArray(s.photos) && s.photos.length === 2
    && s.cover_photo === s.photos[0].url,
    JSON.stringify(s.details).slice(0, 200));
  check('EXP: cover photo is the lowest sort row',
    s.cover_photo === '/api/experiences/' + stayId + '/photos/' + s.photos[0].id, String(s.cover_photo));
  const missing = await call('GET', '/api/experiences/999999');
  check('EXP: detail for a missing listing is 404', missing.status === 404, 'status ' + missing.status);
  const draft = await call('GET', '/api/experiences/' + draftId);
  check('EXP: draft listing is not public (404)', draft.status === 404, 'status ' + draft.status);

  const photoRes = await fetch(BASE + t.photos[0].url);
  check('EXP: cover photo endpoint serves the image',
    photoRes.status === 200 && (photoRes.headers.get('content-type') || '').startsWith('image/'),
    'status ' + photoRes.status);

  const share = await fetch(BASE + '/s/experience/' + tourId);
  const shareText = await share.text();
  check('EXP: share preview carries OG tags and redirects into the hash route',
    share.status === 200 && shareText.includes('EXP South Luangwa Walking Safari')
    && shareText.includes('og:title') && shareText.includes('/#/experience/' + tourId),
    shareText.slice(0, 160));
  const shareMissing = await fetch(BASE + '/s/experience/999999');
  const shareMissingText = await shareMissing.text();
  check('EXP: share preview for a missing listing falls back to the generic page',
    shareMissing.status === 200 && shareMissingText.includes('2911 Jobs: Quick jobs'),
    shareMissingText.slice(0, 120));

  // List cache: first read MISS, repeat HIT, a family write busts it.
  const c1 = await fetch(BASE + '/api/experiences?category=Adventure');
  const c1Cache = c1.headers.get('x-cache');
  await c1.text();
  const c2 = await fetch(BASE + '/api/experiences?category=Adventure');
  const c2Cache = c2.headers.get('x-cache');
  await c2.text();
  check('EXP: list cache serves the repeat read (MISS then HIT)',
    c1Cache === 'MISS' && c2Cache === 'HIT', c1Cache + '/' + c2Cache);
  const bust = await call('POST', '/api/experiences', {});
  const c3 = await fetch(BASE + '/api/experiences?category=Adventure');
  const c3Cache = c3.headers.get('x-cache');
  await c3.text();
  check('EXP: a write to /api/experiences busts the family cache (MISS again)',
    bust.status === 401 && c3Cache === 'MISS', bust.status + '/' + c3Cache);

  // Frontend (Phase 2): the served SPA bundle carries the Experiences
  // routes, views, tokens and icons, and prices are ZMW, never fmtK().
  const appJsRes = await fetch(BASE + '/app.js');
  const appJs = await appJsRes.text();
  check('EXP-FE: served app.js carries the Experiences routes and views',
    appJsRes.status === 200
    && appJs.includes('#/experiences') && appJs.includes('#/experiences/search')
    && appJs.includes('viewExperiences') && appJs.includes('viewExperienceSearch')
    && appJs.includes('viewExperienceCategory') && appJs.includes('viewExperience('),
    'status ' + appJsRes.status);
  check('EXP-FE: fmtZMW formats integer ZMW and Experiences prices never use fmtK',
    appJs.includes('function fmtZMW') && appJs.includes("return 'ZMW '")
    && appJs.includes('expPriceText') && appJs.includes('fmtZMW(e.price_from)'),
    '');
  check('EXP-FE: Experiences icons, category mapping and no-sixth-tab nav are present',
    ['compass:', 'backpack:', 'bed:', 'bus:', 'mountain:', 'drum:', 'ticket:'].every((ic) => appJs.includes(ic))
    && appJs.includes('EXP_CATEGORIES_FALLBACK') && appJs.includes('Travel and stays')
    && appJs.includes("['#/experiences', 'Experiences']"),
    '');
  check('EXP-FE: booking shows an honest "Bookings open soon" state, never a checkout',
    appJs.includes('Bookings open soon') && !appJs.includes('Pay now'),
    '');
  const cssRes = await fetch(BASE + '/styles.css');
  const css = await cssRes.text();
  check('EXP-FE: served styles.css carries the Experiences tokens',
    cssRes.status === 200
    && ['--exp-purple:#4C1D95', '--exp-mint:#A3E635', '--exp-sage:#E8F5E9',
        '--exp-sand:#F5F0E1', '--exp-coral:#FF6B6B', '--exp-gold:#F59E0B']
      .every((t) => css.includes(t))
    && css.includes('.exp-price') && css.includes('.exp-hero-search') && css.includes('.btn-exp'),
    'status ' + cssRes.status);

  // Frontend (Phase 3): host onboarding wizard, dashboards, listing
  // create/edit, payouts, owner banner and status badges, served-asset
  // checks only (no extra writes: the productLimiter budget is thin).
  check('EXP3-FE: served app.js carries the host routes and views',
    appJs.includes('#/host/apply') && appJs.includes('#/host/dashboard')
    && appJs.includes('#/host/business') && appJs.includes('#/host/listings')
    && appJs.includes('#/host/listings/new') && appJs.includes('#/host/payouts')
    && appJs.includes('viewHostApply') && appJs.includes('viewHostDashboard')
    && appJs.includes('viewHostBusiness') && appJs.includes('viewHostListings')
    && appJs.includes('viewHostListingNew') && appJs.includes('viewHostListingEdit')
    && appJs.includes('viewHostPayouts'),
    '');
  check('EXP3-FE: 7-step wizard labels, draft save and submit copy are present',
    appJs.includes('Account type') && appJs.includes('First listing')
    && appJs.includes('Submit for review') && appJs.includes('Save draft')
    && appJs.includes('Application sent. The 2911 Jobs team will review it and let you know.')
    && appJs.includes('JPG, PNG, WebP or PDF, up to 2 MB')
    && appJs.includes('Payments are disabled at launch.'),
    '');
  check('EXP3-FE: publish gate hint and masked payout rule are present',
    appJs.includes('Your host application must be approved before you can publish')
    && appJs.includes('expMaskPayout') && appJs.includes('ending ')
    && appJs.includes('payout_reference_masked'),
    '');
  check('EXP3-FE: owner banner, suspended state and status badges are present',
    appJs.includes('You own this listing') && appJs.includes('expStatusBadge')
    && appJs.includes('This listing is not available') && appJs.includes('data.suspended')
    && appJs.includes('EXP_HOST_STATUS_LABELS'),
    '');
  check('EXP3-FE: dashboard honest empty states are present, no reviews or messages tables',
    appJs.includes('No booking requests yet. When a guest sends a request, it appears here.')
    && appJs.includes('No reviews yet. Reviews appear here after guests complete a booking.')
    && appJs.includes('No dates set')
    && !appJs.includes('experience_reviews') && !appJs.includes('experience_messages'),
    '');
  check('EXP3-FE: served styles.css carries the host status badge tokens',
    ['.exp-status-draft', '.exp-status-submitted', '.exp-status-under_review',
      '.exp-status-additional_info', '.exp-status-approved', '.exp-status-rejected',
      '.exp-status-suspended'].every((t) => css.includes(t))
    && css.includes('.exp-owner-banner') && css.includes('.exp-photo-grid'),
    '');
}

// 2911 Experiences Phase 3 (2026-11-08): host onboarding, verification,
// business opt-in, staff, listing writes, admin decisions. All rows are
// TEST rows (EXP3 titles, TEST users). No payments, no checkout.
async function experiencesPhase3Tests(adminCookie, memberCookie, memberId, otherId, otherCookie) {
  const expHost2 = await registerUser('EXP Host Two', '0970000031', 'Lusaka');
  const expStaff = await registerUser('EXP Staff Member', '0970000032', 'Kitwe');
  const expManager = await registerUser('EXP Manager Member', '0970000034', 'Lusaka');
  const expStranger = await registerUser('EXP Stranger', '0970000033', 'Ndola');
  const toursCat = (await dbOne("SELECT id FROM experience_categories WHERE name = 'Tours'")).id;
  const eventsCat = (await dbOne("SELECT id FROM experience_categories WHERE name = 'Events'")).id;
  const bizRow = await dbOne("SELECT id FROM businesses WHERE slug = 'exp-verified-lodge-co-1'");
  const bizId = Number(bizRow.id);
  const PDF = 'data:application/pdf;base64,JVBERi0xLjQK';
  const BIG_IMG = 'data:image/jpeg;base64,' + 'A'.repeat(2500000);
  const BAD_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // The Phase 3 fixture: the member's host row id (9001) deliberately
  // differs from the member's user id, so the public host card only
  // resolves when the join goes listings -> experience_hosts -> users.
  const fixtureHost = await dbOne('SELECT id, user_id FROM experience_hosts WHERE user_id = ?', [memberId]);
  check('EXP3: fixture host row id differs from the member user id (rewire is genuinely tested)',
    fixtureHost && Number(fixtureHost.id) === 9001 && Number(fixtureHost.user_id) === memberId,
    JSON.stringify(fixtureHost));

  // Signed-out writes are 401.
  const noAuthMe = await call('GET', '/api/experiences/host/me');
  check('EXP3: host/me signed out is 401', noAuthMe.status === 401, 'status ' + noAuthMe.status);
  const noAuthApply = await call('POST', '/api/experiences/host/apply', { display_name: 'X' });
  check('EXP3: host apply signed out is 401', noAuthApply.status === 401, 'status ' + noAuthApply.status);

  // Member host profile + dashboard (fixture host is already approved).
  const me = await call('GET', '/api/experiences/host/me', null, memberCookie);
  const meHost = (me.json || {}).individual || {};
  check('EXP3: host/me returns the member host row (approved) with a masked payout only',
    me.status === 200 && meHost.id === 9001 && meHost.status === 'approved'
    && meHost.account_type === 'individual' && meHost.display_name === 'Worker Tester'
    && !('payout_reference' in meHost) && meHost.payout_reference_masked === ''
    && Array.isArray(me.json.businesses) && me.json.businesses.length === 0,
    JSON.stringify(me.json).slice(0, 200));
  const dash = await call('GET', '/api/experiences/host/dashboard', null, memberCookie);
  check('EXP3: host dashboard carries real zero request/booking/earning counts, never invented numbers',
    dash.status === 200 && dash.json.counts && dash.json.counts.requests === 0
    && dash.json.counts.bookings === 0 && dash.json.counts.earnings === 0
    && dash.json.counts.listings === 3 && dash.json.counts.drafts === 1 && dash.json.counts.active === 2
    && Array.isArray(dash.json.listings) && dash.json.listings.length <= 5,
    JSON.stringify(dash.json.counts));

  // Member (approved host) creates a draft tour with a subtype row.
  const mk = await call('POST', '/api/experiences', {
    host_side: 'individual', listing_type: 'tour', category_id: toursCat,
    title: 'EXP3 Member Tour', description: 'A guided tour for the Phase 3 checks.', city: 'Lusaka',
    price_from: 200, price_unit: 'per_person', capacity_max: 8,
    duration_hours: 3, group_size_max: 8, meeting_point: 'Lusaka Museum',
  }, memberCookie);
  const mkListing = (mk.json || {}).listing || {};
  const mkId = mkListing.id;
  check('EXP3: approved host creates a listing draft (approval draft, town location resolved)',
    mk.status === 200 && mkListing.approval_status === 'draft' && mkListing.status === 'draft'
    && mkListing.title === 'EXP3 Member Tour' && mkListing.location && mkListing.location.name === 'Lusaka',
    'status ' + mk.status + ' ' + JSON.stringify(mk.json).slice(0, 200));
  const mkTour = await dbOne('SELECT * FROM experience_tours WHERE listing_id = ?', [mkId]);
  check('EXP3: listing creation writes the 1:1 tour subtype row in the same write',
    !!mkTour && Number(mkTour.group_size_max) === 8 && mkTour.meeting_point === 'Lusaka Museum',
    JSON.stringify(mkTour));
  const subNoPhoto = await call('POST', '/api/experiences/' + mkId + '/submit', {}, memberCookie);
  check('EXP3: listing submit without a photo is 422',
    subNoPhoto.status === 422 && JSON.stringify(subNoPhoto.json).includes('photo'),
    'status ' + subNoPhoto.status + ' ' + JSON.stringify(subNoPhoto.json).slice(0, 160));
  const addPhoto = await call('POST', '/api/experiences/' + mkId + '/photos', { photos: [IMG] }, memberCookie);
  check('EXP3: owner appends a photo (first photo is the cover, sort 0)',
    addPhoto.status === 200 && (addPhoto.json.photos || []).length === 1
    && addPhoto.json.photos[0].sort === 0,
    'status ' + addPhoto.status + ' ' + JSON.stringify(addPhoto.json).slice(0, 160));
  const subOk = await call('POST', '/api/experiences/' + mkId + '/submit', {}, memberCookie);
  check('EXP3: approved host submits a complete listing (approval submitted)',
    subOk.status === 200 && subOk.json.listing && subOk.json.listing.approval_status === 'submitted',
    'status ' + subOk.status + ' ' + JSON.stringify(subOk.json).slice(0, 160));
  const admApprove = await call('PATCH', '/api/admin/experiences/' + mkId, { decision: 'approve' }, adminCookie);
  check('EXP3: admin listing approve publishes it (approval approved, status active)',
    admApprove.status === 200 && admApprove.json.listing
    && admApprove.json.listing.approval_status === 'approved' && admApprove.json.listing.status === 'active',
    'status ' + admApprove.status + ' ' + JSON.stringify(admApprove.json).slice(0, 160));
  const pub = await call('GET', '/api/experiences/' + mkId);
  const pubItem = (pub.json || {}).experience || {};
  check('EXP3: guest detail carries is_owner false and no approval_status',
    pub.status === 200 && pubItem.is_owner === false && !('approval_status' in pubItem),
    'status ' + pub.status + ' ' + JSON.stringify(pubItem).slice(0, 200));
  const pubOwner = await call('GET', '/api/experiences/' + mkId, null, memberCookie);
  const pubOwnerItem = (pubOwner.json || {}).experience || {};
  check('EXP3: owner detail carries is_owner true and approval_status approved',
    pubOwner.status === 200 && pubOwnerItem.is_owner === true && pubOwnerItem.approval_status === 'approved',
    'status ' + pubOwner.status + ' ' + JSON.stringify(pubOwnerItem).slice(0, 200));
  const listAfter = await call('GET', '/api/experiences');
  check('EXP3: approved listing appears in the public list',
    (listAfter.json.experiences || []).some((e) => e.id === mkId),
    'total ' + listAfter.json.total);
  const admSuspend = await call('PATCH', '/api/admin/experiences/' + mkId, { decision: 'suspend' }, adminCookie);
  check('EXP3: admin listing suspend works',
    admSuspend.status === 200 && admSuspend.json.listing.status === 'suspended',
    'status ' + admSuspend.status + ' ' + JSON.stringify(admSuspend.json).slice(0, 160));
  const listSusp = await call('GET', '/api/experiences');
  check('EXP3: suspended listing is excluded from the public list',
    !(listSusp.json.experiences || []).some((e) => e.id === mkId),
    'total ' + listSusp.json.total);
  const detSusp = await call('GET', '/api/experiences/' + mkId);
  check('EXP3: suspended detail returns the suspended shape (200, no reason shown)',
    detSusp.status === 200 && detSusp.json.suspended === true
    && detSusp.json.listing && detSusp.json.listing.id === mkId && detSusp.json.listing.status === 'suspended',
    'status ' + detSusp.status + ' ' + JSON.stringify(detSusp.json).slice(0, 160));
  const admUnsusp = await call('PATCH', '/api/admin/experiences/' + mkId, { decision: 'unsuspend' }, adminCookie);
  check('EXP3: admin listing unsuspend restores it to active',
    admUnsusp.status === 200 && admUnsusp.json.listing.status === 'active',
    'status ' + admUnsusp.status + ' ' + JSON.stringify(admUnsusp.json).slice(0, 160));

  // New individual host: partial apply, submit validation failures.
  const me2 = await call('GET', '/api/experiences/host/me', null, expHost2.cookie);
  check('EXP3: a new user has no individual host row yet',
    me2.status === 200 && me2.json.individual === null && Array.isArray(me2.json.businesses),
    JSON.stringify(me2.json).slice(0, 120));
  const apply1 = await call('POST', '/api/experiences/host/apply', { display_name: 'EXP Host Two', city: 'Lusaka' }, expHost2.cookie);
  const host2Id = (apply1.json.host || {}).id;
  check('EXP3: partial apply creates a draft host row',
    apply1.status === 200 && apply1.json.host && apply1.json.host.status === 'draft'
    && apply1.json.host.display_name === 'EXP Host Two' && apply1.json.host.city === 'Lusaka',
    'status ' + apply1.status + ' ' + JSON.stringify(apply1.json).slice(0, 160));
  const applyBad = await call('POST', '/api/experiences/host/apply', { account_type: 'business' }, expHost2.cookie);
  check('EXP3: apply with account_type business is 422', applyBad.status === 422, 'status ' + applyBad.status);
  const submitEarly = await call('POST', '/api/experiences/host/submit', {}, expHost2.cookie);
  check('EXP3: host submit with an incomplete application is 422 with a fields map (bio, documents, listing, payout)',
    submitEarly.status === 422 && submitEarly.json.fields
    && submitEarly.json.fields.bio && submitEarly.json.fields.documents
    && submitEarly.json.fields.listing && submitEarly.json.fields.payout_method,
    'status ' + submitEarly.status + ' ' + JSON.stringify(submitEarly.json).slice(0, 200));

  // Document validation: bad MIME, oversize, PDF accepted, selfie accepted.
  const docBadMime = await call('POST', '/api/experiences/host/documents', { kind: 'nrc', image: BAD_IMG, host_side: 'individual' }, expHost2.cookie);
  check('EXP3: document upload rejects a bad MIME (GIF) with 422', docBadMime.status === 422, 'status ' + docBadMime.status);
  const docBig = await call('POST', '/api/experiences/host/documents', { kind: 'nrc', image: BIG_IMG, host_side: 'individual' }, expHost2.cookie);
  check('EXP3: document upload rejects an oversize file with 422', docBig.status === 422, 'status ' + docBig.status);
  const BIG_PDF = 'data:application/pdf;base64,' + 'A'.repeat(3000000);
  const docBigPdf = await call('POST', '/api/experiences/host/documents', { kind: 'nrc', image: BIG_PDF, host_side: 'individual' }, expHost2.cookie);
  check('EXP3: document upload accepts a PDF between the photo cap and the PDF cap', docBigPdf.status === 200, 'status ' + docBigPdf.status);
  const docBigPdfDel = await call('DELETE', '/api/experiences/host/documents/' + docBigPdf.json.document.id, null, expHost2.cookie);
  check('EXP3: the large PDF document can be removed by its owner', docBigPdfDel.status === 200, 'status ' + docBigPdfDel.status);
  const HUGE_PDF = 'data:application/pdf;base64,' + 'A'.repeat(8100000);
  const docHugePdf = await call('POST', '/api/experiences/host/documents', { kind: 'nrc', image: HUGE_PDF, host_side: 'individual' }, expHost2.cookie);
  check('EXP3: document upload rejects a PDF over the PDF cap with 422', docHugePdf.status === 422, 'status ' + docHugePdf.status);
  const docPdf = await call('POST', '/api/experiences/host/documents', { kind: 'nrc', image: PDF, host_side: 'individual' }, expHost2.cookie);
  const nrcDocId = (docPdf.json.document || {}).id;
  check('EXP3: a PDF identity document is accepted (UI Spec image-or-PDF rule)',
    docPdf.status === 200 && docPdf.json.document && docPdf.json.document.kind === 'nrc'
    && docPdf.json.document.status === 'pending' && !('image' in docPdf.json.document),
    'status ' + docPdf.status + ' ' + JSON.stringify(docPdf.json).slice(0, 160));
  const docSelfie = await call('POST', '/api/experiences/host/documents', { kind: 'selfie', image: IMG, host_side: 'individual' }, expHost2.cookie);
  const selfieDocId = (docSelfie.json.document || {}).id;
  check('EXP3: a selfie document upload works',
    docSelfie.status === 200 && docSelfie.json.document && docSelfie.json.document.kind === 'selfie',
    'status ' + docSelfie.status);
  const docLicInd = await call('POST', '/api/experiences/host/documents', { kind: 'tourism_licence', image: IMG, host_side: 'individual' }, expHost2.cookie);
  check('EXP3: a tourism licence upload is 422 for an individual host (business hosts only)',
    docLicInd.status === 422, 'status ' + docLicInd.status);
  const docs = await call('GET', '/api/experiences/host/documents', null, expHost2.cookie);
  check('EXP3: document list carries metadata only, never image data',
    docs.status === 200 && (docs.json.documents || []).length === 2
    && !JSON.stringify(docs.json).includes('data:image') && !JSON.stringify(docs.json).includes('JVBERi'),
    JSON.stringify(docs.json).slice(0, 200));

  // Unapproved host can draft, but cannot publish.
  const l2 = await call('POST', '/api/experiences', {
    host_side: 'individual', listing_type: 'tour', category_id: toursCat,
    title: 'EXP3 Host Two Tour', description: 'A first tour draft from the new host.', city: 'Livingstone',
    price_from: 150, price_unit: 'per_person', capacity_max: 6,
  }, expHost2.cookie);
  const l2Id = (l2.json.listing || {}).id;
  check('EXP3: an unapproved host can still create a listing draft',
    l2.status === 200 && l2.json.listing && l2.json.listing.approval_status === 'draft'
    && l2.json.listing.location && l2.json.listing.location.name === 'Livingstone',
    'status ' + l2.status + ' ' + JSON.stringify(l2.json).slice(0, 200));
  const l2SubmitBlocked = await call('POST', '/api/experiences/' + l2Id + '/submit', {}, expHost2.cookie);
  check('EXP3: listing submit is blocked with 422 until the host is approved',
    l2SubmitBlocked.status === 422 && String(l2SubmitBlocked.json.error || '').includes('must be approved before you can publish'),
    'status ' + l2SubmitBlocked.status + ' ' + JSON.stringify(l2SubmitBlocked.json).slice(0, 160));

  // Complete the application via PATCH, then submit / request-info / resubmit / approve / verify.
  const patchMe = await call('PATCH', '/api/experiences/host/me', {
    bio: 'I guide walking tours around Livingstone and the falls.',
    payout_method: 'mobile_money', payout_reference: '0977123456',
  }, expHost2.cookie);
  check('EXP3: host PATCH saves bio and payout, masked as Airtel Mobile Money ending 456',
    patchMe.status === 200 && patchMe.json.host
    && patchMe.json.host.payout_reference_masked === 'Airtel Mobile Money, ending 456'
    && !('payout_reference' in patchMe.json.host),
    'status ' + patchMe.status + ' ' + JSON.stringify(patchMe.json).slice(0, 200));
  const submitOk = await call('POST', '/api/experiences/host/submit', {}, expHost2.cookie);
  check('EXP3: host submit succeeds once complete (status submitted)',
    submitOk.status === 200 && submitOk.json.host && submitOk.json.host.status === 'submitted',
    'status ' + submitOk.status + ' ' + JSON.stringify(submitOk.json).slice(0, 160));
  const submitAgain = await call('POST', '/api/experiences/host/submit', {}, expHost2.cookie);
  check('EXP3: a submitted application cannot be submitted again (422)', submitAgain.status === 422, 'status ' + submitAgain.status);
  const riNoNote = await call('PATCH', '/api/admin/experiences/hosts/' + host2Id, { decision: 'request_info' }, adminCookie);
  check('EXP3: admin request_info without a note is 422', riNoNote.status === 422, 'status ' + riNoNote.status);
  const riNote = 'Please add a clearer photo of your NRC.';
  const ri = await call('PATCH', '/api/admin/experiences/hosts/' + host2Id, { decision: 'request_info', note: riNote }, adminCookie);
  check('EXP3: admin request_info stores the note verbatim (additional_info)',
    ri.status === 200 && ri.json.host && ri.json.host.status === 'additional_info'
    && ri.json.host.verification_note === riNote,
    'status ' + ri.status + ' ' + JSON.stringify(ri.json).slice(0, 200));
  const resub = await call('POST', '/api/experiences/host/resubmit', {}, expHost2.cookie);
  check('EXP3: host resubmit returns to submitted',
    resub.status === 200 && resub.json.host && resub.json.host.status === 'submitted',
    'status ' + resub.status);
  const approveHost = await call('PATCH', '/api/admin/experiences/hosts/' + host2Id, { decision: 'approve' }, adminCookie);
  check('EXP3: admin host approve works',
    approveHost.status === 200 && approveHost.json.host.status === 'approved', 'status ' + approveHost.status);
  const verifyHost = await call('PATCH', '/api/admin/experiences/hosts/' + host2Id + '/verify', { decision: 'verified', note: 'ID checked.' }, adminCookie);
  check('EXP3: admin host verify sets the verification badge (separate from approval)',
    verifyHost.status === 200 && verifyHost.json.host.verification_status === 'verified',
    'status ' + verifyHost.status + ' ' + JSON.stringify(verifyHost.json).slice(0, 160));

  // The second host's listing can now publish; a third listing tests the reject path.
  const l2Photo = await call('POST', '/api/experiences/' + l2Id + '/photos', { photos: [IMG] }, expHost2.cookie);
  check('EXP3: host adds a photo to the draft', l2Photo.status === 200, 'status ' + l2Photo.status);
  const l2Sub = await call('POST', '/api/experiences/' + l2Id + '/submit', {}, expHost2.cookie);
  check('EXP3: listing submit works once the host is approved',
    l2Sub.status === 200 && l2Sub.json.listing.approval_status === 'submitted',
    'status ' + l2Sub.status + ' ' + JSON.stringify(l2Sub.json).slice(0, 160));
  const l2Approve = await call('PATCH', '/api/admin/experiences/' + l2Id, { decision: 'approve' }, adminCookie);
  check('EXP3: admin approves the second host listing',
    l2Approve.status === 200 && l2Approve.json.listing.status === 'active',
    'status ' + l2Approve.status);
  const l3 = await call('POST', '/api/experiences', {
    host_side: 'individual', listing_type: 'tour', category_id: toursCat,
    title: 'EXP3 Rejected Tour', description: 'A tour that will be rejected by admin.', city: 'Lusaka',
    price_from: 100, price_unit: 'per_person', capacity_max: 4,
  }, expHost2.cookie);
  const l3Id = (l3.json.listing || {}).id;
  await call('POST', '/api/experiences/' + l3Id + '/photos', { photos: [IMG] }, expHost2.cookie);
  await call('POST', '/api/experiences/' + l3Id + '/submit', {}, expHost2.cookie);
  const rejNoNote = await call('PATCH', '/api/admin/experiences/' + l3Id, { decision: 'reject' }, adminCookie);
  check('EXP3: admin listing reject without a note is 422', rejNoNote.status === 422, 'status ' + rejNoNote.status);
  const rejNote = 'Photos do not show the real meeting point.';
  const rej = await call('PATCH', '/api/admin/experiences/' + l3Id, { decision: 'reject', note: rejNote }, adminCookie);
  check('EXP3: admin listing reject stores the note verbatim in approval_note',
    rej.status === 200 && rej.json.listing.approval_status === 'rejected'
    && rej.json.listing.approval_note === rejNote,
    'status ' + rej.status + ' ' + JSON.stringify(rej.json).slice(0, 200));
  const rejPub = await call('GET', '/api/experiences/' + l3Id);
  check('EXP3: a rejected listing stays non-public (404)', rejPub.status === 404, 'status ' + rejPub.status);

  // Fix 1 (Phase 3 fix pass): the owner can read their own non-active
  // listing in full, so the edit form can prefill it.
  const pre = await call('POST', '/api/experiences', {
    host_side: 'individual', listing_type: 'tour', category_id: toursCat,
    title: 'EXP3 Draft Prefill Tour', description: 'A draft tour with every prefill field set.', city: 'Lusaka',
    area: 'TEST Area', address: 'Plot 12, Independence Avenue',
    price_from: 300, price_unit: 'per_person', capacity_max: 6,
    inclusions: ['Return transport', 'Bottled water'], exclusions: ['Lunch'],
    safety_requirements: 'Wear closed shoes.',
    duration_hours: 3, group_size_max: 8, meeting_point: 'Lusaka Museum',
  }, expHost2.cookie);
  const preId = (pre.json.listing || {}).id;
  check('EXP3-FIX1: draft creation stores the full field set (inclusions, safety, subtype row)',
    pre.status === 200 && !!preId && pre.json.listing.approval_status === 'draft',
    'status ' + pre.status + ' ' + JSON.stringify(pre.json).slice(0, 200));
  await call('POST', '/api/experiences/' + preId + '/photos', { photos: [IMG] }, expHost2.cookie);
  const ownerDraft = await call('GET', '/api/experiences/' + preId, null, expHost2.cookie);
  const od = (ownerDraft.json || {}).experience || {};
  check('EXP3-FIX1: owner GET of own draft returns 200 with inclusions, safety, subtype details, photos, approval_status and address',
    ownerDraft.status === 200 && od.is_owner === true && od.approval_status === 'draft'
    && Array.isArray(od.inclusions) && od.inclusions.includes('Return transport')
    && Array.isArray(od.exclusions) && od.exclusions.includes('Lunch')
    && od.safety_requirements === 'Wear closed shoes.'
    && od.details && Number(od.details.duration_hours) === 3 && od.details.meeting_point === 'Lusaka Museum'
    && Array.isArray(od.photos) && od.photos.length === 1 && !!od.photos[0].id
    && od.address === 'Plot 12, Independence Avenue',
    'status ' + ownerDraft.status + ' ' + JSON.stringify(od).slice(0, 300));
  const strangerDraft = await call('GET', '/api/experiences/' + preId, null, expStranger.cookie);
  check('EXP3-FIX1: a signed-in stranger GET of the draft returns 404', strangerDraft.status === 404, 'status ' + strangerDraft.status);
  const anonDraft = await call('GET', '/api/experiences/' + preId);
  check('EXP3-FIX1: signed-out GET of the draft returns 404', anonDraft.status === 404, 'status ' + anonDraft.status);
  const preSub = await call('POST', '/api/experiences/' + preId + '/submit', {}, expHost2.cookie);
  check('EXP3-FIX1: owner submits the prefill draft (approval submitted)',
    preSub.status === 200 && preSub.json.listing && preSub.json.listing.approval_status === 'submitted',
    'status ' + preSub.status + ' ' + JSON.stringify(preSub.json).slice(0, 160));
  const ownerSub = await call('GET', '/api/experiences/' + preId, null, expHost2.cookie);
  const os = (ownerSub.json || {}).experience || {};
  check('EXP3-FIX1: owner GET of own submitted listing returns 200 with the full detail',
    ownerSub.status === 200 && os.approval_status === 'submitted'
    && os.address === 'Plot 12, Independence Avenue' && Array.isArray(os.inclusions) && os.inclusions.includes('Bottled water'),
    'status ' + ownerSub.status + ' ' + JSON.stringify(os).slice(0, 200));
  const guestActive = await call('GET', '/api/experiences/' + l2Id);
  const ga = (guestActive.json || {}).experience || {};
  check('EXP3-FIX1: guest GET of an active listing is unchanged (no approval_status, no address, is_owner false)',
    guestActive.status === 200 && ga.is_owner === false && !('approval_status' in ga) && !('address' in ga),
    'status ' + guestActive.status + ' ' + JSON.stringify(ga).slice(0, 200));
  await call('PATCH', '/api/admin/experiences/' + mkId, { decision: 'suspend' }, adminCookie);
  const ownerSusp = await call('GET', '/api/experiences/' + mkId, null, memberCookie);
  check('EXP3-FIX1: owner GET of own suspended listing still returns the suspended shape',
    ownerSusp.status === 200 && ownerSusp.json.suspended === true
    && ownerSusp.json.listing && ownerSusp.json.listing.id === mkId,
    'status ' + ownerSusp.status + ' ' + JSON.stringify(ownerSusp.json).slice(0, 160));
  await call('PATCH', '/api/admin/experiences/' + mkId, { decision: 'unsuspend' }, adminCookie);

  // Host reject path (stranger's application stays visible as Rejected).
  await call('POST', '/api/experiences/host/apply', { display_name: 'EXP Stranger', city: 'Ndola', bio: 'A stranger host profile for the reject check.' }, expStranger.cookie);
  const strangerHost = await dbOne('SELECT id FROM experience_hosts WHERE user_id = ?', [expStranger.id]);
  const hostRejNote = 'We could not verify this application.';
  const hostRej = await call('PATCH', '/api/admin/experiences/hosts/' + strangerHost.id, { decision: 'reject', note: hostRejNote }, adminCookie);
  check('EXP3: admin host reject stores the note verbatim and the application stays visible as rejected',
    hostRej.status === 200 && hostRej.json.host.status === 'rejected'
    && hostRej.json.host.verification_note === hostRejNote,
    'status ' + hostRej.status + ' ' + JSON.stringify(hostRej.json).slice(0, 200));
  const hostRejSubmit = await call('POST', '/api/experiences/host/submit', {}, expStranger.cookie);
  check('EXP3: a rejected application cannot be submitted again (422)', hostRejSubmit.status === 422, 'status ' + hostRejSubmit.status);
  const adminHosts = await call('GET', '/api/admin/experiences/hosts?status=rejected', null, adminCookie);
  check('EXP3: admin hosts list filters by status',
    adminHosts.status === 200 && (adminHosts.json.hosts || []).length === 1
    && adminHosts.json.hosts[0].id === strangerHost.id,
    'status ' + adminHosts.status + ' ' + JSON.stringify(adminHosts.json).slice(0, 160));
  const adminHostsNo = await call('GET', '/api/admin/experiences/hosts', null, memberCookie);
  check('EXP3: admin hosts list is admin-only (member gets 403)', adminHostsNo.status === 403, 'status ' + adminHostsNo.status);

  // Fix 2 (Phase 3 fix pass): a rejected host can start a new application.
  const reapply = await call('POST', '/api/experiences/host/apply', { display_name: 'EXP Stranger', city: 'Ndola' }, expStranger.cookie);
  check('EXP3-FIX2: a rejected host can re-apply (200, status draft, verification_note cleared)',
    reapply.status === 200 && reapply.json.host && reapply.json.host.status === 'draft'
    && reapply.json.host.verification_note === '',
    'status ' + reapply.status + ' ' + JSON.stringify(reapply.json).slice(0, 200));
  // Complete the fresh application and submit it again.
  await call('POST', '/api/experiences/host/documents', { kind: 'nrc', image: PDF, host_side: 'individual' }, expStranger.cookie);
  await call('POST', '/api/experiences/host/documents', { kind: 'selfie', image: IMG, host_side: 'individual' }, expStranger.cookie);
  const retryListing = await call('POST', '/api/experiences', {
    host_side: 'individual', listing_type: 'tour', category_id: toursCat,
    title: 'EXP3 Stranger Retry Tour', description: 'A retry tour from the re-applied host.', city: 'Ndola',
    price_from: 120, price_unit: 'per_person', capacity_max: 4,
  }, expStranger.cookie);
  check('EXP3-FIX2: the re-applied host can create a listing draft',
    retryListing.status === 200 && (retryListing.json.listing || {}).approval_status === 'draft',
    'status ' + retryListing.status + ' ' + JSON.stringify(retryListing.json).slice(0, 160));
  const retryPatch = await call('PATCH', '/api/experiences/host/me', {
    bio: 'A test host bio that is long enough for the retry.',
    payout_method: 'mobile_money', payout_reference: '0977123456',
  }, expStranger.cookie);
  check('EXP3-FIX2: the re-applied host profile completes (bio + payout, still draft)',
    retryPatch.status === 200 && retryPatch.json.host && retryPatch.json.host.status === 'draft',
    'status ' + retryPatch.status + ' ' + JSON.stringify(retryPatch.json).slice(0, 160));
  const retrySubmit = await call('POST', '/api/experiences/host/submit', {}, expStranger.cookie);
  check('EXP3-FIX2: the re-applied host submits again (status submitted)',
    retrySubmit.status === 200 && retrySubmit.json.host && retrySubmit.json.host.status === 'submitted',
    'status ' + retrySubmit.status + ' ' + JSON.stringify(retrySubmit.json).slice(0, 200));
  // Suspended and approved hosts still cannot re-apply.
  const suspHost = await call('PATCH', '/api/admin/experiences/hosts/' + strangerHost.id, { decision: 'suspend', note: 'TEST suspension for the re-apply check.' }, adminCookie);
  check('EXP3-FIX2: admin suspends the re-submitted host (setup for the 422 check)',
    suspHost.status === 200 && suspHost.json.host && suspHost.json.host.status === 'suspended',
    'status ' + suspHost.status + ' ' + JSON.stringify(suspHost.json).slice(0, 160));
  const suspApply = await call('POST', '/api/experiences/host/apply', { display_name: 'EXP Stranger', city: 'Ndola' }, expStranger.cookie);
  check('EXP3-FIX2: a suspended host still gets 422 on apply', suspApply.status === 422, 'status ' + suspApply.status);
  const apprApply = await call('POST', '/api/experiences/host/apply', { display_name: 'Worker Tester', city: 'Kitwe' }, memberCookie);
  check('EXP3-FIX2: an approved host still gets 422 on apply', apprApply.status === 422, 'status ' + apprApply.status);

  // Business opt-in + commission override.
  const bizOptMember = await call('POST', '/api/experiences/host/business', { business_id: bizId }, memberCookie);
  check('EXP3: business opt-in for a business the caller does not own is 422',
    bizOptMember.status === 422, 'status ' + bizOptMember.status + ' ' + JSON.stringify(bizOptMember.json).slice(0, 120));
  const bizOpt = await call('POST', '/api/experiences/host/business', { business_id: bizId }, otherCookie);
  const linkId = (bizOpt.json.link || {}).id;
  check('EXP3: business owner opts in (link created, experiences active, commission default null)',
    bizOpt.status === 200 && bizOpt.json.link && bizOpt.json.link.business_id === bizId
    && bizOpt.json.link.experiences_status === 'active' && bizOpt.json.link.commission_rate_override === null
    && bizOpt.json.link.verification_status === 'verified',
    'status ' + bizOpt.status + ' ' + JSON.stringify(bizOpt.json).slice(0, 200));
  const bizOptAgain = await call('POST', '/api/experiences/host/business', { business_id: bizId }, otherCookie);
  check('EXP3: opting in twice returns the same link',
    bizOptAgain.status === 200 && bizOptAgain.json.link && bizOptAgain.json.link.id === linkId,
    'status ' + bizOptAgain.status);
  const docBizLic = await call('POST', '/api/experiences/host/documents', { kind: 'tourism_licence', image: IMG, host_side: 'business', business_id: bizId }, otherCookie);
  check('EXP3: a tourism licence upload works for a business host',
    docBizLic.status === 200 && docBizLic.json.document && docBizLic.json.document.kind === 'tourism_licence'
    && docBizLic.json.document.status === 'pending',
    'status ' + docBizLic.status + ' ' + JSON.stringify(docBizLic.json).slice(0, 160));
  const bizPatch = await call('PATCH', '/api/experiences/host/business/' + linkId, {
    payout_method: 'mobile_money', payout_reference: '0771234567',
  }, otherCookie);
  check('EXP3: business owner updates payout, masked as MTN Mobile Money ending 567',
    bizPatch.status === 200 && bizPatch.json.link.payout_reference_masked === 'MTN Mobile Money, ending 567'
    && !('payout_reference' in bizPatch.json.link),
    'status ' + bizPatch.status + ' ' + JSON.stringify(bizPatch.json).slice(0, 200));
  const bizPatchCommission = await call('PATCH', '/api/experiences/host/business/' + linkId, { commission_rate_override: 20 }, otherCookie);
  check('EXP3: business owner attempting the commission override gets 403',
    bizPatchCommission.status === 403, 'status ' + bizPatchCommission.status);
  const commOwner = await call('PATCH', '/api/admin/experiences/businesses/' + bizId + '/commission', { rate: 15 }, otherCookie);
  check('EXP3: commission override is admin-only (owner gets 403)',
    commOwner.status === 403, 'status ' + commOwner.status);
  const commBad = await call('PATCH', '/api/admin/experiences/businesses/' + bizId + '/commission', { rate: 101 }, adminCookie);
  check('EXP3: commission override above 100 is 422', commBad.status === 422, 'status ' + commBad.status);
  const comm = await call('PATCH', '/api/admin/experiences/businesses/' + bizId + '/commission', { rate: 15 }, adminCookie);
  check('EXP3: admin sets the commission override to 15',
    comm.status === 200 && comm.json.link.commission_rate_override === 15,
    'status ' + comm.status + ' ' + JSON.stringify(comm.json).slice(0, 160));
  const commNull = await call('PATCH', '/api/admin/experiences/businesses/' + bizId + '/commission', { rate: null }, adminCookie);
  check('EXP3: admin can reset the commission override to the platform default (null)',
    commNull.status === 200 && commNull.json.link.commission_rate_override === null,
    'status ' + commNull.status);
  const meThird = await call('GET', '/api/experiences/host/me', null, otherCookie);
  check('EXP3: host/me shows the business link for the business owner',
    meThird.status === 200 && meThird.json.individual === null
    && (meThird.json.businesses || []).length === 1
    && meThird.json.businesses[0].business_id === bizId,
    JSON.stringify(meThird.json).slice(0, 200));

  // Staff: invite validation, accept, role boundaries, manager writes, revoke, decline.
  const inviteUnknown = await call('POST', '/api/experiences/host/business/' + bizId + '/staff', { phone: '0970000999', role: 'staff' }, otherCookie);
  check('EXP3: staff invite for a phone with no account is 422', inviteUnknown.status === 422, 'status ' + inviteUnknown.status);
  const inviteOwner = await call('POST', '/api/experiences/host/business/' + bizId + '/staff', { phone: '0970000003', role: 'staff' }, otherCookie);
  check('EXP3: staff invite for the business owner themself is 422', inviteOwner.status === 422, 'status ' + inviteOwner.status);
  const inviteStaff = await call('POST', '/api/experiences/host/business/' + bizId + '/staff', { phone: '0970000032', role: 'staff' }, otherCookie);
  check('EXP3: owner invites a staff member (status invited)',
    inviteStaff.status === 200 && inviteStaff.json.staff && inviteStaff.json.staff.status === 'invited'
    && inviteStaff.json.staff.role === 'staff' && inviteStaff.json.staff.user_id === expStaff.id,
    'status ' + inviteStaff.status + ' ' + JSON.stringify(inviteStaff.json).slice(0, 160));
  const staffListInvited = await call('GET', '/api/experiences/host/business/' + bizId + '/staff', null, expStaff.cookie);
  check('EXP3: an invited (not yet active) member cannot list staff (403)',
    staffListInvited.status === 403, 'status ' + staffListInvited.status);
  const myInvites = await call('GET', '/api/experiences/host/invites', null, expStaff.cookie);
  check('EXP3: the invitee sees the pending invite in-app',
    myInvites.status === 200 && (myInvites.json.invites || []).length === 1
    && myInvites.json.invites[0].business_id === bizId && myInvites.json.invites[0].role === 'staff',
    JSON.stringify(myInvites.json).slice(0, 160));
  const acceptWrong = await call('POST', '/api/experiences/host/staff/invites/' + bizId + '/accept', {}, memberCookie);
  check('EXP3: only the invited user can accept (someone else gets 404)',
    acceptWrong.status === 404, 'status ' + acceptWrong.status);
  const accept = await call('POST', '/api/experiences/host/staff/invites/' + bizId + '/accept', {}, expStaff.cookie);
  check('EXP3: the invitee accepts (invited -> active)',
    accept.status === 200 && accept.json.staff && accept.json.staff.status === 'active',
    'status ' + accept.status + ' ' + JSON.stringify(accept.json).slice(0, 160));
  const staffList = await call('GET', '/api/experiences/host/business/' + bizId + '/staff', null, otherCookie);
  check('EXP3: owner lists staff with name, phone, role and status',
    staffList.status === 200 && (staffList.json.staff || []).length === 1
    && staffList.json.staff[0].name === 'EXP Staff Member',
    JSON.stringify(staffList.json).slice(0, 160));
  const staffListAsStaff = await call('GET', '/api/experiences/host/business/' + bizId + '/staff', null, expStaff.cookie);
  check('EXP3: a staff-role member cannot list staff (403)',
    staffListAsStaff.status === 403, 'status ' + staffListAsStaff.status);
  const inviteMgr = await call('POST', '/api/experiences/host/business/' + bizId + '/staff', { phone: '0970000034', role: 'manager' }, otherCookie);
  check('EXP3: owner invites a manager',
    inviteMgr.status === 200 && inviteMgr.json.staff.role === 'manager', 'status ' + inviteMgr.status);
  await call('POST', '/api/experiences/host/staff/invites/' + bizId + '/accept', {}, expManager.cookie);
  const bizListingStaff = await call('POST', '/api/experiences', {
    host_side: 'business', business_id: bizId, listing_type: 'tour', category_id: toursCat,
    title: 'EXP3 Staff Tour', description: 'A tour a staff member must not create.', city: 'Lusaka',
    price_from: 100, price_unit: 'per_person', capacity_max: 4,
  }, expStaff.cookie);
  check('EXP3: a staff-role member cannot create a business listing (403)',
    bizListingStaff.status === 403, 'status ' + bizListingStaff.status);
  const bizListingMgr = await call('POST', '/api/experiences', {
    host_side: 'business', business_id: bizId, listing_type: 'tour', category_id: toursCat,
    title: 'EXP3 Manager Tour', description: 'A tour created by the business manager.', city: 'Lusaka',
    price_from: 100, price_unit: 'per_person', capacity_max: 4,
  }, expManager.cookie);
  const bizListingId = (bizListingMgr.json.listing || {}).id;
  check('EXP3: a manager can create a business listing draft',
    bizListingMgr.status === 200 && bizListingMgr.json.listing && bizListingMgr.json.listing.approval_status === 'draft',
    'status ' + bizListingMgr.status + ' ' + JSON.stringify(bizListingMgr.json).slice(0, 160));
  const mgrEdit = await call('PATCH', '/api/experiences/' + bizListingId, { title: 'EXP3 Manager Tour Edited' }, expManager.cookie);
  check('EXP3: a manager can edit a business listing',
    mgrEdit.status === 200 && mgrEdit.json.listing.title === 'EXP3 Manager Tour Edited',
    'status ' + mgrEdit.status + ' ' + JSON.stringify(mgrEdit.json).slice(0, 160));
  const staffEdit = await call('PATCH', '/api/experiences/' + bizListingId, { title: 'EXP3 Staff Edit' }, expStaff.cookie);
  check('EXP3: a staff-role member cannot edit a listing (403)',
    staffEdit.status === 403, 'status ' + staffEdit.status);
  const staffPayout = await call('PATCH', '/api/experiences/host/business/' + linkId, { payout_reference: '0970000000' }, expStaff.cookie);
  check('EXP3: a staff-role member cannot change payout details (403)',
    staffPayout.status === 403, 'status ' + staffPayout.status);
  const staffComm = await call('PATCH', '/api/admin/experiences/businesses/' + bizId + '/commission', { rate: 5 }, expStaff.cookie);
  check('EXP3: a staff-role member cannot change the commission override (403)',
    staffComm.status === 403, 'status ' + staffComm.status);
  await call('POST', '/api/experiences/' + bizListingId + '/photos', { photos: [IMG] }, expManager.cookie);
  const bizSub = await call('POST', '/api/experiences/' + bizListingId + '/submit', {}, expManager.cookie);
  check('EXP3: a manager can submit a business listing (business host gate is the active storefront)',
    bizSub.status === 200 && bizSub.json.listing.approval_status === 'submitted',
    'status ' + bizSub.status + ' ' + JSON.stringify(bizSub.json).slice(0, 160));
  await call('PATCH', '/api/admin/experiences/' + bizListingId, { decision: 'approve' }, adminCookie);
  await call('POST', '/api/experiences/host/business/' + bizId + '/staff', { phone: '0970000033', role: 'staff' }, otherCookie);
  const decline = await call('POST', '/api/experiences/host/staff/invites/' + bizId + '/decline', {}, expStranger.cookie);
  const invitesAfter = await call('GET', '/api/experiences/host/invites', null, expStranger.cookie);
  check('EXP3: the invitee can decline (invite removed)',
    decline.status === 200 && (invitesAfter.json.invites || []).length === 0,
    'status ' + decline.status);
  const revoke = await call('POST', '/api/experiences/host/business/' + bizId + '/staff/' + expStaff.id + '/revoke', {}, otherCookie);
  check('EXP3: owner revokes a staff member',
    revoke.status === 200 && revoke.json.staff.status === 'revoked',
    'status ' + revoke.status + ' ' + JSON.stringify(revoke.json).slice(0, 160));
  const staffEditAfter = await call('PATCH', '/api/experiences/' + bizListingId, { title: 'EXP3 After Revoke' }, expStaff.cookie);
  check('EXP3: a revoked member loses access immediately (403)',
    staffEditAfter.status === 403, 'status ' + staffEditAfter.status);

  // Listing creation validation + free events + host-side move refusal.
  const badTitle = await call('POST', '/api/experiences', {
    host_side: 'individual', listing_type: 'tour', category_id: toursCat,
    title: 'AB', description: 'Long enough description here.', city: 'Lusaka',
    price_from: 100, price_unit: 'per_person', capacity_max: 4,
  }, memberCookie);
  check('EXP3: listing creation rejects a title under 3 chars (422)', badTitle.status === 422, 'status ' + badTitle.status);
  const badCity = await call('POST', '/api/experiences', {
    host_side: 'individual', listing_type: 'tour', category_id: toursCat,
    title: 'EXP3 Bad City', description: 'Long enough description here.', city: 'Nowhere',
    price_from: 100, price_unit: 'per_person', capacity_max: 4,
  }, memberCookie);
  check('EXP3: listing creation rejects a city outside CITIES (422)', badCity.status === 422, 'status ' + badCity.status);
  const badPrice = await call('POST', '/api/experiences', {
    host_side: 'individual', listing_type: 'tour', category_id: toursCat,
    title: 'EXP3 Free Tour', description: 'Long enough description here.', city: 'Lusaka',
    price_from: 0, price_unit: 'per_person', capacity_max: 4,
  }, memberCookie);
  check('EXP3: a non-event listing cannot be free (422)', badPrice.status === 422, 'status ' + badPrice.status);
  const overPrice = await call('POST', '/api/experiences', {
    host_side: 'individual', listing_type: 'tour', category_id: toursCat,
    title: 'EXP3 Pricey Tour', description: 'Long enough description here.', city: 'Lusaka',
    price_from: 10000001, price_unit: 'per_person', capacity_max: 4,
  }, memberCookie);
  check('EXP3: listing creation rejects a price above K10,000,000 (422)', overPrice.status === 422, 'status ' + overPrice.status);
  const badCat = await call('POST', '/api/experiences', {
    host_side: 'individual', listing_type: 'tour', category_id: 999999,
    title: 'EXP3 Bad Cat', description: 'Long enough description here.', city: 'Lusaka',
    price_from: 100, price_unit: 'per_person', capacity_max: 4,
  }, memberCookie);
  check('EXP3: listing creation rejects an unknown category (422)', badCat.status === 422, 'status ' + badCat.status);
  const freeEvent = await call('POST', '/api/experiences', {
    host_side: 'individual', listing_type: 'event', category_id: eventsCat,
    title: 'EXP3 Free Event', description: 'A free community event for testing.', city: 'Lusaka',
    price_from: 0, price_unit: 'per_event', capacity_max: 50,
    venue_name: 'Showgrounds', event_date: '2027-05-01',
  }, memberCookie);
  const freeEventId = (freeEvent.json.listing || {}).id;
  check('EXP3: an event may be free (price 0) and writes the event subtype row',
    freeEvent.status === 200 && freeEvent.json.listing && freeEvent.json.listing.price_from === 0,
    'status ' + freeEvent.status + ' ' + JSON.stringify(freeEvent.json).slice(0, 160));
  const freeEventRow = await dbOne('SELECT * FROM experience_events WHERE listing_id = ?', [freeEventId]);
  check('EXP3: event subtype row carries the venue and date',
    !!freeEventRow && freeEventRow.venue_name === 'Showgrounds' && freeEventRow.event_date === '2027-05-01',
    JSON.stringify(freeEventRow));
  const notOwnerEdit = await call('PATCH', '/api/experiences/' + mkId, { title: 'EXP3 Hijack' }, expStranger.cookie);
  check('EXP3: a non-owner cannot edit a listing (403)', notOwnerEdit.status === 403, 'status ' + notOwnerEdit.status);
  const moveSide = await call('PATCH', '/api/experiences/' + mkId, { host_side: 'business', business_id: bizId }, memberCookie);
  check('EXP3: moving a listing between host sides is refused (422, deferred)',
    moveSide.status === 422, 'status ' + moveSide.status);

  // Photo cap 8, cover swap, delete, host listings.
  const capListing = await call('POST', '/api/experiences', {
    host_side: 'individual', listing_type: 'tour', category_id: toursCat,
    title: 'EXP3 Photo Cap Tour', description: 'A tour to test the eight photo cap.', city: 'Lusaka',
    price_from: 100, price_unit: 'per_person', capacity_max: 4,
  }, memberCookie);
  const capId = (capListing.json.listing || {}).id;
  const eight = await call('POST', '/api/experiences/' + capId + '/photos', { photos: [IMG, IMG, IMG, IMG, IMG, IMG, IMG, IMG] }, memberCookie);
  const capPhotos = (eight.json.photos || []);
  check('EXP3: eight photos can be added (the cap)',
    eight.status === 200 && capPhotos.length === 8,
    'status ' + eight.status + ' ' + JSON.stringify(eight.json).slice(0, 160));
  const ninth = await call('POST', '/api/experiences/' + capId + '/photos', { photos: [IMG] }, memberCookie);
  check('EXP3: a ninth photo is refused (photo cap 8 enforced)',
    ninth.status === 422, 'status ' + ninth.status);
  const coverSwap = await call('POST', `/api/experiences/${capId}/photos/${capPhotos[3].id}/cover`, {}, memberCookie);
  const coverRow = await dbOne('SELECT id FROM experience_listing_media WHERE listing_id = ? ORDER BY sort, id LIMIT 1', [capId]);
  check('EXP3: making a photo the cover swaps it to sort 0',
    coverSwap.status === 200 && coverRow && Number(coverRow.id) === capPhotos[3].id,
    'status ' + coverSwap.status + ' ' + JSON.stringify(coverRow));
  const delPhoto = await call('DELETE', '/api/experiences/' + capId + '/photos/' + capPhotos[0].id, null, memberCookie);
  const photoCount = await dbOne('SELECT COUNT(*) AS c FROM experience_listing_media WHERE listing_id = ?', [capId]);
  check('EXP3: owner can delete a photo',
    delPhoto.status === 200 && Number(photoCount.c) === 7,
    'status ' + delPhoto.status + ' count ' + JSON.stringify(photoCount));
  const myListings = await call('GET', '/api/experiences/host/listings', null, memberCookie);
  check('EXP3: host listings lists the caller listings with approval_status',
    myListings.status === 200 && (myListings.json.listings || []).some((l) => l.id === mkId && l.approval_status === 'approved')
    && myListings.json.total >= 4,
    'status ' + myListings.status + ' total ' + myListings.json.total);

  // Document reads: stranger 404, owner + admin read and are logged, queue, delete rules.
  const strangerRead = await fetch(BASE + '/api/experiences/host/documents/' + nrcDocId, { headers: { Cookie: expStranger.cookie } });
  await strangerRead.text();
  check('EXP3: a stranger reading a verification document gets 404',
    strangerRead.status === 404, 'status ' + strangerRead.status);
  const ownerRead = await fetch(BASE + '/api/experiences/host/documents/' + nrcDocId, { headers: { Cookie: expHost2.cookie } });
  const ownerReadType = ownerRead.headers.get('content-type');
  await ownerRead.text();
  check('EXP3: the owner can read their PDF document (application/pdf)',
    ownerRead.status === 200 && (ownerReadType || '').includes('application/pdf'),
    'status ' + ownerRead.status + ' type ' + ownerReadType);
  const views = await dbOne('SELECT COUNT(*) AS c FROM experience_document_views WHERE document_id = ?', [nrcDocId]);
  check('EXP3: a successful document read is logged in experience_document_views',
    Number(views.c) === 1, 'views ' + JSON.stringify(views));
  const adminRead = await fetch(BASE + '/api/experiences/host/documents/' + nrcDocId, { headers: { Cookie: adminCookie } });
  await adminRead.text();
  const views2 = await dbOne('SELECT COUNT(*) AS c FROM experience_document_views WHERE document_id = ?', [nrcDocId]);
  check('EXP3: an admin read is logged too (2 views total)',
    adminRead.status === 200 && Number(views2.c) === 2, 'views ' + JSON.stringify(views2));
  const queue = await call('GET', '/api/admin/experiences/documents', null, adminCookie);
  check('EXP3: admin documents queue lists documents with identity, never image data',
    queue.status === 200 && (queue.json.documents || []).some((d) => d.id === nrcDocId && d.kind === 'nrc')
    && !JSON.stringify(queue.json).includes('data:application') && !JSON.stringify(queue.json).includes('data:image'),
    'status ' + queue.status + ' ' + JSON.stringify(queue.json).slice(0, 200));
  const queueMember = await call('GET', '/api/admin/experiences/documents', null, memberCookie);
  check('EXP3: the documents queue is admin/support only (member gets 403)',
    queueMember.status === 403, 'status ' + queueMember.status);
  const docDecideMember = await call('PATCH', '/api/admin/experiences/documents/' + nrcDocId, { decision: 'approved' }, memberCookie);
  check('EXP3: a member cannot decide a document (403)', docDecideMember.status === 403, 'status ' + docDecideMember.status);
  const docApprove = await call('PATCH', '/api/admin/experiences/documents/' + selfieDocId, { decision: 'approved', note: 'Clear selfie.' }, adminCookie);
  check('EXP3: admin approves a document (reviewed_by + note stored)',
    docApprove.status === 200 && docApprove.json.document.status === 'approved'
    && docApprove.json.document.review_note === 'Clear selfie.',
    'status ' + docApprove.status + ' ' + JSON.stringify(docApprove.json).slice(0, 160));
  const delApproved = await call('DELETE', '/api/experiences/host/documents/' + selfieDocId, null, expHost2.cookie);
  check('EXP3: an approved document cannot be deleted (422, audit trail)',
    delApproved.status === 422, 'status ' + delApproved.status);
  const delPending = await call('DELETE', '/api/experiences/host/documents/' + nrcDocId, null, expHost2.cookie);
  const goneDoc = await dbOne('SELECT id FROM experience_host_verifications WHERE id = ?', [nrcDocId]);
  check('EXP3: a pending document can be deleted by its owner',
    delPending.status === 200 && !goneDoc, 'status ' + delPending.status);
}

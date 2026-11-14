'use strict';
/**
 * 2911 Hustle — "What's Your Hustle?" K10,000 Business Challenge +
 * Business Storefront Marketplace extension (Phase 1 backend, Nov 13, 2026).
 *
 * Module split (Architecture 1.1): this router module is mounted from
 * server.js and shares the existing auth, maybeAuth, ah, err, runWrite,
 * getOne, getAll, listCache, isAdmin, isSupport, logAdmin, CITIES,
 * notifySms, notifyPush, client, normalizePhone and composeSms helpers
 * via the factory deps, following the routes/experiences.js pattern.
 * It must not change any existing route's behaviour.
 *
 * Fixed decisions carried in (Architecture / Database / ImplementationPlan
 * section 9 reconciled decisions; Zac approved the dates and rules
 * Nov 13, 2026):
 * - Competition dates live on the hustle_competitions row, never
 *   hard-coded. Stored UTC, displayed Africa/Lusaka (UTC+2, no DST).
 * - One authorised rep per business, Hustle-scoped table
 *   (hustle_business_reps), owner-only invite/revoke, narrow powers:
 *   apply/edit the business's competition application and view its
 *   Hustle notifications/analytics. Never Experiences powers, never
 *   edit storefront/documents/products/owner fields.
 * - Pitch video is a SOCIAL MEDIA LINK only (facebook, tiktok, youtube,
 *   instagram), domain allowlist, no upload, no R2, no duration/size
 *   stored. The 60-90 second rule is checked by the admin opening the
 *   link at pitch review.
 * - Voting in-app only, one vote per verified account
 *   (users.selfie_status = 'approved'), free, live leaderboard.
 *   Counts are COUNT(*) on read; no counter column anywhere.
 * - Freeze is PERMANENT; snapshots live in hustle_results. No endpoint
 *   may add votes or silently change totals. Vote invalidation sets
 *   is_valid = 0 with reason + logAdmin, never deletes votes.
 * - Admin is Zac's account only (isAdmin / ADMIN_PHONES).
 * - logAdmin uses ONLY the 21 exact action strings in Database
 *   section 13. No other Hustle admin action strings exist.
 * - SMS spend ~K24.24 TOTAL per competition: SMS only for PACRA
 *   decisions, application decisions, and the winner. No broadcast SMS.
 *   notifyHustle always writes the inbox row; push/SMS are best-effort
 *   with explicit flags at each call site. No SMS/email is sent by the
 *   test suite (no Africa's Talking creds in tests: notifySms logs
 *   'skipped').
 *
 * DEVIATIONS recorded here (not revisited without Zac):
 * - Business-level verification outcome 'changes_requested' is NOT
 *   built: businesses.verification_status keeps its CHECK
 *   ('unverified','pending','verified','rejected') because adding a
 *   value needs a table rebuild, which the Database doc (14.1) and the
 *   build scope forbid. Per-document 'changes_requested' IS built
 *   (business_documents.status, a new column) via PATCH
 *   /api/admin/businesses/:businessId/documents/:documentId, and the
 *   business status is derived from its PACRA document.
 * - PATCH /api/businesses/:id/hustle-profile is owner-or-admin only.
 *   Architecture 1.3 lists "owner or authorised rep", but the Nov 13
 *   gating decision narrows reps to application work only, never
 *   editing storefront fields.
 * - The vote rate limiter runs as middleware (before the 8 ordered
 *   eligibility checks in the handler). The 8 checks still run in
 *   order among themselves; a 429 is a flood control, not a vote
 *   rejection, and is never recorded as a fraud flag.
 * - Automatic fraud-detector rules (Architecture 3.6 sweeper) are NOT
 *   built: hustle_vote_flags rows are created by the admin flag
 *   endpoint (manual_report) and reviewed in the admin queue. No vote
 *   is ever auto-invalidated.
 * - Announcements have no per-user read state by design (one row per
 *   announcement, no fan-out). They appear in the inbox by union;
 *   the unread badge counts personal inbox rows only.
 * - Anonymous storefront/pitch views are recorded raw (one row per
 *   load); signed-in views are deduped per actor per day. hustle_events
 *   has no IP column (Database doc wins for schema), so anonymous
 *   dedup is not possible without storing IPs.
 */
const express = require('express');
const crypto = require('crypto');

// ---------------------------------------------------------------- constants
const HUSTLE_BUSINESS_TYPES = ['sole_proprietor', 'limited_company', 'partnership', 'cooperative', 'other'];
const HUSTLE_PROVINCES = ['Central', 'Copperbelt', 'Eastern', 'Luapula', 'Lusaka', 'Muchinga', 'North-Western', 'Northern', 'Southern', 'Western'];
const HUSTLE_SOCIAL_PLATFORMS = ['facebook', 'instagram', 'tiktok', 'whatsapp', 'other'];
const MAX_ACTIVE_REPS = 1; // one authorised rep per business at launch
const MAX_PITCH_PHOTOS = 5; // same cap as product photos
const PITCH_PHOTO_MAX_LEN = 2500000; // data URI chars (~2 MB), Database section 7
const DOC_IMG_MAX_LEN = 2500000; // business document images, same as PACRA cert cap
const DOC_PDF_MAX_LEN = 8000000; // business document PDFs (~6 MB), Experiences rule
const MAX_SPEND_ITEMS = 10;
const SPEND_MIN_ITEMS = 1;
const LEADERBOARD_TOP = 10;
const NOTIF_PAGE_SIZE = 20;

// Pitch video: domain allowlist (Zac, Nov 8, 2026). fb.watch maps to
// facebook, youtu.be maps to youtube.
const VIDEO_DOMAINS = {
  'facebook.com': 'facebook', 'fb.watch': 'facebook',
  'tiktok.com': 'tiktok',
  'youtube.com': 'youtube', 'youtu.be': 'youtube',
  'instagram.com': 'instagram',
};

// The 10 application questions, version 1. The question wording lives in
// code (Architecture 5.2); answers are stored as answers_json q1..q10.
const HUSTLE_QUESTIONS_V1 = [
  'What is your business called, and what does it do?',
  'What problem does your business solve for its customers?',
  'Who are your customers, and where are they?',
  'What makes your business different from others doing the same thing?',
  'How long have you been trading, and what have you achieved so far?',
  'Who works in the business with you?',
  'Roughly how much does the business earn in a typical month?',
  'In a few lines, how would you spend the K10,000 if you win?',
  'What jobs would the K10,000 help you create or keep?',
  'Why should your business win What\'s Your Hustle?',
];
const HUSTLE_QUESTIONS_VERSION = 1;
const ANSWER_MAX_LEN = 1000;
const PITCH_SUMMARY_MAX_LEN = 500;

// Competition status set (Database section 5). No backwards transition
// except none: once voting has closed it never reopens; frozen never
// returns to voting_open.
const COMPETITION_STATUSES = ['draft', 'applications_open', 'applications_closed', 'voting_open', 'voting_closed', 'frozen', 'winner_announced', 'archived'];
const COMPETITION_STATUS_FLOW = {
  draft: ['applications_open', 'archived'],
  applications_open: ['applications_closed', 'archived'],
  applications_closed: ['voting_open', 'archived'],
  voting_open: ['voting_closed', 'archived'], // frozen only via the freeze endpoint
  voting_closed: ['frozen', 'archived'], // frozen only via the freeze endpoint
  frozen: ['winner_announced', 'archived'], // winner only via the finalise endpoint
  winner_announced: ['archived'],
  archived: [],
};
const APPLICATION_STATUSES = ['draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'rejected', 'disqualified', 'withdrawn'];
const ANNOUNCEMENT_KINDS = ['voting_opened', 'voting_closing_soon', 'results_announced', 'winner_announced', 'general'];

// The ONLY Hustle admin action strings (Database section 13, 21 actions).
// logAdmin is never called with any other Hustle action.
const HUSTLE_AUDIT_ACTIONS = new Set([
  'hustle.business.verify',
  'hustle.business.document.approve', 'hustle.business.document.reject', 'hustle.business.document.changes_requested',
  'hustle.application.approve', 'hustle.application.reject', 'hustle.application.changes_requested',
  'hustle.application.disqualify', 'hustle.application.reinstate',
  'hustle.pitch.approve', 'hustle.pitch.reject', 'hustle.pitch.changes_requested',
  'hustle.competition.create', 'hustle.competition.dates', 'hustle.competition.status', 'hustle.competition.freeze',
  'hustle.vote.invalidate', 'hustle.vote.restore',
  'hustle.result.publish',
  'hustle.prize.mark_paid', 'hustle.prize.mark_failed',
]);

// Notification kinds (Database section 11). A notification names the
// business and the competition only: never a voter, phone, IP, device
// fingerprint, or another business's vote count. Bodies capped at 300 chars.
const NOTIF_KINDS = new Set([
  'business_registered', 'business_verified', 'business_verification_changes_requested',
  'application_received', 'application_changes_requested', 'application_approved',
  'application_rejected', 'application_disqualified', 'voting_opened',
  'voting_closing_soon', 'results_announced', 'prize_paid',
  'rep_invited', 'rep_invite_accepted',
]);

function createHustleRouter(deps) {
  const { ah, err, maybeAuth, getOne, getAll, runWrite, listCache,
    auth, isAdmin, isSupport, logAdmin, CITIES, client,
    notifySms, notifyPush, hustleVoteLimiter, hustleApplyLimiter,
    normalizePhone, composeSms } = deps;
  const router = express.Router();

  // lastInsertRowid comes back as a BigInt from libsql — normalise.
  function insertId(result) { return Number(result.lastInsertRowid); }

  // ------------------------------------------------------------ small helpers
  function parseJsonArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    try { const p = JSON.parse(String(value)); return Array.isArray(p) ? p : []; }
    catch { return []; }
  }
  function parseJsonObject(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (value == null) return {};
    try { const p = JSON.parse(String(value)); return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {}; }
    catch { return {}; }
  }
  function parseDataUri(s) {
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(String(s || ''));
    if (!m) return null;
    return { mime: m[1], b64: m[2] };
  }
  function sha256Hex(s) { return crypto.createHash('sha256').update(String(s || '')).digest('hex'); }
  function nowSql() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
  // Normalise an admin-supplied date to UTC 'YYYY-MM-DD HH:MM:SS' or null.
  // Accepts 'YYYY-MM-DD HH:MM:SS', ISO with T/Z, or a plain date.
  function toSqlUtc(value) {
    if (value == null || value === '') return null;
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) {
      return s.length === 16 ? s + ':00' : s;
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  function parseSqlUtc(s) {
    if (!s) return null;
    const d = new Date(String(s).replace(' ', 'T') + 'Z');
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Africa/Lusaka display (UTC+2, no DST): 'Mon Dec 7, 23:59 Lusaka time'.
  function lusakaLabel(sqlUtc) {
    const d = parseSqlUtc(sqlUtc);
    if (!d) return '';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Lusaka', weekday: 'short', month: 'short',
      day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d) + ' Lusaka time';
  }
  function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()); }
  function plausiblePhone(v) {
    if (typeof normalizePhone === 'function') return !!normalizePhone(v);
    const d = String(v || '').replace(/\D/g, '');
    return d.length >= 9 && d.length <= 15;
  }
  // Find a user by phone, trying the stored E.164 form and the common
  // Zambian input forms (mirrors routes/experiences.js findUserByPhone).
  async function findUserByPhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return null;
    const candidates = ['+' + digits];
    if (digits.startsWith('260')) candidates.push('+' + digits);
    if (digits.startsWith('0')) candidates.push('+260' + digits.slice(1));
    if (/^[976]\d{8}$/.test(digits)) candidates.push('+260' + digits);
    for (const c of [...new Set(candidates)]) {
      const u = await getOne('SELECT * FROM users WHERE phone = ?', [c]);
      if (u) return u;
    }
    return null;
  }

  // ------------------------------------------------------------ serializers
  // The winner lives in hustle_results, not on the competition row.
  async function winnerApplicationId(competitionId) {
    const w = await getOne(
      'SELECT application_id FROM hustle_results WHERE competition_id = ? AND is_winner = 1 ORDER BY rank ASC LIMIT 1',
      [competitionId]);
    return w ? Number(w.application_id) : null;
  }
  function serializeCompetition(c, extra) {
    return {
      id: Number(c.id), name: c.name, slug: c.slug, tagline: c.tagline || '',
      description: c.description || '', rules_text: c.rules_text || '',
      prize_kwacha: Number(c.prize_kwacha || 0), prize_currency: c.prize_currency || 'ZMW',
      eligibility: parseJsonObject(c.eligibility_json),
      applications_open_at: c.applications_open_at || null,
      applications_close_at: c.applications_close_at || null,
      voting_open_at: c.voting_open_at || null,
      voting_close_at: c.voting_close_at || null,
      freeze_at: c.freeze_at || null,
      winner_at: c.winner_at || null,
      applications_close_label: c.applications_close_at ? lusakaLabel(c.applications_close_at) : '',
      voting_open_label: c.voting_open_at ? lusakaLabel(c.voting_open_at) : '',
      voting_close_label: c.voting_close_at ? lusakaLabel(c.voting_close_at) : '',
      winner_label: c.winner_at ? lusakaLabel(c.winner_at) : '',
      status: c.status,
      created_at: c.created_at, updated_at: c.updated_at,
      ...(extra || {}),
    };
  }
  function serializeBusinessCard(b) {
    if (!b) return null;
    return {
      id: Number(b.id), name: b.name, slug: b.slug,
      trading_name: b.trading_name || '',
      tagline: b.tagline || '', category: b.category, city: b.city,
      province: b.province || '', district: b.district || '',
      logo: b.logo || null, cover: b.cover || null,
      verified: b.verification_status === 'verified',
      verification_status: b.verification_status,
      phone: b.phone || '', whatsapp: b.whatsapp || '', email: b.email || '',
      website: b.website || '',
    };
  }
  async function voteCountLive(applicationId) {
    const r = await getOne(
      `SELECT COUNT(*) AS c FROM hustle_votes v
        JOIN hustle_applications a ON a.id = v.application_id
       WHERE v.application_id = ? AND v.is_valid = 1 AND v.after_freeze = 0
         AND a.status = 'approved'`,
      [applicationId]);
    return Number(r ? r.c : 0);
  }
  // Public vote total for an entry: after the freeze the frozen snapshot
  // in hustle_results is the public truth; before it, the live count.
  async function publicVoteCount(app, competition) {
    if (competition && ['frozen', 'winner_announced', 'archived'].includes(competition.status)) {
      const snap = await getOne(
        'SELECT final_vote_count FROM hustle_results WHERE competition_id = ? AND application_id = ?',
        [competition.id, app.id]);
      if (snap) return Number(snap.final_vote_count);
    }
    return voteCountLive(app.id);
  }
  async function pitchPhotosFor(applicationId) {
    const rows = await getAll(
      'SELECT id, mime, sort FROM hustle_pitch_photos WHERE application_id = ? ORDER BY sort, id',
      [applicationId]);
    return rows.map((p) => ({
      id: Number(p.id),
      url: `/api/hustle/applications/${applicationId}/photos/${p.id}`,
      mime: p.mime || 'image/jpeg', sort: Number(p.sort || 0),
    }));
  }
  async function pitchVideoFor(applicationId) {
    const v = await getOne(
      'SELECT id, video_url, video_platform, status, review_note FROM hustle_pitch_videos WHERE application_id = ?',
      [applicationId]);
    return v ? {
      id: Number(v.id), video_url: v.video_url, video_platform: v.video_platform,
      status: v.status, review_note: v.review_note || '',
    } : null;
  }
  async function spendItemsFor(applicationId) {
    const rows = await getAll(
      'SELECT id, label, amount, note, sort FROM hustle_spend_items WHERE application_id = ? ORDER BY sort, id',
      [applicationId]);
    return rows.map((r) => ({
      id: Number(r.id), label: r.label, amount: Number(r.amount),
      note: r.note || '', sort: Number(r.sort || 0),
    }));
  }
  function serializeApplication(a, opts) {
    const o = opts || {};
    return {
      id: Number(a.id), competition_id: Number(a.competition_id),
      business_id: Number(a.business_id), submitted_by: Number(a.submitted_by),
      answers: parseJsonObject(a.answers_json),
      questions_version: Number(a.questions_version || 1),
      pitch_summary: a.pitch_summary || '',
      status: a.status,
      reviewed_by: a.reviewed_by == null ? null : Number(a.reviewed_by),
      reviewed_at: a.reviewed_at || null,
      review_note: a.review_note || '',
      disqualified_reason: a.disqualified_reason || '',
      submitted_at: a.submitted_at || null,
      approved_at: a.approved_at || null,
      withdrawn_at: a.withdrawn_at || null,
      created_at: a.created_at, updated_at: a.updated_at,
      ...(o.business ? { business: o.business } : {}),
      ...(o.competition ? { competition: o.competition } : {}),
      ...(o.spend_items ? { spend_items: o.spend_items } : {}),
      ...(o.pitch_video !== undefined ? { pitch_video: o.pitch_video } : {}),
      ...(o.photos ? { photos: o.photos } : {}),
      ...(o.vote_count !== undefined ? { vote_count: o.vote_count } : {}),
    };
  }
  function serializeNotification(n) {
    return {
      id: n.is_announcement ? ('ann-' + n.id) : Number(n.id),
      announcement: !!n.is_announcement,
      kind: n.kind, title: n.title, body: n.body,
      link: n.link || '',
      related_type: n.related_type || '',
      related_id: n.related_id == null ? null : Number(n.related_id),
      read_at: n.read_at || null,
      sent_via: n.sent_via || 'in_app',
      created_at: n.created_at,
    };
  }
  function serializeRepRow(r, user) {
    return {
      business_id: Number(r.business_id), user_id: Number(r.user_id),
      name: user ? user.name : '', phone: user ? user.phone : '',
      role: r.role, status: r.status,
      invited_by: r.invited_by == null ? null : Number(r.invited_by),
      invited_at: r.invited_at, accepted_at: r.accepted_at || null,
      revoked_at: r.revoked_at || null,
      revoked_by: r.revoked_by == null ? null : Number(r.revoked_by),
    };
  }

  // ------------------------------------------------------------ access helpers
  // The caller's access to one business: 'owner', 'representative'
  // (active rep only), or null. Invited/revoked rows grant nothing.
  // Admin is handled by callers with isAdmin() where the route allows it.
  async function businessAccess(userId, businessId) {
    const b = await getOne('SELECT * FROM businesses WHERE id = ?', [businessId]);
    if (!b) return { business: null, role: null };
    if (Number(b.owner_id) === Number(userId)) return { business: b, role: 'owner' };
    const rep = await getOne(
      "SELECT * FROM hustle_business_reps WHERE business_id = ? AND user_id = ? AND status = 'active'",
      [businessId, userId]);
    return { business: b, role: rep ? 'representative' : null };
  }
  async function activeRepFor(businessId) {
    // No id column on this table: the PK is (business_id, user_id).
    return getOne(
      "SELECT * FROM hustle_business_reps WHERE business_id = ? AND status = 'active' ORDER BY accepted_at, user_id LIMIT 1",
      [businessId]);
  }
  // People to notify about a business event: owner + active rep.
  async function businessNotifyTargets(businessId) {
    const b = await getOne('SELECT owner_id FROM businesses WHERE id = ?', [businessId]);
    const ids = [];
    if (b) ids.push(Number(b.owner_id));
    const rep = await activeRepFor(businessId);
    if (rep && !ids.includes(Number(rep.user_id))) ids.push(Number(rep.user_id));
    return ids;
  }


  // logAdmin for Hustle decisions: ONLY the 21 exact action strings in
  // Database section 13. Anything else is a bug, so refuse loudly
  // rather than writing a rogue action into admin_audit.
  function logHustleAdmin(req, action, targetType, targetId, detail) {
    if (!HUSTLE_AUDIT_ACTIONS.has(action)) {
      throw new Error('Refusing unknown Hustle audit action: ' + action);
    }
    logAdmin(req, action, targetType, targetId, detail);
  }

  // ------------------------------------------------------------ notifications
  // notifyHustle ALWAYS writes the inbox row (the guarantee); push and
  // SMS are best-effort and never break the request. Every call site
  // passes explicit sms/push flags, so the SMS spend decision is visible
  // in code. SMS only for PACRA decisions, application decisions, winner
  // (Architecture 6.2, ~K24.24 TOTAL per competition).
  async function notifyHustle(userId, kind, title, body, opts) {
    const o = opts || {};
    const cleanKind = NOTIF_KINDS.has(kind) ? kind : 'application_received';
    const cleanTitle = String(title || '').slice(0, 120);
    const cleanBody = String(body || '').slice(0, 300);
    try {
      await runWrite(
        `INSERT INTO hustle_notifications
           (user_id, kind, title, body, link, related_type, related_id, sent_via, delivery_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent')`,
        [userId, cleanKind, cleanTitle, cleanBody, String(o.link || '').slice(0, 300),
         String(o.relatedType || '').slice(0, 60),
         o.relatedId == null ? null : Number(o.relatedId),
         o.sms ? 'sms' : (o.push ? 'push' : 'in_app')]
      );
    } catch (e) { console.error('notifyHustle inbox write failed:', e && e.message); }
    if (o.push && typeof notifyPush === 'function') {
      notifyPush(userId, {
        title: '2911 Jobs', body: cleanBody,
        url: o.link || '#/notifications', tag: `hustle-${cleanKind}`,
      }).catch(() => {});
    }
    if (o.sms && typeof notifySms === 'function' && o.smsBody) {
      let text = String(o.smsBody);
      if (typeof composeSms === 'function') {
        try { text = composeSms((n, t) => `Hi, this is Zac, your assistant. ${t}`, '', text); }
        catch { text = text.slice(0, 160); }
      } else {
        text = text.slice(0, 160);
      }
      notifySms(userId, 'hustle_' + cleanKind, text).catch(() => {});
    }
  }
  async function notifyBusinessPeople(businessId, kind, title, body, opts) {
    const targets = await businessNotifyTargets(businessId);
    for (const uid of targets) {
      await notifyHustle(uid, kind, title, body, opts);
    }
  }

  // ------------------------------------------------------------ analytics events
  // Fire-and-forget (never breaks the read). Signed-in views are deduped
  // per actor per business per day (Lusaka date); anonymous views are
  // recorded raw (no IP column exists to dedup them — see header note).
  function recordHustleEvent(businessId, eventType, actorId, refType, refId) {
    const write = actorId
      ? runWrite(
          `INSERT INTO hustle_events (business_id, event_type, actor_user_id, ref_type, ref_id)
           SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (
             SELECT 1 FROM hustle_events
             WHERE business_id = ? AND event_type = ? AND actor_user_id = ?
               AND date(created_at, '+2 hours') = date('now', '+2 hours'))`,
          [businessId, eventType, actorId, refType || '', refId == null ? null : refId,
           businessId, eventType, actorId])
      : runWrite(
          `INSERT INTO hustle_events (business_id, event_type, actor_user_id, ref_type, ref_id)
           VALUES (?, ?, NULL, ?, ?)`,
          [businessId, eventType, refType || '', refId == null ? null : refId]);
    write.catch(() => { /* analytics must never break a read */ });
  }

  // ------------------------------------------------------------ completeness
  // hustleBusinessCompleteness (Architecture 4.7): the full required set
  // of the registration form plus the competition-presentation fields.
  // Registration itself is unchanged; competition entry is a higher bar.
  // Returns { complete, missing[], verified, verification_status }.
  // missing holds field keys the frontend maps to the completion flow.
  async function hustleBusinessCompleteness(businessId) {
    const b = await getOne('SELECT * FROM businesses WHERE id = ?', [businessId]);
    if (!b) return { complete: false, missing: ['business'], verified: false, verification_status: '' };
    const missing = [];
    if (!b.name || String(b.name).trim().length < 3) missing.push('name');
    if (!b.category) missing.push('category');
    if (!HUSTLE_BUSINESS_TYPES.includes(b.business_type || '')) missing.push('business_type');
    if (!b.description || String(b.description).trim().length < 10) missing.push('description');
    if (!b.province) missing.push('province');
    if (!b.district) missing.push('district');
    if (!b.city) missing.push('city');
    if (!b.address || String(b.address).trim().length < 5) missing.push('address');
    if (!b.owner_legal_name || String(b.owner_legal_name).trim().length < 5) missing.push('owner_legal_name');
    if (!b.phone || !plausiblePhone(b.phone)) missing.push('phone');
    if (!b.whatsapp || !plausiblePhone(b.whatsapp)) missing.push('whatsapp');
    if (!b.email || !isValidEmail(b.email)) missing.push('email');
    if (!b.logo) missing.push('logo');
    if (!b.cover) missing.push('cover');
    if (!b.pacra_number || String(b.pacra_number).trim().length < 5) missing.push('pacra_number');
    if (!/^\d{10}$/.test(String(b.tpin || '').replace(/\s/g, ''))) missing.push('tpin');
    const pacra = await getOne(
      "SELECT id FROM business_documents WHERE business_id = ? AND kind = 'pacra' LIMIT 1", [businessId]);
    if (!pacra) missing.push('pacra_certificate');
    const year = Number(b.year_started);
    if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) missing.push('year_started');
    // Products/services: free-text list OR at least one linked product.
    const services = String(b.services_text || '').trim();
    const linked = await getOne(
      "SELECT COUNT(*) AS c FROM products WHERE business_id = ? AND status = 'active'", [businessId]);
    if (!services && Number(linked ? linked.c : 0) === 0) missing.push('services');
    // Operating hours: structured hours OR the free-text hours field.
    const hours = parseJsonObject(b.hours_json);
    const hasStructuredHours = Object.keys(hours).length > 0;
    if (!hasStructuredHours && !String(b.hours_text || '').trim()) missing.push('hours');
    const verified = b.verification_status === 'verified';
    return {
      complete: missing.length === 0, missing,
      verified, verification_status: b.verification_status,
    };
  }

  // ------------------------------------------------------------ competitions
  async function getCompetition(idOrSlug) {
    const v = String(idOrSlug || '');
    if (/^\d+$/.test(v)) return getOne('SELECT * FROM hustle_competitions WHERE id = ?', [Number(v)]);
    return getOne('SELECT * FROM hustle_competitions WHERE slug = ?', [v]);
  }
  function votingWindowOpen(comp, now) {
    const t = now.getTime();
    const open = parseSqlUtc(comp.voting_open_at);
    const close = parseSqlUtc(comp.voting_close_at);
    if (!open || !close) return false;
    return t >= open.getTime() && t <= close.getTime();
  }
  function applicationsWindowOpen(comp, now) {
    const t = now.getTime();
    const open = parseSqlUtc(comp.applications_open_at);
    const close = parseSqlUtc(comp.applications_close_at);
    if (!open || !close) return false;
    return t >= open.getTime() && t <= close.getTime();
  }
  function isFrozen(comp) { return comp.status === 'frozen' || !!comp.freeze_at; }

  // Validate the Hustle business-profile fields (PATCH hustle-profile).
  // Returns a fields error map ({} when valid).
  function validateBusinessExtensionInput(b) {
    const f = {};
    if (b.trading_name !== undefined && String(b.trading_name).length > 120) f.trading_name = 'Trading name must be under 120 characters.';
    if (b.province !== undefined && b.province !== '' && !HUSTLE_PROVINCES.includes(b.province)) f.province = 'Choose a valid province.';
    if (b.district !== undefined && String(b.district).length > 80) f.district = 'District must be under 80 characters.';
    if (b.business_type !== undefined && b.business_type !== '' && !HUSTLE_BUSINESS_TYPES.includes(b.business_type)) f.business_type = 'Choose a valid business type.';
    if (b.year_started !== undefined && b.year_started !== null && b.year_started !== '') {
      const y = Number(b.year_started);
      if (!Number.isInteger(y) || y < 1900 || y > new Date().getFullYear()) f.year_started = 'Year started must be between 1900 and this year.';
    }
    if (b.website !== undefined && b.website !== '' && !/^https?:\/\/.+/i.test(String(b.website))) f.website = 'Website must start with http:// or https://.';
    if (b.website !== undefined && String(b.website).length > 200) f.website = 'Website must be under 200 characters.';
    if (b.social_links !== undefined) {
      let links = [];
      if (Array.isArray(b.social_links)) links = b.social_links;
      else if (typeof b.social_links === 'string') {
        try {
          const parsed = JSON.parse(b.social_links);
          if (!Array.isArray(parsed)) f.social_links = 'Social links must be a list of {platform, url}.';
          else links = parsed;
        } catch { f.social_links = 'Social links must be a list of {platform, url}.'; }
      } else {
        f.social_links = 'Social links must be a list of {platform, url}.';
      }
      for (const l of links) {
        if (!l || typeof l !== 'object' || !HUSTLE_SOCIAL_PLATFORMS.includes(l.platform) || !/^https?:\/\/.+/i.test(String(l.url || ''))) {
          f.social_links = 'Each social link needs a platform and a full https:// URL.';
          break;
        }
      }
    }
    if (b.registration_number !== undefined && String(b.registration_number).length > 40) f.registration_number = 'Registration number must be under 40 characters.';
    if (b.hours_json !== undefined && b.hours_json !== '' && b.hours_json !== null) {
      const h = typeof b.hours_json === 'string' ? parseJsonObject(b.hours_json) : b.hours_json;
      if (typeof b.hours_json === 'string') {
        try { JSON.parse(b.hours_json); } catch { f.hours_json = 'Opening hours must be valid JSON.'; }
      }
      if (h && typeof h === 'object') {
        for (const [day, v] of Object.entries(h)) {
          if (!v || typeof v !== 'object' || (v.closed !== true && (!v.open || !v.close))) {
            f.hours_json = `Opening hours for ${day} need an open and close time, or closed.`;
            break;
          }
        }
      }
    }
    if (b.services_text !== undefined && String(b.services_text).length > 1000) f.services_text = 'Products and services must be under 1000 characters.';
    return f;
  }

  // Validate a pitch video URL against the domain allowlist; returns
  // { platform } or { error }.
  function validatePitchVideoUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return { error: 'Add the link to your pitch video.' };
    let host = '';
    try { host = new URL(s).hostname.toLowerCase().replace(/^www\./, ''); }
    catch { return { error: 'That link does not look right. Paste the full link to your video.' }; }
    const platform = VIDEO_DOMAINS[host];
    if (!platform) return { error: 'Post your pitch on Facebook, TikTok, YouTube or Instagram, then paste that link here.' };
    return { platform, url: s };
  }

  // Validate spend items shape (amounts > 0, 1-10 items). The exact-sum
  // rule (must total the prize) is checked at submit time only.
  // Shape check only for the list itself; the prize-sum check needs the
  // competition's prize, so callers pass it in. A wrong-sum list must be
  // rejected at write time, not only at submit (submitChecks re-checks
  // the stored total as the last gate).
  function validateSpendItems(items, prizeKwacha) {
    if (!Array.isArray(items)) return 'Spend breakdown must be a list.';
    if (items.length < SPEND_MIN_ITEMS || items.length > MAX_SPEND_ITEMS) {
      return `List between ${SPEND_MIN_ITEMS} and ${MAX_SPEND_ITEMS} planned spends.`;
    }
    for (const it of items) {
      if (!it || typeof it !== 'object' || !String(it.label || '').trim()) return 'Each spend line needs a label.';
      const amt = Number(it.amount);
      if (!Number.isInteger(amt) || amt <= 0) return 'Each spend amount must be a whole number of Kwacha above 0.';
      if (String(it.label).length > 120) return 'Each spend label must be under 120 characters.';
    }
    const prize = Number(prizeKwacha);
    if (Number.isInteger(prize) && prize > 0) {
      const total = items.reduce((s, it) => s + Number(it.amount), 0);
      if (total !== prize) {
        return `Spend lines must add up to exactly K${prize.toLocaleString('en-ZM')} (the prize). They add up to K${total.toLocaleString('en-ZM')}.`;
      }
    }
    return null;
  }
  async function replaceSpendItems(applicationId, items) {
    await runWrite('DELETE FROM hustle_spend_items WHERE application_id = ?', [applicationId]);
    for (let i = 0; i < items.length; i++) {
      await runWrite(
        'INSERT INTO hustle_spend_items (application_id, label, amount, note, sort) VALUES (?, ?, ?, ?, ?)',
        [applicationId, String(items[i].label).trim(), Number(items[i].amount),
         String(items[i].note || '').slice(0, 200), i]);
    }
  }
  async function spendTotal(applicationId) {
    const r = await getOne(
      'SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM hustle_spend_items WHERE application_id = ?',
      [applicationId]);
    return { total: Number(r ? r.total : 0), count: Number(r ? r.n : 0) };
  }
  function validateAnswers(answers) {
    const a = (answers && typeof answers === 'object' && !Array.isArray(answers)) ? answers : {};
    const missing = [];
    for (let i = 1; i <= HUSTLE_QUESTIONS_V1.length; i++) {
      const v = String(a['q' + i] || '').trim();
      if (!v) missing.push('q' + i);
      else if (v.length > ANSWER_MAX_LEN) return { error: `Answer ${i} must be under ${ANSWER_MAX_LEN} characters.` };
    }
    if (missing.length) return { error: 'Answer all 10 questions before submitting.', missing };
    return { answers: a };
  }

  // Derive the business verification_status from its PACRA document
  // (Database section 3): verified only when the PACRA document is
  // approved; rejected when it is rejected; pending otherwise. The
  // business CHECK has no 'changes_requested' value, so a document in
  // changes_requested surfaces as pending with the note.
  async function deriveBusinessVerification(businessId, req) {
    const b = await getOne('SELECT id, name, verification_status FROM businesses WHERE id = ?', [businessId]);
    if (!b) return;
    const pacra = await getOne(
      "SELECT status FROM business_documents WHERE business_id = ? AND kind = 'pacra' ORDER BY id DESC LIMIT 1",
      [businessId]);
    if (!pacra) return;
    let next = null;
    if (pacra.status === 'approved') next = 'verified';
    else if (pacra.status === 'rejected') next = 'rejected';
    else if (b.verification_status === 'verified' || b.verification_status === 'rejected') next = 'pending';
    if (next && next !== b.verification_status) {
      await runWrite(
        "UPDATE businesses SET verification_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [next, businessId]);
      if (req) logHustleAdmin(req, 'hustle.business.verify', 'business', businessId, `${b.name}: ${b.verification_status} -> ${next} (PACRA document ${pacra.status})`);
    }
  }

  // Ranked live leaderboard rows for a competition: approved entries
  // ordered by valid vote count desc, then earliest approval first.
  async function liveLeaderboardRows(competitionId) {
    const apps = await getAll(
      `SELECT a.*, b.name AS business_name, b.slug AS business_slug, b.logo AS business_logo,
              b.category AS business_category, b.city AS business_city,
              b.province AS business_province, b.district AS business_district,
              b.verification_status AS business_verification_status
       FROM hustle_applications a JOIN businesses b ON b.id = a.business_id
       WHERE a.competition_id = ? AND a.status = 'approved'
       ORDER BY a.approved_at ASC, a.id ASC`,
      [competitionId]);
    const rows = [];
    for (const a of apps) {
      rows.push({ app: a, votes: await voteCountLive(a.id) });
    }
    rows.sort((x, y) => (y.votes - x.votes) || String(x.app.approved_at || '').localeCompare(String(y.app.approved_at || '')) || (x.app.id - y.app.id));
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }
  async function frozenLeaderboardRows(competitionId) {
    const rows = await getAll(
      `SELECT r.*, a.status AS app_status, a.approved_at AS approved_at,
              b.name AS business_name, b.slug AS business_slug, b.logo AS business_logo,
              b.category AS business_category, b.city AS business_city,
              b.province AS business_province, b.district AS business_district,
              b.verification_status AS business_verification_status
       FROM hustle_results r
       JOIN hustle_applications a ON a.id = r.application_id
       JOIN businesses b ON b.id = r.business_id
       WHERE r.competition_id = ? ORDER BY r.rank ASC`,
      [competitionId]);
    return rows.map((r) => ({
      app: {
        id: r.application_id, competition_id: competitionId, business_id: r.business_id,
        pitch_summary: '', status: r.app_status, approved_at: r.approved_at,
      },
      votes: Number(r.final_vote_count), rank: Number(r.rank),
      business_name: r.business_name, business_slug: r.business_slug,
      business_logo: r.business_logo, business_category: r.business_category,
      business_city: r.business_city, business_province: r.business_province,
      business_district: r.business_district,
      business_verification_status: r.business_verification_status,
      is_winner: !!r.is_winner,
    }));
  }
  function leaderboardRowJson(row) {
    const a = row.app;
    const business = row.business_name !== undefined
      ? { id: Number(a.business_id), name: row.business_name, slug: row.business_slug,
          logo: row.business_logo || null, category: row.business_category,
          city: row.business_city, province: row.business_province || '',
          district: row.business_district || '',
          verified: row.business_verification_status === 'verified' }
      : null;
    return {
      rank: row.rank, application_id: Number(a.id), business_id: Number(a.business_id),
      business, vote_count: Number(row.votes),
      approved_at: a.approved_at || null,
      ...(row.is_winner !== undefined ? { is_winner: !!row.is_winner } : {}),
    };
  }
  async function liveRowJson(row, competition) {
    const b = await getOne('SELECT * FROM businesses WHERE id = ?', [row.app.business_id]);
    return leaderboardRowJson({
      ...row,
      business_name: b ? b.name : '', business_slug: b ? b.slug : '',
      business_logo: b ? b.logo : null, business_category: b ? b.category : '',
      business_city: b ? b.city : '', business_province: b ? b.province : '',
      business_district: b ? b.district : '',
      business_verification_status: b ? b.verification_status : '',
    });
  }

  // ================================================================ competitions (public)
  // GET /api/hustle/competitions — public fields only; drafts are not public.
  router.get('/api/hustle/competitions', listCache, ah(maybeAuth), ah(async (req, res) => {
    const rows = await getAll(
      `SELECT * FROM hustle_competitions WHERE status != 'draft' ORDER BY created_at DESC, id DESC`);
    const out = [];
    for (const c of rows) {
      const e = await getOne(
        "SELECT COUNT(*) AS n FROM hustle_applications WHERE competition_id = ? AND status = 'approved'",
        [c.id]);
      out.push(serializeCompetition(c, { entry_count: Number(e ? e.n : 0) }));
    }
    res.json({ competitions: out });
  }));

  // GET /api/hustle/competitions/current — the active competition.
  // 404 when none is live. Literal route before /:id.
  router.get('/api/hustle/competitions/current', listCache, ah(maybeAuth), ah(async (req, res) => {
    const c = await getOne(
      `SELECT * FROM hustle_competitions
        WHERE status IN ('applications_open', 'applications_closed', 'voting_open', 'voting_closed', 'frozen', 'winner_announced')
        ORDER BY created_at DESC, id DESC LIMIT 1`);
    if (!c) return err(res, 404, 'No competition is live right now.');
    const e = await getOne(
      "SELECT COUNT(*) AS n FROM hustle_applications WHERE competition_id = ? AND status = 'approved'", [c.id]);
    res.json({ competition: serializeCompetition(c, { entry_count: Number(e ? e.n : 0), winner_application_id: await winnerApplicationId(c.id) }) });
  }));

  // GET /api/hustle/competitions/:id — landing data.
  router.get('/api/hustle/competitions/:id', ah(maybeAuth), ah(async (req, res) => {
    const c = await getCompetition(req.params.id);
    if (!c) return err(res, 404, 'Competition not found.');
    if (c.status === 'draft' && !(req.user && isAdmin(req.user))) return err(res, 404, 'Competition not found.');
    const e = await getOne(
      "SELECT COUNT(*) AS n FROM hustle_applications WHERE competition_id = ? AND status = 'approved'", [c.id]);
    const v = await getOne(
      'SELECT COUNT(*) AS n FROM hustle_votes WHERE competition_id = ? AND is_valid = 1', [c.id]);
    res.json({
      competition: serializeCompetition(c, {
        entry_count: Number(e ? e.n : 0),
        vote_count: Number(v ? v.n : 0),
        winner_application_id: await winnerApplicationId(c.id),
        leaderboard_url: `/api/hustle/competitions/${c.id}/leaderboard`,
      }),
    });
  }));

  // GET /api/hustle/competitions/:id/entries — public approved entries.
  router.get('/api/hustle/competitions/:id/entries', listCache, ah(maybeAuth), ah(async (req, res) => {
    const c = await getCompetition(req.params.id);
    if (!c) return err(res, 404, 'Competition not found.');
    if (c.status === 'draft') return err(res, 404, 'Competition not found.');
    const apps = await getAll(
      `SELECT a.* FROM hustle_applications a
        WHERE a.competition_id = ? AND a.status = 'approved'
        ORDER BY a.approved_at ASC, a.id ASC LIMIT 100`, [c.id]);
    const entries = [];
    for (const a of apps) {
      const b = await getOne('SELECT * FROM businesses WHERE id = ?', [a.business_id]);
      entries.push({
        application_id: Number(a.id),
        business: serializeBusinessCard(b),
        pitch_summary: a.pitch_summary || '',
        pitch_video: await pitchVideoFor(a.id),
        photos: await pitchPhotosFor(a.id),
        vote_count: await publicVoteCount(a, c),
        approved_at: a.approved_at || null,
      });
    }
    res.json({ competition_id: Number(c.id), entries });
  }));

  // GET /api/hustle/competitions/:id/leaderboard — Top 10 + caller's rank.
  router.get('/api/hustle/competitions/:id/leaderboard', listCache, ah(maybeAuth), ah(async (req, res) => {
    const c = await getCompetition(req.params.id);
    if (!c) return err(res, 404, 'Competition not found.');
    if (c.status === 'draft') return err(res, 404, 'Competition not found.');
    const frozen = ['frozen', 'winner_announced', 'archived'].includes(c.status);
    let rows;
    let top;
    if (frozen) {
      rows = await frozenLeaderboardRows(c.id);
      top = rows.slice(0, LEADERBOARD_TOP).map(leaderboardRowJson);
    } else {
      rows = await liveLeaderboardRows(c.id);
      top = [];
      for (const r of rows.slice(0, LEADERBOARD_TOP)) top.push(await liveRowJson(r, c));
    }
    let my_rank = null;
    let my_entry = null;
    if (req.user) {
      const mine = await getAll(
        `SELECT a.* FROM hustle_applications a JOIN businesses b ON b.id = a.business_id
          WHERE a.competition_id = ? AND a.status = 'approved'
            AND (b.owner_id = ? OR EXISTS (SELECT 1 FROM hustle_business_reps r
              WHERE r.business_id = b.id AND r.user_id = ? AND r.status = 'active'))`,
        [c.id, req.user.id, req.user.id]);
      if (mine.length) {
        const found = rows.find((r) => Number(r.app.id) === Number(mine[0].id));
        if (found) {
          my_rank = found.rank;
          my_entry = frozen ? leaderboardRowJson(found) : await liveRowJson(found, c);
        }
      }
    }
    res.json({
      competition_id: Number(c.id), status: c.status, frozen,
      frozen_at: c.freeze_at || null,
      leaderboard: top, my_rank, my_entry,
    });
  }));

  // GET /api/hustle/competitions/:id/votes/mine — the caller's vote record.
  router.get('/api/hustle/competitions/:id/votes/mine', ah(auth), ah(async (req, res) => {
    const c = await getCompetition(req.params.id);
    if (!c) return err(res, 404, 'Competition not found.');
    const v = await getOne(
      'SELECT * FROM hustle_votes WHERE competition_id = ? AND voter_id = ?',
      [c.id, req.user.id]);
    if (!v) return res.json({ vote: null });
    res.json({
      vote: {
        id: Number(v.id), competition_id: Number(v.competition_id),
        application_id: Number(v.application_id), business_id: Number(v.business_id),
        after_freeze: !!v.after_freeze, is_valid: !!v.is_valid,
        created_at: v.created_at,
      },
    });
  }));

  // ================================================================ business extension
  // PATCH /api/businesses/:id/hustle-profile — set the Hustle fields.
  // Owner or admin only (reps never edit storefront fields; see header).
  router.patch('/api/businesses/:id/hustle-profile', ah(auth), ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const row = await getOne('SELECT * FROM businesses WHERE id = ?', [id]);
    if (!row) return err(res, 404, 'Business not found.');
    if (row.owner_id !== req.user.id && !isAdmin(req.user)) {
      return err(res, 403, 'Only the business owner can edit this profile.');
    }
    const b = req.body || {};
    const f = validateBusinessExtensionInput(b);
    if (Object.keys(f).length) return err(res, 422, Object.values(f)[0], f);
    const updates = {};
    for (const k of ['trading_name', 'province', 'district', 'business_type', 'website',
      'registration_number', 'services_text']) {
      if (b[k] !== undefined) updates[k] = String(b[k]).trim();
    }
    if (b.year_started !== undefined) {
      updates.year_started = (b.year_started === '' || b.year_started === null) ? null : Number(b.year_started);
    }
    if (b.social_links !== undefined) {
      const links = Array.isArray(b.social_links) ? b.social_links : parseJsonArray(b.social_links);
      updates.social_links = JSON.stringify(links.map((l) => ({ platform: l.platform, url: String(l.url).trim().slice(0, 200) })));
    }
    if (b.hours_json !== undefined) {
      updates.hours_json = (b.hours_json === '' || b.hours_json === null) ? ''
        : (typeof b.hours_json === 'string' ? b.hours_json : JSON.stringify(b.hours_json));
    }
    if (b.location_id !== undefined) {
      if (b.location_id === '' || b.location_id === null) {
        updates.location_id = null;
      } else {
        const loc = await getOne('SELECT id FROM experience_locations WHERE id = ?', [Number(b.location_id) || 0]);
        if (!loc) return err(res, 422, 'That location does not exist.');
        updates.location_id = loc.id;
      }
    }
    if (Object.keys(updates).length) {
      const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
      await runWrite(`UPDATE businesses SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...Object.values(updates), id]);
    }
    const fresh = await getOne('SELECT * FROM businesses WHERE id = ?', [id]);
    res.json({ ok: true, id, business: serializeBusinessCard(fresh) });
  }));

  // POST /api/businesses/:id/representatives — owner invites by phone.
  // Max 1 ACTIVE rep per business. No SMS is sent for the invite (the
  // invite is visible in-app on next sign-in, Experiences Phase 3 rule).
  router.post('/api/businesses/:id/representatives', ah(auth), ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const row = await getOne('SELECT * FROM businesses WHERE id = ?', [id]);
    if (!row) return err(res, 404, 'Business not found.');
    if (row.owner_id !== req.user.id) return err(res, 403, 'Only the business owner can invite a representative.');
    const invitee = await findUserByPhone((req.body || {}).phone);
    if (!invitee) return err(res, 422, 'No account uses that phone number.');
    if (Number(invitee.id) === Number(req.user.id)) return err(res, 422, 'You already own this business.');
    const existing = await getOne(
      'SELECT * FROM hustle_business_reps WHERE business_id = ? AND user_id = ?', [id, invitee.id]);
    if (existing && existing.status === 'active') return err(res, 409, 'That person is already an active representative.');
    if (existing && existing.status === 'invited') return err(res, 409, 'That person already has a pending invite.');
    const active = await activeRepFor(id);
    if (active && !(existing && existing.status === 'revoked')) {
      return err(res, 422, 'This business already has an active representative. Revoke them first to invite someone else.');
    }
    if (existing && existing.status === 'revoked') {
      await runWrite(
        `UPDATE hustle_business_reps SET role = 'representative', invited_by = ?, status = 'invited',
           invited_at = CURRENT_TIMESTAMP, accepted_at = NULL, revoked_at = NULL, revoked_by = NULL
         WHERE business_id = ? AND user_id = ?`,
        [req.user.id, id, invitee.id]);
    } else {
      await runWrite(
        `INSERT INTO hustle_business_reps (business_id, user_id, role, invited_by, status)
         VALUES (?, ?, 'representative', ?, 'invited')`,
        [id, invitee.id, req.user.id]);
    }
    await notifyHustle(invitee.id, 'rep_invited',
      'Representative invite',
      `${row.name} invited you to be its authorised representative for What's Your Hustle?. Open the app to accept or decline.`,
      { link: '#/notifications', relatedType: 'business', relatedId: id, push: true, sms: false });
    const fresh = await getOne(
      'SELECT * FROM hustle_business_reps WHERE business_id = ? AND user_id = ?', [id, invitee.id]);
    res.status(201).json({ ok: true, representative: serializeRepRow(fresh, invitee) });
  }));

  // GET /api/businesses/:id/representatives — owner or admin.
  router.get('/api/businesses/:id/representatives', ah(auth), ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const row = await getOne('SELECT * FROM businesses WHERE id = ?', [id]);
    if (!row) return err(res, 404, 'Business not found.');
    if (row.owner_id !== req.user.id && !isAdmin(req.user)) {
      return err(res, 403, 'Only the business owner can see its representatives.');
    }
    const rows = await getAll(
      'SELECT * FROM hustle_business_reps WHERE business_id = ? ORDER BY created_at, user_id', [id]);
    const out = [];
    for (const r of rows) {
      const u = await getOne('SELECT id, name, phone FROM users WHERE id = ?', [r.user_id]);
      out.push(serializeRepRow(r, u));
    }
    res.json({ business_id: id, representatives: out });
  }));

  // POST /api/businesses/:id/representatives/:userId/revoke — owner only.
  router.post('/api/businesses/:id/representatives/:userId/revoke', ah(auth), ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const userId = parseInt(req.params.userId, 10);
    const row = await getOne('SELECT * FROM businesses WHERE id = ?', [id]);
    if (!row) return err(res, 404, 'Business not found.');
    if (row.owner_id !== req.user.id) return err(res, 403, 'Only the business owner can revoke a representative.');
    const rep = await getOne(
      'SELECT * FROM hustle_business_reps WHERE business_id = ? AND user_id = ?', [id, userId]);
    if (!rep) return err(res, 404, 'Representative not found.');
    if (rep.status === 'revoked') return res.json({ ok: true, representative: serializeRepRow(rep, null) });
    await runWrite(
      `UPDATE hustle_business_reps SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, revoked_by = ?
       WHERE business_id = ? AND user_id = ?`,
      [req.user.id, id, userId]);
    const fresh = await getOne(
      'SELECT * FROM hustle_business_reps WHERE business_id = ? AND user_id = ?', [id, userId]);
    res.json({ ok: true, representative: serializeRepRow(fresh, null) });
  }));

  // GET /api/hustle/representative-invites — invites waiting for the caller.
  router.get('/api/hustle/representative-invites', ah(auth), ah(async (req, res) => {
    const rows = await getAll(
      `SELECT r.*, b.name AS business_name, b.slug AS business_slug
       FROM hustle_business_reps r JOIN businesses b ON b.id = r.business_id
       WHERE r.user_id = ? AND r.status = 'invited' ORDER BY r.invited_at DESC, r.business_id`,
      [req.user.id]);
    res.json({
      invites: rows.map((r) => ({
        business_id: Number(r.business_id), business_name: r.business_name,
        business_slug: r.business_slug, invited_by: Number(r.invited_by),
        invited_at: r.invited_at,
      })),
    });
  }));

  // POST /api/hustle/representative-invites/:id/accept — :id is business_id.
  router.post('/api/hustle/representative-invites/:id/accept', ah(auth), ah(async (req, res) => {
    const businessId = parseInt(req.params.id, 10);
    const rep = await getOne(
      'SELECT * FROM hustle_business_reps WHERE business_id = ? AND user_id = ?',
      [businessId, req.user.id]);
    if (!rep || rep.status !== 'invited') return err(res, 404, 'Invite not found.');
    const active = await activeRepFor(businessId);
    if (active) return err(res, 422, 'This business already has an active representative.');
    await runWrite(
      `UPDATE hustle_business_reps SET status = 'active', accepted_at = CURRENT_TIMESTAMP
       WHERE business_id = ? AND user_id = ? AND status = 'invited'`,
      [businessId, req.user.id]);
    const b = await getOne('SELECT owner_id, name FROM businesses WHERE id = ?', [businessId]);
    if (b) {
      await notifyHustle(b.owner_id, 'rep_invite_accepted',
        'Representative accepted',
        `${req.user.name} accepted your invite to represent ${b.name} for What's Your Hustle?.`,
        { link: '#/notifications', relatedType: 'business', relatedId: businessId, push: true, sms: false });
    }
    const fresh = await getOne(
      'SELECT * FROM hustle_business_reps WHERE business_id = ? AND user_id = ?', [businessId, req.user.id]);
    res.json({ ok: true, representative: serializeRepRow(fresh, req.user) });
  }));

  // POST /api/hustle/representative-invites/:id/decline — deletes the row
  // (Experiences decline rule).
  router.post('/api/hustle/representative-invites/:id/decline', ah(auth), ah(async (req, res) => {
    const businessId = parseInt(req.params.id, 10);
    const rep = await getOne(
      'SELECT * FROM hustle_business_reps WHERE business_id = ? AND user_id = ?',
      [businessId, req.user.id]);
    if (!rep || rep.status !== 'invited') return err(res, 404, 'Invite not found.');
    await runWrite(
      'DELETE FROM hustle_business_reps WHERE business_id = ? AND user_id = ? AND status = ?',
      [businessId, req.user.id, 'invited']);
    res.json({ ok: true });
  }));

  // GET /api/hustle/businesses/:businessId/documents/:documentId — owner,
  // active rep, or admin only. Returns the bytes; the read is logged to
  // hustle_document_views (Database section 3).
  router.get('/api/hustle/businesses/:businessId/documents/:documentId', ah(auth), ah(async (req, res) => {
    const businessId = parseInt(req.params.businessId, 10);
    const docId = parseInt(req.params.documentId, 10);
    const acc = await businessAccess(req.user.id, businessId);
    if (!acc.business) return err(res, 404, 'Business not found.');
    if (!acc.role && !isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const doc = await getOne(
      'SELECT * FROM business_documents WHERE id = ? AND business_id = ?', [docId, businessId]);
    if (!doc) return err(res, 404, 'Document not found.');
    await runWrite(
      'INSERT INTO hustle_document_views (document_id, viewer_id) VALUES (?, ?)',
      [docId, req.user.id]).catch(() => {});
    const parsed = parseDataUri(doc.image);
    if (parsed) {
      res.set('Content-Type', doc.mime || parsed.mime || 'application/octet-stream');
      res.set('Cache-Control', 'private, max-age=300');
      return res.send(Buffer.from(parsed.b64, 'base64'));
    }
    res.json({
      document: {
        id: Number(doc.id), business_id: Number(doc.business_id), kind: doc.kind,
        status: doc.status, reviewed_by: doc.reviewed_by, reviewed_at: doc.reviewed_at || null,
        review_note: doc.review_note || '', mime: doc.mime || '', size_bytes: Number(doc.size_bytes || 0),
        filename: doc.filename || '', created_at: doc.created_at,
      },
    });
  }));

  // PATCH /api/admin/businesses/:businessId/documents/:documentId — admin
  // per-document review (approve / reject / changes_requested, with a
  // note). The business verification_status is derived from the PACRA
  // document afterwards. SMS goes out for PACRA decisions (Architecture
  // 6.2 event 2), inbox + push always.
  router.patch('/api/admin/businesses/:businessId/documents/:documentId', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const businessId = parseInt(req.params.businessId, 10);
    const docId = parseInt(req.params.documentId, 10);
    const doc = await getOne(
      'SELECT * FROM business_documents WHERE id = ? AND business_id = ?', [docId, businessId]);
    if (!doc) return err(res, 404, 'Document not found.');
    const decision = String((req.body || {}).decision || '');
    if (!['approved', 'rejected', 'changes_requested'].includes(decision)) {
      return err(res, 422, 'Decision must be approved, rejected or changes_requested.');
    }
    const note = String((req.body || {}).note || '').trim().slice(0, 300);
    if ((decision === 'rejected' || decision === 'changes_requested') && !note) {
      return err(res, 422, 'Add a note so the owner knows what to fix.', { note: 'Add a note so the owner knows what to fix.' });
    }
    await runWrite(
      `UPDATE business_documents SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ?
       WHERE id = ?`,
      [decision, req.user.id, note, docId]);
    const action = decision === 'approved' ? 'hustle.business.document.approve'
      : decision === 'rejected' ? 'hustle.business.document.reject'
      : 'hustle.business.document.changes_requested';
    logAdmin(req, action, 'business_document', docId, `${doc.kind} document for business ${businessId}: ${decision}${note ? ' (' + note + ')' : ''}`);
    await deriveBusinessVerification(businessId, req);
    const b = await getOne('SELECT * FROM businesses WHERE id = ?', [businessId]);
    if (b) {
      const title = decision === 'approved' ? 'Document approved'
        : decision === 'rejected' ? 'Document rejected' : 'Changes requested on your document';
      const body = decision === 'approved'
        ? `Your ${doc.kind} document for ${b.name} was approved.`
        : decision === 'rejected'
          ? `Your ${doc.kind} document for ${b.name} was rejected. ${note}`
          : `2911 Jobs asked for changes on your ${doc.kind} document for ${b.name}. ${note}`;
      await notifyBusinessPeople(businessId, 'business_verification_changes_requested', title, body, {
        link: '#/business/mine', relatedType: 'business', relatedId: businessId,
        push: true, sms: doc.kind === 'pacra',
        smsBody: decision === 'approved'
          ? `Your PACRA document for ${b.name} was approved.`
          : `2911 Jobs asked for changes on your document for ${b.name}. Open the app to see what to fix.`,
      });
    }
    const fresh = await getOne('SELECT * FROM business_documents WHERE id = ?', [docId]);
    res.json({
      ok: true,
      document: {
        id: Number(fresh.id), business_id: Number(fresh.business_id), kind: fresh.kind,
        status: fresh.status, reviewed_by: fresh.reviewed_by, reviewed_at: fresh.reviewed_at || null,
        review_note: fresh.review_note || '', mime: fresh.mime || '',
        size_bytes: Number(fresh.size_bytes || 0), filename: fresh.filename || '',
        created_at: fresh.created_at,
      },
    });
  }));

  // ================================================================ opt-in / completeness
  // POST /api/hustle/businesses/:id/opt-in — runs the completeness check.
  // Creates nothing: opt-in is a check, not an entry.
  router.post('/api/hustle/businesses/:id/opt-in', ah(auth), ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const acc = await businessAccess(req.user.id, id);
    if (!acc.business) return err(res, 404, 'Business not found.');
    if (!acc.role && !isAdmin(req.user)) return err(res, 403, 'Only the owner or its representative can enter this business.');
    const check = await hustleBusinessCompleteness(id);
    res.json({
      business_id: id, eligible: check.complete && check.verified,
      complete: check.complete, missing: check.missing,
      verified: check.verified, verification_status: check.verification_status,
    });
  }));

  // GET /api/hustle/businesses/:id/completeness — the missing-field list.
  router.get('/api/hustle/businesses/:id/completeness', ah(auth), ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const acc = await businessAccess(req.user.id, id);
    if (!acc.business) return err(res, 404, 'Business not found.');
    if (!acc.role && !isAdmin(req.user)) return err(res, 403, 'Only the owner or its representative can see this.');
    const check = await hustleBusinessCompleteness(id);
    res.json({
      business_id: id, complete: check.complete, missing: check.missing,
      verified: check.verified, verification_status: check.verification_status,
    });
  }));

  // ================================================================ applications
  // Shared: load an application with its business access for the caller.
  // Returns { app, business, role } or sends the error itself.
  async function loadApplicationForCaller(req, res, applicationId, { adminOk } = {}) {
    const app = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [applicationId]);
    if (!app) { err(res, 404, 'Application not found.'); return null; }
    const acc = await businessAccess(req.user.id, app.business_id);
    if (!acc.business) { err(res, 404, 'Application not found.'); return null; }
    if (!acc.role && !(adminOk && isAdmin(req.user))) {
      err(res, 403, 'Only the owner or its representative can see this application.');
      return null;
    }
    return { app, business: acc.business, role: acc.role };
  }

  // POST /api/hustle/competitions/:id/applications — create a draft.
  // Runs the completeness check server side; 422 with the missing list
  // when the business is incomplete or unverified.
  router.post('/api/hustle/competitions/:id/applications', ah(auth), hustleApplyLimiter, ah(async (req, res) => {
    const comp = await getCompetition(req.params.id);
    if (!comp) return err(res, 404, 'Competition not found.');
    const b = req.body || {};
    const businessId = parseInt(b.business_id, 10);
    if (!businessId) return err(res, 422, 'Choose which of your businesses is entering.');
    const acc = await businessAccess(req.user.id, businessId);
    if (!acc.business) return err(res, 404, 'Business not found.');
    if (!acc.role) return err(res, 403, 'Only the owner or its representative can apply for this business.');
    if (comp.status !== 'applications_open' || !applicationsWindowOpen(comp, new Date())) {
      return err(res, 422, 'Applications are not open for this competition right now.');
    }
    if (acc.business.status !== 'active') return err(res, 422, 'The business must be live before it can enter.');
    const check = await hustleBusinessCompleteness(businessId);
    if (!check.complete) {
      return err(res, 422, 'Finish the business profile first: ' + check.missing.join(', ') + ' still missing.',
        { missing: check.missing });
    }
    if (!check.verified) {
      return err(res, 422, 'The business must be verified before it can enter. Its PACRA documents are still under review.',
        { verification_status: check.verification_status });
    }
    // One live entry per business. A withdrawn draft or a rejected
    // application does not block a fresh application while the window is
    // open (the UI offers "Apply again" after a rejection, and a deleted
    // draft must not lock the business out). Disqualified stays blocked.
    const existing = await getOne(
      `SELECT id, status FROM hustle_applications WHERE competition_id = ? AND business_id = ?
         AND status NOT IN ('withdrawn', 'rejected')`,
      [comp.id, businessId]);
    if (existing) return err(res, 409, 'This business already has an application for this competition.');
    const answers = (b.answers && typeof b.answers === 'object') ? b.answers : {};
    for (const k of Object.keys(answers)) {
      if (!/^q([1-9]|10)$/.test(k)) return err(res, 422, 'Answers must be keyed q1 to q10.');
      if (String(answers[k]).length > ANSWER_MAX_LEN) return err(res, 422, `Answer ${k} must be under ${ANSWER_MAX_LEN} characters.`);
    }
    const pitchSummary = String(b.pitch_summary || '').slice(0, PITCH_SUMMARY_MAX_LEN);
    const info = await runWrite(
      `INSERT INTO hustle_applications (competition_id, business_id, submitted_by, answers_json, questions_version, pitch_summary)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [comp.id, businessId, req.user.id, JSON.stringify(answers), HUSTLE_QUESTIONS_VERSION, pitchSummary]);
    const appId = insertId(info);
    if (Array.isArray(b.spend_items) && b.spend_items.length) {
      const spendErr = validateSpendItems(b.spend_items, comp.prize_kwacha);
      if (spendErr) {
        await runWrite('DELETE FROM hustle_applications WHERE id = ?', [appId]);
        return err(res, 422, spendErr);
      }
      await replaceSpendItems(appId, b.spend_items);
    }
    const app = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [appId]);
    res.status(201).json({
      application: serializeApplication(app, {
        business: serializeBusinessCard(acc.business),
        competition: serializeCompetition(comp),
        spend_items: await spendItemsFor(appId),
      }),
    });
  }));

  // GET /api/hustle/applications/mine — the caller's applications.
  // Literal route before /:id.
  router.get('/api/hustle/applications/mine', ah(auth), ah(async (req, res) => {
    const rows = await getAll(
      `SELECT a.* FROM hustle_applications a JOIN businesses b ON b.id = a.business_id
        WHERE a.submitted_by = ? OR b.owner_id = ?
           OR EXISTS (SELECT 1 FROM hustle_business_reps r
             WHERE r.business_id = b.id AND r.user_id = ? AND r.status = 'active')
        ORDER BY a.created_at DESC, a.id DESC`,
      [req.user.id, req.user.id, req.user.id]);
    const out = [];
    for (const a of rows) {
      const b = await getOne('SELECT * FROM businesses WHERE id = ?', [a.business_id]);
      const c = await getCompetition(a.competition_id);
      out.push(serializeApplication(a, {
        business: serializeBusinessCard(b),
        competition: c ? serializeCompetition(c) : null,
        vote_count: a.status === 'approved' ? await voteCountLive(a.id) : 0,
      }));
    }
    res.json({ applications: out });
  }));

  // GET /api/hustle/applications/:id — draft detail (full answers, pitch
  // media, status history). Owner/rep/admin only.
  router.get('/api/hustle/applications/:id', ah(auth), ah(async (req, res) => {
    const loaded = await loadApplicationForCaller(req, res, parseInt(req.params.id, 10), { adminOk: true });
    if (!loaded) return;
    const { app, business } = loaded;
    const comp = await getCompetition(app.competition_id);
    recordHustleEvent(app.business_id, 'application_view', req.user.id, 'hustle_application', app.id);
    res.json({
      application: serializeApplication(app, {
        business: serializeBusinessCard(business),
        competition: comp ? serializeCompetition(comp) : null,
        spend_items: await spendItemsFor(app.id),
        pitch_video: await pitchVideoFor(app.id),
        photos: await pitchPhotosFor(app.id),
        vote_count: app.status === 'approved' ? await publicVoteCount(app, comp) : 0,
      }),
    });
  }));

  // PATCH /api/hustle/applications/:id — edit a draft, or edit after
  // changes-requested. Locked once approved or submitted-and-under-review.
  router.patch('/api/hustle/applications/:id', ah(auth), hustleApplyLimiter, ah(async (req, res) => {
    const loaded = await loadApplicationForCaller(req, res, parseInt(req.params.id, 10), { adminOk: false });
    if (!loaded) return;
    const { app } = loaded;
    if (!['draft', 'changes_requested'].includes(app.status)) {
      return err(res, 422, 'This application can no longer be edited.');
    }
    const b = req.body || {};
    const updates = {};
    if (b.answers !== undefined) {
      if (typeof b.answers !== 'object' || Array.isArray(b.answers)) return err(res, 422, 'Answers must be an object keyed q1 to q10.');
      for (const k of Object.keys(b.answers)) {
        if (!/^q([1-9]|10)$/.test(k)) return err(res, 422, 'Answers must be keyed q1 to q10.');
        if (String(b.answers[k]).length > ANSWER_MAX_LEN) return err(res, 422, `Answer ${k} must be under ${ANSWER_MAX_LEN} characters.`);
      }
      updates.answers_json = JSON.stringify(b.answers);
    }
    if (b.pitch_summary !== undefined) updates.pitch_summary = String(b.pitch_summary).slice(0, PITCH_SUMMARY_MAX_LEN);
    if (Object.keys(updates).length) {
      const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
      await runWrite(`UPDATE hustle_applications SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...Object.values(updates), app.id]);
    }
    if (b.spend_items !== undefined) {
      if (!Array.isArray(b.spend_items)) return err(res, 422, 'Spend breakdown must be a list.');
      const comp = await getCompetition(app.competition_id);
      const spendErr = validateSpendItems(b.spend_items, comp ? comp.prize_kwacha : null);
      if (spendErr) return err(res, 422, spendErr);
      await replaceSpendItems(app.id, b.spend_items);
    }
    const fresh = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [app.id]);
    res.json({
      application: serializeApplication(fresh, {
        spend_items: await spendItemsFor(app.id),
        pitch_video: await pitchVideoFor(app.id),
        photos: await pitchPhotosFor(app.id),
      }),
    });
  }));

  // Submit checks shared by submit and resubmit: all 10 questions,
  // pitch summary, K10,000 breakdown totalling the prize exactly,
  // pitch video link present, 1-5 pitch photos, business complete and
  // verified. Returns an error string or null.
  async function submitChecks(app, comp) {
    const v = validateAnswers(parseJsonObject(app.answers_json));
    if (v.error) return v.error;
    if (!String(app.pitch_summary || '').trim()) return 'Add a short pitch summary before submitting.';
    const spend = await spendTotal(app.id);
    if (spend.count < SPEND_MIN_ITEMS || spend.count > MAX_SPEND_ITEMS) {
      return `Add your K10,000 plan: between ${SPEND_MIN_ITEMS} and ${MAX_SPEND_ITEMS} spend lines.`;
    }
    if (spend.total !== Number(comp.prize_kwacha)) {
      return `Your K10,000 plan must add up to exactly K${Number(comp.prize_kwacha).toLocaleString('en-ZM')} (it adds up to K${spend.total.toLocaleString('en-ZM')}).`;
    }
    const video = await pitchVideoFor(app.id);
    if (!video || !video.video_url) return 'Add the link to your 60-90 second pitch video before submitting.';
    const photos = await getOne(
      'SELECT COUNT(*) AS n FROM hustle_pitch_photos WHERE application_id = ?', [app.id]);
    if (Number(photos ? photos.n : 0) < 1) return 'Add at least one pitch photo before submitting.';
    if (Number(photos.n) > MAX_PITCH_PHOTOS) return `Up to ${MAX_PITCH_PHOTOS} pitch photos.`;
    const check = await hustleBusinessCompleteness(app.business_id);
    if (!check.complete) return 'Finish the business profile first: ' + check.missing.join(', ') + ' still missing.';
    if (!check.verified) return 'The business must be verified before it can enter.';
    const biz = await getOne('SELECT status FROM businesses WHERE id = ?', [app.business_id]);
    if (!biz || biz.status !== 'active') return 'The business must be live before it can enter.';
    return null;
  }

  // POST /api/hustle/applications/:id/submit — draft to submitted.
  router.post('/api/hustle/applications/:id/submit', ah(auth), hustleApplyLimiter, ah(async (req, res) => {
    const loaded = await loadApplicationForCaller(req, res, parseInt(req.params.id, 10), { adminOk: false });
    if (!loaded) return;
    const { app } = loaded;
    if (app.status !== 'draft') return err(res, 422, 'Only a draft can be submitted.');
    const comp = await getCompetition(app.competition_id);
    if (!comp || comp.status !== 'applications_open' || !applicationsWindowOpen(comp, new Date())) {
      return err(res, 422, 'Applications are not open for this competition right now.');
    }
    const fresh = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [app.id]);
    const problem = await submitChecks(fresh, comp);
    if (problem) return err(res, 422, problem);
    await runWrite(
      `UPDATE hustle_applications SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'draft'`,
      [app.id]);
    const biz = await getOne('SELECT name FROM businesses WHERE id = ?', [app.business_id]);
    await notifyHustle(req.user.id, 'application_received',
      'Application received',
      `Your application for ${biz ? biz.name : 'your business'} in ${comp.name} was received. We will review it and let you know.`,
      { link: '#/hustle/my-entry', relatedType: 'hustle_application', relatedId: app.id, push: true, sms: false });
    const out = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [app.id]);
    res.json({ application: serializeApplication(out) });
  }));

  // POST /api/hustle/applications/:id/resubmit — after changes-requested,
  // with a resubmission note.
  router.post('/api/hustle/applications/:id/resubmit', ah(auth), hustleApplyLimiter, ah(async (req, res) => {
    const loaded = await loadApplicationForCaller(req, res, parseInt(req.params.id, 10), { adminOk: false });
    if (!loaded) return;
    const { app } = loaded;
    if (app.status !== 'changes_requested') return err(res, 422, 'Only an application sent back for changes can be resubmitted.');
    const comp = await getCompetition(app.competition_id);
    if (!comp || comp.status !== 'applications_open' || !applicationsWindowOpen(comp, new Date())) {
      return err(res, 422, 'Applications are not open for this competition right now.');
    }
    const fresh = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [app.id]);
    const problem = await submitChecks(fresh, comp);
    if (problem) return err(res, 422, problem);
    const note = String((req.body || {}).note || '').trim().slice(0, 300);
    const reviewNote = note
      ? (String(fresh.review_note || '') + (fresh.review_note ? ' | ' : '') + 'Resubmitted: ' + note).slice(0, 300)
      : fresh.review_note;
    await runWrite(
      `UPDATE hustle_applications SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP,
         review_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'changes_requested'`,
      [reviewNote, app.id]);
    const biz = await getOne('SELECT name FROM businesses WHERE id = ?', [app.business_id]);
    await notifyHustle(req.user.id, 'application_received',
      'Application resubmitted',
      `Your updated application for ${biz ? biz.name : 'your business'} in ${comp.name} was resubmitted for review.`,
      { link: '#/hustle/my-entry', relatedType: 'hustle_application', relatedId: app.id, push: true, sms: false });
    const out = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [app.id]);
    res.json({ application: serializeApplication(out) });
  }));

  // POST /api/hustle/applications/:id/withdraw — removes the entry from
  // voting and the leaderboard, keeps the audit trail. Terminal.
  router.post('/api/hustle/applications/:id/withdraw', ah(auth), ah(async (req, res) => {
    const loaded = await loadApplicationForCaller(req, res, parseInt(req.params.id, 10), { adminOk: false });
    if (!loaded) return;
    const { app } = loaded;
    if (['rejected', 'disqualified', 'withdrawn'].includes(app.status)) {
      return err(res, 422, 'This application is already closed.');
    }
    await runWrite(
      `UPDATE hustle_applications SET status = 'withdrawn', withdrawn_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [app.id]);
    const out = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [app.id]);
    res.json({ application: serializeApplication(out) });
  }));

  // ================================================================ pitches
  // POST /api/hustle/applications/:id/pitch — attach or replace the pitch:
  // social media video link + summary text + K10,000 breakdown.
  router.post('/api/hustle/applications/:id/pitch', ah(auth), hustleApplyLimiter, ah(async (req, res) => {
    const loaded = await loadApplicationForCaller(req, res, parseInt(req.params.id, 10), { adminOk: false });
    if (!loaded) return;
    const { app } = loaded;
    if (!['draft', 'changes_requested'].includes(app.status)) {
      return err(res, 422, 'The pitch can only be changed while the application is a draft or sent back for changes.');
    }
    const b = req.body || {};
    const check = validatePitchVideoUrl(b.video_url);
    if (check.error) return err(res, 422, check.error);
    if (b.pitch_summary !== undefined) {
      await runWrite(
        'UPDATE hustle_applications SET pitch_summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [String(b.pitch_summary).slice(0, PITCH_SUMMARY_MAX_LEN), app.id]);
    }
    if (b.spend_items !== undefined) {
      if (!Array.isArray(b.spend_items)) return err(res, 422, 'Spend breakdown must be a list.');
      const comp = await getCompetition(app.competition_id);
      const spendErr = validateSpendItems(b.spend_items, comp ? comp.prize_kwacha : null);
      if (spendErr) return err(res, 422, spendErr);
      await replaceSpendItems(app.id, b.spend_items);
    }
    const existing = await getOne(
      'SELECT id FROM hustle_pitch_videos WHERE application_id = ?', [app.id]);
    if (existing) {
      await runWrite(
        `UPDATE hustle_pitch_videos SET video_url = ?, video_platform = ?, status = 'pending',
           reviewed_by = NULL, reviewed_at = NULL, review_note = '', uploaded_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE application_id = ?`,
        [check.url, check.platform, req.user.id, app.id]);
    } else {
      await runWrite(
        `INSERT INTO hustle_pitch_videos (application_id, video_url, video_platform, status, uploaded_by)
         VALUES (?, ?, ?, 'pending', ?)`,
        [app.id, check.url, check.platform, req.user.id]);
    }
    const fresh = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [app.id]);
    res.json({
      application: serializeApplication(fresh, {
        pitch_video: await pitchVideoFor(app.id),
        spend_items: await spendItemsFor(app.id),
        photos: await pitchPhotosFor(app.id),
      }),
    });
  }));

  // POST /api/hustle/applications/:id/photos — add a pitch photo (max 5).
  router.post('/api/hustle/applications/:id/photos', ah(auth), hustleApplyLimiter, ah(async (req, res) => {
    const loaded = await loadApplicationForCaller(req, res, parseInt(req.params.id, 10), { adminOk: false });
    if (!loaded) return;
    const { app } = loaded;
    if (!['draft', 'changes_requested'].includes(app.status)) {
      return err(res, 422, 'Photos can only be changed while the application is a draft or sent back for changes.');
    }
    const image = (req.body || {}).image;
    const parsed = parseDataUri(image);
    if (!parsed || !['image/jpeg', 'image/png', 'image/webp'].includes(parsed.mime)) {
      return err(res, 422, 'Each pitch photo must be a JPG, PNG or WebP image.');
    }
    if (String(image).length > PITCH_PHOTO_MAX_LEN) {
      return err(res, 422, 'Each pitch photo must be under about 2 MB. Use a smaller photo.');
    }
    const count = await getOne(
      'SELECT COUNT(*) AS n FROM hustle_pitch_photos WHERE application_id = ?', [app.id]);
    if (Number(count ? count.n : 0) >= MAX_PITCH_PHOTOS) {
      return err(res, 422, `Up to ${MAX_PITCH_PHOTOS} pitch photos per application.`);
    }
    const sortRow = await getOne(
      'SELECT COALESCE(MAX(sort), -1) + 1 AS next_sort FROM hustle_pitch_photos WHERE application_id = ?',
      [app.id]);
    const info = await runWrite(
      'INSERT INTO hustle_pitch_photos (application_id, image, mime, sort) VALUES (?, ?, ?, ?)',
      [app.id, image, parsed.mime, Number(sortRow ? sortRow.next_sort : 0)]);
    const photoId = insertId(info);
    res.status(201).json({
      photo: { id: photoId, url: `/api/hustle/applications/${app.id}/photos/${photoId}`, mime: parsed.mime },
    });
  }));

  // DELETE /api/hustle/applications/:id/photos/:photoId — remove one.
  router.delete('/api/hustle/applications/:id/photos/:photoId', ah(auth), hustleApplyLimiter, ah(async (req, res) => {
    const loaded = await loadApplicationForCaller(req, res, parseInt(req.params.id, 10), { adminOk: false });
    if (!loaded) return;
    const { app } = loaded;
    if (!['draft', 'changes_requested'].includes(app.status)) {
      return err(res, 422, 'Photos can only be changed while the application is a draft or sent back for changes.');
    }
    const photoId = parseInt(req.params.photoId, 10);
    const photo = await getOne(
      'SELECT id FROM hustle_pitch_photos WHERE id = ? AND application_id = ?', [photoId, app.id]);
    if (!photo) return err(res, 404, 'Photo not found.');
    await runWrite('DELETE FROM hustle_pitch_photos WHERE id = ?', [photoId]);
    res.json({ ok: true, id: photoId });
  }));

  // GET /api/hustle/applications/:id/photos/:photoId — serve bytes.
  // Approved entries are public; drafts are owner/rep/admin only.
  router.get('/api/hustle/applications/:id/photos/:photoId', ah(maybeAuth), ah(async (req, res) => {
    const appId = parseInt(req.params.id, 10);
    const photoId = parseInt(req.params.photoId, 10);
    const app = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [appId]);
    if (!app) return err(res, 404, 'Photo not found.');
    if (app.status !== 'approved') {
      if (!req.user) return err(res, 401, 'Sign in required.');
      const acc = await businessAccess(req.user.id, app.business_id);
      if (!acc.role && !isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    }
    const photo = await getOne(
      'SELECT image, mime FROM hustle_pitch_photos WHERE id = ? AND application_id = ?', [photoId, appId]);
    if (!photo) return err(res, 404, 'Photo not found.');
    const parsed = parseDataUri(photo.image);
    if (!parsed) return err(res, 404, 'Photo not found.');
    res.set('Content-Type', photo.mime || parsed.mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(parsed.b64, 'base64'));
  }));

  // ================================================================ votes & entries
  // GET /api/hustle/entries/:applicationId — public entry detail.
  router.get('/api/hustle/entries/:applicationId', ah(maybeAuth), ah(async (req, res) => {
    const appId = parseInt(req.params.applicationId, 10);
    const app = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [appId]);
    if (!app) return err(res, 404, 'Entry not found.');
    const comp = await getCompetition(app.competition_id);
    if (!comp) return err(res, 404, 'Entry not found.');
    if (app.status !== 'approved') {
      // Non-live entries are visible only to their owner/rep/admin.
      if (!req.user) return err(res, 404, 'Entry not found.');
      const acc = await businessAccess(req.user.id, app.business_id);
      if (!acc.role && !isAdmin(req.user)) return err(res, 404, 'Entry not found.');
    }
    const b = await getOne('SELECT * FROM businesses WHERE id = ?', [app.business_id]);
    let voted = false;
    let myVote = null;
    if (req.user) {
      const v = await getOne(
        'SELECT id, application_id FROM hustle_votes WHERE competition_id = ? AND voter_id = ?',
        [comp.id, req.user.id]);
      if (v) { voted = true; myVote = { application_id: Number(v.application_id) }; }
    }
    recordHustleEvent(app.business_id, 'pitch_view', req.user ? req.user.id : null, 'hustle_application', app.id);
    res.json({
      entry: {
        application_id: Number(app.id),
        business: serializeBusinessCard(b),
        pitch_summary: app.pitch_summary || '',
        answers: parseJsonObject(app.answers_json),
        spend_items: await spendItemsFor(app.id),
        pitch_video: await pitchVideoFor(app.id),
        photos: await pitchPhotosFor(app.id),
        vote_count: app.status === 'approved' ? await publicVoteCount(app, comp) : 0,
        status: app.status,
        approved_at: app.approved_at || null,
        competition: serializeCompetition(comp),
        you_have_voted: voted,
        my_vote: myVote,
      },
    });
  }));

  // POST /api/hustle/entries/:applicationId/vote — cast the one vote.
  // The 8 ordered eligibility checks (Architecture 3.2); the write is a
  // single conditional INSERT...SELECT...WHERE NOT EXISTS in one
  // client.batch, so two simultaneous votes from the same voter cannot
  // both land. 409 on duplicate, no partial write. No vote change, no
  // vote withdrawal.
  router.post('/api/hustle/entries/:applicationId/vote', ah(auth), hustleVoteLimiter, ah(async (req, res) => {
    const appId = parseInt(req.params.applicationId, 10);
    const app = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [appId]);
    if (!app) return err(res, 404, 'Entry not found.');
    const comp = await getCompetition(app.competition_id);
    if (!comp) return err(res, 404, 'Entry not found.');
    const now = new Date();
    // 3. Voter is selfie-approved ("verified account").
    if ((req.user.selfie_status || 'pending') !== 'approved') {
      return err(res, 403, 'Only verified accounts can vote. Get your selfie approved first.');
    }
    // 4. Voting period open (early freeze keeps the endpoint live until
    // voting_close_at; those votes are marked after_freeze). The dates
    // rule, not just the status: a competition left on voting_open past
    // its close must still refuse votes.
    const inWindow = votingWindowOpen(comp, now);
    const frozenEarly = comp.status === 'frozen' && inWindow;
    if (!inWindow || (comp.status !== 'voting_open' && !frozenEarly)) {
      const msg = parseSqlUtc(comp.voting_open_at) && now < parseSqlUtc(comp.voting_open_at)
        ? 'Voting is not open yet.'
        : 'Voting has closed.';
      return err(res, 422, msg);
    }
    // 5. Entry is votable: approved, not withdrawn/disqualified.
    if (app.status !== 'approved') {
      return err(res, 422, 'This entry cannot be voted for right now.');
    }
    // 6. Not your own business: owner or active rep.
    const acc = await businessAccess(req.user.id, app.business_id);
    if (acc.role) {
      return err(res, 422, 'You cannot vote for your own business.');
    }
    // 7. Not already voted (friendly pre-check; the UNIQUE constraint
    // and the conditional insert below are the guarantee).
    const prior = await getOne(
      'SELECT id, application_id FROM hustle_votes WHERE competition_id = ? AND voter_id = ?',
      [comp.id, req.user.id]);
    if (prior) return err(res, 409, 'You have already voted in this competition.');
    // (8. Rate limit runs as middleware, before this handler; see header.)
    const afterFreeze = comp.status === 'frozen' ? 1 : 0;
    const ipHash = sha256Hex((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '');
    let inserted = 0;
    try {
      const results = await client.batch([
        { sql: `INSERT INTO hustle_votes
                 (competition_id, application_id, business_id, voter_id,
                  voter_selfie_status_at_vote, ip_hash, after_freeze)
                 SELECT ?, ?, ?, ?, ?, ?, ?
                 WHERE NOT EXISTS (SELECT 1 FROM hustle_votes WHERE voter_id = ? AND competition_id = ?)
                   AND EXISTS (SELECT 1 FROM hustle_applications WHERE id = ? AND status = 'approved')`,
          args: [comp.id, app.id, app.business_id, req.user.id,
            req.user.selfie_status || 'pending', ipHash, afterFreeze,
            req.user.id, comp.id, app.id] },
      ], 'write');
      inserted = Number(results && results[0] ? (results[0].rowsAffected || 0) : 0);
    } catch (e) {
      // UNIQUE (voter_id, competition_id): a concurrent duplicate lost the race.
      if (/UNIQUE constraint failed/i.test(String(e && e.message))) {
        return err(res, 409, 'You have already voted in this competition.');
      }
      throw e;
    }
    if (!inserted) return err(res, 409, 'You have already voted in this competition.');
    const b = await getOne('SELECT name FROM businesses WHERE id = ?', [app.business_id]);
    res.status(201).json({
      ok: true,
      vote: {
        competition_id: Number(comp.id), application_id: Number(app.id),
        business_name: b ? b.name : '',
        after_freeze: !!afterFreeze,
        message: afterFreeze
          ? 'Voting has closed for the public leaderboard; your vote is recorded for the audit record.'
          : 'Thank you! Your vote has been counted.',
      },
    });
  }));

  // GET /api/hustle/entries/:applicationId/my-vote — UI vote state.
  router.get('/api/hustle/entries/:applicationId/my-vote', ah(auth), ah(async (req, res) => {
    const appId = parseInt(req.params.applicationId, 10);
    const app = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [appId]);
    if (!app) return err(res, 404, 'Entry not found.');
    const v = await getOne(
      'SELECT * FROM hustle_votes WHERE competition_id = ? AND voter_id = ?',
      [app.competition_id, req.user.id]);
    res.json({
      voted: !!v,
      vote: v ? {
        application_id: Number(v.application_id), after_freeze: !!v.after_freeze,
        is_valid: !!v.is_valid, created_at: v.created_at,
      } : null,
    });
  }));

  // ================================================================ admin: competitions
  // POST /api/admin/hustle/competitions — create a competition. Dates are
  // data on the row, never hard-coded. No competition row is seeded in
  // db.js init(); the competition is created here.
  router.post('/api/admin/hustle/competitions', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (name.length < 3) return err(res, 422, 'Give the competition a name (3+ characters).');
    const slug = String(b.slug || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) return err(res, 422, 'Give the competition a URL slug, e.g. whats-your-hustle-2026.');
    const prize = Number(b.prize_kwacha);
    if (!Number.isInteger(prize) || prize <= 0) return err(res, 422, 'Prize must be a whole number of Kwacha above 0.');
    const dates = {};
    for (const k of ['applications_open_at', 'applications_close_at', 'voting_open_at', 'voting_close_at', 'freeze_at', 'winner_at']) {
      if (b[k] !== undefined) {
        if (b[k] === '' || b[k] === null) dates[k] = null;
        else {
          const v = toSqlUtc(b[k]);
          if (!v) return err(res, 422, `${k} is not a valid date.`);
          dates[k] = v;
        }
      }
    }
    let eligibility = '{}';
    if (b.eligibility_json !== undefined) {
      eligibility = typeof b.eligibility_json === 'string' ? b.eligibility_json : JSON.stringify(b.eligibility_json);
      try { JSON.parse(eligibility); } catch { return err(res, 422, 'eligibility_json must be valid JSON.'); }
    } else if (b.eligibility !== undefined) {
      eligibility = JSON.stringify(b.eligibility);
    }
    const dup = await getOne('SELECT id FROM hustle_competitions WHERE slug = ?', [slug]);
    if (dup) return err(res, 409, 'A competition already uses that slug.');
    const info = await runWrite(
      `INSERT INTO hustle_competitions
         (name, slug, tagline, description, rules_text, prize_kwacha, prize_currency,
          eligibility_json, applications_open_at, applications_close_at,
          voting_open_at, voting_close_at, freeze_at, winner_at, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
      [name, slug, String(b.tagline || '').slice(0, 200), String(b.description || ''),
       String(b.rules_text || ''), prize, String(b.prize_currency || 'ZMW').slice(0, 10),
       eligibility, dates.applications_open_at ?? null, dates.applications_close_at ?? null,
       dates.voting_open_at ?? null, dates.voting_close_at ?? null,
       dates.freeze_at ?? null, dates.winner_at ?? null, req.user.id]);
    const comp = await getOne('SELECT * FROM hustle_competitions WHERE id = ?', [insertId(info)]);
    logHustleAdmin(req, 'hustle.competition.create', 'hustle_competition', comp.id, `${name} (K${prize.toLocaleString('en-ZM')})`);
    res.status(201).json({ competition: serializeCompetition(comp) });
  }));

  // PATCH /api/admin/hustle/competitions/:id — edit dates/rules before
  // applications open; date changes after opening are logged and
  // announced. Status moves only along the state machine; freeze and
  // finalise have their own endpoints.
  router.patch('/api/admin/hustle/competitions/:id', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const comp = await getCompetition(req.params.id);
    if (!comp) return err(res, 404, 'Competition not found.');
    const b = req.body || {};
    const updates = {};
    const dateChanges = [];
    for (const k of ['applications_open_at', 'applications_close_at', 'voting_open_at', 'voting_close_at', 'freeze_at', 'winner_at']) {
      if (b[k] !== undefined) {
        let v = null;
        if (b[k] !== '' && b[k] !== null) {
          v = toSqlUtc(b[k]);
          if (!v) return err(res, 422, `${k} is not a valid date.`);
        }
        if (v !== comp[k]) {
          updates[k] = v;
          dateChanges.push(`${k}: ${comp[k] || 'unset'} -> ${v || 'unset'}`);
        }
      }
    }
    for (const k of ['name', 'tagline', 'description', 'rules_text']) {
      if (b[k] !== undefined) updates[k] = String(b[k]);
    }
    if (b.prize_kwacha !== undefined) {
      const p = Number(b.prize_kwacha);
      if (!Number.isInteger(p) || p <= 0) return err(res, 422, 'Prize must be a whole number of Kwacha above 0.');
      updates.prize_kwacha = p;
    }
    if (b.prize_currency !== undefined) updates.prize_currency = String(b.prize_currency).slice(0, 10);
    if (b.eligibility_json !== undefined || b.eligibility !== undefined) {
      const raw = b.eligibility_json !== undefined ? b.eligibility_json : b.eligibility;
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
      try { JSON.parse(text); } catch { return err(res, 422, 'eligibility_json must be valid JSON.'); }
      updates.eligibility_json = text;
    }
    if (b.status !== undefined) {
      const next = String(b.status);
      if (!COMPETITION_STATUSES.includes(next)) return err(res, 422, 'Invalid status.');
      if (next !== comp.status) {
        if (next === 'frozen') return err(res, 422, 'Freeze the leaderboard with the freeze endpoint, not a status edit.');
        if (next === 'winner_announced') return err(res, 422, 'Announce the winner with the finalise endpoint, not a status edit.');
        if (!COMPETITION_STATUS_FLOW[comp.status].includes(next)) {
          return err(res, 422, `Cannot move a competition from ${comp.status} to ${next}.`);
        }
        if (next === 'applications_open' && !comp.applications_open_at && !updates.applications_open_at) {
          return err(res, 422, 'Set applications_open_at before opening applications.');
        }
        if (next === 'voting_open' && !comp.voting_open_at && !updates.voting_open_at) {
          return err(res, 422, 'Set voting_open_at before opening voting.');
        }
        updates.status = next;
      }
    }
    if (Object.keys(updates).length) {
      const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
      await runWrite(`UPDATE hustle_competitions SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...Object.values(updates), comp.id]);
      if (dateChanges.length) {
        logHustleAdmin(req, 'hustle.competition.dates', 'hustle_competition', comp.id, dateChanges.join('; ').slice(0, 300));
      }
      if (updates.status) {
        logHustleAdmin(req, 'hustle.competition.status', 'hustle_competition', comp.id, `${comp.name}: ${comp.status} -> ${updates.status}`);
      }
    }
    const fresh = await getOne('SELECT * FROM hustle_competitions WHERE id = ?', [comp.id]);
    res.json({ competition: serializeCompetition(fresh) });
  }));

  // POST /api/admin/hustle/competitions/:id/freeze — freeze the public
  // leaderboard. PERMANENT: there is no unfreeze, ever. Frozen counts
  // are snapshotted into hustle_results.
  router.post('/api/admin/hustle/competitions/:id/freeze', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const comp = await getCompetition(req.params.id);
    if (!comp) return err(res, 404, 'Competition not found.');
    if (['frozen', 'winner_announced', 'archived'].includes(comp.status)) {
      return err(res, 422, 'This leaderboard is already frozen.');
    }
    if (!['voting_open', 'voting_closed'].includes(comp.status)) {
      return err(res, 422, 'Only a competition in voting can be frozen.');
    }
    const rows = await liveLeaderboardRows(comp.id);
    const top = rows.slice(0, LEADERBOARD_TOP);
    const now = nowSql();
    const stmts = [
      { sql: "UPDATE hustle_competitions SET status = 'frozen', freeze_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        args: [now, comp.id] },
    ];
    for (const r of top) {
      stmts.push({
        sql: `INSERT INTO hustle_results (competition_id, application_id, business_id, rank, final_vote_count)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(competition_id, application_id) DO UPDATE SET rank = excluded.rank, final_vote_count = excluded.final_vote_count`,
        args: [comp.id, r.app.id, r.app.business_id, r.rank, r.votes],
      });
    }
    await client.batch(stmts, 'write');
    const summary = top.map((r) => `#${r.rank} ${r.votes}`).join(', ').slice(0, 240);
    logHustleAdmin(req, 'hustle.competition.freeze', 'hustle_competition', comp.id, `${comp.name}: frozen Top ${top.length}${summary ? ' (' + summary + ')' : ''}`);
    logHustleAdmin(req, 'hustle.competition.status', 'hustle_competition', comp.id, `${comp.name}: ${comp.status} -> frozen`);
    const fresh = await getOne('SELECT * FROM hustle_competitions WHERE id = ?', [comp.id]);
    res.json({ competition: serializeCompetition(fresh), frozen: top.map(leaderboardRowJson) });
  }));

  // POST /api/admin/hustle/competitions/:id/finalise — declare the winner
  // after verification. Irreversible, Zac only. The winner is the
  // highest-ranked ELIGIBLE entry, not automatically the highest-ranked
  // entry: business verified, application approved, owner selfie-approved.
  router.post('/api/admin/hustle/competitions/:id/finalise', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const comp = await getCompetition(req.params.id);
    if (!comp) return err(res, 404, 'Competition not found.');
    if (comp.status === 'winner_announced' || comp.status === 'archived') {
      return err(res, 422, 'The winner for this competition has already been announced.');
    }
    if (comp.status !== 'frozen') {
      return err(res, 422, 'Freeze the leaderboard before announcing the winner.');
    }
    const winnerId = parseInt((req.body || {}).winner_application_id ?? (req.body || {}).application_id, 10);
    if (!winnerId) return err(res, 422, 'Choose the winning application.');
    const winnerApp = await getOne(
      'SELECT * FROM hustle_applications WHERE id = ? AND competition_id = ?', [winnerId, comp.id]);
    if (!winnerApp) return err(res, 404, 'Winning application not found in this competition.');
    // Highest-ranked eligible entry among the frozen finalists.
    const finalists = await frozenLeaderboardRows(comp.id);
    let expectedWinner = null;
    for (const f of finalists) {
      const biz = await getOne('SELECT owner_id, verification_status FROM businesses WHERE id = ?', [f.app.business_id]);
      if (!biz || biz.verification_status !== 'verified') continue;
      if (f.app.status !== 'approved') continue;
      const owner = await getOne('SELECT selfie_status FROM users WHERE id = ?', [biz.owner_id]);
      if (!owner || (owner.selfie_status || 'pending') !== 'approved') continue;
      expectedWinner = f;
      break;
    }
    if (!expectedWinner) return err(res, 422, 'No eligible finalist: every finalist fails verification (business, application, or owner selfie).');
    if (Number(expectedWinner.app.id) !== winnerId) {
      return err(res, 422, `The winner must be the highest-ranked eligible entry (application ${expectedWinner.app.id}).`);
    }
    const now = nowSql();
    const stmts = [
      { sql: `UPDATE hustle_results SET is_winner = 1, verified_at = ?, verified_by = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP
              WHERE competition_id = ? AND application_id = ?`,
        args: [now, req.user.id, now, comp.id, winnerId] },
      { sql: `UPDATE hustle_results SET verified_at = ?, verified_by = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP
              WHERE competition_id = ? AND application_id != ?`,
        args: [now, req.user.id, now, comp.id, winnerId] },
      { sql: "UPDATE hustle_competitions SET status = 'winner_announced', winner_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        args: [now, comp.id] },
    ];
    await client.batch(stmts, 'write');
    const winBiz = await getOne('SELECT * FROM businesses WHERE id = ?', [winnerApp.business_id]);
    logHustleAdmin(req, 'hustle.result.publish', 'hustle_result', winnerId,
      `${comp.name}: winner application ${winnerId} (${winBiz ? winBiz.name : ''}), ${finalists.length} finalists`);
    logHustleAdmin(req, 'hustle.competition.status', 'hustle_competition', comp.id, `${comp.name}: frozen -> winner_announced`);
    // Winner: SMS + push + inbox. Everyone else: one announcement row.
    if (winBiz) {
      await notifyBusinessPeople(winBiz.id, 'results_announced',
        'You won What\'s Your Hustle?',
        `Congratulations! ${winBiz.name} won ${comp.name} and the K${Number(comp.prize_kwacha).toLocaleString('en-ZM')} prize. We will be in touch about payment.`,
        { link: '#/hustle', relatedType: 'hustle_competition', relatedId: comp.id, push: true,
          sms: true,
          smsBody: `Congratulations! ${winBiz.name} won ${comp.name} and the K${Number(comp.prize_kwacha).toLocaleString('en-ZM')} prize. We will be in touch about payment.` });
    }
    await runWrite(
      'INSERT INTO hustle_announcements (competition_id, kind, title, body) VALUES (?, ?, ?, ?)',
      [comp.id, 'winner_announced', `Winner announced: ${winBiz ? winBiz.name : ''}`,
       `${winBiz ? winBiz.name : 'The winner'} won ${comp.name}. See the leaderboard for the final results.`]);
    const fresh = await getOne('SELECT * FROM hustle_competitions WHERE id = ?', [comp.id]);
    res.json({
      competition: serializeCompetition(fresh),
      winner_application_id: winnerId,
      business: serializeBusinessCard(winBiz),
    });
  }));

  // PATCH /api/admin/hustle/results/:id/prize — prize payment tracking.
  router.patch('/api/admin/hustle/results/:id/prize', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const id = parseInt(req.params.id, 10);
    const row = await getOne('SELECT * FROM hustle_results WHERE id = ?', [id]);
    if (!row) return err(res, 404, 'Result not found.');
    const b = req.body || {};
    const status = String(b.prize_payment_status || b.status || '');
    if (!['unpaid', 'processing', 'paid', 'failed'].includes(status)) {
      return err(res, 422, 'Prize status must be unpaid, processing, paid or failed.');
    }
    const reference = String(b.prize_payment_reference || b.reference || '').slice(0, 120);
    const method = String(b.prize_payment_method || b.method || '').slice(0, 60);
    if (status === 'paid' && !reference) {
      return err(res, 422, 'Add the payment reference when marking the prize paid.');
    }
    const now = nowSql();
    await runWrite(
      `UPDATE hustle_results SET prize_payment_status = ?, prize_paid_at = ?, prize_payment_reference = ?,
         prize_payment_method = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, status === 'paid' ? now : (status === 'processing' ? row.prize_paid_at : row.prize_paid_at),
       reference || row.prize_payment_reference, method || row.prize_payment_method, id]);
    if (status === 'paid') {
      logHustleAdmin(req, 'hustle.prize.mark_paid', 'hustle_result', id, `Prize paid, reference ${reference}`);
      const biz = await getOne('SELECT id, name FROM businesses WHERE id = ?', [row.business_id]);
      const comp = await getCompetition(row.competition_id);
      const prizeText = comp ? `K${Number(comp.prize_kwacha).toLocaleString('en-ZM')}` : 'The prize';
      if (biz) {
        await notifyBusinessPeople(biz.id, 'prize_paid',
          'Prize paid',
          `${prizeText} prize for ${biz.name} has been paid. Reference ${reference}.`,
          { link: '#/hustle', relatedType: 'hustle_result', relatedId: id, push: true, sms: false });
      }
    } else if (status === 'failed') {
      const reason = String(b.reason || '').slice(0, 300);
      logHustleAdmin(req, 'hustle.prize.mark_failed', 'hustle_result', id, `Prize payment failed${reason ? ': ' + reason : ''}`);
    }
    const fresh = await getOne('SELECT * FROM hustle_results WHERE id = ?', [id]);
    res.json({
      result: {
        id: Number(fresh.id), competition_id: Number(fresh.competition_id),
        application_id: Number(fresh.application_id), business_id: Number(fresh.business_id),
        rank: Number(fresh.rank), final_vote_count: Number(fresh.final_vote_count),
        is_winner: !!fresh.is_winner,
        prize_payment_status: fresh.prize_payment_status,
        prize_paid_at: fresh.prize_paid_at || null,
        prize_payment_reference: fresh.prize_payment_reference || '',
        prize_payment_method: fresh.prize_payment_method || '',
      },
    });
  }));

  // GET /api/admin/hustle/competitions/:id/results — frozen/final result
  // rows, for the prize-payment UI in Competition settings. Empty until
  // the leaderboard is frozen.
  router.get('/api/admin/hustle/competitions/:id/results', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const comp = await getCompetition(req.params.id);
    if (!comp) return err(res, 404, 'Competition not found.');
    const rows = await getAll(
      `SELECT r.*, b.name AS business_name FROM hustle_results r
         JOIN businesses b ON b.id = r.business_id
        WHERE r.competition_id = ? ORDER BY r.rank ASC`,
      [comp.id]);
    res.json({
      competition_id: Number(comp.id),
      results: rows.map((r) => ({
        id: Number(r.id), competition_id: Number(r.competition_id),
        application_id: Number(r.application_id), business_id: Number(r.business_id),
        business_name: r.business_name || '',
        rank: Number(r.rank), final_vote_count: Number(r.final_vote_count),
        is_winner: !!r.is_winner,
        prize_payment_status: r.prize_payment_status,
        prize_paid_at: r.prize_paid_at || null,
        prize_payment_reference: r.prize_payment_reference || '',
        prize_payment_method: r.prize_payment_method || '',
      })),
    });
  }));

  // ================================================================ admin: applications
  // GET /api/admin/hustle/applications?status= — review queue, oldest
  // first, with counts per status.
  router.get('/api/admin/hustle/applications', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const status = String(req.query.status || '');
    const counts = {};
    const countRows = await getAll(
      'SELECT status, COUNT(*) AS n FROM hustle_applications GROUP BY status');
    for (const r of countRows) counts[r.status] = Number(r.n);
    const compId = parseInt(req.query.competition_id, 10) || null;
    const conds = [];
    const params = [];
    if (APPLICATION_STATUSES.includes(status)) { conds.push('a.status = ?'); params.push(status); }
    if (compId) { conds.push('a.competition_id = ?'); params.push(compId); }
    const rows = await getAll(
      `SELECT a.* FROM hustle_applications a
        ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
        ORDER BY a.created_at ASC, a.id ASC LIMIT 200`, params);
    const out = [];
    for (const a of rows) {
      const b = await getOne('SELECT * FROM businesses WHERE id = ?', [a.business_id]);
      const c = await getCompetition(a.competition_id);
      const spend = await spendTotal(a.id);
      out.push(serializeApplication(a, {
        business: serializeBusinessCard(b),
        competition: c ? serializeCompetition(c) : null,
        spend_items: await spendItemsFor(a.id),
        pitch_video: await pitchVideoFor(a.id),
        photos: await pitchPhotosFor(a.id),
        vote_count: a.status === 'approved' ? await voteCountLive(a.id) : 0,
      }));
      out[out.length - 1].spend_total = spend.total;
      out[out.length - 1].spend_count = spend.count;
    }
    res.json({ applications: out, counts });
  }));

  // PATCH /api/admin/hustle/applications/:id — approve / reject /
  // request-changes / mark under review, with a note. Every decision is
  // logged to admin_audit and notified (inbox + push + SMS).
  router.patch('/api/admin/hustle/applications/:id', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const id = parseInt(req.params.id, 10);
    const app = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [id]);
    if (!app) return err(res, 404, 'Application not found.');
    const decision = String((req.body || {}).decision || '');
    if (!['approve', 'reject', 'changes_requested', 'under_review'].includes(decision)) {
      return err(res, 422, 'Decision must be approve, reject, changes_requested or under_review.');
    }
    if (['approved', 'rejected', 'disqualified', 'withdrawn'].includes(app.status)) {
      return err(res, 422, `This application is already ${app.status}.`);
    }
    const note = String((req.body || {}).note || '').trim().slice(0, 300);
    if ((decision === 'reject' || decision === 'changes_requested') && !note) {
      return err(res, 422, 'Add a note so the applicant knows why.', { note: 'Add a note so the applicant knows why.' });
    }
    const comp = await getCompetition(app.competition_id);
    const biz = await getOne('SELECT * FROM businesses WHERE id = ?', [app.business_id]);
    const now = nowSql();
    if (decision === 'approve') {
      // An application cannot become approved while its pitch video is
      // pending or changes_requested (Database section 7).
      const video = await pitchVideoFor(app.id);
      if (video && ['pending', 'changes_requested'].includes(video.status)) {
        return err(res, 422, 'Review the pitch video first: it is still ' + video.status + '.');
      }
      if (biz && biz.verification_status !== 'verified') {
        return err(res, 422, 'The business must be verified before its application can be approved.');
      }
      await runWrite(
        `UPDATE hustle_applications SET status = 'approved', reviewed_by = ?, reviewed_at = ?,
           review_note = ?, approved_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [req.user.id, now, note, now, id]);
      logHustleAdmin(req, 'hustle.application.approve', 'hustle_application', id,
        `${biz ? biz.name : 'Application ' + id} approved for ${comp ? comp.name : ''}`);
      await notifyBusinessPeople(app.business_id, 'application_approved',
        'Application approved',
        `Your application for ${biz ? biz.name : 'your business'} in ${comp ? comp.name : 'the competition'} was approved. It is now live for voting.`,
        { link: '#/hustle/my-entry', relatedType: 'hustle_application', relatedId: id, push: true,
          sms: true, smsBody: `Your application for ${biz ? biz.name : 'your business'} was approved and is now live for voting.` });
    } else if (decision === 'reject') {
      await runWrite(
        `UPDATE hustle_applications SET status = 'rejected', reviewed_by = ?, reviewed_at = ?,
           review_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [req.user.id, now, note, id]);
      logHustleAdmin(req, 'hustle.application.reject', 'hustle_application', id,
        `${biz ? biz.name : 'Application ' + id} rejected${note ? ': ' + note : ''}`);
      await notifyBusinessPeople(app.business_id, 'application_rejected',
        'Application not approved',
        `Your application for ${biz ? biz.name : 'your business'} was not approved. ${note}`,
        { link: '#/hustle/my-entry', relatedType: 'hustle_application', relatedId: id, push: true,
          sms: true, smsBody: `Your application for ${biz ? biz.name : 'your business'} was not approved. Open the app to see why.` });
    } else if (decision === 'changes_requested') {
      await runWrite(
        `UPDATE hustle_applications SET status = 'changes_requested', reviewed_by = ?, reviewed_at = ?,
           review_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [req.user.id, now, note, id]);
      logHustleAdmin(req, 'hustle.application.changes_requested', 'hustle_application', id,
        `${biz ? biz.name : 'Application ' + id} sent back${note ? ': ' + note : ''}`);
      await notifyBusinessPeople(app.business_id, 'application_changes_requested',
        'Changes requested',
        `2911 Jobs asked for changes on your application for ${biz ? biz.name : 'your business'}. ${note}`,
        { link: '#/hustle/my-entry', relatedType: 'hustle_application', relatedId: id, push: true,
          sms: true, smsBody: `2911 Jobs asked for changes on your application for ${biz ? biz.name : 'your business'}. Open the app to see what to fix.` });
    } else {
      await runWrite(
        `UPDATE hustle_applications SET status = 'under_review', reviewed_by = ?, reviewed_at = ?,
           updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [req.user.id, now, id]);
    }
    const fresh = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [id]);
    res.json({ application: serializeApplication(fresh) });
  }));

  // PATCH /api/admin/hustle/pitches/:id — pitch video decision.
  router.patch('/api/admin/hustle/pitches/:id', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const id = parseInt(req.params.id, 10);
    const pitch = await getOne('SELECT * FROM hustle_pitch_videos WHERE id = ?', [id]);
    if (!pitch) return err(res, 404, 'Pitch not found.');
    const decision = String((req.body || {}).decision || '');
    if (!['approved', 'rejected', 'changes_requested'].includes(decision)) {
      return err(res, 422, 'Decision must be approved, rejected or changes_requested.');
    }
    const note = String((req.body || {}).note || '').trim().slice(0, 300);
    if ((decision === 'rejected' || decision === 'changes_requested') && !note) {
      return err(res, 422, 'Add a note so the applicant knows what to fix.', { note: 'Add a note so the applicant knows what to fix.' });
    }
    await runWrite(
      `UPDATE hustle_pitch_videos SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
         review_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [decision, req.user.id, note, id]);
    const action = decision === 'approved' ? 'hustle.pitch.approve'
      : decision === 'rejected' ? 'hustle.pitch.reject' : 'hustle.pitch.changes_requested';
    logAdmin(req, action, 'hustle_pitch_video', id,
      `Pitch video for application ${pitch.application_id}: ${decision}${note ? ' (' + note + ')' : ''}`);
    const app = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [pitch.application_id]);
    const biz = app ? await getOne('SELECT name FROM businesses WHERE id = ?', [app.business_id]) : null;
    const title = decision === 'approved' ? 'Pitch approved'
      : decision === 'rejected' ? 'Pitch rejected' : 'Pitch changes requested';
    const body = decision === 'approved'
      ? `Your pitch video for ${biz ? biz.name : 'your business'} was approved.`
      : `Your pitch video for ${biz ? biz.name : 'your business'} needs changes. ${note}`;
    if (app) {
      await notifyBusinessPeople(app.business_id,
        decision === 'approved' ? 'application_approved' : 'application_changes_requested', title, body, {
        link: '#/hustle/my-entry', relatedType: 'hustle_application', relatedId: app.id, push: true,
        sms: decision !== 'approved',
        smsBody: decision === 'approved'
          ? `Your pitch video for ${biz ? biz.name : 'your business'} was approved.`
          : `Your pitch video for ${biz ? biz.name : 'your business'} needs changes. Open the app to see what to fix.`,
      });
    }
    const fresh = await getOne('SELECT * FROM hustle_pitch_videos WHERE id = ?', [id]);
    res.json({
      pitch: {
        id: Number(fresh.id), application_id: Number(fresh.application_id),
        video_url: fresh.video_url, video_platform: fresh.video_platform,
        status: fresh.status, review_note: fresh.review_note || '',
      },
    });
  }));

  // ================================================================ admin: votes
  // GET /api/admin/hustle/votes — fraud review queue. ?flagged=1 shows
  // only votes with open flags; ?competition_id= scopes it.
  router.get('/api/admin/hustle/votes', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const compId = parseInt(req.query.competition_id, 10) || null;
    const flaggedOnly = String(req.query.flagged || '') === '1';
    const conds = [];
    const params = [];
    if (compId) { conds.push('v.competition_id = ?'); params.push(compId); }
    if (flaggedOnly) {
      conds.push(`EXISTS (SELECT 1 FROM hustle_vote_flags f WHERE f.vote_id = v.id AND f.status IN ('open', 'reviewing'))`);
    }
    const rows = await getAll(
      `SELECT v.*, u.created_at AS voter_created_at, u.selfie_status AS voter_selfie_status
       FROM hustle_votes v JOIN users u ON u.id = v.voter_id
       ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
       ORDER BY v.created_at DESC, v.id DESC LIMIT 200`, params);
    const out = [];
    for (const v of rows) {
      const flags = await getAll(
        'SELECT * FROM hustle_vote_flags WHERE vote_id = ? ORDER BY created_at DESC, id DESC', [v.id]);
      const biz = await getOne('SELECT name, slug FROM businesses WHERE id = ?', [v.business_id]);
      out.push({
        id: Number(v.id), competition_id: Number(v.competition_id),
        application_id: Number(v.application_id), business_id: Number(v.business_id),
        business_name: biz ? biz.name : '',
        voter_id: Number(v.voter_id),
        voter_created_at: v.voter_created_at,
        voter_selfie_status: v.voter_selfie_status,
        voter_selfie_status_at_vote: v.voter_selfie_status_at_vote,
        after_freeze: !!v.after_freeze, is_valid: !!v.is_valid,
        invalidated_by: v.invalidated_by == null ? null : Number(v.invalidated_by),
        invalidated_at: v.invalidated_at || null,
        invalidation_reason: v.invalidation_reason || '',
        created_at: v.created_at,
        flags: flags.map((f) => ({
          id: Number(f.id), reason: f.reason, detector: f.detector, status: f.status,
          resolution: f.resolution || '', created_at: f.created_at,
        })),
      });
    }
    res.json({ votes: out });
  }));

  // PATCH /api/admin/hustle/votes/:id/flag — flag, clear, invalidate or
  // restore a vote, with a reason. Never deletes a vote.
  router.patch('/api/admin/hustle/votes/:id/flag', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const id = parseInt(req.params.id, 10);
    const vote = await getOne('SELECT * FROM hustle_votes WHERE id = ?', [id]);
    if (!vote) return err(res, 404, 'Vote not found.');
    const b = req.body || {};
    const action = String(b.action || '');
    if (!['flag', 'clear', 'invalidate', 'restore'].includes(action)) {
      return err(res, 422, 'Action must be flag, clear, invalidate or restore.');
    }
    const reason = String(b.reason || '').trim().slice(0, 300);
    if (action === 'flag') {
      if (!reason) return err(res, 422, 'Give a reason for the flag.');
      const detector = String(b.detector || 'manual_report').slice(0, 60);
      await runWrite(
        `INSERT INTO hustle_vote_flags (vote_id, voter_id, application_id, competition_id, reason, detector)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [vote.id, vote.voter_id, vote.application_id, vote.competition_id, reason, detector]);
      res.json({ ok: true, vote_id: id, action: 'flagged' });
      return;
    }
    if (action === 'clear') {
      await runWrite(
        `UPDATE hustle_vote_flags SET status = 'dismissed', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
           resolution = ?, updated_at = CURRENT_TIMESTAMP
         WHERE vote_id = ? AND status IN ('open', 'reviewing')`,
        [req.user.id, reason || 'Flag cleared by admin.', id]);
      res.json({ ok: true, vote_id: id, action: 'cleared' });
      return;
    }
    if (action === 'invalidate') {
      if (!reason) return err(res, 422, 'Give a reason for invalidating this vote.');
      await client.batch([
        { sql: `UPDATE hustle_votes SET is_valid = 0, invalidated_by = ?, invalidated_at = CURRENT_TIMESTAMP,
                 invalidation_reason = ? WHERE id = ?`,
          args: [req.user.id, reason, id] },
        { sql: `UPDATE hustle_vote_flags SET status = 'confirmed_fraud', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
                 resolution = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE vote_id = ? AND status IN ('open', 'reviewing')`,
          args: [req.user.id, reason, id] },
      ], 'write');
      logHustleAdmin(req, 'hustle.vote.invalidate', 'hustle_vote', id, `Vote ${id} invalidated: ${reason}`);
      res.json({ ok: true, vote_id: id, action: 'invalidated' });
      return;
    }
    // restore
    if (!reason) return err(res, 422, 'Give a reason for restoring this vote.');
    await runWrite(
      `UPDATE hustle_votes SET is_valid = 1, invalidated_by = NULL, invalidated_at = NULL,
         invalidation_reason = '' WHERE id = ?`,
      [id]);
    logHustleAdmin(req, 'hustle.vote.restore', 'hustle_vote', id, `Vote ${id} restored: ${reason}`);
    res.json({ ok: true, vote_id: id, action: 'restored' });
  }));

  // POST /api/admin/hustle/entries/:applicationId/disqualify — removes
  // the entry from voting and the leaderboard, keeps the record.
  router.post('/api/admin/hustle/entries/:applicationId/disqualify', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const appId = parseInt(req.params.applicationId, 10);
    const app = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [appId]);
    if (!app) return err(res, 404, 'Entry not found.');
    if (app.status === 'disqualified') return err(res, 422, 'This entry is already disqualified.');
    if (app.status !== 'approved') return err(res, 422, 'Only a live (approved) entry can be disqualified.');
    const reason = String((req.body || {}).reason || '').trim();
    if (!reason) return err(res, 422, 'Give a reason for disqualification.');
    await runWrite(
      `UPDATE hustle_applications SET status = 'disqualified', disqualified_reason = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [reason.slice(0, 300), appId]);
    logHustleAdmin(req, 'hustle.application.disqualify', 'hustle_application', appId, `Entry ${appId} disqualified: ${reason.slice(0, 300)}`);
    await notifyBusinessPeople(app.business_id, 'application_disqualified',
      'Entry disqualified',
      `Your entry in What's Your Hustle? was disqualified. ${reason.slice(0, 200)}`,
      { link: '#/hustle/my-entry', relatedType: 'hustle_application', relatedId: appId, push: true, sms: false });
    const fresh = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [appId]);
    res.json({ application: serializeApplication(fresh) });
  }));

  // POST /api/admin/hustle/entries/:applicationId/reinstate — reverse a
  // disqualification, with a reason. Votes cast while disqualified were
  // never recorded, so there is nothing to restore.
  router.post('/api/admin/hustle/entries/:applicationId/reinstate', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const appId = parseInt(req.params.applicationId, 10);
    const app = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [appId]);
    if (!app) return err(res, 404, 'Entry not found.');
    if (app.status !== 'disqualified') return err(res, 422, 'Only a disqualified entry can be reinstated.');
    const reason = String((req.body || {}).reason || '').trim();
    if (!reason) return err(res, 422, 'Give a reason for reinstating this entry.');
    await runWrite(
      `UPDATE hustle_applications SET status = 'approved', disqualified_reason = '', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [appId]);
    logHustleAdmin(req, 'hustle.application.reinstate', 'hustle_application', appId, `Entry ${appId} reinstated: ${reason.slice(0, 300)}`);
    const fresh = await getOne('SELECT * FROM hustle_applications WHERE id = ?', [appId]);
    res.json({ application: serializeApplication(fresh) });
  }));

  // GET /api/admin/hustle/competitions/:id/export — CSV on demand:
  // entries, vote totals, flagged votes, winner record. No voter phone
  // numbers, voter id only (the admin can look up the account).
  router.get('/api/admin/hustle/competitions/:id/export', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const comp = await getCompetition(req.params.id);
    if (!comp) return err(res, 404, 'Competition not found.');
    const csvCell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [];
    lines.push('section,application_id,business_id,business_name,status,vote_count,flagged_votes');
    const apps = await getAll(
      `SELECT a.*, b.name AS business_name FROM hustle_applications a
        JOIN businesses b ON b.id = a.business_id
        WHERE a.competition_id = ? ORDER BY a.id`, [comp.id]);
    for (const a of apps) {
      const votes = await voteCountLive(a.id);
      const flags = await getOne(
        `SELECT COUNT(*) AS n FROM hustle_vote_flags f JOIN hustle_votes v ON v.id = f.vote_id
          WHERE v.application_id = ? AND f.status IN ('open', 'reviewing')`, [a.id]);
      lines.push(['entry', a.id, a.business_id, a.business_name, a.status, votes, Number(flags ? flags.n : 0)]
        .map(csvCell).join(','));
    }
    lines.push('');
    lines.push('section,vote_id,voter_id,application_id,created_at,is_valid,after_freeze');
    const votes = await getAll(
      'SELECT * FROM hustle_votes WHERE competition_id = ? ORDER BY created_at, id', [comp.id]);
    for (const v of votes) {
      lines.push(['vote', v.id, v.voter_id, v.application_id, v.created_at, v.is_valid, v.after_freeze]
        .map(csvCell).join(','));
    }
    lines.push('');
    lines.push('section,rank,application_id,business_id,final_vote_count,is_winner,prize_payment_status');
    const results = await getAll(
      'SELECT * FROM hustle_results WHERE competition_id = ? ORDER BY rank', [comp.id]);
    for (const r of results) {
      lines.push(['result', r.rank, r.application_id, r.business_id, r.final_vote_count, r.is_winner, r.prize_payment_status]
        .map(csvCell).join(','));
    }
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="hustle-${comp.slug}-export.csv"`);
    res.send(lines.join('\n') + '\n');
  }));

  // GET /api/admin/hustle/stats — counts only.
  router.get('/api/admin/hustle/stats', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const appCounts = {};
    for (const r of await getAll('SELECT status, COUNT(*) AS n FROM hustle_applications GROUP BY status')) {
      appCounts[r.status] = Number(r.n);
    }
    const votes = await getOne('SELECT COUNT(*) AS total, SUM(is_valid) AS valid, COUNT(DISTINCT voter_id) AS voters FROM hustle_votes');
    const flags = await getOne("SELECT COUNT(*) AS n FROM hustle_vote_flags WHERE status IN ('open', 'reviewing')");
    const views = await getOne("SELECT COUNT(*) AS n FROM hustle_events WHERE event_type = 'storefront_view'");
    const comps = await getOne('SELECT COUNT(*) AS n FROM hustle_competitions');
    const biz = await getOne('SELECT COUNT(*) AS n FROM businesses');
    res.json({
      stats: {
        applications_by_status: appCounts,
        votes_cast: Number(votes ? votes.total : 0),
        valid_votes: Number(votes ? votes.valid : 0),
        voters: Number(votes ? votes.voters : 0),
        flagged_votes_open: Number(flags ? flags.n : 0),
        storefront_views: Number(views ? views.n : 0),
        competitions: Number(comps ? comps.n : 0),
        businesses: Number(biz ? biz.n : 0),
      },
    });
  }));

  // POST /api/admin/hustle/announcements — ONE row per announcement
  // (no per-user fan-out). The inbox shows it to every member by union.
  router.post('/api/admin/hustle/announcements', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const b = req.body || {};
    const kind = String(b.kind || '');
    if (!ANNOUNCEMENT_KINDS.includes(kind)) {
      return err(res, 422, 'Kind must be one of: ' + ANNOUNCEMENT_KINDS.join(', ') + '.');
    }
    const title = String(b.title || '').trim();
    const body = String(b.body || '').trim();
    if (!title) return err(res, 422, 'Give the announcement a title.');
    if (!body) return err(res, 422, 'Give the announcement a body.');
    const compId = b.competition_id ? parseInt(b.competition_id, 10) : null;
    if (compId) {
      const comp = await getCompetition(compId);
      if (!comp) return err(res, 404, 'Competition not found.');
    }
    const info = await runWrite(
      'INSERT INTO hustle_announcements (competition_id, kind, title, body) VALUES (?, ?, ?, ?)',
      [compId, kind, title.slice(0, 120), body.slice(0, 1000)]);
    const row = await getOne('SELECT * FROM hustle_announcements WHERE id = ?', [insertId(info)]);
    res.status(201).json({
      announcement: {
        id: Number(row.id), competition_id: row.competition_id == null ? null : Number(row.competition_id),
        kind: row.kind, title: row.title, body: row.body, created_at: row.created_at,
      },
    });
  }));

  // ================================================================ notifications
  // GET /api/hustle/notifications — inbox list, newest first, paginated.
  // Union of the member's own rows and the shared announcements.
  router.get('/api/hustle/notifications', ah(auth), ah(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || String(NOTIF_PAGE_SIZE), 10) || NOTIF_PAGE_SIZE));
    const offset = (page - 1) * limit;
    const rows = await getAll(
      `SELECT id, kind, title, body, link, related_type, related_id, read_at, sent_via, created_at, 0 AS is_announcement
         FROM hustle_notifications WHERE user_id = ?
       UNION ALL
       SELECT id, kind, title, body, '' AS link, 'hustle_competition' AS related_type,
              competition_id AS related_id, NULL AS read_at, 'in_app' AS sent_via, created_at, 1 AS is_announcement
         FROM hustle_announcements
       ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset]);
    const totalRow = await getOne(
      `SELECT (SELECT COUNT(*) FROM hustle_notifications WHERE user_id = ?)
              + (SELECT COUNT(*) FROM hustle_announcements) AS n`,
      [req.user.id]);
    res.json({
      notifications: rows.map(serializeNotification),
      page, total: Number(totalRow ? totalRow.n : 0),
      totalPages: Math.max(1, Math.ceil(Number(totalRow ? totalRow.n : 0) / limit)),
    });
  }));

  // GET /api/hustle/notifications/unread-count — unread badge count.
  // Counts personal inbox rows only (announcements have no per-user
  // read state by design).
  router.get('/api/hustle/notifications/unread-count', ah(auth), ah(async (req, res) => {
    const r = await getOne(
      'SELECT COUNT(*) AS n FROM hustle_notifications WHERE user_id = ? AND read_at IS NULL',
      [req.user.id]);
    res.json({ unread_count: Number(r ? r.n : 0) });
  }));

  // POST /api/hustle/notifications/read-all — mark all own rows read.
  // Registered before /:id/read so 'read-all' is never read as an id.
  router.post('/api/hustle/notifications/read-all', ah(auth), ah(async (req, res) => {
    await runWrite(
      "UPDATE hustle_notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL",
      [req.user.id]);
    res.json({ ok: true });
  }));

  // POST /api/hustle/notifications/:id/read — mark one read.
  router.post('/api/hustle/notifications/:id/read', ah(auth), ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return err(res, 404, 'Notification not found.');
    const row = await getOne(
      'SELECT id FROM hustle_notifications WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!row) return err(res, 404, 'Notification not found.');
    await runWrite(
      'UPDATE hustle_notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    res.json({ ok: true, id });
  }));

  // ================================================================ analytics
  // GET /api/hustle/analytics/:businessId — owner analytics for one
  // storefront. Counts come from hustle_events rows only (plus the live
  // vote total, which is COUNT(*) over hustle_votes). A metric with no
  // events shows 0, never a made-up number.
  router.get('/api/hustle/analytics/:businessId', ah(auth), ah(async (req, res) => {
    const businessId = parseInt(req.params.businessId, 10);
    const acc = await businessAccess(req.user.id, businessId);
    if (!acc.business) return err(res, 404, 'Business not found.');
    if (!acc.role && !isAdmin(req.user)) return err(res, 403, 'Only the owner or its representative can see this analytics.');
    const byType = await getAll(
      `SELECT event_type, COUNT(*) AS n FROM hustle_events
        WHERE business_id = ? GROUP BY event_type`,
      [businessId]);
    const counts = {};
    for (const r of byType) counts[r.event_type] = Number(r.n);
    const daily = await getAll(
      `SELECT date(created_at, '+2 hours') AS day, event_type, COUNT(*) AS n
         FROM hustle_events WHERE business_id = ? AND created_at >= date('now', '-30 days')
         GROUP BY day, event_type ORDER BY day DESC`,
      [businessId]);
    const apps = await getAll(
      'SELECT id, status FROM hustle_applications WHERE business_id = ?', [businessId]);
    let votes = 0;
    for (const a of apps) {
      if (a.status === 'approved') votes += await voteCountLive(a.id);
    }
    const followers = await getOne(
      'SELECT COUNT(*) AS n FROM business_follows WHERE business_id = ?', [businessId]);
    res.json({
      business_id: businessId,
      counts: {
        storefront_view: counts.storefront_view || 0,
        product_view: counts.product_view || 0,
        contact_click: counts.contact_click || 0,
        whatsapp_click: counts.whatsapp_click || 0,
        pitch_view: counts.pitch_view || 0,
        application_view: counts.application_view || 0,
      },
      votes: votes,
      followers: Number(followers ? followers.n : 0),
      daily: daily.map((d) => ({ day: d.day, event_type: d.event_type, count: Number(d.n) })),
      applications: apps.map((a) => ({ id: Number(a.id), status: a.status })),
    });
  }));

  return router;
}

module.exports = createHustleRouter;

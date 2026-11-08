'use strict';
/**
 * 2911 Experiences — public browse API (Phase 2 backend) + host
 * onboarding, verification and listing management (Phase 3 backend).
 *
 * Module split (coordinator decision, Nov 8, 2026): this router module is
 * mounted from server.js and shares the existing auth, maybeAuth, ah, err,
 * runWrite, getOne, getAll, listCache, isAdmin, isSupport, logAdmin,
 * CITIES, productLimiter and expHostLimiter helpers via the factory deps.
 * It must not change any existing route's behaviour.
 *
 * Phase 3 (Nov 8, 2026): host application (individual), verification
 * documents, business opt-in, business staff (manager/staff only),
 * listing create/edit/photos/submit, host dashboard, and admin
 * host/document/listing decisions. No payments code, no checkout, no
 * experience_reviews / experience_messages tables (Phases 4-5).
 *
 * Phase 3 decisions recorded here (not revisited without Zac):
 * - host_id is an experience_hosts.id (Phase 3 migration), NOT a user id.
 *   Every host join goes listings.host_id -> experience_hosts.id ->
 *   experience_hosts.user_id -> users.id. Display name and avatar come
 *   from users; bio and city come from experience_hosts.
 * - Base64 media in the shared Turso DB; photo cap 8 per listing (the
 *   item that changes if object storage is chosen later); max price
 *   K10,000,000; six categories; no sixth tab (Zac's provisional
 *   defaults, Nov 8, 2026).
 * - Verification documents accept JPEG/PNG/WebP images AND PDF
 *   (DEVIATION: Architecture 7.3 allowlist was images-only, but UI Spec
 *   6.1 step 4 requires image or PDF). Data URI cap 2,500,000 chars
 *   (same as the business PACRA cert cap); max 10 documents per host
 *   side (build decision). Document reads are logged to
 *   experience_document_views; a stranger reading a document gets 404.
 * - No SMS is sent for staff invites in Phase 3 (DEVIATION: UI Spec
 *   7.2.7 invite-and-accept shape is honoured in-app via
 *   GET /host/invites + accept/decline, but no SMS goes out).
 * - No separate POST /:id/publish endpoint (DEVIATION from Architecture
 *   1.2): submit is the publish path for new listings (admin approval
 *   still required) and PATCH keeps approved listings live.
 * - Listing location_id is resolved from the city by matching a
 *   town-level experience_locations row when one exists, else NULL.
 * - Moving a listing between individual and business host sides is NOT
 *   built in Phase 3 (deferred; Architecture 2.2 attach rule needs it).
 * - Staff roles are manager/staff only (DB Design 2.1). The Architecture
 *   2.3 owner/manager/agent/viewer set plus scope column is NOT built;
 *   pending Zac's confirmation.
 * - Payout reference is NEVER returned in full by any GET; only a masked
 *   form ("MTN Mobile Money, ending 123"). The owner re-enters the full
 *   value to change it. The provider word (MTN/Airtel/Zamtel) is inferred
 *   from the number prefix (076/077 MTN, 096/097 Airtel, 075/095 Zamtel).
 * - Rate limits reuse the existing limiters: productLimiter (40/hr) for
 *   listing creation and photo uploads, and a dedicated expHostLimiter
 *   (20/hr, same policy as businessLimiter) for host application,
 *   document upload and business opt-in. The dedicated bucket exists
 *   because the shared businessLimiter budget is consumed by POST
 *   /api/businesses validation traffic; sharing it throttled host
 *   onboarding in the API suite. No other new limiter.
 * - Error shape follows the existing err helper ({ error, fields? }).
 *
 * Coordinator decisions recorded here (not revisited):
 * - Table prefix experience_ (DB Design).
 * - Amenities are JSON text (DB Design left CSV vs JSON open; JSON chosen).
 * - Photo cap 8 per listing (provisional, DB Design 2.3). Photo upload
 *   endpoints are Phase 3; the media-storage decision (base64 vs object
 *   storage) is still pending with Zac, so the media table follows the
 *   existing base64 pattern (same as product_photos / job_photos) and
 *   nothing here assumes object storage.
 * - Price bound K10,000,000 maximum (provisional, product bound).
 *   Still pending Zac's decision.
 * - Category seed (provisional): the UI Spec's six launch categories
 *   (Tours, Stays, Transport, Adventure, Cultural, Events) mapped to the
 *   DB Design kind values (tour, stay, transport, experience, experience,
 *   event). The DB Design 21-item seed list is a pending Zac decision;
 *   categories are admin-managed data, so the seed can change without a
 *   migration.
 *
 * Public-read rules (DB Design 4.3): signed-out users can browse and
 * search. No phone numbers and no host documents appear in any public
 * response. Prices are integer ZMW. No rating is shown where there are no
 * reviews (rating_avg is null, rating_count 0) until the Phase 5 reviews
 * table exists.
 *
 * Destination-first search with NO radius (Implementation Plan Phase 2):
 * the jobs 50 km default radius must NOT be inherited. A guest searching
 * Livingstone from Lusaka is ~470 km away and must still see results.
 * Optional viewer lat/lng only annotates distance_km; it never filters.
 */
const express = require('express');
const { parseLatLng, haversineKm } = require('../geo');

// Zambia bounding box (DB Design 3.3): roughly lat -8 to -18.5,
// lng 21.5 to 34. APPROXIMATE, not a surveyed border; the exact box is
// still to be confirmed against a named source (DB Design Appendix B).
// Country/province seed coordinates are likewise approximate.
const ZAMBIA_BOUNDS = { minLat: -18.5, maxLat: -8, minLng: 21.5, maxLng: 34 };
function isInZambia(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= ZAMBIA_BOUNDS.minLat && lat <= ZAMBIA_BOUNDS.maxLat
    && lng >= ZAMBIA_BOUNDS.minLng && lng <= ZAMBIA_BOUNDS.maxLng;
}

// Provisional caps/bounds (coordinator decisions, pending Zac).
const EXP_PRICE_MAX = 10000000; // K10,000,000, the product bound.
const EXP_PRICE_MIN = 0; // Events may be free ("Free", not "ZMW 0").
const EXP_MAX_PHOTOS = 8; // per listing, DB Design 2.3.
const EXP_PRICE_UNITS = ['per_person', 'per_group', 'per_night', 'per_day', 'per_hour', 'per_trip', 'per_event', 'quote'];
const EXP_CANCELLATION_POLICIES = ['Flexible', 'Moderate', 'Strict', 'Event'];
const EXP_SORTS = ['recommended', 'newest', 'price_low', 'price_high', 'rating'];
const EXP_LISTING_TYPES = ['stay', 'vehicle', 'tour', 'event', 'experience'];
const EXP_HOST_STATUSES = ['draft', 'submitted', 'under_review', 'additional_info', 'approved', 'rejected', 'suspended'];
const EXP_DOC_KINDS = ['nrc', 'passport', 'drivers_licence', 'tourism_licence', 'selfie', 'other'];
const EXP_DOC_MAX = 10; // documents per host side (build decision, Phase 3).
const EXP_DOC_MAX_LEN = 2500000; // data URI chars, same as the business PACRA cert cap.
const EXP_PAYOUT_METHODS = ['', 'mobile_money', 'bank'];
const EXP_PROPERTY_TYPES = ['hotel', 'lodge', 'guesthouse', 'homestay', 'campsite', 'apartment'];
const EXP_VEHICLE_TYPES = ['sedan', 'suv', 'minibus', 'bus', 'truck', 'motorbike', 'other'];
const EXP_UNIT_TYPES = ['room', 'bed', 'tent', 'house', 'dorm_bed'];
const LIST_LIMIT_DEFAULT = 20;
const LIST_LIMIT_MAX = 20;
const CANDIDATE_CAP = 500;

function createExperiencesRouter(deps) {
  const { ah, err, maybeAuth, getOne, getAll, runWrite, listCache,
    auth, isAdmin, isSupport, logAdmin, CITIES, productLimiter, expHostLimiter } = deps;
  const router = express.Router();

  // lastInsertRowid comes back as a BigInt from libsql — normalise.
  function insertId(result) { return Number(result.lastInsertRowid); }

  // ------------------------------------------------------------ helpers
  // Parse a JSON-text list column (amenities, inclusions, exclusions).
  // Defensive: bad JSON or an empty value yields an empty list, never a
  // crash; a non-JSON value is returned as a single item.
  function parseJsonList(value) {
    if (value == null) return [];
    const s = String(value).trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [String(parsed)];
    } catch {
      return [s];
    }
  }

  // Parse a JSON-text array column (languages, provinces). Bad JSON
  // yields an empty list, never a crash.
  function parseJsonArray(value) {
    if (Array.isArray(value)) return value.map((x) => String(x));
    if (value == null) return [];
    try {
      const parsed = JSON.parse(String(value));
      return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
    } catch {
      return [];
    }
  }

  // Masked payout reference for GET responses. The full reference is
  // NEVER returned; the owner re-enters it to change it. The provider
  // word is inferred from the Zambian mobile prefix (076/077 MTN,
  // 096/097 Airtel, 075/095 Zamtel); anything else is plain Mobile Money.
  function maskPayout(method, ref) {
    const r = String(ref || '').trim();
    if (!r) return '';
    const tail = r.slice(-3);
    if (method === 'mobile_money') {
      const d = r.replace(/\D/g, '');
      let core = d;
      if (core.startsWith('260')) core = core.slice(3);
      else if (core.startsWith('0')) core = core.slice(1);
      const p = core.slice(0, 2);
      const prov = (p === '96' || p === '97') ? 'Airtel'
        : (p === '76' || p === '77') ? 'MTN'
        : (p === '95' || p === '75') ? 'Zamtel' : '';
      return (prov ? prov + ' Mobile Money' : 'Mobile Money') + ', ending ' + tail;
    }
    if (method === 'bank') return 'Bank transfer, ending ' + tail;
    return 'Ending ' + tail;
  }

  // Owner-only host profile shape. payout_reference is masked, never full.
  function serializeHost(h) {
    if (!h) return null;
    return {
      id: Number(h.id), account_type: 'individual', user_id: Number(h.user_id),
      display_name: h.display_name || '', bio: h.bio || '',
      languages: parseJsonArray(h.languages), response_time: h.response_time || '',
      phone_public: h.phone_public || '', city: h.city || '', area: h.area || '',
      meeting_point: h.meeting_point || '', provinces: parseJsonArray(h.provinces),
      status: h.status, verification_status: h.verification_status,
      verification_note: h.verification_note || '',
      payout_method: h.payout_method || '',
      payout_reference_masked: maskPayout(h.payout_method, h.payout_reference),
      created_at: h.created_at, updated_at: h.updated_at,
    };
  }

  // Business opt-in link shape. verification_status comes from the
  // storefront businesses row, not the link row.
  async function serializeBusinessLink(link) {
    const b = await getOne(
      'SELECT id, owner_id, name, slug, city, verification_status FROM businesses WHERE id = ?',
      [link.business_id]);
    return {
      id: Number(link.id), account_type: 'business', business_id: Number(link.business_id),
      business_name: b ? b.name : '', business_slug: b ? b.slug : '',
      business_city: b ? b.city : '',
      verification_status: b ? b.verification_status : '',
      experiences_status: link.experiences_status,
      payout_method: link.payout_method || '',
      payout_reference_masked: maskPayout(link.payout_method, link.payout_reference),
      commission_rate_override: link.commission_rate_override == null
        ? null : Number(link.commission_rate_override),
    };
  }

  // Experience business links visible to a user: businesses they own, or
  // where they are an active manager/staff member.
  async function businessLinksForUser(userId) {
    const rows = await getAll(
      `SELECT eb.* FROM experience_businesses eb JOIN businesses b ON b.id = eb.business_id
       WHERE b.owner_id = ?
          OR EXISTS (SELECT 1 FROM experience_business_staff s
                     WHERE s.business_id = eb.business_id AND s.user_id = ? AND s.status = 'active')
       ORDER BY eb.id`,
      [userId, userId]);
    const out = [];
    for (const r of rows) out.push(await serializeBusinessLink(r));
    return out;
  }

  // Business ids a user can act for in Experiences: owned, or active staff.
  async function myExperienceBusinessIds(userId) {
    const rows = await getAll(
      `SELECT b.id FROM businesses b WHERE b.owner_id = ?
          OR EXISTS (SELECT 1 FROM experience_business_staff s
                     WHERE s.business_id = b.id AND s.user_id = ? AND s.status = 'active')`,
      [userId, userId]);
    return rows.map((r) => Number(r.id));
  }

  // The caller's individual host row, if any.
  async function myHost(userId) {
    return getOne('SELECT * FROM experience_hosts WHERE user_id = ?', [userId]);
  }

  // A user's role for one business: 'owner', 'manager', 'staff', or null.
  // Only an ACTIVE staff row counts; invited/revoked rows grant nothing.
  async function businessAccess(userId, businessId) {
    const b = await getOne('SELECT * FROM businesses WHERE id = ?', [businessId]);
    if (!b) return { business: null, role: null };
    if (Number(b.owner_id) === Number(userId)) return { business: b, role: 'owner' };
    const s = await getOne(
      "SELECT * FROM experience_business_staff WHERE business_id = ? AND user_id = ? AND status = 'active'",
      [businessId, userId]);
    return { business: b, role: s ? s.role : null };
  }

  // A user's access to one listing: 'owner' (individual host owner or
  // business owner), 'manager', 'staff', or null.
  async function listingAccess(userId, listing) {
    if (listing.host_id != null) {
      const h = await getOne('SELECT user_id FROM experience_hosts WHERE id = ?', [listing.host_id]);
      if (h && Number(h.user_id) === Number(userId)) return 'owner';
      return null;
    }
    if (listing.business_id != null) {
      const a = await businessAccess(userId, listing.business_id);
      return a.role;
    }
    return null;
  }

  // The caller's own verification documents (individual + businesses they
  // own or actively staff), newest first. Never includes image data.
  function serializeDoc(d) {
    return {
      id: Number(d.id), host_id: d.host_id == null ? null : Number(d.host_id),
      business_id: d.business_id == null ? null : Number(d.business_id),
      submitted_by: Number(d.submitted_by), kind: d.kind, status: d.status,
      review_note: d.review_note || '', expires_at: d.expires_at || null,
      created_at: d.created_at,
    };
  }
  async function myDocs(userId) {
    const h = await myHost(userId);
    const bizIds = await myExperienceBusinessIds(userId);
    const conds = [];
    const params = [];
    if (h) { conds.push('host_id = ?'); params.push(h.id); }
    if (bizIds.length) {
      conds.push(`business_id IN (${bizIds.map(() => '?').join(',')})`);
      params.push(...bizIds);
    }
    if (!conds.length) return [];
    const rows = await getAll(
      `SELECT * FROM experience_host_verifications WHERE ${conds.join(' OR ')} ORDER BY created_at DESC, id DESC`,
      params);
    return rows.map(serializeDoc);
  }

  // Parse a data URI into { mime, b64 }, or null when malformed.
  function parseDataUri(s) {
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(String(s || ''));
    if (!m) return null;
    return { mime: m[1], b64: m[2] };
  }

  // Find a user by phone, trying the stored E.164 form and the common
  // Zambian input forms (097..., +26097..., 26097...).
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

  // Resolve a listing's location_id from its city: the town-level
  // experience_locations row when one exists, else NULL.
  async function resolveLocationId(city) {
    const r = await getOne(
      "SELECT id FROM experience_locations WHERE level = 'town' AND name = ? AND active = 1",
      [city]);
    return r ? Number(r.id) : null;
  }

  function fmtChainDisplay(level, name) {
    if (level === 'district') return name + ' District';
    if (level === 'province') return name + ' Province';
    return name;
  }

  // Full ancestor chain for one location row, from a pre-fetched map
  // (id -> row). Returns { chain, ancestors }: chain is the display
  // string the UI shows ("Mfuwe, Mambwe District, Eastern Province"),
  // ancestors are the rows above the location, top-down (country first).
  function locationChain(loc, byId) {
    const ancestors = [];
    const seen = new Set();
    let cur = loc;
    let hops = 0;
    while (cur && cur.parent_id != null && hops < 5 && !seen.has(cur.id)) {
      seen.add(cur.id);
      const parent = byId.get(Number(cur.parent_id));
      if (!parent) break;
      ancestors.unshift(parent);
      cur = parent;
      hops++;
    }
    const parts = [loc.name];
    for (const a of ancestors.slice().reverse()) {
      if (a.level === 'country') continue;
      parts.push(fmtChainDisplay(a.level, a.name));
    }
    return { chain: parts.join(', '), ancestors: ancestors.map((a) => ({ id: Number(a.id), level: a.level, name: a.name })) };
  }

  async function loadLocationMap() {
    const rows = await getAll('SELECT id, parent_id, level, name, slug, lat, lng FROM experience_locations WHERE active = 1');
    return new Map(rows.map((r) => [Number(r.id), r]));
  }

  // All descendant ids of the given location ids (inclusive), from a map.
  function descendantIds(seedIds, byId) {
    const children = new Map();
    for (const row of byId.values()) {
      const p = row.parent_id == null ? null : Number(row.parent_id);
      if (!children.has(p)) children.set(p, []);
      children.get(p).push(Number(row.id));
    }
    const out = new Set(seedIds.map(Number));
    const stack = [...out];
    while (stack.length) {
      const id = stack.pop();
      for (const c of children.get(id) || []) {
        if (!out.has(c)) { out.add(c); stack.push(c); }
      }
    }
    return [...out];
  }

  // Host card for a listing row. Individual hosts come from the
  // experience_hosts profile joined to users (Phase 3: host_id is an
  // experience_hosts.id, never a user id). Display name and avatar come
  // from users; bio and city come from experience_hosts. Business hosts
  // come from the businesses row. Never includes a phone number,
  // WhatsApp or email.
  function hostCard(r) {
    if (r.business_id != null) {
      return {
        type: 'business', id: Number(r.business_id),
        name: r.business_name || '', slug: r.business_slug || '',
        city: r.business_city || '',
        verified: r.business_verification === 'verified',
        rating_avg: null, rating_count: 0,
        avatar: r.business_logo ? `/api/businesses/${r.business_id}/image/logo` : '',
        member_since: r.business_created_at || null,
      };
    }
    return {
      type: 'individual', id: Number(r.host_id),
      name: r.host_name || '', city: r.host_city || r.host_user_city || '',
      bio: r.host_bio || '',
      verified: r.host_selfie_status === 'approved',
      rating_avg: null, rating_count: 0,
      avatar: r.host_has_avatar && r.host_user_id != null ? `/api/users/${r.host_user_id}/avatar` : '',
      member_since: r.host_created_at || null,
    };
  }

  function serializeListing(r, locMap) {
    const loc = r.location_id != null ? locMap.get(Number(r.location_id)) : null;
    const chain = loc ? locationChain(loc, locMap).chain : null;
    return {
      id: Number(r.id), listing_type: r.listing_type,
      title: r.title, description: r.description || '',
      city: r.city, area: r.area || '',
      price_from: Number(r.price_from || 0), price_unit: r.price_unit,
      currency: r.currency || 'ZMW',
      capacity_max: Number(r.capacity_max || 1),
      instant_book: !!r.instant_book,
      cancellation_policy: r.cancellation_policy,
      status: r.status, view_count: Number(r.view_count || 0),
      created_at: r.created_at,
      category: r.category_id != null
        ? { id: Number(r.category_id), name: r.category_name || '', kind: r.category_kind || '' }
        : null,
      location: loc
        ? { id: Number(loc.id), name: loc.name, level: loc.level, chain }
        : null,
      host: hostCard(r),
      rating_avg: null, rating_count: 0,
      cover_photo: r.cover_photo_id ? `/api/experiences/${r.id}/photos/${r.cover_photo_id}` : null,
      photo_count: Number(r.photo_count || 0),
      lat: r.lat != null ? Number(r.lat) : (loc && loc.lat != null ? Number(loc.lat) : null),
      lng: r.lng != null ? Number(r.lng) : (loc && loc.lng != null ? Number(loc.lng) : null),
      distance_km: null,
    };
  }

  const EXP_SELECT = `
    SELECT l.*, c.name AS category_name, c.kind AS category_kind,
           h.user_id AS host_user_id, h.city AS host_city, h.bio AS host_bio,
           u.name AS host_name, u.city AS host_user_city,
           u.selfie_status AS host_selfie_status, u.created_at AS host_created_at,
           (u.avatar IS NOT NULL AND u.avatar <> '') AS host_has_avatar,
           bz.name AS business_name, bz.slug AS business_slug, bz.city AS business_city,
           bz.verification_status AS business_verification,
           bz.owner_id AS business_owner_id,
           bz.created_at AS business_created_at,
           (bz.logo IS NOT NULL AND bz.logo <> '') AS business_logo,
           (SELECT COUNT(*) FROM experience_listing_media m WHERE m.listing_id = l.id) AS photo_count,
           (SELECT m.id FROM experience_listing_media m WHERE m.listing_id = l.id ORDER BY m.sort, m.id LIMIT 1) AS cover_photo_id
    FROM experience_listings l
    LEFT JOIN experience_categories c ON c.id = l.category_id
    LEFT JOIN experience_hosts h ON h.id = l.host_id
    LEFT JOIN users u ON u.id = h.user_id
    LEFT JOIN businesses bz ON bz.id = l.business_id`;

  function isDateStr(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const y = Number(v.slice(0, 4)), m = Number(v.slice(5, 7)), d = Number(v.slice(8, 10));
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  // ------------------------------------------------------------ list
  // GET /api/experiences — public browse. Filters are applied server side
  // via query parameters (UI Spec 4.2). No radius: see the header note.
  router.get('/api/experiences', listCache, ah(maybeAuth), ah(async (req, res) => {
    const q = req.query;
    const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
    let limit = parseInt(q.limit || String(LIST_LIMIT_DEFAULT), 10);
    if (!Number.isFinite(limit) || limit < 1) limit = LIST_LIMIT_DEFAULT;
    if (limit > LIST_LIMIT_MAX) limit = LIST_LIMIT_MAX;

    const sort = EXP_SORTS.includes(String(q.sort || '')) ? String(q.sort) : 'recommended';

    // Optional viewer coordinates annotate distance_km only. Both or
    // neither (geo.js parseLatLng semantics); never a radius filter.
    let viewer = null;
    const parsed = parseLatLng(q);
    if (parsed && parsed.error) return err(res, 422, parsed.error, { location: parsed.error });
    if (parsed) viewer = parsed;

    // Date range: validated, never silently ignored.
    const from = q.from ? String(q.from) : '';
    const to = q.to ? String(q.to) : '';
    if ((from && !isDateStr(from)) || (to && !isDateStr(to))) {
      return err(res, 422, 'Dates must be YYYY-MM-DD.', { date: 'Dates must be YYYY-MM-DD.' });
    }
    if (from && to && from > to) {
      return err(res, 422, 'Check out must be after check in.', { date: 'Check out must be after check in.' });
    }

    const conds = ["l.status = 'active'"];
    const params = [];
    // A listing whose business host is no longer active, or whose
    // individual host deactivated their account, is not public. The
    // host check goes through experience_hosts (host_id is a host id,
    // not a user id) to the linked user.
    conds.push("(l.business_id IS NULL OR EXISTS (SELECT 1 FROM businesses b2 WHERE b2.id = l.business_id AND b2.status = 'active'))");
    conds.push("(l.host_id IS NULL OR EXISTS (SELECT 1 FROM experience_hosts h2 JOIN users u2 ON u2.id = h2.user_id WHERE h2.id = l.host_id AND u2.deactivated_at IS NULL))");

    // Category: by id or by name/slug (case-insensitive, so 'tours'
    // matches the seeded 'Tours'). An unknown category matches nothing:
    // a category page must not silently show every listing.
    if (q.category) {
      const rawCat = String(q.category).trim();
      const asId = parseInt(rawCat, 10);
      let catRow = null;
      if (String(asId) === rawCat) {
        catRow = await getOne('SELECT id FROM experience_categories WHERE id = ? AND active = 1', [asId]);
      } else {
        catRow = await getOne('SELECT id FROM experience_categories WHERE LOWER(name) = LOWER(?) AND active = 1', [rawCat]);
      }
      if (!catRow) return res.json({ experiences: [], total: 0, page, totalPages: 1, limit, remaining: 0 });
      conds.push('l.category_id = ?'); params.push(catRow.id);
    }

    const locMap = await loadLocationMap();

    // Destination: match a location (town/area/district/province) and
    // everything under it, plus the listing's own city/area text.
    if (q.destination && String(q.destination).trim()) {
      const d = String(q.destination).trim();
      const matched = [...locMap.values()].filter((r) => r.name.toLowerCase().includes(d.toLowerCase()));
      const ids = descendantIds(matched.map((r) => Number(r.id)), locMap);
      const like = `%${d}%`;
      if (ids.length) {
        conds.push(`(l.location_id IN (${ids.map(() => '?').join(',')}) OR l.city LIKE ? OR l.area LIKE ?)`);
        params.push(...ids, like, like);
      } else {
        conds.push('(l.city LIKE ? OR l.area LIKE ?)');
        params.push(like, like);
      }
    }

    // Province: by name; everything under that province. Unknown province
    // matches nothing (same reasoning as category above).
    if (q.province && String(q.province).trim()) {
      const p = String(q.province).trim();
      const prov = [...locMap.values()].find((r) => r.level === 'province' && r.name.toLowerCase() === p.toLowerCase());
      if (!prov) return res.json({ experiences: [], total: 0, page, totalPages: 1, limit, remaining: 0 });
      const ids = descendantIds([Number(prov.id)], locMap);
      conds.push(`l.location_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }

    // Date range (Phase 2 limitation, recorded for Phase 4): there is no
    // availability table until Phase 4, so only dated events can be
    // date-filtered (experience_events.event_date). Non-event listings
    // have no calendar yet and pass the date filter rather than being
    // hidden for lacking dates that do not exist yet.
    if (from || to) {
      const parts = ["l.listing_type != 'event'"];
      if (from && to) parts.push('(ev.event_date >= ? AND ev.event_date <= ?)');
      else if (from) parts.push('ev.event_date >= ?');
      else parts.push('ev.event_date <= ?');
      conds.push('(' + parts.join(' OR ') + ')');
      if (from) params.push(from);
      if (to) params.push(to);
    }

    const min = parseInt(q.min, 10);
    if (Number.isInteger(min) && min >= 0) { conds.push('l.price_from >= ?'); params.push(min); }
    const max = parseInt(q.max, 10);
    if (Number.isInteger(max) && max > 0) { conds.push('l.price_from <= ?'); params.push(max); }

    // Guests and capacity are the same filter: minimum capacity.
    const guestsRaw = q.guests != null ? q.guests : q.capacity;
    const guests = parseInt(guestsRaw, 10);
    if (Number.isInteger(guests) && guests > 0) { conds.push('l.capacity_max >= ?'); params.push(guests); }

    if (String(q.verified || '') === '1') {
      conds.push("((l.business_id IS NOT NULL AND bz.verification_status = 'verified') OR (l.host_id IS NOT NULL AND u.selfie_status = 'approved'))");
    }
    if (String(q.instant || '') === '1') conds.push('l.instant_book = 1');

    if (q.q && String(q.q).trim()) {
      conds.push('(l.title LIKE ? OR l.description LIKE ? OR c.name LIKE ? OR l.city LIKE ? OR l.area LIKE ?)');
      const s = `%${String(q.q).trim()}%`;
      params.push(s, s, s, s, s);
    }

    const where = 'WHERE ' + conds.join(' AND ');
    // Events need their date for the date filter; the join is harmless
    // for other types.
    const order = sort === 'price_low' ? 'l.price_from ASC, l.id DESC'
      : sort === 'price_high' ? 'l.price_from DESC, l.id DESC'
      : sort === 'rating' ? 'COALESCE(u.rating_avg, 0) DESC, l.created_at DESC, l.id DESC'
      : 'l.created_at DESC, l.id DESC';
    const rows = await getAll(
      `${EXP_SELECT} LEFT JOIN experience_events ev ON ev.listing_id = l.id ${where} ORDER BY ${order} LIMIT ?`,
      [...params, CANDIDATE_CAP]
    );

    let out = rows.map((r) => serializeListing(r, locMap));
    if (viewer) {
      for (const item of out) {
        if (item.lat != null && item.lng != null) {
          item.distance_km = Math.round(haversineKm(viewer.lat, viewer.lng, item.lat, item.lng) * 10) / 10;
        }
      }
      // No radius filter is applied here, deliberately: a viewer in
      // Lusaka searching Livingstone (~470 km) must still see results.
    }

    const total = out.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const slice = out.slice((page - 1) * limit, page * limit);
    res.json({
      experiences: slice, total, page, totalPages, limit,
      remaining: Math.max(0, total - page * limit),
    });
  }));

  // ------------------------------------------------------------ categories
  // GET /api/experiences/categories — the admin-managed category list.
  // Literal route, registered before /:id (jobs recommended precedent).
  router.get('/api/experiences/categories', ah(async (req, res) => {
    const rows = await getAll("SELECT id, name, kind, icon FROM experience_categories WHERE active = 1 ORDER BY sort, name");
    res.json({ categories: rows.map((r) => ({ id: Number(r.id), name: r.name, kind: r.kind, icon: r.icon || '' })) });
  }));

  // ------------------------------------------------------------ locations
  // GET /api/experiences/locations — autocomplete as a single indexed
  // query on experience_locations (active, name), returning the full
  // ancestor chain so the UI can show "Mfuwe, Mambwe District, Eastern
  // Province". No external maps API. Without q, returns the 10 provinces
  // (the province filter source).
  router.get('/api/experiences/locations', ah(async (req, res) => {
    const query = req.query.q ? String(req.query.q).trim() : '';
    let limit = parseInt(req.query.limit || '10', 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 10;
    if (limit > 20) limit = 20;
    const locMap = await loadLocationMap();
    let rows;
    if (query) {
      rows = await getAll(
        `SELECT id, parent_id, level, name, slug, lat, lng FROM experience_locations
         WHERE active = 1 AND name LIKE ?
         ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, sort, name LIMIT ?`,
        [`%${query}%`, `${query}%`, limit]
      );
    } else {
      rows = await getAll(
        `SELECT id, parent_id, level, name, slug, lat, lng FROM experience_locations
         WHERE active = 1 AND level = 'province' ORDER BY sort, name LIMIT ?`,
        [limit]
      );
    }
    const locations = rows.map((r) => {
      const { chain, ancestors } = locationChain(r, locMap);
      return {
        id: Number(r.id), parent_id: r.parent_id == null ? null : Number(r.parent_id),
        level: r.level, name: r.name, slug: r.slug,
        lat: r.lat != null ? Number(r.lat) : null,
        lng: r.lng != null ? Number(r.lng) : null,
        chain, ancestors,
      };
    });
    res.json({ locations });
  }));

  // ------------------------------------------------------------ photos
  // GET /api/experiences/:id/photos/:photoId — serve one listing photo
  // (base64 in experience_listing_media, same pattern as product photos).
  router.get('/api/experiences/:id/photos/:photoId', ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const photoId = parseInt(req.params.photoId, 10);
    if (!id || !photoId) return err(res, 404, 'Photo not found.');
    const row = await getOne(
      'SELECT image, mime FROM experience_listing_media WHERE id = ? AND listing_id = ?',
      [photoId, id]
    );
    if (!row) return err(res, 404, 'Photo not found.');
    const comma = String(row.image).indexOf(',');
    const buf = Buffer.from(String(row.image).slice(comma + 1), 'base64');
    res.set('Content-Type', row.mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  }));

  // ============================================================ Phase 3
  // Host onboarding, verification, listing management, admin decisions.
  // All write endpoints live here. Error shape follows the existing err
  // helper ({ error, fields? }); 401 signed out, 403 not owner / wrong
  // role, 422 validation or ownership, 404 missing. No phone number and
  // no verification document image appears in any public response; the
  // payout_reference is never returned in full (masked only).

  // ---- host profile field parsing (apply + PATCH share the field set)
  function hostProfileFields(b) {
    const fields = {};
    if (b.display_name !== undefined) {
      const v = String(b.display_name).trim();
      if (v) fields.display_name = v;
    }
    if (b.bio !== undefined) fields.bio = String(b.bio);
    if (b.languages !== undefined) {
      if (!Array.isArray(b.languages)) return { error: 'Languages must be a list.' };
      fields.languages = JSON.stringify(b.languages.map((x) => String(x)));
    }
    if (b.response_time !== undefined) fields.response_time = String(b.response_time);
    if (b.phone_public !== undefined) fields.phone_public = String(b.phone_public).trim();
    if (b.city !== undefined) {
      const city = String(b.city).trim();
      if (city && !CITIES.includes(city)) return { error: 'Choose a valid city.' };
      if (city) fields.city = city;
    }
    if (b.area !== undefined) fields.area = String(b.area);
    if (b.meeting_point !== undefined) fields.meeting_point = String(b.meeting_point);
    if (b.provinces !== undefined) {
      if (!Array.isArray(b.provinces)) return { error: 'Provinces must be a list.' };
      fields.provinces = JSON.stringify(b.provinces.map((x) => String(x)));
    }
    if (b.payout_method !== undefined) {
      if (!EXP_PAYOUT_METHODS.includes(b.payout_method)) return { error: 'Payout method must be mobile money or bank transfer.' };
      fields.payout_method = b.payout_method;
    }
    if (b.payout_reference !== undefined) fields.payout_reference = String(b.payout_reference).trim();
    return { fields };
  }

  async function updateHostRow(hostId, fields) {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    const sets = keys.map((k) => `${k} = ?`).join(', ');
    await runWrite(
      `UPDATE experience_hosts SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...keys.map((k) => fields[k]), hostId]);
  }

  // ---- host submit validation (submit + resubmit share the required set)
  async function hostSubmitProblems(host) {
    const fields = {};
    if (!String(host.display_name || '').trim()) fields.display_name = 'Add a display name.';
    if (String(host.bio || '').trim().length < 20) fields.bio = 'Write a bio of at least 20 characters.';
    if (!String(host.city || '').trim()) fields.city = 'Add your town or city.';
    const docs = await getAll('SELECT kind FROM experience_host_verifications WHERE host_id = ?', [host.id]);
    const kinds = new Set(docs.map((d) => d.kind));
    if (!kinds.has('nrc') && !kinds.has('passport')) fields.documents = 'Upload your NRC or passport.';
    if (!kinds.has('selfie')) fields.selfie = 'Upload a verification selfie.';
    const listing = await getOne(
      "SELECT id FROM experience_listings WHERE host_id = ? AND status = 'draft' LIMIT 1", [host.id]);
    if (!listing) fields.listing = 'Create your first listing draft before submitting.';
    if (!host.payout_method) fields.payout_method = 'Choose how you want to be paid.';
    else if (!String(host.payout_reference || '').trim()) fields.payout_reference = 'Add your payout number or account details.';
    return fields;
  }

  // ---- verification document access
  async function isDocOwner(user, doc) {
    if (Number(doc.submitted_by) === Number(user.id)) return true;
    if (doc.host_id != null) {
      const h = await getOne('SELECT user_id FROM experience_hosts WHERE id = ?', [doc.host_id]);
      if (h && Number(h.user_id) === Number(user.id)) return true;
    }
    if (doc.business_id != null) {
      const b = await getOne('SELECT owner_id FROM businesses WHERE id = ?', [doc.business_id]);
      if (b && Number(b.owner_id) === Number(user.id)) return true;
    }
    return false;
  }
  async function canReadDocument(user, doc) {
    if (isAdmin(user) || isSupport(user)) return true;
    return isDocOwner(user, doc);
  }

  // ---- staff shapes
  async function serializeStaffRow(row) {
    const u = await getOne('SELECT id, name, phone FROM users WHERE id = ?', [row.user_id]);
    const inviter = row.invited_by
      ? await getOne('SELECT name FROM users WHERE id = ?', [row.invited_by]) : null;
    return {
      user_id: Number(row.user_id), name: u ? u.name : '', phone: u ? u.phone : '',
      role: row.role, status: row.status,
      invited_by: row.invited_by == null ? null : Number(row.invited_by),
      invited_by_name: inviter ? inviter.name : '',
    };
  }
  async function myPendingInvites(userId) {
    const rows = await getAll(
      `SELECT s.business_id, s.role, s.invited_by, b.name AS business_name, u.name AS invited_by_name
       FROM experience_business_staff s
       JOIN businesses b ON b.id = s.business_id
       LEFT JOIN users u ON u.id = s.invited_by
       WHERE s.user_id = ? AND s.status = 'invited' ORDER BY s.created_at DESC`,
      [userId]);
    return rows.map((r) => ({
      business_id: Number(r.business_id), business_name: r.business_name, role: r.role,
      invited_by: r.invited_by == null ? null : Number(r.invited_by),
      invited_by_name: r.invited_by_name || '',
    }));
  }

  // ---- listing validation + subtypes
  function listingPriceError(priceFrom, listingType) {
    const p = Number(priceFrom);
    if (priceFrom === undefined || priceFrom === null || priceFrom === '' || !Number.isInteger(p)) {
      return 'Set a price in Kwacha (whole numbers).';
    }
    if (listingType === 'event' ? p < 0 : p < 1) {
      return listingType === 'event'
        ? 'Set a price in Kwacha (whole numbers).'
        : 'Set a price of at least K1 (events may be free).';
    }
    if (p > EXP_PRICE_MAX) return 'Price must be K10,000,000 or less.';
    return null;
  }

  async function validateListingCreate(b) {
    const f = {};
    if (!EXP_LISTING_TYPES.includes(b.listing_type)) f.listing_type = 'Choose a listing type.';
    if (b.category_id === undefined || b.category_id === null || b.category_id === '') {
      f.category_id = 'Choose a category.';
    } else {
      const cat = await getOne(
        'SELECT id FROM experience_categories WHERE id = ? AND active = 1',
        [parseInt(b.category_id, 10) || 0]);
      if (!cat) f.category_id = 'Choose a valid category.';
    }
    if (!b.title || String(b.title).trim().length < 3) f.title = 'Give the listing a title (3+ characters).';
    if (!b.description || String(b.description).trim().length < 10) f.description = 'Describe the listing (10+ characters).';
    if (!CITIES.includes(b.city)) f.city = 'Choose a valid city.';
    const pe = listingPriceError(b.price_from, b.listing_type);
    if (pe) f.price_from = pe;
    if (b.price_unit !== undefined && !EXP_PRICE_UNITS.includes(b.price_unit)) f.price_unit = 'Choose a valid price unit.';
    if (b.cancellation_policy !== undefined && !EXP_CANCELLATION_POLICIES.includes(b.cancellation_policy)) {
      f.cancellation_policy = 'Choose a valid cancellation policy.';
    }
    if (b.capacity_max !== undefined) {
      const c = Number(b.capacity_max);
      if (!Number.isInteger(c) || c < 1) f.capacity_max = 'Capacity must be at least 1.';
    }
    if (b.lat !== undefined && b.lat !== null && b.lat !== '') {
      if (!Number.isFinite(Number(b.lat))) f.lat = 'Latitude must be a number.';
    }
    if (b.lng !== undefined && b.lng !== null && b.lng !== '') {
      if (!Number.isFinite(Number(b.lng))) f.lng = 'Longitude must be a number.';
    }
    if (b.inclusions !== undefined && !Array.isArray(b.inclusions)) f.inclusions = 'Inclusions must be a list.';
    if (b.exclusions !== undefined && !Array.isArray(b.exclusions)) f.exclusions = 'Exclusions must be a list.';
    return f;
  }

  // Subtype fields may arrive flat or nested under `details`; merge both.
  const SUBTYPE_KEYS = {
    stay: ['property_type', 'star_rating', 'check_in_time', 'check_out_time', 'max_guests', 'bedrooms', 'bathrooms', 'amenities', 'house_rules', 'units'],
    vehicle: ['vehicle_type', 'make', 'model', 'year', 'seats', 'transmission', 'fuel', 'driver_included', 'price_per_day'],
    tour: ['duration_hours', 'duration_days', 'group_size_max', 'group_size_min', 'meeting_point', 'meeting_lat', 'meeting_lng', 'itinerary', 'included', 'excluded', 'price_per_person'],
    event: ['venue_name', 'event_date', 'doors_time', 'ends_at', 'ticket_capacity', 'age_limit'],
  };
  function subtypeInput(body) {
    const flat = { ...(body || {}) };
    if (body && body.details && typeof body.details === 'object') Object.assign(flat, body.details);
    return flat;
  }
  function hasSubtypeInput(type, input) {
    return (SUBTYPE_KEYS[type] || []).some((k) => input[k] !== undefined);
  }
  function definedOnly(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) if (v !== undefined) out[k] = v;
    return out;
  }
  async function currentSubtype(listingId, type) {
    const table = type === 'stay' ? 'experience_properties'
      : type === 'vehicle' ? 'experience_vehicles'
      : type === 'tour' ? 'experience_tours'
      : type === 'event' ? 'experience_events' : null;
    if (!table) return null;
    return getOne(`SELECT * FROM ${table} WHERE listing_id = ?`, [listingId]);
  }

  // Pure validation of the effective subtype values (merged with the
  // existing row on PATCH). Returns a fields map, empty when valid.
  function validateSubtype(type, m, priceFrom) {
    if (type === 'stay') {
      if (m.property_type !== undefined && m.property_type !== null && m.property_type !== ''
        && !EXP_PROPERTY_TYPES.includes(String(m.property_type))) return { property_type: 'Choose a property type.' };
      if (m.star_rating !== undefined && m.star_rating !== null && m.star_rating !== '') {
        const s = Number(m.star_rating);
        if (!Number.isInteger(s) || s < 1 || s > 5) return { star_rating: 'Star rating must be 1 to 5.' };
      }
      for (const k of ['max_guests', 'bedrooms', 'bathrooms']) {
        if (m[k] !== undefined && m[k] !== null && m[k] !== '') {
          const n = Number(m[k]);
          if (!Number.isInteger(n) || n < 0) return { [k]: 'Must be a whole number.' };
        }
      }
      if (Array.isArray(m.units)) {
        for (const u of m.units) {
          if (!u || typeof u.name !== 'string' || !u.name.trim()) return { units: 'Each unit needs a name.' };
          if (!EXP_UNIT_TYPES.includes(u.unit_type)) return { units: 'Each unit needs a valid type.' };
          if (!Number.isInteger(Number(u.price_per_night)) || Number(u.price_per_night) < 0) {
            return { units: 'Each unit needs a price per night.' };
          }
        }
      }
      return {};
    }
    if (type === 'vehicle') {
      if (m.vehicle_type !== undefined && m.vehicle_type !== null && m.vehicle_type !== ''
        && !EXP_VEHICLE_TYPES.includes(String(m.vehicle_type))) return { vehicle_type: 'Choose a vehicle type.' };
      if (m.transmission !== undefined && !['', 'manual', 'automatic'].includes(String(m.transmission))) {
        return { transmission: 'Transmission must be manual or automatic.' };
      }
      if (m.fuel !== undefined && !['', 'petrol', 'diesel', 'electric', 'hybrid'].includes(String(m.fuel))) {
        return { fuel: 'Choose a valid fuel type.' };
      }
      if (m.price_per_day !== undefined && m.price_per_day !== null && m.price_per_day !== '') {
        if (!Number.isInteger(Number(m.price_per_day)) || Number(m.price_per_day) < 0) {
          return { price_per_day: 'Price per day must be a whole number.' };
        }
      }
      if (m.year !== undefined && m.year !== null && m.year !== '') {
        const y = Number(m.year);
        if (!Number.isInteger(y) || y < 1900 || y > 2100) return { year: 'Year must be a valid year.' };
      }
      if (m.seats !== undefined && m.seats !== null && m.seats !== '') {
        if (!Number.isInteger(Number(m.seats)) || Number(m.seats) < 1) return { seats: 'Seats must be at least 1.' };
      }
      return {};
    }
    if (type === 'tour') {
      if (m.price_per_person !== undefined && m.price_per_person !== null && m.price_per_person !== '') {
        if (!Number.isInteger(Number(m.price_per_person)) || Number(m.price_per_person) < 0) {
          return { price_per_person: 'Price per person must be a whole number.' };
        }
      }
      if (m.duration_hours !== undefined && m.duration_hours !== null && m.duration_hours !== '') {
        if (!Number.isFinite(Number(m.duration_hours)) || Number(m.duration_hours) < 0) {
          return { duration_hours: 'Duration must be a positive number.' };
        }
      }
      for (const k of ['duration_days', 'group_size_max', 'group_size_min']) {
        if (m[k] !== undefined && m[k] !== null && m[k] !== '') {
          if (!Number.isInteger(Number(m[k])) || Number(m[k]) < 0) return { [k]: 'Must be a whole number.' };
        }
      }
      if (m.group_size_min !== undefined && m.group_size_max !== undefined
        && m.group_size_min !== '' && m.group_size_max !== ''
        && Number(m.group_size_min) > Number(m.group_size_max)) {
        return { group_size_min: 'Minimum group size cannot exceed the maximum.' };
      }
      for (const k of ['meeting_lat', 'meeting_lng']) {
        if (m[k] !== undefined && m[k] !== null && m[k] !== '' && !Number.isFinite(Number(m[k]))) {
          return { [k]: 'Meeting point coordinates must be numbers.' };
        }
      }
      return {};
    }
    if (type === 'event') {
      if (m.event_date !== undefined && m.event_date !== null && m.event_date !== '') {
        if (!isDateStr(String(m.event_date))) return { event_date: 'Event date must be YYYY-MM-DD.' };
      }
      if (m.ticket_capacity !== undefined && m.ticket_capacity !== null && m.ticket_capacity !== '') {
        if (!Number.isInteger(Number(m.ticket_capacity)) || Number(m.ticket_capacity) < 0) {
          return { ticket_capacity: 'Ticket capacity must be a whole number.' };
        }
      }
      if (m.age_limit !== undefined && m.age_limit !== null && m.age_limit !== '') {
        if (!Number.isInteger(Number(m.age_limit)) || Number(m.age_limit) < 0) {
          return { age_limit: 'Age limit must be a whole number.' };
        }
      }
      return {};
    }
    return {};
  }

  // Write the 1:1 subtype row for a listing (INSERT OR REPLACE, merged
  // values already validated). Units replace the whole set when given.
  async function saveSubtype(listingId, type, m, priceFrom) {
    const num = (v, dflt) => (v === undefined || v === null || v === '' ? dflt : Number(v));
    const str = (v, dflt) => (v === undefined || v === null ? dflt : String(v));
    if (type === 'stay') {
      const property_type = m.property_type ? String(m.property_type) : 'guesthouse';
      const star = m.star_rating === undefined || m.star_rating === null || m.star_rating === '' ? null : Number(m.star_rating);
      const amenities = Array.isArray(m.amenities) ? JSON.stringify(m.amenities.map(String))
        : (typeof m.amenities === 'string' ? m.amenities : '');
      await runWrite(
        `INSERT OR REPLACE INTO experience_properties
         (listing_id, property_type, star_rating, check_in_time, check_out_time, max_guests, bedrooms, bathrooms, amenities, house_rules, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [listingId, property_type, star, str(m.check_in_time, ''), str(m.check_out_time, ''),
         num(m.max_guests, 2), num(m.bedrooms, 0), num(m.bathrooms, 0), amenities, str(m.house_rules, '')]);
      if (Array.isArray(m.units)) {
        await runWrite('DELETE FROM experience_property_units WHERE property_id = ?', [listingId]);
        for (const u of m.units) {
          await runWrite(
            `INSERT INTO experience_property_units (property_id, name, unit_type, sleeps, quantity, price_per_night)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [listingId, String(u.name).trim(), u.unit_type,
             Number.isInteger(Number(u.sleeps)) && Number(u.sleeps) >= 1 ? Number(u.sleeps) : 1,
             Number.isInteger(Number(u.quantity)) && Number(u.quantity) >= 1 ? Number(u.quantity) : 1,
             Number(u.price_per_night)]);
        }
      }
      return;
    }
    if (type === 'vehicle') {
      const pricePerDay = m.price_per_day !== undefined && m.price_per_day !== null && m.price_per_day !== ''
        ? Number(m.price_per_day) : Number(priceFrom);
      const year = m.year === undefined || m.year === null || m.year === '' ? null : Number(m.year);
      await runWrite(
        `INSERT OR REPLACE INTO experience_vehicles
         (listing_id, vehicle_type, make, model, year, seats, transmission, fuel, driver_included, price_per_day, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [listingId, m.vehicle_type ? String(m.vehicle_type) : 'other', str(m.make, ''), str(m.model, ''),
         year, num(m.seats, 4), str(m.transmission, ''), str(m.fuel, ''),
         m.driver_included ? 1 : 0, pricePerDay]);
      return;
    }
    if (type === 'tour') {
      const pricePerPerson = m.price_per_person !== undefined && m.price_per_person !== null && m.price_per_person !== ''
        ? Number(m.price_per_person) : Number(priceFrom);
      await runWrite(
        `INSERT OR REPLACE INTO experience_tours
         (listing_id, duration_hours, duration_days, group_size_max, group_size_min, meeting_point, meeting_lat, meeting_lng, itinerary, included, excluded, price_per_person, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [listingId,
         m.duration_hours === undefined || m.duration_hours === null || m.duration_hours === '' ? null : Number(m.duration_hours),
         num(m.duration_days, 0), num(m.group_size_max, 10), num(m.group_size_min, 1),
         str(m.meeting_point, ''),
         m.meeting_lat === undefined || m.meeting_lat === null || m.meeting_lat === '' ? null : Number(m.meeting_lat),
         m.meeting_lng === undefined || m.meeting_lng === null || m.meeting_lng === '' ? null : Number(m.meeting_lng),
         str(m.itinerary, ''), str(m.included, ''), str(m.excluded, ''), pricePerPerson]);
      return;
    }
    if (type === 'event') {
      const ageLimit = m.age_limit === undefined || m.age_limit === null || m.age_limit === '' ? null : Number(m.age_limit);
      await runWrite(
        `INSERT OR REPLACE INTO experience_events
         (listing_id, venue_name, event_date, doors_time, ends_at, ticket_capacity, age_limit, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [listingId, str(m.venue_name, ''), String(m.event_date), str(m.doors_time, ''),
         m.ends_at === undefined || m.ends_at === null || m.ends_at === '' ? null : String(m.ends_at),
         num(m.ticket_capacity, 0), ageLimit]);
    }
  }

  // Load one listing through the public select, serialised for its owner
  // (approval_status + approval_note included; the public serializer
  // never carries them).
  async function loadOwnerListing(id) {
    const row = await getOne(`${EXP_SELECT} WHERE l.id = ?`, [id]);
    if (!row) return null;
    const locMap = await loadLocationMap();
    const item = serializeListing(row, locMap);
    item.approval_status = row.approval_status;
    item.approval_note = row.approval_note || '';
    return { row, item };
  }

  // ------------------------------------------------------------ host: me
  // GET /api/experiences/host/me — the caller's individual host profile
  // (or null) plus their business opt-in links. Owner-only; the payout
  // reference is masked, never full.
  router.get('/api/experiences/host/me', ah(auth), ah(async (req, res) => {
    const h = await myHost(req.user.id);
    const businesses = await businessLinksForUser(req.user.id);
    res.json({ ok: true, individual: serializeHost(h), businesses });
  }));

  // POST /api/experiences/host/apply — create or update the caller's
  // individual host draft. Partial body allowed: the wizard saves after
  // each step. Status stays 'draft'. One host row per user.
  router.post('/api/experiences/host/apply', ah(auth), expHostLimiter, ah(async (req, res) => {
    const b = req.body || {};
    if (b.account_type !== undefined && b.account_type !== 'individual') {
      return err(res, 422, 'Business hosts opt in through the business endpoint.',
        { account_type: 'Use the business opt-in endpoint.' });
    }
    const parsed = hostProfileFields(b);
    if (parsed.error) return err(res, 422, parsed.error);
    const existing = await myHost(req.user.id);
    if (existing && !['draft', 'additional_info'].includes(existing.status)) {
      return err(res, 422, 'Your host application has already been submitted. Update your profile from your dashboard instead.');
    }
    const fields = { ...parsed.fields };
    if (!existing) {
      if (!fields.display_name) fields.display_name = req.user.name || '';
      if (!fields.city) fields.city = req.user.city || '';
      if (!fields.display_name) return err(res, 422, 'Add a display name.', { display_name: 'Add a display name.' });
      if (!fields.city) return err(res, 422, 'Add your town or city.', { city: 'Add your town or city.' });
      const r = await runWrite(
        `INSERT INTO experience_hosts
         (user_id, display_name, bio, languages, response_time, phone_public, city, area, meeting_point, provinces,
          payout_method, payout_reference, status, verification_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'unverified')`,
        [req.user.id, fields.display_name, fields.bio || '', fields.languages || '[]',
         fields.response_time || '', fields.phone_public || '', fields.city,
         fields.area || '', fields.meeting_point || '', fields.provinces || '[]',
         fields.payout_method || '', fields.payout_reference || '']);
      const row = await getOne('SELECT * FROM experience_hosts WHERE id = ?', [insertId(r)]);
      return res.json({ ok: true, host: serializeHost(row) });
    }
    await updateHostRow(existing.id, fields);
    const row = await getOne('SELECT * FROM experience_hosts WHERE id = ?', [existing.id]);
    res.json({ ok: true, host: serializeHost(row) });
  }));

  // PATCH /api/experiences/host/me — the owner updates their own
  // profile/payout fields (same field set as apply).
  router.patch('/api/experiences/host/me', ah(auth), ah(async (req, res) => {
    const existing = await myHost(req.user.id);
    if (!existing) return err(res, 404, 'No host profile yet. Apply first.');
    const parsed = hostProfileFields(req.body || {});
    if (parsed.error) return err(res, 422, parsed.error);
    await updateHostRow(existing.id, parsed.fields);
    const row = await getOne('SELECT * FROM experience_hosts WHERE id = ?', [existing.id]);
    res.json({ ok: true, host: serializeHost(row) });
  }));

  // POST /api/experiences/host/submit — draft (or additional_info) ->
  // submitted. Validates the required set; 422 with a fields map when
  // incomplete.
  router.post('/api/experiences/host/submit', ah(auth), ah(async (req, res) => {
    const h = await myHost(req.user.id);
    if (!h) return err(res, 404, 'No host profile yet. Apply first.');
    if (!['draft', 'additional_info'].includes(h.status)) {
      return err(res, 422, 'Only a draft application can be submitted.');
    }
    const problems = await hostSubmitProblems(h);
    if (Object.keys(problems).length) {
      return err(res, 422, 'Complete your application before submitting.', problems);
    }
    await runWrite("UPDATE experience_hosts SET status = 'submitted', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [h.id]);
    const row = await getOne('SELECT * FROM experience_hosts WHERE id = ?', [h.id]);
    res.json({ ok: true, host: serializeHost(row) });
  }));

  // POST /api/experiences/host/resubmit — additional_info -> submitted,
  // same validation as submit.
  router.post('/api/experiences/host/resubmit', ah(auth), ah(async (req, res) => {
    const h = await myHost(req.user.id);
    if (!h) return err(res, 404, 'No host profile yet. Apply first.');
    if (h.status !== 'additional_info') {
      return err(res, 422, 'Only an application asking for more information can be resubmitted.');
    }
    const problems = await hostSubmitProblems(h);
    if (Object.keys(problems).length) {
      return err(res, 422, 'Complete your application before resubmitting.', problems);
    }
    await runWrite("UPDATE experience_hosts SET status = 'submitted', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [h.id]);
    const row = await getOne('SELECT * FROM experience_hosts WHERE id = ?', [h.id]);
    res.json({ ok: true, host: serializeHost(row) });
  }));

  // ------------------------------------------------------------ host: documents
  // GET /api/experiences/host/documents — the caller's own documents
  // only. No image data in the list, ever.
  router.get('/api/experiences/host/documents', ah(auth), ah(async (req, res) => {
    res.json({ ok: true, documents: await myDocs(req.user.id) });
  }));

  // POST /api/experiences/host/documents — upload one document.
  // Images (JPEG/PNG/WebP) and PDF are accepted (DEVIATION: Architecture
  // 7.3 was images-only; UI Spec 6.1 step 4 requires image or PDF).
  // Data URI cap 2,500,000 chars (~2 MB, same as the business PACRA cert
  // cap); max 10 documents per host side. Exactly one of host_id /
  // business_id is set; the caller must own that host side.
  router.post('/api/experiences/host/documents', ah(auth), expHostLimiter, ah(async (req, res) => {
    const b = req.body || {};
    const kind = String(b.kind || '');
    if (!EXP_DOC_KINDS.includes(kind)) {
      return err(res, 422, 'Choose a valid document type.', { kind: 'Choose a valid document type.' });
    }
    const image = typeof b.image === 'string' ? b.image : '';
    const parsed = parseDataUri(image);
    if (!parsed || !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(parsed.mime)) {
      return err(res, 422, 'Document must be a JPEG, PNG, WebP image or a PDF.',
        { image: 'Attach a JPG, PNG, WebP image or a PDF.' });
    }
    if (image.length > EXP_DOC_MAX_LEN) {
      return err(res, 422, 'Document is too large. Keep it under about 2 MB.',
        { image: 'Document is too large.' });
    }
    const hostSide = String(b.host_side || '');
    let hostId = null;
    let businessId = null;
    if (hostSide === 'individual') {
      const h = await myHost(req.user.id);
      if (!h) return err(res, 422, 'Create your host profile before uploading documents.');
      hostId = h.id;
    } else if (hostSide === 'business') {
      const businessIdRaw = parseInt(b.business_id, 10);
      if (!businessIdRaw) {
        return err(res, 422, 'Choose which business this document belongs to.',
          { business_id: 'Choose a business.' });
      }
      const acc = await businessAccess(req.user.id, businessIdRaw);
      if (!acc.business) return err(res, 422, 'Business not found.');
      if (acc.role === null) return err(res, 422, 'That business is not yours.');
      if (acc.role === 'staff') return err(res, 403, 'Staff members cannot upload verification documents.');
      businessId = businessIdRaw;
    } else {
      return err(res, 422, 'Choose whether this document is for your individual or business host profile.',
        { host_side: 'Choose individual or business.' });
    }
    const countRow = await getOne(
      hostId != null
        ? 'SELECT COUNT(*) AS c FROM experience_host_verifications WHERE host_id = ?'
        : 'SELECT COUNT(*) AS c FROM experience_host_verifications WHERE business_id = ?',
      [hostId != null ? hostId : businessId]);
    if (Number(countRow.c || 0) >= EXP_DOC_MAX) {
      return err(res, 422, `Up to ${EXP_DOC_MAX} documents per host profile.`);
    }
    const r = await runWrite(
      "INSERT INTO experience_host_verifications (host_id, business_id, submitted_by, kind, image, status) VALUES (?, ?, ?, ?, ?, 'pending')",
      [hostId, businessId, req.user.id, kind, image]);
    const row = await getOne('SELECT * FROM experience_host_verifications WHERE id = ?', [insertId(r)]);
    res.json({ ok: true, document: serializeDoc(row) });
  }));

  // GET /api/experiences/host/documents/:id — serve the stored data URI.
  // Allowed only to the submitting host owner, the business owner, admin
  // or support reviewers. Everyone else gets 404 (not 403, so existence
  // is not leaked). Every successful read is logged to
  // experience_document_views. The image itself is never logged.
  router.get('/api/experiences/host/documents/:id', ah(auth), ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const doc = id ? await getOne('SELECT * FROM experience_host_verifications WHERE id = ?', [id]) : null;
    if (!doc) return err(res, 404, 'Document not found.');
    if (!(await canReadDocument(req.user, doc))) return err(res, 404, 'Document not found.');
    await runWrite('INSERT INTO experience_document_views (document_id, viewer_id) VALUES (?, ?)',
      [doc.id, req.user.id]).catch(() => { /* the read log must never break the read */ });
    const parsed = parseDataUri(doc.image);
    if (!parsed) return err(res, 404, 'Document not found.');
    res.set('Content-Type', parsed.mime);
    res.set('Cache-Control', 'private, no-store');
    res.send(Buffer.from(parsed.b64, 'base64'));
  }));

  // DELETE /api/experiences/host/documents/:id — owner only, and only
  // while the document status is 'pending' (422 otherwise; approved /
  // rejected documents stay for the audit trail).
  router.delete('/api/experiences/host/documents/:id', ah(auth), ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const doc = id ? await getOne('SELECT * FROM experience_host_verifications WHERE id = ?', [id]) : null;
    if (!doc) return err(res, 404, 'Document not found.');
    if (!(await isDocOwner(req.user, doc))) return err(res, 404, 'Document not found.');
    if (doc.status !== 'pending') {
      return err(res, 422, 'Only a pending document can be deleted. Reviewed documents stay for the audit trail.');
    }
    await runWrite('DELETE FROM experience_host_verifications WHERE id = ?', [id]);
    res.json({ ok: true });
  }));

  // ------------------------------------------------------------ host: business opt-in
  // POST /api/experiences/host/business — create the experience_businesses
  // link row for a storefront the caller owns that is active (422
  // otherwise). If a link already exists, return it.
  router.post('/api/experiences/host/business', ah(auth), expHostLimiter, ah(async (req, res) => {
    const businessId = parseInt((req.body || {}).business_id, 10);
    if (!businessId) return err(res, 422, 'Choose a business.');
    const b = await getOne('SELECT * FROM businesses WHERE id = ?', [businessId]);
    if (!b || Number(b.owner_id) !== Number(req.user.id) || b.status !== 'active') {
      return err(res, 422, 'That business does not exist, is not yours, or is not active.');
    }
    const existing = await getOne('SELECT * FROM experience_businesses WHERE business_id = ?', [businessId]);
    if (existing) return res.json({ ok: true, link: await serializeBusinessLink(existing) });
    const r = await runWrite('INSERT INTO experience_businesses (business_id) VALUES (?)', [businessId]);
    const row = await getOne('SELECT * FROM experience_businesses WHERE id = ?', [insertId(r)]);
    res.json({ ok: true, link: await serializeBusinessLink(row) });
  }));

  // GET /api/experiences/host/business — the caller's business links.
  router.get('/api/experiences/host/business', ah(auth), ah(async (req, res) => {
    res.json({ ok: true, businesses: await businessLinksForUser(req.user.id) });
  }));

  // PATCH /api/experiences/host/business/:id — business owner or manager
  // updates payout_method, payout_reference, experiences_status
  // (active/paused only). commission_rate_override is admin-only (403 if
  // attempted). Staff-role members get 403. :id is the link id, or the
  // business id as a fallback.
  router.patch('/api/experiences/host/business/:id', ah(auth), ah(async (req, res) => {
    const b = req.body || {};
    if ('commission_rate_override' in b) {
      return err(res, 403, 'Only an admin can change the commission rate.');
    }
    const id = parseInt(req.params.id, 10);
    let link = id ? await getOne('SELECT * FROM experience_businesses WHERE id = ?', [id]) : null;
    if (!link && id) link = await getOne('SELECT * FROM experience_businesses WHERE business_id = ?', [id]);
    if (!link) return err(res, 404, 'Business link not found.');
    const acc = await businessAccess(req.user.id, link.business_id);
    if (acc.role === null) return err(res, 403, 'Not authorized.');
    if (acc.role === 'staff') return err(res, 403, 'Staff members cannot change payout details.');
    const fields = {};
    if (b.payout_method !== undefined) {
      if (!EXP_PAYOUT_METHODS.includes(b.payout_method)) {
        return err(res, 422, 'Payout method must be mobile money or bank transfer.');
      }
      fields.payout_method = b.payout_method;
    }
    if (b.payout_reference !== undefined) fields.payout_reference = String(b.payout_reference).trim();
    if (b.experiences_status !== undefined) {
      if (!['active', 'paused'].includes(b.experiences_status)) {
        return err(res, 422, 'Status must be active or paused.');
      }
      fields.experiences_status = b.experiences_status;
    }
    const keys = Object.keys(fields);
    if (keys.length) {
      await runWrite(
        `UPDATE experience_businesses SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...keys.map((k) => fields[k]), link.id]);
    }
    const row = await getOne('SELECT * FROM experience_businesses WHERE id = ?', [link.id]);
    res.json({ ok: true, link: await serializeBusinessLink(row) });
  }));

  // ------------------------------------------------------------ host: staff
  // GET /api/experiences/host/business/:businessId/staff — owner or
  // manager lists staff. Staff-role members get 403.
  router.get('/api/experiences/host/business/:businessId/staff', ah(auth), ah(async (req, res) => {
    const businessId = parseInt(req.params.businessId, 10);
    const acc = await businessAccess(req.user.id, businessId);
    if (!acc.business) return err(res, 404, 'Business not found.');
    if (acc.role === null || acc.role === 'staff') {
      return err(res, 403, 'Only the business owner or a manager can view staff.');
    }
    const rows = await getAll(
      'SELECT * FROM experience_business_staff WHERE business_id = ? ORDER BY created_at, user_id',
      [businessId]);
    const staff = [];
    for (const r of rows) staff.push(await serializeStaffRow(r));
    res.json({ ok: true, staff });
  }));

  // POST /api/experiences/host/business/:businessId/staff — owner or
  // manager invites { phone, role }. The phone must belong to an existing
  // user (422 if no account; 422 if it is the business owner themself).
  // Creates a row with status 'invited'. No SMS invite is sent in Phase 3
  // (DEVIATION, see header): the invitee sees it in the app via
  // GET /host/invites. A revoked member can be invited again.
  router.post('/api/experiences/host/business/:businessId/staff', ah(auth), ah(async (req, res) => {
    const businessId = parseInt(req.params.businessId, 10);
    const acc = await businessAccess(req.user.id, businessId);
    if (!acc.business) return err(res, 404, 'Business not found.');
    if (acc.role === null || acc.role === 'staff') {
      return err(res, 403, 'Only the business owner or a manager can invite staff.');
    }
    const b = req.body || {};
    const role = String(b.role || '');
    if (!['manager', 'staff'].includes(role)) {
      return err(res, 422, 'Role must be manager or staff.', { role: 'Choose manager or staff.' });
    }
    const invited = await findUserByPhone(b.phone);
    if (!invited) {
      return err(res, 422, 'No account uses that phone number. The person must sign up first.',
        { phone: 'No account uses that phone number.' });
    }
    if (Number(invited.id) === Number(acc.business.owner_id)) {
      return err(res, 422, 'The business owner is already on the team.',
        { phone: 'That is the business owner.' });
    }
    const existing = await getOne(
      'SELECT * FROM experience_business_staff WHERE business_id = ? AND user_id = ?',
      [businessId, invited.id]);
    if (existing && existing.status !== 'revoked') {
      return err(res, 422, 'That person is already on the team.');
    }
    if (existing) {
      await runWrite(
        "UPDATE experience_business_staff SET role = ?, invited_by = ?, status = 'invited' WHERE business_id = ? AND user_id = ?",
        [role, req.user.id, businessId, invited.id]);
    } else {
      await runWrite(
        "INSERT INTO experience_business_staff (business_id, user_id, role, invited_by, status) VALUES (?, ?, ?, ?, 'invited')",
        [businessId, invited.id, role, req.user.id]);
    }
    const row = await getOne(
      'SELECT * FROM experience_business_staff WHERE business_id = ? AND user_id = ?',
      [businessId, invited.id]);
    res.json({ ok: true, staff: await serializeStaffRow(row) });
  }));

  // GET /api/experiences/host/invites — my pending invites.
  router.get('/api/experiences/host/invites', ah(auth), ah(async (req, res) => {
    res.json({ ok: true, invites: await myPendingInvites(req.user.id) });
  }));

  // POST /api/experiences/host/staff/invites/:businessId/accept — the
  // invited user only (404 when there is no pending invite for them)
  // flips invited -> active.
  router.post('/api/experiences/host/staff/invites/:businessId/accept', ah(auth), ah(async (req, res) => {
    const businessId = parseInt(req.params.businessId, 10);
    const row = await getOne(
      "SELECT * FROM experience_business_staff WHERE business_id = ? AND user_id = ? AND status = 'invited'",
      [businessId, req.user.id]);
    if (!row) return err(res, 404, 'No pending invite for this business.');
    await runWrite(
      "UPDATE experience_business_staff SET status = 'active' WHERE business_id = ? AND user_id = ?",
      [businessId, req.user.id]);
    const updated = await getOne(
      'SELECT * FROM experience_business_staff WHERE business_id = ? AND user_id = ?',
      [businessId, req.user.id]);
    res.json({ ok: true, staff: await serializeStaffRow(updated) });
  }));

  // POST /api/experiences/host/staff/invites/:businessId/decline — the
  // invited user only; deletes the row.
  router.post('/api/experiences/host/staff/invites/:businessId/decline', ah(auth), ah(async (req, res) => {
    const businessId = parseInt(req.params.businessId, 10);
    const row = await getOne(
      "SELECT * FROM experience_business_staff WHERE business_id = ? AND user_id = ? AND status = 'invited'",
      [businessId, req.user.id]);
    if (!row) return err(res, 404, 'No pending invite for this business.');
    await runWrite('DELETE FROM experience_business_staff WHERE business_id = ? AND user_id = ?',
      [businessId, req.user.id]);
    res.json({ ok: true });
  }));

  // POST /api/experiences/host/business/:businessId/staff/:userId/revoke —
  // owner or manager sets status revoked. Revoked staff lose access
  // immediately: every staff-gated check reads the live row.
  router.post('/api/experiences/host/business/:businessId/staff/:userId/revoke', ah(auth), ah(async (req, res) => {
    const businessId = parseInt(req.params.businessId, 10);
    const userId = parseInt(req.params.userId, 10);
    const acc = await businessAccess(req.user.id, businessId);
    if (!acc.business) return err(res, 404, 'Business not found.');
    if (acc.role === null || acc.role === 'staff') {
      return err(res, 403, 'Only the business owner or a manager can revoke staff.');
    }
    const row = await getOne(
      'SELECT * FROM experience_business_staff WHERE business_id = ? AND user_id = ?',
      [businessId, userId]);
    if (!row) return err(res, 404, 'Staff member not found.');
    await runWrite(
      "UPDATE experience_business_staff SET status = 'revoked' WHERE business_id = ? AND user_id = ?",
      [businessId, userId]);
    const updated = await getOne(
      'SELECT * FROM experience_business_staff WHERE business_id = ? AND user_id = ?',
      [businessId, userId]);
    res.json({ ok: true, staff: await serializeStaffRow(updated) });
  }));

  // ------------------------------------------------------------ listings: host writes
  // POST /api/experiences — create a listing DRAFT. Creating a draft is
  // allowed for any host, including unapproved (the wizard step 5 creates
  // the first listing during onboarding). Subtype fields (flat or under
  // `details`) create the 1:1 subtype row in the same write.
  router.post('/api/experiences', ah(auth), productLimiter, ah(async (req, res) => {
    const b = req.body || {};
    const problems = await validateListingCreate(b);
    if (Object.keys(problems).length) return err(res, 422, 'Check the listing details.', problems);
    const input = subtypeInput(b);
    if (hasSubtypeInput(b.listing_type, input)) {
      if (b.listing_type === 'event' && !input.event_date) {
        return err(res, 422, 'Check the listing details.', { event_date: 'An event needs a date.' });
      }
      const sp = validateSubtype(b.listing_type, input, Number(b.price_from));
      if (Object.keys(sp).length) return err(res, 422, 'Check the listing details.', sp);
    }
    let hostId = null;
    let businessId = null;
    const hostSide = String(b.host_side || '');
    if (hostSide === 'individual') {
      const h = await myHost(req.user.id);
      if (!h) {
        return err(res, 422, 'Create your host profile before listing.',
          { host_side: 'Create your host profile first.' });
      }
      hostId = h.id;
    } else if (hostSide === 'business') {
      const bizId = parseInt(b.business_id, 10);
      if (!bizId) {
        return err(res, 422, 'Choose which business this listing belongs to.',
          { business_id: 'Choose a business.' });
      }
      const acc = await businessAccess(req.user.id, bizId);
      if (!acc.business) return err(res, 422, 'Business not found.');
      if (acc.role === null) return err(res, 422, 'That business is not yours.');
      if (acc.role === 'staff') return err(res, 403, 'Staff members cannot create listings.');
      if (acc.business.status !== 'active') return err(res, 422, 'That business is not active.');
      businessId = bizId;
    } else {
      return err(res, 422, 'Choose whether this listing is hosted as an individual or a business.',
        { host_side: 'Choose individual or business.' });
    }
    const locationId = await resolveLocationId(b.city);
    const r = await runWrite(
      `INSERT INTO experience_listings
       (listing_type, category_id, host_id, business_id, location_id, title, description, city, area, address, lat, lng,
        price_from, price_unit, capacity_max, instant_book, cancellation_policy, inclusions, exclusions, safety_requirements, status, approval_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'draft')`,
      [b.listing_type, parseInt(b.category_id, 10), hostId, businessId, locationId,
       String(b.title).trim(), String(b.description).trim(), b.city,
       b.area ? String(b.area) : '', b.address ? String(b.address) : '',
       b.lat !== undefined && b.lat !== null && b.lat !== '' ? Number(b.lat) : null,
       b.lng !== undefined && b.lng !== null && b.lng !== '' ? Number(b.lng) : null,
       Number(b.price_from), b.price_unit || 'per_person',
       b.capacity_max !== undefined ? Number(b.capacity_max) : 1,
       b.instant_book ? 1 : 0, b.cancellation_policy || 'Flexible',
       Array.isArray(b.inclusions) ? JSON.stringify(b.inclusions.map(String)) : '',
       Array.isArray(b.exclusions) ? JSON.stringify(b.exclusions.map(String)) : '',
       b.safety_requirements ? String(b.safety_requirements) : '']);
    const listingId = insertId(r);
    if (hasSubtypeInput(b.listing_type, input)) {
      await saveSubtype(listingId, b.listing_type, input, Number(b.price_from));
    }
    const loaded = await loadOwnerListing(listingId);
    res.json({ ok: true, listing: loaded.item });
  }));

  // PATCH /api/experiences/:id — owner (individual host owner) or business
  // owner/manager edits. Staff role gets 403. Draft listings: any field
  // editable. Approved (active) listings: edits save and the listing stays
  // active (the "Publish" path for edits of approved listings). The owner
  // may also set status paused/active on an approved listing
  // (pause/resume). The host side cannot be changed here; moving a listing
  // between individual and business is NOT built in Phase 3 (deferred).
  router.patch('/api/experiences/:id', ah(auth), ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const listing = id ? await getOne('SELECT * FROM experience_listings WHERE id = ?', [id]) : null;
    if (!listing) return err(res, 404, 'Experience not found.');
    const access = await listingAccess(req.user.id, listing);
    if (access === null) return err(res, 403, 'Not authorized.');
    if (access === 'staff') return err(res, 403, 'Staff members cannot edit listings.');
    const b = req.body || {};
    if (b.listing_type !== undefined && b.listing_type !== listing.listing_type) {
      return err(res, 422, 'Listing type cannot be changed.',
        { listing_type: 'Listing type cannot be changed.' });
    }
    if (b.host_id !== undefined || b.business_id !== undefined || b.host_side !== undefined) {
      return err(res, 422, 'A listing cannot be moved between individual and business hosting here.',
        { host_side: 'Moving a listing is not supported yet.' });
    }
    const f = {};
    if (b.category_id !== undefined) {
      const cat = await getOne('SELECT id FROM experience_categories WHERE id = ? AND active = 1',
        [parseInt(b.category_id, 10) || 0]);
      if (!cat) f.category_id = 'Choose a valid category.';
    }
    if (b.title !== undefined && String(b.title).trim().length < 3) f.title = 'Give the listing a title (3+ characters).';
    if (b.description !== undefined && String(b.description).trim().length < 10) f.description = 'Describe the listing (10+ characters).';
    if (b.city !== undefined && !CITIES.includes(b.city)) f.city = 'Choose a valid city.';
    if (b.price_from !== undefined) {
      const pe = listingPriceError(b.price_from, listing.listing_type);
      if (pe) f.price_from = pe;
    }
    if (b.price_unit !== undefined && !EXP_PRICE_UNITS.includes(b.price_unit)) f.price_unit = 'Choose a valid price unit.';
    if (b.cancellation_policy !== undefined && !EXP_CANCELLATION_POLICIES.includes(b.cancellation_policy)) {
      f.cancellation_policy = 'Choose a valid cancellation policy.';
    }
    if (b.capacity_max !== undefined) {
      const c = Number(b.capacity_max);
      if (!Number.isInteger(c) || c < 1) f.capacity_max = 'Capacity must be at least 1.';
    }
    if (b.inclusions !== undefined && !Array.isArray(b.inclusions)) f.inclusions = 'Inclusions must be a list.';
    if (b.exclusions !== undefined && !Array.isArray(b.exclusions)) f.exclusions = 'Exclusions must be a list.';
    if (b.status !== undefined) {
      if (listing.approval_status !== 'approved' || !['active', 'paused'].includes(b.status)) {
        f.status = 'Only an approved listing can be paused or resumed.';
      }
    }
    const input = subtypeInput(b);
    let mergedSubtype = null;
    if (hasSubtypeInput(listing.listing_type, input)) {
      const cur = await currentSubtype(listing.id, listing.listing_type);
      mergedSubtype = { ...(cur || {}), ...definedOnly(input) };
      const sp = validateSubtype(listing.listing_type, mergedSubtype,
        b.price_from !== undefined ? Number(b.price_from) : Number(listing.price_from));
      Object.assign(f, sp);
    }
    if (Object.keys(f).length) return err(res, 422, 'Check the listing details.', f);
    const sets = [];
    const args = [];
    const setStr = (col, v) => { sets.push(`${col} = ?`); args.push(v); };
    if (b.title !== undefined) setStr('title', String(b.title).trim());
    if (b.description !== undefined) setStr('description', String(b.description).trim());
    if (b.city !== undefined) {
      setStr('city', b.city);
      setStr('location_id', await resolveLocationId(b.city));
    }
    if (b.area !== undefined) setStr('area', String(b.area));
    if (b.address !== undefined) setStr('address', String(b.address));
    if (b.lat !== undefined) setStr('lat', (b.lat === null || b.lat === '') ? null : Number(b.lat));
    if (b.lng !== undefined) setStr('lng', (b.lng === null || b.lng === '') ? null : Number(b.lng));
    if (b.price_from !== undefined) setStr('price_from', Number(b.price_from));
    if (b.price_unit !== undefined) setStr('price_unit', b.price_unit);
    if (b.capacity_max !== undefined) setStr('capacity_max', Number(b.capacity_max));
    if (b.instant_book !== undefined) setStr('instant_book', b.instant_book ? 1 : 0);
    if (b.cancellation_policy !== undefined) setStr('cancellation_policy', b.cancellation_policy);
    if (b.inclusions !== undefined) setStr('inclusions', JSON.stringify(b.inclusions.map(String)));
    if (b.exclusions !== undefined) setStr('exclusions', JSON.stringify(b.exclusions.map(String)));
    if (b.safety_requirements !== undefined) setStr('safety_requirements', String(b.safety_requirements));
    if (b.category_id !== undefined) setStr('category_id', parseInt(b.category_id, 10));
    if (b.status !== undefined) setStr('status', b.status);
    if (sets.length) {
      await runWrite(
        `UPDATE experience_listings SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...args, id]);
    }
    if (mergedSubtype) {
      await saveSubtype(id, listing.listing_type, mergedSubtype,
        b.price_from !== undefined ? Number(b.price_from) : Number(listing.price_from));
    }
    const loaded = await loadOwnerListing(id);
    res.json({ ok: true, listing: loaded.item });
  }));

  // POST /api/experiences/:id/photos — owner/manager appends photos.
  // Images only (JPEG/PNG/WebP), at most 8 photos total per listing
  // (Zac's cap; the item that changes if object storage is chosen later),
  // each photo at most 2,500,000 characters. First photo is the cover
  // (lowest sort).
  router.post('/api/experiences/:id/photos', ah(auth), productLimiter, ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const listing = id ? await getOne('SELECT * FROM experience_listings WHERE id = ?', [id]) : null;
    if (!listing) return err(res, 404, 'Experience not found.');
    const access = await listingAccess(req.user.id, listing);
    if (access === null || access === 'staff') return err(res, 403, 'Not authorized.');
    const b = req.body || {};
    const incoming = Array.isArray(b.photos) ? b.photos : (typeof b.image === 'string' ? [b.image] : []);
    if (!incoming.length) return err(res, 422, 'Attach at least one photo.', { photos: 'Attach at least one photo.' });
    for (const p of incoming) {
      const parsed = parseDataUri(p);
      if (!parsed || !['image/jpeg', 'image/png', 'image/webp'].includes(parsed.mime)) {
        return err(res, 422, 'Each photo must be a JPG, PNG or WebP image.',
          { photos: 'Each photo must be a JPG, PNG or WebP image.' });
      }
      if (String(p).length > EXP_DOC_MAX_LEN) {
        return err(res, 422, 'Each photo must be under about 2 MB.',
          { photos: 'Each photo must be under about 2 MB.' });
      }
    }
    const countRow = await getOne(
      'SELECT COUNT(*) AS c, COALESCE(MAX(sort), -1) AS max_sort FROM experience_listing_media WHERE listing_id = ?',
      [id]);
    const current = Number(countRow.c || 0);
    if (current + incoming.length > EXP_MAX_PHOTOS) {
      return err(res, 422, `Up to ${EXP_MAX_PHOTOS} photos per listing.`,
        { photos: `Up to ${EXP_MAX_PHOTOS} photos per listing.` });
    }
    let sort = Number(countRow.max_sort) + 1;
    const added = [];
    for (const p of incoming) {
      const parsed = parseDataUri(p);
      const r = await runWrite(
        'INSERT INTO experience_listing_media (listing_id, image, mime, sort) VALUES (?, ?, ?, ?)',
        [id, p, parsed.mime, sort]);
      added.push({ id: insertId(r), sort });
      sort++;
    }
    res.json({ ok: true, photos: added });
  }));

  // POST /api/experiences/:id/photos/:photoId/cover — owner/manager makes
  // that photo the cover (swap sort values so it becomes sort 0).
  router.post('/api/experiences/:id/photos/:photoId/cover', ah(auth), ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const photoId = parseInt(req.params.photoId, 10);
    const listing = id ? await getOne('SELECT * FROM experience_listings WHERE id = ?', [id]) : null;
    if (!listing) return err(res, 404, 'Experience not found.');
    const access = await listingAccess(req.user.id, listing);
    if (access === null || access === 'staff') return err(res, 403, 'Not authorized.');
    const photo = photoId
      ? await getOne('SELECT * FROM experience_listing_media WHERE id = ? AND listing_id = ?', [photoId, id])
      : null;
    if (!photo) return err(res, 404, 'Photo not found.');
    const cover = await getOne(
      'SELECT * FROM experience_listing_media WHERE listing_id = ? ORDER BY sort, id LIMIT 1', [id]);
    if (cover && Number(cover.id) !== Number(photo.id)) {
      await runWrite('UPDATE experience_listing_media SET sort = ? WHERE id = ?', [photo.sort, cover.id]);
      await runWrite('UPDATE experience_listing_media SET sort = 0 WHERE id = ?', [photo.id]);
    }
    res.json({ ok: true });
  }));

  // DELETE /api/experiences/:id/photos/:photoId — owner/manager removes
  // a photo.
  router.delete('/api/experiences/:id/photos/:photoId', ah(auth), ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const photoId = parseInt(req.params.photoId, 10);
    const listing = id ? await getOne('SELECT * FROM experience_listings WHERE id = ?', [id]) : null;
    if (!listing) return err(res, 404, 'Experience not found.');
    const access = await listingAccess(req.user.id, listing);
    if (access === null || access === 'staff') return err(res, 403, 'Not authorized.');
    const photo = photoId
      ? await getOne('SELECT * FROM experience_listing_media WHERE id = ? AND listing_id = ?', [photoId, id])
      : null;
    if (!photo) return err(res, 404, 'Photo not found.');
    await runWrite('DELETE FROM experience_listing_media WHERE id = ?', [photoId]);
    res.json({ ok: true });
  }));

  // POST /api/experiences/:id/submit — draft -> approval submitted. This
  // is the publish path for new listings (no separate publish endpoint;
  // see header). Requires the caller's host status to be 'approved' (422
  // with the "must be approved before you can publish" hint otherwise),
  // and the listing to be complete: title, description, category, city,
  // price valid, at least 1 photo. Sets approval_status 'submitted'.
  router.post('/api/experiences/:id/submit', ah(auth), ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const listing = id ? await getOne('SELECT * FROM experience_listings WHERE id = ?', [id]) : null;
    if (!listing) return err(res, 404, 'Experience not found.');
    const access = await listingAccess(req.user.id, listing);
    if (access === null) return err(res, 403, 'Not authorized.');
    if (access === 'staff') return err(res, 403, 'Staff members cannot submit listings.');
    if (!['draft', 'additional_info', 'rejected'].includes(listing.approval_status)) {
      return err(res, 422, 'Only a draft listing can be submitted for approval.');
    }
    if (listing.host_id != null) {
      const h = await getOne('SELECT status FROM experience_hosts WHERE id = ?', [listing.host_id]);
      if (!h || h.status !== 'approved') {
        return err(res, 422, 'Your host application must be approved before you can publish.',
          { host: 'Your host application must be approved before you can publish.' });
      }
    } else if (listing.business_id != null) {
      const b = await getOne('SELECT status FROM businesses WHERE id = ?', [listing.business_id]);
      const link = await getOne(
        'SELECT experiences_status FROM experience_businesses WHERE business_id = ?',
        [listing.business_id]);
      if (!b || b.status !== 'active' || (link && link.experiences_status !== 'active')) {
        return err(res, 422, 'Your host application must be approved before you can publish.',
          { host: 'Your host application must be approved before you can publish.' });
      }
    }
    const f = {};
    if (!String(listing.title || '').trim()) f.title = 'Add a title.';
    if (!listing.description || String(listing.description).trim().length < 10) {
      f.description = 'Describe the listing (10+ characters).';
    }
    if (!listing.category_id) f.category_id = 'Choose a category.';
    if (!listing.city) f.city = 'Choose a city.';
    const pe = listingPriceError(listing.price_from, listing.listing_type);
    if (pe) f.price_from = pe;
    const photoCount = await getOne(
      'SELECT COUNT(*) AS c FROM experience_listing_media WHERE listing_id = ?', [id]);
    if (Number(photoCount.c || 0) < 1) f.photos = 'Add at least one photo.';
    if (Object.keys(f).length) return err(res, 422, 'Complete the listing before submitting.', f);
    await runWrite(
      "UPDATE experience_listings SET approval_status = 'submitted', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [id]);
    const loaded = await loadOwnerListing(id);
    res.json({ ok: true, listing: loaded.item });
  }));

  // GET /api/experiences/host/listings — the caller's listings across both
  // host sides (individual + businesses they own/manage), paginated
  // (page/limit, same pattern as the public list).
  router.get('/api/experiences/host/listings', ah(auth), ah(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    let limit = parseInt(req.query.limit || String(LIST_LIMIT_DEFAULT), 10);
    if (!Number.isFinite(limit) || limit < 1) limit = LIST_LIMIT_DEFAULT;
    if (limit > LIST_LIMIT_MAX) limit = LIST_LIMIT_MAX;
    const h = await myHost(req.user.id);
    const bizIds = await myExperienceBusinessIds(req.user.id);
    const conds = [];
    const params = [];
    if (h) { conds.push('l.host_id = ?'); params.push(h.id); }
    if (bizIds.length) {
      conds.push(`l.business_id IN (${bizIds.map(() => '?').join(',')})`);
      params.push(...bizIds);
    }
    if (!conds.length) {
      return res.json({ listings: [], total: 0, page, totalPages: 1, limit, remaining: 0 });
    }
    const where = 'WHERE (' + conds.join(' OR ') + ')';
    const rows = await getAll(
      `${EXP_SELECT} ${where} ORDER BY l.created_at DESC, l.id DESC LIMIT ?`,
      [...params, CANDIDATE_CAP]);
    const locMap = await loadLocationMap();
    const items = rows.map((r) => {
      const it = serializeListing(r, locMap);
      it.approval_status = r.approval_status;
      it.approval_note = r.approval_note || '';
      return it;
    });
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    res.json({
      listings: items.slice((page - 1) * limit, page * limit),
      total, page, totalPages, limit, remaining: Math.max(0, total - page * limit),
    });
  }));

  // GET /api/experiences/host/dashboard — individual profile, business
  // links, up to 5 most recent listings, counts, documents, invites.
  // requests/bookings/earnings are real zeros in Phase 3: those tables do
  // not exist yet. No numbers are invented.
  router.get('/api/experiences/host/dashboard', ah(auth), ah(async (req, res) => {
    const h = await myHost(req.user.id);
    const businesses = await businessLinksForUser(req.user.id);
    const bizIds = await myExperienceBusinessIds(req.user.id);
    const conds = [];
    const params = [];
    if (h) { conds.push('l.host_id = ?'); params.push(h.id); }
    if (bizIds.length) {
      conds.push(`l.business_id IN (${bizIds.map(() => '?').join(',')})`);
      params.push(...bizIds);
    }
    let listings = [];
    let counts = { listings: 0, drafts: 0, active: 0, requests: 0, bookings: 0, earnings: 0 };
    if (conds.length) {
      const where = 'WHERE (' + conds.join(' OR ') + ')';
      const rows = await getAll(
        `${EXP_SELECT} ${where} ORDER BY l.created_at DESC, l.id DESC LIMIT 5`, params);
      const locMap = await loadLocationMap();
      listings = rows.map((r) => {
        const it = serializeListing(r, locMap);
        it.approval_status = r.approval_status;
        it.approval_note = r.approval_note || '';
        return it;
      });
      const c = await getOne(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS drafts,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
         FROM experience_listings l ${where}`,
        params);
      counts = {
        listings: Number(c.total || 0), drafts: Number(c.drafts || 0), active: Number(c.active || 0),
        requests: 0, bookings: 0, earnings: 0,
      };
    }
    const documents = await myDocs(req.user.id);
    const invites = await myPendingInvites(req.user.id);
    res.json({ ok: true, individual: serializeHost(h), businesses, listings, counts, documents, invites });
  }));

  // ------------------------------------------------------------ admin (API only; review UI is Phase 5)
  // All admin-only via isAdmin. Support may READ the documents queue but
  // may not decide anything.

  // PATCH /api/admin/experiences/hosts/:id — approve / reject /
  // request_info / suspend / unsuspend a host application. reject and
  // request_info require a note, stored verbatim in verification_note.
  router.patch('/api/admin/experiences/hosts/:id', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const id = parseInt(req.params.id, 10);
    const row = await getOne('SELECT * FROM experience_hosts WHERE id = ?', [id]);
    if (!row) return err(res, 404, 'Host not found.');
    const decision = String((req.body || {}).decision || '');
    if (!['approve', 'reject', 'request_info', 'suspend', 'unsuspend'].includes(decision)) {
      return err(res, 422, 'Decision must be approve, reject, request_info, suspend or unsuspend.');
    }
    const note = String((req.body || {}).note || '').trim().slice(0, 300);
    if ((decision === 'reject' || decision === 'request_info') && !note) {
      return err(res, 422, 'A note is required.', { note: 'Add a note explaining the decision.' });
    }
    if (decision === 'unsuspend' && row.status !== 'suspended') {
      return err(res, 422, 'Only a suspended host can be unsuspended.');
    }
    const next = decision === 'approve' ? 'approved'
      : decision === 'reject' ? 'rejected'
      : decision === 'request_info' ? 'additional_info'
      : decision === 'suspend' ? 'suspended' : 'approved';
    await runWrite(
      'UPDATE experience_hosts SET status = ?, verification_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [next, note || row.verification_note || '', id]);
    logAdmin(req, 'experience.host.' + decision, 'experience_host', id,
      `${row.display_name}: ${row.status} -> ${next}${note ? ' (' + note + ')' : ''}`);
    const updated = await getOne('SELECT * FROM experience_hosts WHERE id = ?', [id]);
    res.json({ ok: true, host: serializeHost(updated) });
  }));

  // PATCH /api/admin/experiences/hosts/:id/verify — set verification_status
  // (separate from approval: approval gates publishing, verification is
  // the badge).
  router.patch('/api/admin/experiences/hosts/:id/verify', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const id = parseInt(req.params.id, 10);
    const row = await getOne('SELECT * FROM experience_hosts WHERE id = ?', [id]);
    if (!row) return err(res, 404, 'Host not found.');
    const decision = String((req.body || {}).decision || '');
    if (!['verified', 'rejected'].includes(decision)) {
      return err(res, 422, 'Decision must be verified or rejected.');
    }
    const note = String((req.body || {}).note || '').trim().slice(0, 300);
    await runWrite(
      'UPDATE experience_hosts SET verification_status = ?, verification_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [decision, note || row.verification_note || '', id]);
    logAdmin(req, 'experience.host.verify', 'experience_host', id,
      `${row.display_name}: ${decision}${note ? ' (' + note + ')' : ''}`);
    const updated = await getOne('SELECT * FROM experience_hosts WHERE id = ?', [id]);
    res.json({ ok: true, host: serializeHost(updated) });
  }));

  // GET /api/admin/experiences/hosts — list host applications, filter by
  // ?status=, with the business links included. No document images.
  router.get('/api/admin/experiences/hosts', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const status = req.query.status ? String(req.query.status) : '';
    if (status && !EXP_HOST_STATUSES.includes(status)) return err(res, 422, 'Invalid status filter.');
    const rows = status
      ? await getAll('SELECT * FROM experience_hosts WHERE status = ? ORDER BY updated_at DESC, id DESC', [status])
      : await getAll('SELECT * FROM experience_hosts ORDER BY updated_at DESC, id DESC');
    const hosts = [];
    for (const r of rows) {
      const h = serializeHost(r);
      h.businesses = await businessLinksForUser(Number(r.user_id));
      hosts.push(h);
    }
    res.json({ hosts });
  }));

  // GET /api/admin/experiences/documents — verification queue: documents
  // with host/business identity, kind, status, submitted_at. No image
  // data in the list. Support may read this queue but may NOT decide.
  router.get('/api/admin/experiences/documents', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user) && !isSupport(req.user)) return err(res, 403, 'Not authorized.');
    const status = req.query.status ? String(req.query.status) : '';
    if (status && !['pending', 'approved', 'rejected'].includes(status)) {
      return err(res, 422, 'Invalid status filter.');
    }
    const select = `SELECT d.*, hu.name AS host_name, b.name AS business_name, su.name AS submitted_by_name
     FROM experience_host_verifications d
     LEFT JOIN experience_hosts h ON h.id = d.host_id
     LEFT JOIN users hu ON hu.id = h.user_id
     LEFT JOIN businesses b ON b.id = d.business_id
     LEFT JOIN users su ON su.id = d.submitted_by`;
    const rows = status
      ? await getAll(`${select} WHERE d.status = ? ORDER BY d.created_at DESC, d.id DESC`, [status])
      : await getAll(`${select} ORDER BY d.created_at DESC, d.id DESC`);
    res.json({
      documents: rows.map((d) => ({
        ...serializeDoc(d),
        host_name: d.host_name || '', business_name: d.business_name || '',
        submitted_by_name: d.submitted_by_name || '', submitted_at: d.created_at,
      })),
    });
  }));

  // PATCH /api/admin/experiences/documents/:id — approve / reject a
  // verification document. Sets status, reviewed_by, review_note.
  router.patch('/api/admin/experiences/documents/:id', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const id = parseInt(req.params.id, 10);
    const row = await getOne('SELECT * FROM experience_host_verifications WHERE id = ?', [id]);
    if (!row) return err(res, 404, 'Document not found.');
    const decision = String((req.body || {}).decision || '');
    if (!['approved', 'rejected'].includes(decision)) {
      return err(res, 422, 'Decision must be approved or rejected.');
    }
    const note = String((req.body || {}).note || '').trim().slice(0, 300);
    let expires = row.expires_at;
    if ((req.body || {}).expires_at !== undefined && (req.body || {}).expires_at !== null
      && (req.body || {}).expires_at !== '') {
      if (!isDateStr(String((req.body || {}).expires_at))) {
        return err(res, 422, 'expires_at must be YYYY-MM-DD.',
          { expires_at: 'Use YYYY-MM-DD.' });
      }
      expires = String((req.body || {}).expires_at);
    }
    await runWrite(
      'UPDATE experience_host_verifications SET status = ?, reviewed_by = ?, review_note = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [decision, req.user.id, note, expires, id]);
    logAdmin(req, 'experience.document.' + decision, 'experience_host_verification', id,
      `${row.kind} #${id}: ${decision}${note ? ' (' + note + ')' : ''}`);
    const updated = await getOne('SELECT * FROM experience_host_verifications WHERE id = ?', [id]);
    res.json({ ok: true, document: serializeDoc(updated) });
  }));

  // PATCH /api/admin/experiences/:id — approve / reject / request_info /
  // suspend / unsuspend a LISTING. approve publishes it (approval_status
  // approved AND status active). reject / request_info require a note,
  // stored in approval_note. unsuspend only from an approved listing.
  router.patch('/api/admin/experiences/:id', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const id = parseInt(req.params.id, 10);
    const row = await getOne('SELECT * FROM experience_listings WHERE id = ?', [id]);
    if (!row) return err(res, 404, 'Experience not found.');
    const decision = String((req.body || {}).decision || '');
    if (!['approve', 'reject', 'request_info', 'suspend', 'unsuspend'].includes(decision)) {
      return err(res, 422, 'Decision must be approve, reject, request_info, suspend or unsuspend.');
    }
    const note = String((req.body || {}).note || '').trim().slice(0, 300);
    if ((decision === 'reject' || decision === 'request_info') && !note) {
      return err(res, 422, 'A note is required.', { note: 'Add a note explaining the decision.' });
    }
    let approval = row.approval_status;
    let status = row.status;
    if (decision === 'approve') { approval = 'approved'; status = 'active'; }
    else if (decision === 'reject') { approval = 'rejected'; }
    else if (decision === 'request_info') { approval = 'additional_info'; }
    else if (decision === 'suspend') { status = 'suspended'; }
    else if (decision === 'unsuspend') {
      if (row.approval_status !== 'approved') {
        return err(res, 422, 'Only an approved listing can be unsuspended.');
      }
      status = 'active';
    }
    await runWrite(
      'UPDATE experience_listings SET approval_status = ?, approval_note = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [approval,
       (decision === 'reject' || decision === 'request_info') ? note : (note || row.approval_note || ''),
       status, id]);
    logAdmin(req, 'experience.listing.' + decision, 'experience_listing', id,
      `${row.title}: ${decision}${note ? ' (' + note + ')' : ''}`);
    const loaded = await loadOwnerListing(id);
    res.json({ ok: true, listing: loaded.item });
  }));

  // PATCH /api/admin/experiences/businesses/:id/commission — set
  // commission_rate_override (integer 0-100, or null for the platform
  // default). Admin only; staff and owners get 403. :id is the business
  // id, or the link id as a fallback.
  router.patch('/api/admin/experiences/businesses/:id/commission', ah(auth), ah(async (req, res) => {
    if (!isAdmin(req.user)) return err(res, 403, 'Not authorized.');
    const id = parseInt(req.params.id, 10);
    let link = id ? await getOne('SELECT * FROM experience_businesses WHERE business_id = ?', [id]) : null;
    if (!link && id) link = await getOne('SELECT * FROM experience_businesses WHERE id = ?', [id]);
    if (!link) return err(res, 422, 'Business has not opted in to Experiences.');
    const rate = (req.body || {}).rate;
    if (rate !== null && rate !== undefined) {
      if (!Number.isInteger(Number(rate)) || Number(rate) < 0 || Number(rate) > 100) {
        return err(res, 422, 'Rate must be a whole number from 0 to 100, or null for the platform default.',
          { rate: 'Rate must be 0-100 or null.' });
      }
    }
    await runWrite(
      'UPDATE experience_businesses SET commission_rate_override = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [rate === null || rate === undefined ? null : Number(rate), link.id]);
    logAdmin(req, 'experience.business.commission', 'experience_business', link.id,
      `business ${link.business_id}: commission ${rate === null || rate === undefined ? 'default' : rate + '%'}`);
    const updated = await getOne('SELECT * FROM experience_businesses WHERE id = ?', [link.id]);
    res.json({ ok: true, link: await serializeBusinessLink(updated) });
  }));

  // ------------------------------------------------------------ detail
  // GET /api/experiences/:id — public detail. Only active listings are
  // public in Phase 2 (owner/admin preview lands in Phase 3). No phone
  // numbers, no host documents. Reviews show no rating where there are
  // no reviews (no experience_reviews table until Phase 5).
  //
  // Phase 3 owner/suspended behaviour: a SUSPENDED listing returns 200
  // with { ok: true, suspended: true, listing: { id, title, status } }
  // so the frontend renders "This listing is not available" with a link
  // back; draft/submitted/under_review/additional_info/rejected listings
  // still return 404. A signed-in owner of an active listing gets
  // is_owner: true plus approval_status (never shown to guests).
  router.get('/api/experiences/:id', ah(maybeAuth), ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return err(res, 404, 'Experience not found.');
    const row = await getOne(`${EXP_SELECT} WHERE l.id = ?`, [id]);
    if (!row) return err(res, 404, 'Experience not found.');
    if (row.status === 'suspended') {
      return res.json({ ok: true, suspended: true, listing: { id: Number(row.id), title: row.title, status: 'suspended' } });
    }
    if (row.status !== 'active') return err(res, 404, 'Experience not found.');

    const locMap = await loadLocationMap();
    const item = serializeListing(row, locMap);

    const isOwner = !!req.user && (
      (row.host_user_id != null && Number(req.user.id) === Number(row.host_user_id)) ||
      (row.business_id != null && Number(req.user.id) === Number(row.business_owner_id || -1))
    );
    item.is_owner = isOwner;
    if (isOwner) {
      item.approval_status = row.approval_status;
      item.approval_note = row.approval_note || '';
    }
    if (!isOwner) {
      runWrite('UPDATE experience_listings SET view_count = view_count + 1 WHERE id = ?', [id]).catch(() => {});
    }

    const photos = await getAll(
      'SELECT id FROM experience_listing_media WHERE listing_id = ? ORDER BY sort, id', [id]);
    item.photos = photos.map((ph) => ({ id: Number(ph.id), url: `/api/experiences/${id}/photos/${ph.id}` }));

    // Per-category detail rows (UI Spec 5.2-5.7).
    let details = null;
    if (row.listing_type === 'stay') {
      const p = await getOne('SELECT * FROM experience_properties WHERE listing_id = ?', [id]);
      const units = p ? await getAll(
        "SELECT id, name, unit_type, sleeps, quantity, price_per_night FROM experience_property_units WHERE property_id = ? AND status = 'active' ORDER BY id",
        [id]) : [];
      details = p ? {
        property_type: p.property_type, star_rating: p.star_rating,
        check_in_time: p.check_in_time || '', check_out_time: p.check_out_time || '',
        max_guests: Number(p.max_guests || 0), bedrooms: Number(p.bedrooms || 0),
        bathrooms: Number(p.bathrooms || 0),
        amenities: parseJsonList(p.amenities), house_rules: p.house_rules || '',
        units: units.map((u) => ({
          id: Number(u.id), name: u.name, unit_type: u.unit_type,
          sleeps: Number(u.sleeps), quantity: Number(u.quantity),
          price_per_night: Number(u.price_per_night),
        })),
      } : null;
    } else if (row.listing_type === 'vehicle') {
      const v = await getOne('SELECT * FROM experience_vehicles WHERE listing_id = ?', [id]);
      details = v ? {
        vehicle_type: v.vehicle_type, make: v.make || '', model: v.model || '',
        year: v.year, seats: Number(v.seats || 0),
        transmission: v.transmission || '', fuel: v.fuel || '',
        driver_included: !!v.driver_included,
        price_per_day: Number(v.price_per_day || 0),
      } : null;
    } else if (row.listing_type === 'tour') {
      const t = await getOne('SELECT * FROM experience_tours WHERE listing_id = ?', [id]);
      details = t ? {
        duration_hours: t.duration_hours, duration_days: Number(t.duration_days || 0),
        group_size_max: Number(t.group_size_max || 0), group_size_min: Number(t.group_size_min || 0),
        meeting_point: t.meeting_point || '',
        meeting_lat: t.meeting_lat != null ? Number(t.meeting_lat) : null,
        meeting_lng: t.meeting_lng != null ? Number(t.meeting_lng) : null,
        itinerary: t.itinerary || '', included: t.included || '', excluded: t.excluded || '',
        price_per_person: Number(t.price_per_person || 0),
      } : null;
    } else if (row.listing_type === 'event') {
      const e = await getOne('SELECT * FROM experience_events WHERE listing_id = ?', [id]);
      details = e ? {
        venue_name: e.venue_name || '', event_date: e.event_date,
        doors_time: e.doors_time || '', ends_at: e.ends_at || '',
        ticket_capacity: Number(e.ticket_capacity || 0), age_limit: e.age_limit,
      } : null;
    }
    item.details = details;
    item.inclusions = parseJsonList(row.inclusions);
    item.exclusions = parseJsonList(row.exclusions);
    item.safety_requirements = row.safety_requirements || '';
    // Reviews: no table until Phase 5, so no rating and no reviews.
    item.reviews = { rating_avg: null, rating_count: 0, reviews: [] };
    // Availability: no calendar table until Phase 4; shown as text and
    // validated at booking time (UI Spec 5.1).
    item.availability_text = null;

    // Related listings: same category, same city first, excluding self.
    const relRows = await getAll(
      `${EXP_SELECT} WHERE l.status = 'active' AND l.id != ? AND l.category_id = ?
       ORDER BY (l.city = ?) DESC, l.created_at DESC, l.id DESC LIMIT 8`,
      [id, row.category_id, row.city]
    );
    const related = relRows.map((r) => serializeListing(r, locMap));

    res.json({ experience: item, related });
  }));

  return router;
}

module.exports = createExperiencesRouter;
module.exports.isInZambia = isInZambia;
module.exports.ZAMBIA_BOUNDS = ZAMBIA_BOUNDS;
module.exports.EXP_PRICE_MAX = EXP_PRICE_MAX;
module.exports.EXP_PRICE_MIN = EXP_PRICE_MIN;
module.exports.EXP_MAX_PHOTOS = EXP_MAX_PHOTOS;
module.exports.EXP_PRICE_UNITS = EXP_PRICE_UNITS;
module.exports.EXP_CANCELLATION_POLICIES = EXP_CANCELLATION_POLICIES;

'use strict';
/**
 * 2911 Experiences — public browse API (Phase 2 backend).
 *
 * Module split (coordinator decision, Nov 8, 2026): this router module is
 * mounted from server.js and shares the existing auth, maybeAuth, ah, err,
 * runWrite, getOne, getAll and listCache helpers via the factory deps. It
 * must not change any existing route. No write endpoints exist in this
 * phase: listing creation is Phase 3, bookings Phase 4.
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
const LIST_LIMIT_DEFAULT = 20;
const LIST_LIMIT_MAX = 20;
const CANDIDATE_CAP = 500;

function createExperiencesRouter(deps) {
  const { ah, err, maybeAuth, getOne, getAll, runWrite, listCache } = deps;
  const router = express.Router();

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

  // Host card for a listing row. Individual hosts come from the users row
  // (Phase 3 adds the experience_hosts profile); business hosts from the
  // businesses row. Never includes a phone number, WhatsApp or email.
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
      name: r.host_name || '', city: r.host_city || '',
      verified: r.host_selfie_status === 'approved',
      rating_avg: null, rating_count: 0,
      avatar: r.host_has_avatar ? `/api/users/${r.host_id}/avatar` : '',
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
           u.name AS host_name, u.city AS host_city,
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
    LEFT JOIN users u ON u.id = l.host_id
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
    // individual host deactivated their account, is not public.
    conds.push("(l.business_id IS NULL OR EXISTS (SELECT 1 FROM businesses b2 WHERE b2.id = l.business_id AND b2.status = 'active'))");
    conds.push("(l.host_id IS NULL OR EXISTS (SELECT 1 FROM users u2 WHERE u2.id = l.host_id AND u2.deactivated_at IS NULL))");

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

  // ------------------------------------------------------------ detail
  // GET /api/experiences/:id — public detail. Only active listings are
  // public in Phase 2 (owner/admin preview lands in Phase 3). No phone
  // numbers, no host documents. Reviews show no rating where there are
  // no reviews (no experience_reviews table until Phase 5).
  router.get('/api/experiences/:id', ah(maybeAuth), ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return err(res, 404, 'Experience not found.');
    const row = await getOne(`${EXP_SELECT} WHERE l.id = ?`, [id]);
    if (!row || row.status !== 'active') return err(res, 404, 'Experience not found.');

    const locMap = await loadLocationMap();
    const item = serializeListing(row, locMap);

    const isOwner = !!req.user && (
      (row.host_id != null && req.user.id === Number(row.host_id)) ||
      (row.business_id != null && req.user.id === Number(row.business_owner_id || -1))
    );
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

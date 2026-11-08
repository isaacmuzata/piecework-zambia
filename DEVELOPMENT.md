# PieceWork Zambia 2.0: development notes

This repository is the **2.0 development copy**. Production
(`isaacmuzata/piecework-zambia`, live at pieceworkzambia.com) is a
separate repo and is never touched from here. 2.0 work lands here first,
gets tested here, and is only promoted to production as a deliberate,
separately approved step.

## Rules

1. Never copy production data, `.env` files, signing keys, or credentials
   into this repo. Tests use synthetic users only.
2. Every milestone ends with: `npm test` green, a browser journey check,
   a commit, and a go/no-go note for the milestone owner.
3. Database changes are additive migrations only (new tables, new
   optional columns via `OPTIONAL_COLUMNS` in `db.js`). Never rename or
   drop a column in place; the `jobs.pay_type` CHECK constraint lives in
   the table definition, so changing it needs a table-rebuild migration
   tested against a simulated old-schema database first.
4. Frontend changes must bump `CACHE` (`pwz-vN`) and `ASSET_V` (`v=N`)
   in `public/sw.js`, plus the `?v=N` asset refs in `public/index.html`.
5. No payment processing, commissions, subscriptions, or listing fees.
   The platform is free; users arrange payment between themselves.

## Running locally

```bash
npm ci
PORT=3100 ADMIN_PHONES=+260970000001 node server.js   # local file DB
npm test                                              # API test suite
```

Local env lives in `local.env` (not committed): a fresh JWT secret, a
local port, and a test admin phone.

## Tests

`tests/api.test.js` boots the real server against a throwaway database
and walks the user journeys over HTTP: registration, orientation, jobs,
applications, the hire and NRC flow, admin boards, and the M0 safety
pack (reports, blocking, suspension, audit log, managed categories).
Exit code 0 means all checks passed. Add a check for every new endpoint
and every bug fix; a fix without a test is not done.

## Backup and restore

- Before any risky change or migration: `node scripts/export-schema.js`
  writes the schema plus per-table row counts to `backups/` (no row
  data, safe to keep).
- Local file DB: copy the `.db` file itself before experimenting.
- Production (Turso): point-in-time restore is the recovery path; run
  the schema export against production before and after a migration
  and diff the two files.

## Milestone log

- **M0 (Oct 22, 2026): foundations and safety.** In-repo API test
  harness (38 checks). Schema export script. Abuse reports with an
  admin queue. User blocking enforced on applications, conversation
  creation, conversation reads, and message sends. Account suspension
  enforced at login and on every authenticated request, with admin
  suspend/reinstate controls. Admin audit log covering verification
  decisions, food licence decisions, password reset issues, giveaway
  create/draw, tester flags, suspensions, report resolutions, and
  category changes. Admin-managed job categories.
  - **Bug found and fixed here:** the server's category list had 10
    entries while the frontend offered 18. Jobs in Carpentry, Plumbing,
    Electrical, Bricklaying, Welding, Waiter, Bartender, and Mixologist
    could be picked in the app but were rejected by the server, so they
    could never be posted. Categories now live in the `categories`
    table (seeded with the union of both lists), the server validates
    against the table, and the app loads the live list at boot. This
    bug also exists in production v51 and needs a separate production
    fix decision.
- **M1 (Oct 22, 2026): Jobs 2.0.** Job photos (up to 3 per job,
  `job_photos` table, served from a dedicated endpoint so list
  payloads stay light). Drafts via an additive `jobs.is_draft` flag
  (no status rebuild): create with a title only, hidden from the
  public, publish endpoint validates the full job first. New job
  fields: expected_duration (fixed list), start_time,
  transport_provided, materials_provided, is_urgent, instructions.
  Application shortlist status (applications table rebuilt by
  migration to extend the CHECK constraint; verified against a
  simulated old-schema DB with data preserved). Repost a previous
  job with a fresh date, copying fields and photos. Browse filters:
  pay range, duration, urgent. Rules-based recommendations on the
  home screen (same city +3, skills match +2, within 25 km +1).
  API suite: 65 checks passing. Browser journey: 11 of 11 checks.
  Commit 6277e63. Not deployed to production.
- **M2 (Oct 22, 2026): UI/UX redesign.** Design tokens (spacing,
  type, radius, motion, z-layers) in :root, focus-visible outlines,
  reduced-motion support, 44px icon buttons. Navigation rebuilt to
  the planned five: Home, Find Work, Marketplace (Soon placeholder
  in tab bar, drawer, and desktop nav; lights up at M3), Messages,
  Profile. The old center Post tab moved to the home hero quick
  actions, the drawer, and the desktop nav. Home redesigned: town
  line under the greeting, hero quick actions, the full live
  category list as a scroll strip (was 4 fixed tiles), safety strip,
  Near you section title when a location is stored. Global search
  (#/search) across jobs and people; job search now also matches
  category and city, people search matches name, skills, bio, city
  (new q param on /api/workers). Skeletons replace spinners on the
  main lists; a standard error state with a working Try again
  (re-runs the route) replaces dead-end error text on home, browse,
  workers, saved, and messages. Responsive: new tablet breakpoint
  (641-899px, 720px shell, 2-column card grids) alongside the
  existing desktop 3-column layout; verified at 390, 768, and
  1280px widths. API suite: 68 checks passing. Browser journey:
  14 of 14 checks. Commit e5fcb17. Not deployed to production.
- **M3 (Oct 22, 2026): Marketplace.** Products with up to 5 photos
  (same pipeline as job photos), price, condition, town and area.
  Sixteen market categories seeded into the admin-managed categories
  table (new kind column value 'market'); category uniqueness is now
  per kind via a rebuild migration, and the conversations table was
  rebuilt so one chat stack serves job threads and product threads.
  Browse with search, category chips, town, condition, and price
  filters, newest / price / nearby sorting and pagination. Product
  pages carry a seller card (ID verified when the selfie is
  approved), save (on-device), report (feeds the M0 admin queue),
  message seller, and offers: one live offer per buyer, updating
  rather than duplicating; sellers accept or decline; an accepted
  offer reveals phone numbers in the product chat, mirroring the
  job hire rule. Seller dashboard (#/selling): stat cards, my
  listings in every state, offers received and made. Spam guards:
  40 listings per hour rate limit, 30 active listings cap, duplicate
  title block per seller. Hidden listings vanish from public view;
  removal is a soft delete with an admin path that is audit-logged.
  The Marketplace tab is now live in the tab bar, drawer, and
  desktop nav, and global search gained an Items for sale section.
  Also ported presence (Active now / Last seen) from production v52
  into the 2.0 line, server and client, so the rollout does not
  lose the feature testers asked for. API suite: 92 checks passing.
  Browser journey: 13 of 13 checks. Commit 43e53a7. Not deployed
  to production.
- **M4 (Oct 22, 2026): Business storefronts.** Businesses apply in
  app (name, category, town, about, logo, cover, contact, hours);
  an admin approves before the storefront goes public. The Verified
  badge is earned separately: owners upload PACRA, TPIN, or trading
  licence documents, an admin reviews them (Admin > Businesses),
  and only then does the badge appear. Unverified shops stay public
  with an Unverified label, per the recommendation Zac let stand.
  Storefronts show logo, cover, tagline, about, contact and hours,
  the owner's rating from job reviews, a catalogue of linked
  products, and the owner's open jobs. Sellers link listings to a
  live shop from the Sell form ("Sell as"); product pages and cards
  show the shop with its badge. Admins can suspend or reinstate a
  shop, and every status or verification change is audit-logged.
  Guards: max 3 storefronts per owner, document type and size
  validation, non-owner edits blocked. API suite: 107 checks
  passing. Browser journey: 8 of 8 checks. Commit in git log.
  Not deployed to production.

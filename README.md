# PieceWork Zambia 🇿🇲

**Quick jobs. Quick cash.** A mobile-first marketplace for casual day labor ("piece work") in Zambia.
People post jobs — events setup, moving help, cleaning, construction — and workers nearby apply in one tap.
Payment happens off-platform via **MTN Mobile Money** / **Airtel Money** (stated honestly in the UI; v1 does not fake a payment integration).

## Stack

- **Backend:** Node.js 20+, Express 4, SQLite via `@libsql/client` (Turso cloud DB in production, local file at `data/piecework.db` in dev), `bcryptjs`, `jsonwebtoken` (httpOnly cookie, 7-day expiry), `cookie-parser`, `express-rate-limit`, `helmet`, `cors`
- **Frontend:** vanilla JS single-page app in `public/` — hand-written CSS, no frameworks, **no CDN dependencies** at runtime (works fully offline of CDNs). Mobile-first with a bottom tab bar.
- **Config:** `.env` (`JWT_SECRET`, `PORT`, `ALLOWED_ORIGINS`)

## Quick start (local)

```bash
cd piecework-zambia
cp .env.example .env
# edit .env — set JWT_SECRET to a long random string:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

npm install
npm run seed     # demo users + 10 sample jobs (skips if data already exists)
npm start        # → http://localhost:3000
```

Demo logins (password for both: `demo1234`):

| Name | Phone | Role |
|---|---|---|
| Chanda Mwansa | +260977123456 | poster (Lusaka) |
| Bwalya Kasonde | +260966234567 | worker (Kitwe) |

### Wiping / reseeding demo data

```bash
npm run wipe        # asks for confirmation; deletes data/piecework.db
npm run wipe -- --yes   # no confirmation (scripts/CI)
npm run seed        # re-seed afterwards
```

The schema is created automatically on server start (`db.js`), so a fresh `npm start` after a wipe gives you an empty database.

## API overview

All endpoints return JSON. Auth uses an httpOnly `pw_token` cookie (7 days); `Authorization: Bearer` is also accepted. Errors look like `{ "error": "message" }` (plus `fields` for validation errors).

| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | – | `{name, phone, password, city}`; phone validated as Zambian `+260…`; auto-login |
| POST | `/api/auth/login` | – | rate-limited |
| POST | `/api/auth/logout` | – | clears cookie |
| GET | `/api/auth/me` | ✅ | current user |
| GET | `/api/jobs?city=&category=&q=&status=&page=` | – | public browse, newest first, 20/page |
| GET | `/api/jobs?lat=&lng=&max_km=` | – | **distance matching**: `distance_km` per job, nearest first, radius filter (default 50 km, `any` disables) |
| POST | `/api/jobs` | ✅ | create job; optional `lat`/`lng` pins the exact job location |
| GET | `/api/jobs/:id` | optional | poster summary + counts; applicant list only for the poster |
| PATCH | `/api/jobs/:id` | ✅ poster | edit fields; `open→cancelled/completed`, `filled→completed/cancelled` |
| POST | `/api/jobs/:id/apply` | ✅ | `{message}`; not own job; not twice |
| GET | `/api/applications/mine` | ✅ | jobs I applied to |
| GET | `/api/jobs/:id/applications` | ✅ poster | applicant list |
| PATCH | `/api/applications/:id` | ✅ | poster: `accepted`/`declined`; worker: `withdrawn`. Job auto-fills at `workers_needed` |
| GET | `/api/users/:id` | – | public profile + completed-jobs count + reviews |
| PATCH | `/api/users/me` | ✅ | edit name, city, bio, skills; optional `lat`/`lng` saves the user's location |
| POST | `/api/reviews` | ✅ | after job completed; poster↔accepted workers only; one per triple |

### Distance matching (kilometres)

Jobs are matched by distance, not just city name:

- Every job and user can carry precise `lat`/`lng` coordinates. Posters pin a job's
  GPS location from the Post form; workers save theirs from their profile ("Near me"
  on the browse page uses the phone's GPS for one-off searches).
- When no coordinates are stored, the **city centre** is used as the fallback
  (`geo.js` → `CITY_COORDS`), so distance matching still works for every listing.
- `GET /api/jobs` accepts `?lat=&lng=` (explicit viewer location; otherwise the
  signed-in user's saved location is used). With a known location each job gets
  `distance_km`, results sort **nearest first**, and `?max_km=` filters the radius
  — default **50 km**, or `max_km=any` for no radius limit.
- Jobs whose location can't be resolved (city "Other" with no GPS) sort last and
  are excluded while a finite radius applies.

## Deployment

### Render (recommended, free tier)

1. Push this folder to a GitHub repo.
2. Create a free database at [turso.tech](https://turso.tech) and grab its URL + auth token:
   ```bash
   turso db create piecework-zambia
   turso db show piecework-zambia --url            # → TURSO_DATABASE_URL
   turso db tokens create piecework-zambia         # → TURSO_AUTH_TOKEN
   ```
3. In Render: **New → Web Service →** point at the repo. Render detects `render.yaml`
   (Docker, free plan, `JWT_SECRET` auto-generated). Because the free plan cannot
   attach a persistent disk, the database lives in Turso instead of a local SQLite file.
4. After the first deploy, go to the service → **Environment** and add
   `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (they're declared `sync: false` in
   `render.yaml`, so they must be set manually). Redeploy once to pick them up.
5. Done — note the free tier sleeps after inactivity (first load takes ~30s to wake).
   Seed demo data any time with `npm run seed` pointed at the Turso DB
   (set the same two env vars locally first).

To use a custom domain (e.g. `piecework.co.zm`): Render dashboard → your service → **Settings → Custom Domains**, then set `ALLOWED_ORIGINS=https://your-domain` in the service's environment variables.

### Railway

1. `railway init` in this folder, or **New Project → Deploy from GitHub**.
2. Add variables: `NODE_ENV=production`, `JWT_SECRET=<long random string>`.
3. Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` from your free Turso database
   (a local SQLite file is lost on redeploy, and volumes cost extra).
4. Railway assigns a public domain automatically; add your custom domain under **Settings → Networking** and set `ALLOWED_ORIGINS` to match.

### VPS (Ubuntu, any host)

```bash
# on the server
sudo apt install -y nodejs npm nginx certbot python3-certbot-nginx
git clone <your-repo> piecework-zambia && cd piecework-zambia
cp .env.example .env   # set JWT_SECRET + PORT=3000
npm install --omit=dev
# run under pm2 (or systemd)
sudo npm i -g pm2
pm2 start server.js --name piecework
pm2 save && pm2 startup   # follow the printed instructions

# nginx reverse proxy → certbot for HTTPS
sudo nano /etc/nginx/sites-available/piecework   # proxy_pass http://127.0.0.1:3000;
sudo ln -s /etc/nginx/sites-available/piecework /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

Backups: production data lives in Turso (automatic backups on their side). Local dev
still uses the single file `data/piecework.db` — copy it nightly (`cron` + `scp`/`rsync`)
and you're covered.

## Project structure

```
piecework-zambia/
├── server.js            # Express app: API + static frontend + SPA fallback
├── db.js                # DB layer (@libsql/client): Turso cloud in prod, local SQLite file in dev; idempotent schema
├── package.json
├── .env.example
├── Dockerfile           # production image (node:20-alpine)
├── render.yaml          # Render blueprint: Docker, free plan, Turso env placeholders (no disk)
├── data/                # piecework.db lives here (git-ignored)
├── scripts/
│   ├── seed.js          # demo users + 10 realistic Zambian jobs (idempotent-ish)
│   └── wipe.js          # delete all data (confirmation, or --yes)
├── public/
│   ├── index.html       # app shell
│   ├── styles.css       # mobile-first, hand-written CSS
│   └── app.js           # hash-routed SPA (browse, job detail, post, dashboard, profile, auth, how-it-works)
└── README.md
```

## Roadmap / v2 ideas

- **Real MTN MoMo / Airtel Money API integration** (collections & disbursements via their Open APIs) with escrow on job completion
- **SMS verification** of phone numbers at registration (e.g. Africa's Talking)
- **Photo uploads** for jobs and worker ID verification
- Push notifications (job alerts by city/category) instead of relying on WhatsApp
- In-app chat instead of WhatsApp deep links
- Admin moderation queue + reporting of bad actors
- Postgres migration path if scale demands it (all queries are standard SQL; swap the driver layer in `db.js`)

## License

MIT

'use strict';
/* PieceWork Zambia — vanilla JS single-page app. Hash-routed, no dependencies. */

const CATEGORIES = [
  'Events Setup', 'Moving Help', 'Cleaning', 'Construction & Labor',
  'Delivery & Errands', 'Cooking & Catering', 'Gardening', 'Painting',
  'Security & Ushering', 'Other',
];
const CITIES = [
  'Lusaka', 'Kitwe', 'Ndola', 'Kabwe', 'Chipata', 'Livingstone',
  'Chingola', 'Luanshya', 'Kasama', 'Solwezi', 'Mongu', 'Choma', 'Other',
];
const PAY_LABEL = { per_job: 'per job', per_hour: 'per hour', per_day: 'per day' };
const PAY_SHORT = { per_job: '/job', per_hour: '/hr', per_day: '/day' };

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const topbarAuth = document.getElementById('topbar-auth');
let currentUser = null;
let browseState = { q: '', city: '', category: '', page: 1, maxKm: 50 };

/* ---------------- location (kilometre matching) ---------------- */
/** Saved viewer location {lat, lng} from localStorage, or null. */
function getLoc() {
  try {
    const v = JSON.parse(localStorage.getItem('pw_loc') || 'null');
    if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng)) return v;
  } catch { /* ignore */ }
  return null;
}
function setLoc(v) {
  if (v) localStorage.setItem('pw_loc', JSON.stringify(v));
  else localStorage.removeItem('pw_loc');
}
/** One-shot browser geolocation → {lat, lng}. */
function getGps() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Location is not supported on this device.')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject(new Error('Could not get your location. Allow location access and try again.')),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  });
}
function fmtKm(km) {
  if (km == null) return '';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`;
}

/* ---------------- utilities ---------------- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function kwacha(n) {
  return 'K ' + Number(n).toLocaleString('en-ZM');
}
function payText(job) {
  return kwacha(job.pay_amount) + (PAY_SHORT[job.pay_type] || '');
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function waLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  return 'https://wa.me/' + digits + (text ? '?text=' + encodeURIComponent(text) : '');
}
function stars(avg) {
  const full = Math.round(Number(avg) || 0);
  let s = '';
  for (let i = 1; i <= 5; i++) s += `<span class="${i <= full ? '' : 'off'}">★</span>`;
  return `<span class="stars">${s}</span>`;
}
function toast(msg, isErr) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const e = new Error((data && data.error) || 'Request failed.');
    e.status = res.status;
    e.fields = data && data.fields;
    throw e;
  }
  return data;
}

/** Render per-field errors under inputs named in `fields`. */
function showFieldErrors(form, fields) {
  form.querySelectorAll('.field-error').forEach(el => el.remove());
  form.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
  if (!fields) return;
  for (const [name, msg] of Object.entries(fields)) {
    const input = form.querySelector(`[name="${name}"]`);
    if (!input) continue;
    input.classList.add('invalid');
    const div = document.createElement('div');
    div.className = 'field-error';
    div.textContent = msg;
    input.closest('.field').appendChild(div);
  }
}

/* ---------------- auth state / chrome ---------------- */
async function refreshMe() {
  try {
    const { user } = await api('/api/auth/me');
    currentUser = user;
  } catch { currentUser = null; }
  renderChrome();
}

function renderChrome() {
  if (currentUser) {
    topbarAuth.innerHTML =
      `<span class="hello">Hi, ${esc(currentUser.name.split(' ')[0])}</span>` +
      `<a href="#/profile">Account</a>`;
  } else {
    topbarAuth.innerHTML = `<a href="#/login">Sign in</a>`;
  }
  const tabs = [
    { href: '#/', label: 'Jobs', ico: '💼', match: (h) => h === '#/' || h.startsWith('#/job/') },
    { href: '#/post', label: 'Post', ico: '➕', match: (h) => h.startsWith('#/post') },
    { href: '#/dashboard', label: 'My Gigs', ico: '📋', match: (h) => h.startsWith('#/dashboard') },
    { href: '#/how', label: 'How it works', ico: '❓', match: (h) => h.startsWith('#/how') },
    { href: currentUser ? '#/profile' : '#/login', label: currentUser ? 'Profile' : 'Sign in', ico: '👤',
      match: (h) => h.startsWith('#/profile') || h.startsWith('#/user/') || h.startsWith('#/login') || h.startsWith('#/register') },
  ];
  const h = location.hash || '#/';
  tabbar.innerHTML = tabs.map(t =>
    `<a href="${t.href}" class="${t.match(h) ? 'active' : ''}"><span class="ico">${t.ico}</span>${t.label}</a>`
  ).join('');
}

function requireAuth(next) {
  if (!currentUser) {
    sessionStorage.setItem('pw_next', next);
    location.hash = '#/login';
    return false;
  }
  return true;
}
function afterAuthRedirect() {
  const next = sessionStorage.getItem('pw_next');
  sessionStorage.removeItem('pw_next');
  location.hash = next || '#/dashboard';
}

/* ---------------- shared components ---------------- */
function jobCard(job) {
  return `
  <a class="card job-card" href="#/job/${job.id}">
    <div class="card-row">
      <span class="badge badge-cat">${esc(job.category)}</span>
      <span class="badge badge-status-${job.status}">${esc(job.status)}</span>
    </div>
    <h3>${esc(job.title)}</h3>
    <div class="pay">${kwacha(job.pay_amount)}<small> ${esc(PAY_LABEL[job.pay_type] || '')}</small></div>
    <div class="job-meta">
      <span>📍 <b>${esc(job.city)}</b>${job.area ? ' · ' + esc(job.area) : ''}${job.distance_km != null ? ` · 📏 <b>${esc(fmtKm(job.distance_km))}</b> away` : ''}</span>
      <span>📅 ${esc(fmtDate(job.date_needed))}</span>
      <span>👥 ${job.workers_needed} needed${job.accepted_count ? ` · ${job.accepted_count} hired` : ''}</span>
    </div>
    <div class="job-meta"><span>by ${esc(job.poster.name)}</span></div>
  </a>`;
}

function loadingHtml(msg) {
  return `<div class="loading"><div class="spinner"></div>${esc(msg || 'Loading…')}</div>`;
}
function emptyHtml(icon, title, sub, cta) {
  return `<div class="empty"><div class="big">${icon}</div><h3 style="margin:0 0 6px">${esc(title)}</h3>
    <p style="margin:0 0 12px">${esc(sub)}</p>${cta || ''}</div>`;
}
function momoNoteHtml() {
  return `<div class="momo-note">💵 <b>How payment works:</b> PieceWork Zambia connects you —
    payment happens directly between you and the other person, usually via
    <b>MTN Mobile Money</b> or <b>Airtel Money</b> when the work is done.
    Agree the amount up front and never pay before work starts.</div>`;
}

/* ---------------- views ---------------- */
async function viewBrowse() {
  app.innerHTML = `
    <div class="hero">
      <h2>Quick jobs. Quick cash. 💪</h2>
      <p>Find piece work near you in Zambia — or post a job and hire helping hands today.</p>
    </div>
    <div class="searchbar">
      <input id="q" type="search" placeholder="Search jobs… e.g. moving, cleaning" value="${esc(browseState.q)}" aria-label="Search jobs">
    </div>
    <div class="filters">
      <select id="f-city" aria-label="Filter by city">
        <option value="">All cities</option>
        ${CITIES.map(c => `<option ${browseState.city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
    </div>
    <div class="locbar" id="locbar"></div>
    <div class="chips" id="chips">
      <button class="chip ${!browseState.category ? 'active' : ''}" data-cat="">All</button>
      ${CATEGORIES.map(c => `<button class="chip ${browseState.category === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>
    <div id="results">${loadingHtml('Finding jobs…')}</div>
    <div id="more-wrap" style="text-align:center;margin:8px 0 16px"></div>`;

  const q = document.getElementById('q');
  let debounce;
  q.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { browseState.q = q.value.trim(); browseState.page = 1; loadJobs(true); }, 350);
  });
  document.getElementById('f-city').addEventListener('change', (e) => {
    browseState.city = e.target.value; browseState.page = 1; loadJobs(true);
  });
  // --- kilometre matching controls ---
  function renderLocBar() {
    const bar = document.getElementById('locbar');
    const loc = getLoc();
    if (!loc) {
      bar.innerHTML = `<button class="btn btn-sm" id="btn-near-me">📍 Near me</button>
        <span class="hint-inline">Match jobs by distance in kilometres</span>`;
      document.getElementById('btn-near-me').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true; btn.textContent = '📍 Locating…';
        try {
          setLoc(await getGps());
          browseState.page = 1;
          renderLocBar();
          loadJobs(true);
          toast('Location set — showing jobs nearest to you. 📍');
        } catch (err2) {
          toast(err2.message, true);
          btn.disabled = false; btn.textContent = '📍 Near me';
        }
      });
    } else {
      bar.innerHTML = `<span class="loc-on">📍 <b>Near you</b></span>
        <select id="f-maxkm" aria-label="Maximum distance">
          ${[5, 10, 25, 50, 100].map(d => `<option value="${d}" ${browseState.maxKm === d ? 'selected' : ''}>within ${d} km</option>`).join('')}
          <option value="any" ${browseState.maxKm === 'any' ? 'selected' : ''}>any distance</option>
        </select>
        <button class="link-btn" id="btn-loc-clear">clear</button>`;
      document.getElementById('f-maxkm').addEventListener('change', (e) => {
        browseState.maxKm = e.target.value === 'any' ? 'any' : Number(e.target.value);
        browseState.page = 1; loadJobs(true);
      });
      document.getElementById('btn-loc-clear').addEventListener('click', () => {
        setLoc(null); browseState.page = 1;
        renderLocBar(); loadJobs(true);
      });
    }
  }
  renderLocBar();
  document.getElementById('chips').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    browseState.category = btn.dataset.cat; browseState.page = 1;
    document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === btn));
    loadJobs(true);
  });
  document.getElementById('more-wrap').addEventListener('click', (e) => {
    if (e.target.id === 'load-more') { browseState.page++; loadJobs(false); }
  });
  await loadJobs(true);

  async function loadJobs(reset) {
    const results = document.getElementById('results');
    if (reset) results.innerHTML = loadingHtml('Finding jobs…');
    const params = new URLSearchParams({ status: 'open', page: browseState.page });
    if (browseState.q) params.set('q', browseState.q);
    if (browseState.city) params.set('city', browseState.city);
    if (browseState.category) params.set('category', browseState.category);
    const loc = getLoc();
    if (loc) {
      params.set('lat', loc.lat);
      params.set('lng', loc.lng);
      params.set('max_km', browseState.maxKm);
    }
    try {
      const data = await api('/api/jobs?' + params.toString());
      if (reset) results.innerHTML = '';
      if (!data.jobs.length && reset) {
        results.innerHTML = emptyHtml('🔍', 'No jobs found',
          'Try a different search or city — or post the job yourself!',
          `<a class="btn btn-sm btn-orange" href="#/post">Post a job</a>`);
      } else {
        results.insertAdjacentHTML('beforeend', data.jobs.map(jobCard).join(''));
      }
      document.getElementById('more-wrap').innerHTML =
        data.page < data.totalPages ? `<button id="load-more" class="btn btn-ghost btn-sm">Load more (${data.total - data.page * data.limit} remaining)</button>` : '';
    } catch (e) {
      results.innerHTML = emptyHtml('⚠️', 'Could not load jobs', e.message);
    }
  }
}

async function viewJobDetail(id) {
  app.innerHTML = loadingHtml('Loading job…');
  let job;
  try {
    const loc = getLoc();
    const qp = loc ? `?lat=${loc.lat}&lng=${loc.lng}` : '';
    ({ job } = await api('/api/jobs/' + id + qp));
  } catch (e) {
    app.innerHTML = emptyHtml('🔍', 'Job not found', 'This job may have been removed.');
    return;
  }
  const isPoster = job.is_poster;
  const waText = `Hello ${job.poster.name}, I saw your job "${job.title}" on PieceWork Zambia and I'm interested.`;
  const applicants = (job.applications || []).filter(a => a.status !== 'withdrawn');
  const pending = applicants.filter(a => a.status === 'pending');

  let actionHtml = '';
  if (isPoster) {
    const open = job.status === 'open' || job.status === 'filled';
    actionHtml = `
      <div class="card">
        <h3 style="margin-top:0">Manage this job</h3>
        <div class="card-row" style="margin-bottom:8px">
          <span class="badge badge-status-${job.status}">${esc(job.status)}</span>
          <span style="font-size:13px;color:var(--muted)">${job.accepted_count}/${job.workers_needed} hired</span>
        </div>
        ${open ? `
        <div class="btn-row">
          <button class="btn btn-sm" id="btn-complete">Mark completed</button>
          <button class="btn btn-sm btn-danger" id="btn-cancel">Cancel job</button>
        </div>` : `<p style="color:var(--muted);font-size:14px;margin:8px 0 0">This job is ${job.status}.</p>`}
      </div>
      <div class="card">
        <h3 style="margin-top:0">Applicants (${applicants.length})</h3>
        <div id="applicants">${applicants.length ? applicants.map(applicantHtml).join('') : '<p style="color:var(--muted)">No applications yet. Share the job or wait for workers to apply.</p>'}</div>
      </div>`;
  } else if (!currentUser) {
    actionHtml = `<div class="card" style="text-align:center">
      <p style="margin-top:0">Want this job? Sign in to apply.</p>
      <a class="btn" href="#/login">Sign in / Register</a></div>`;
  } else if (job.my_application) {
    const s = job.my_application.status;
    actionHtml = `<div class="card"><h3 style="margin-top:0">Your application</h3>
      <p>Status: <span class="badge badge-app-${s}">${esc(s)}</span></p>
      ${s === 'pending' ? `<button class="link-btn" id="btn-withdraw">Withdraw application</button>` : ''}
      ${s === 'accepted' && job.whatsapp ? `<a class="whatsapp-btn" href="${waLink(job.whatsapp, waText)}" target="_blank" rel="noopener">💬 Chat on WhatsApp</a>` : ''}
    </div>`;
  } else if (job.status === 'open') {
    actionHtml = `<div class="card">
      <h3 style="margin-top:0">Apply for this job</h3>
      <form id="apply-form">
        <div class="field">
          <label for="app-msg">Message to the poster (optional)</label>
          <textarea name="message" id="app-msg" maxlength="500" placeholder="e.g. I have done this work before and I stay nearby. I can start early."></textarea>
        </div>
        <button class="btn btn-orange" type="submit">Apply now</button>
      </form></div>`;
  } else {
    actionHtml = `<div class="card"><p style="margin:0;color:var(--muted)">This job is ${job.status} and no longer accepting applications.</p></div>`;
  }

  // Reviews section for completed jobs.
  let reviewHtml = '';
  if (job.status === 'completed' && currentUser) {
    const reviewees = [];
    if (isPoster) {
      (job.applications || []).filter(a => a.status === 'accepted')
        .forEach(a => reviewees.push({ id: a.worker_id, name: a.worker_name }));
    } else if (job.my_application && job.my_application.status === 'accepted') {
      reviewees.push({ id: job.poster.id, name: job.poster.name });
    }
    if (reviewees.length) {
      reviewHtml = `<div class="card"><h3 style="margin-top:0">⭐ Rate your experience</h3>
        <p style="color:var(--muted);font-size:14px;margin-top:0">The job is done — let others know how it went.</p>
        ${reviewees.map(r => `
          <div class="field" style="border-top:1px solid var(--line);padding-top:10px">
            <label>${esc(r.name)}</label>
            <div style="display:flex;gap:8px">
              <select data-review-for="${r.id}" data-review-job="${job.id}" aria-label="Rating">
                <option value="">Choose…</option>
                <option value="5">★★★★★ Excellent</option>
                <option value="4">★★★★ Good</option>
                <option value="3">★★★ Okay</option>
                <option value="2">★★ Poor</option>
                <option value="1">★ Terrible</option>
              </select>
              <button class="btn btn-sm" data-review-btn="${r.id}">Send</button>
            </div>
            <input data-review-comment="${r.id}" placeholder="Short comment (optional)" style="margin-top:8px">
          </div>`).join('')}
      </div>`;
    }
  }

  app.innerHTML = `
    <a href="#/" style="font-size:14px;font-weight:700">← Back to jobs</a>
    <div class="card" style="margin-top:10px">
      <div class="card-row">
        <span class="badge badge-cat">${esc(job.category)}</span>
        <span class="badge badge-status-${job.status}">${esc(job.status)}</span>
      </div>
      <h2 style="margin:8px 0">${esc(job.title)}</h2>
      <div class="pay" style="font-size:22px">${kwacha(job.pay_amount)}<small> ${esc(PAY_LABEL[job.pay_type] || '')}</small></div>
      <dl class="detail-list">
        <dt>What needs doing</dt><dd>${esc(job.description).replace(/\n/g, '<br>')}</dd>
        <dt>Location</dt><dd>📍 ${esc(job.city)}${job.area ? ' · ' + esc(job.area) : ''}${job.distance_km != null ? ` · <b>${esc(fmtKm(job.distance_km))} away</b>` : ''}</dd>
        <dt>Date needed</dt><dd>📅 ${esc(fmtDate(job.date_needed))}</dd>
        <dt>Workers</dt><dd>👥 ${job.workers_needed} needed · ${job.accepted_count} hired · ${job.applicant_count} applied</dd>
        <dt>Posted by</dt><dd><a href="#/user/${job.poster.id}"><b>${esc(job.poster.name)}</b></a>
          ${stars(job.poster.rating_avg)} <span style="color:var(--muted);font-size:13px">(${job.poster.rating_count})</span></dd>
        <dt>Posted</dt><dd style="color:var(--muted)">${esc(fmtDateTime(job.created_at))}</dd>
      </dl>
      ${!isPoster && job.whatsapp && job.status === 'open' ? `<a class="whatsapp-btn" href="${waLink(job.whatsapp, waText)}" target="_blank" rel="noopener">💬 Chat on WhatsApp</a>` : ''}
    </div>
    ${momoNoteHtml()}
    ${actionHtml}
    ${reviewHtml}`;

  // --- wire up interactions ---
  const applyForm = document.getElementById('apply-form');
  if (applyForm) {
    applyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = applyForm.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        await api(`/api/jobs/${id}/apply`, {
          method: 'POST',
          body: JSON.stringify({ message: applyForm.message.value }),
        });
        toast('Application sent! The poster will review it.');
        viewJobDetail(id); renderChrome();
      } catch (err2) { toast(err2.message, true); btn.disabled = false; }
    });
  }
  const withdraw = document.getElementById('btn-withdraw');
  if (withdraw) withdraw.addEventListener('click', async () => {
    if (!confirm('Withdraw your application?')) return;
    try {
      await api(`/api/applications/${job.my_application.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'withdrawn' }) });
      toast('Application withdrawn.');
      viewJobDetail(id);
    } catch (e) { toast(e.message, true); }
  });
  const complete = document.getElementById('btn-complete');
  if (complete) complete.addEventListener('click', async () => {
    if (!confirm('Mark this job as completed? Workers can then be rated.')) return;
    try {
      await api(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) });
      toast('Job marked as completed. 🎉');
      viewJobDetail(id);
    } catch (e) { toast(e.message, true); }
  });
  const cancel = document.getElementById('btn-cancel');
  if (cancel) cancel.addEventListener('click', async () => {
    if (!confirm('Cancel this job? Applicants will no longer see it.')) return;
    try {
      await api(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
      toast('Job cancelled.');
      viewJobDetail(id);
    } catch (e) { toast(e.message, true); }
  });
  document.querySelectorAll('[data-accept]').forEach(btn => btn.addEventListener('click', () => decideApplication(btn.dataset.accept, 'accepted')));
  document.querySelectorAll('[data-decline]').forEach(btn => btn.addEventListener('click', () => decideApplication(btn.dataset.decline, 'declined')));
  document.querySelectorAll('[data-review-btn]').forEach(btn => btn.addEventListener('click', async () => {
    const forId = btn.dataset.reviewBtn;
    const sel = document.querySelector(`select[data-review-for="${forId}"]`);
    const com = document.querySelector(`input[data-review-comment="${forId}"]`);
    if (!sel.value) { toast('Choose a star rating first.', true); return; }
    btn.disabled = true;
    try {
      await api('/api/reviews', { method: 'POST', body: JSON.stringify({
        job_id: Number(sel.dataset.reviewJob), reviewee_id: Number(forId),
        rating: Number(sel.value), comment: com.value.trim(),
      }) });
      toast('Thanks for the review! ⭐');
      viewJobDetail(id);
    } catch (e) { toast(e.message, true); btn.disabled = false; }
  }));

  function applicantHtml(a) {
    return `<div class="applicant">
      <div class="card-row">
        <div><a href="#/user/${a.worker_id}"><b>${esc(a.worker_name)}</b></a>
          <div style="font-size:13px;color:var(--muted)">${esc(a.worker_city)} · ${stars(a.worker_rating)} (${a.worker_rating_count})</div>
        </div>
        <span class="badge badge-app-${a.status}">${esc(a.status)}</span>
      </div>
      ${a.message ? `<p style="font-size:14px;margin:8px 0">“${esc(a.message)}”</p>` : ''}
      ${a.status === 'pending' ? `<div class="btn-row">
        <button class="btn btn-sm" data-accept="${a.id}">Accept</button>
        <button class="btn btn-sm btn-danger" data-decline="${a.id}">Decline</button>
      </div>
      <div style="margin-top:6px"><a class="link-btn" style="font-size:13px" href="${waLink(a.worker_phone, 'Hello ' + a.worker_name + ', about your application for "' + job.title + '" on PieceWork Zambia…')}" target="_blank" rel="noopener">💬 WhatsApp ${esc(a.worker_name.split(' ')[0])}</a></div>` : ''}
    </div>`;
  }

  async function decideApplication(appId, status) {
    const verb = status === 'accepted' ? 'Accept' : 'Decline';
    if (!confirm(`${verb} this applicant?`)) return;
    try {
      await api(`/api/applications/${appId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast(status === 'accepted' ? 'Worker hired! 🎉' : 'Application declined.');
      viewJobDetail(id);
    } catch (e) { toast(e.message, true); }
  }
}

function jobFormHtml(prefill = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return `
  <form id="job-form" novalidate>
    <div class="field">
      <label for="jf-title">Job title</label>
      <input name="title" id="jf-title" maxlength="120" value="${esc(prefill.title || '')}" placeholder="e.g. Need 3 people to offload a truck">
    </div>
    <div class="field">
      <label for="jf-category">Category</label>
      <select name="category" id="jf-category">
        <option value="">Choose…</option>
        ${CATEGORIES.map(c => `<option ${prefill.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label for="jf-desc">Describe the work</label>
      <textarea name="description" id="jf-desc" placeholder="What exactly needs doing? Hours? What should workers bring?">${esc(prefill.description || '')}</textarea>
      <div class="hint">Be specific — clear jobs get better workers.</div>
    </div>
    <div class="filters" style="margin-bottom:0">
      <div class="field" style="flex:1">
        <label for="jf-city">City</label>
        <select name="city" id="jf-city">
          <option value="">Choose…</option>
          ${CITIES.map(c => `<option ${prefill.city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="flex:1">
        <label for="jf-area">Area / Township</label>
        <input name="area" id="jf-area" maxlength="80" value="${esc(prefill.area || '')}" placeholder="e.g. Kabulonga">
      </div>
    </div>
    <div class="field">
      <label for="jf-date">Date needed</label>
      <input name="date_needed" id="jf-date" type="date" min="${today}" value="${esc(prefill.date_needed || today)}">
    </div>
    <div class="filters" style="margin-bottom:0">
      <div class="field" style="flex:1">
        <label for="jf-pay">Pay (Kwacha)</label>
        <input name="pay_amount" id="jf-pay" type="number" min="1" max="1000000" inputmode="numeric" value="${esc(prefill.pay_amount || '')}" placeholder="e.g. 250">
      </div>
      <div class="field" style="flex:1">
        <label for="jf-paytype">Pay type</label>
        <select name="pay_type" id="jf-paytype">
          <option value="per_day" ${prefill.pay_type === 'per_day' ? 'selected' : ''}>Per day</option>
          <option value="per_job" ${prefill.pay_type === 'per_job' ? 'selected' : ''}>Per job (fixed)</option>
          <option value="per_hour" ${prefill.pay_type === 'per_hour' ? 'selected' : ''}>Per hour</option>
        </select>
      </div>
      <div class="field" style="flex:1">
        <label for="jf-workers">Workers</label>
        <input name="workers_needed" id="jf-workers" type="number" min="1" max="50" inputmode="numeric" value="${esc(prefill.workers_needed || '1')}">
      </div>
    </div>
    <div class="field">
      <label>Pinpoint location (optional)</label>
      <input type="hidden" name="lat" id="jf-lat">
      <input type="hidden" name="lng" id="jf-lng">
      <div class="hint" id="jf-loc-status">No GPS pinned — distance matching will use your city centre.</div>
      <button type="button" class="btn btn-sm btn-ghost" id="btn-pin-loc" style="margin-top:6px">📍 Pin my current location</button>
    </div>
    <div class="field">
      <label for="jf-wa">WhatsApp number (optional)</label>
      <input name="whatsapp" id="jf-wa" type="tel" inputmode="tel" value="${esc(prefill.whatsapp || (currentUser ? currentUser.phone : ''))}" placeholder="0977 123 456">
      <div class="hint">Workers can message you directly. Leave blank to keep applications in the app only.</div>
    </div>
    <button class="btn btn-orange" type="submit">Post job</button>
  </form>`;
}

async function viewPost() {
  if (!requireAuth('#/post')) return;
  app.innerHTML = `
    <h1 class="page-title">Post a job</h1>
    <p class="page-sub">Describe the piece work — workers nearby will see it instantly.</p>
    <div class="card">${jobFormHtml()}</div>
    ${momoNoteHtml()}`;
  const form = document.getElementById('job-form');
  document.getElementById('btn-pin-loc').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = '📍 Locating…';
    try {
      const { lat, lng } = await getGps();
      document.getElementById('jf-lat').value = lat;
      document.getElementById('jf-lng').value = lng;
      document.getElementById('jf-loc-status').innerHTML = '📍 <b>Location pinned</b> — workers will see how many km away the job is.';
      toast('Location pinned. 📍');
    } catch (err2) {
      toast(err2.message, true);
    }
    btn.disabled = false; btn.textContent = '📍 Pin my current location';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const { id } = await api('/api/jobs', { method: 'POST', body: JSON.stringify(data) });
      toast('Job posted! 🎉');
      location.hash = '#/job/' + id;
    } catch (err2) {
      showFieldErrors(form, err2.fields);
      toast(err2.message, true);
      btn.disabled = false;
    }
  });
}

async function viewDashboard() {
  if (!requireAuth('#/dashboard')) return;
  app.innerHTML = `
    <h1 class="page-title">My Gigs</h1>
    <div class="seg">
      <button id="seg-postings" class="active">My Postings</button>
      <button id="seg-gigs">Jobs I Applied To</button>
    </div>
    <div id="dash-body">${loadingHtml()}</div>`;
  const body = document.getElementById('dash-body');
  const segP = document.getElementById('seg-postings');
  const segG = document.getElementById('seg-gigs');

  async function showPostings() {
    segP.classList.add('active'); segG.classList.remove('active');
    body.innerHTML = loadingHtml();
    try {
      // Reuse public browse endpoint per status and filter client-side to my jobs.
      const lists = await Promise.all(
        ['open', 'filled', 'completed', 'cancelled'].map(s => api('/api/jobs?status=' + s + '&page=1').catch(() => ({ jobs: [] })))
      );
      const mine = lists.flatMap(l => l.jobs).filter(j => j.poster.id === currentUser.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      body.innerHTML = mine.length ? mine.map(jobCard).join('')
        : emptyHtml('📝', 'No postings yet', 'Post your first job and find helping hands fast.', `<a class="btn btn-sm btn-orange" href="#/post">Post a job</a>`);
    } catch (e) { body.innerHTML = emptyHtml('⚠️', 'Could not load', e.message); }
  }
  async function showGigs() {
    segG.classList.add('active'); segP.classList.remove('active');
    body.innerHTML = loadingHtml();
    try {
      const { applications } = await api('/api/applications/mine');
      if (!applications.length) {
        body.innerHTML = emptyHtml('💼', 'No applications yet', 'Browse open jobs and apply to your first gig.', `<a class="btn btn-sm" href="#/">Browse jobs</a>`);
        return;
      }
      body.innerHTML = applications.map(a => `
        <a class="card job-card" href="#/job/${a.job_id}">
          <div class="card-row">
            <span class="badge badge-cat">${esc(a.category)}</span>
            <span class="badge badge-app-${a.app_status}">${esc(a.app_status)}</span>
          </div>
          <h3>${esc(a.title)}</h3>
          <div class="pay">${kwacha(a.pay_amount)}<small> ${esc(PAY_LABEL[a.pay_type] || '')}</small></div>
          <div class="job-meta"><span>📍 <b>${esc(a.city)}</b></span><span>📅 ${esc(fmtDate(a.date_needed))}</span>
          <span>Job: <b>${esc(a.job_status)}</b></span></div>
          <div class="job-meta"><span>by ${esc(a.poster_name)} · applied ${esc(fmtDateTime(a.applied_at))}</span></div>
        </a>`).join('');
    } catch (e) { body.innerHTML = emptyHtml('⚠️', 'Could not load', e.message); }
  }
  segP.addEventListener('click', showPostings);
  segG.addEventListener('click', showGigs);
  showPostings();
}

async function viewProfile() {
  if (!requireAuth('#/profile')) return;
  app.innerHTML = `
    <h1 class="page-title">My Profile</h1>
    <div class="card">
      <div class="card-row" style="margin-bottom:10px">
        <div><h3 style="margin:0">${esc(currentUser.name)}</h3>
        <div style="color:var(--muted);font-size:14px">${esc(currentUser.phone)} · ${esc(currentUser.city)}</div>
        <div style="margin-top:4px">${stars(currentUser.rating_avg)} <span style="color:var(--muted);font-size:13px">(${currentUser.rating_count} reviews)</span></div></div>
      </div>
      <form id="profile-form">
        <div class="field"><label for="pf-name">Full name</label><input name="name" id="pf-name" value="${esc(currentUser.name)}"></div>
        <div class="field"><label for="pf-city">City</label>
          <select name="city" id="pf-city">${CITIES.map(c => `<option ${currentUser.city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="field"><label for="pf-bio">About you</label>
          <textarea name="bio" id="pf-bio" maxlength="500" placeholder="Tell posters who you are and what you do best…">${esc(currentUser.bio || '')}</textarea></div>
        <div class="field"><label for="pf-skills">Skills (comma separated)</label>
          <input name="skills" id="pf-skills" maxlength="300" value="${esc(currentUser.skills || '')}" placeholder="e.g. Moving, Cleaning, Painting"></div>
        <div class="field">
          <label>Your location</label>
          <div class="hint" id="pf-loc-status">${currentUser.lat != null ? '📍 <b>Location saved</b> — jobs are matched by distance to you in kilometres.' : 'No precise location saved — distance matching uses your city centre.'}</div>
          <button type="button" class="btn btn-sm btn-ghost" id="btn-save-loc" style="margin-top:6px">📍 Set my location</button>
        </div>
        <button class="btn" type="submit">Save changes</button>
      </form>
    </div>
    <div class="card" style="text-align:center">
      <button class="btn btn-danger" id="btn-logout">Sign out</button>
    </div>`;
  const form = document.getElementById('profile-form');
  document.getElementById('btn-save-loc').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = '📍 Locating…';
    try {
      const { lat, lng } = await getGps();
      const { user } = await api('/api/users/me', { method: 'PATCH', body: JSON.stringify({ lat, lng }) });
      currentUser = user; renderChrome();
      document.getElementById('pf-loc-status').innerHTML = '📍 <b>Location saved</b> — jobs are matched by distance to you in kilometres.';
      toast('Location saved. 📍');
    } catch (err2) {
      toast(err2.message, true);
    }
    btn.disabled = false; btn.textContent = '📍 Set my location';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const { user } = await api('/api/users/me', { method: 'PATCH', body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      currentUser = user; renderChrome();
      toast('Profile updated. ✅');
    } catch (err2) { showFieldErrors(form, err2.fields); toast(err2.message, true); }
    btn.disabled = false;
  });
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    currentUser = null; renderChrome();
    location.hash = '#/';
    toast('Signed out.');
  });
}

async function viewUser(id) {
  app.innerHTML = loadingHtml('Loading profile…');
  try {
    const { user, completed_jobs, reviews } = await api('/api/users/' + id);
    const skills = (user.skills || '').split(',').map(s => s.trim()).filter(Boolean);
    app.innerHTML = `
      <a href="#/" style="font-size:14px;font-weight:700">← Back</a>
      <div class="card" style="margin-top:10px">
        <h2 style="margin:0 0 4px">${esc(user.name)}</h2>
        <div style="color:var(--muted);font-size:14px;margin-bottom:6px">📍 ${esc(user.city)} · 📱 ${esc(user.phone)}</div>
        <div>${stars(user.rating_avg)} <span style="color:var(--muted);font-size:13px">${user.rating_avg} average · ${user.rating_count} reviews · ${completed_jobs} jobs completed</span></div>
        ${user.bio ? `<p style="margin:12px 0 0">${esc(user.bio)}</p>` : ''}
        ${skills.length ? `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">${skills.map(s => `<span class="badge badge-cat">${esc(s)}</span>`).join('')}</div>` : ''}
        ${currentUser && currentUser.id !== user.id ? `<a class="whatsapp-btn" href="${waLink(user.phone, 'Hello ' + user.name + ', I found you on PieceWork Zambia.')}" target="_blank" rel="noopener">💬 Chat on WhatsApp</a>` : ''}
      </div>
      <div class="card">
        <h3 style="margin-top:0">Reviews (${reviews.length})</h3>
        ${reviews.length ? reviews.map(r => `
          <div class="review"><span class="who">${esc(r.reviewer_name)}</span> ${stars(r.rating)}
            <span class="when">· ${esc(fmtDateTime(r.created_at))} · on “${esc(r.job_title)}”</span>
            ${r.comment ? `<p style="margin:4px 0 0">${esc(r.comment)}</p>` : ''}</div>`).join('')
          : '<p style="color:var(--muted)">No reviews yet.</p>'}
      </div>`;
  } catch (e) {
    app.innerHTML = emptyHtml('🔍', 'Profile not found', e.message);
  }
}

function viewLogin() {
  if (currentUser) { location.hash = '#/dashboard'; return; }
  app.innerHTML = `
    <h1 class="page-title">Welcome back 👋</h1>
    <p class="page-sub">Sign in to post jobs and apply for gigs.</p>
    <div class="card">
      <form id="login-form" novalidate>
        <div class="field">
          <label for="li-phone">Phone number</label>
          <input name="phone" id="li-phone" type="tel" inputmode="tel" placeholder="0977 123 456" autocomplete="tel">
        </div>
        <div class="field">
          <label for="li-pass">Password</label>
          <input name="password" id="li-pass" type="password" autocomplete="current-password" placeholder="Your password">
        </div>
        <button class="btn" type="submit">Sign in</button>
      </form>
    </div>
    <p style="text-align:center">New here? <a href="#/register" style="font-weight:700">Create an account</a></p>`;
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const { user } = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone: form.phone.value.trim(), password: form.password.value }),
      });
      currentUser = user; renderChrome();
      toast(`Welcome back, ${user.name.split(' ')[0]}!`);
      afterAuthRedirect();
    } catch (err2) { toast(err2.message, true); btn.disabled = false; }
  });
}

function viewRegister() {
  if (currentUser) { location.hash = '#/dashboard'; return; }
  app.innerHTML = `
    <h1 class="page-title">Join PieceWork 🇿🇲</h1>
    <p class="page-sub">Free to join. Find work or find workers in minutes.</p>
    <div class="card">
      <form id="reg-form" novalidate>
        <div class="field">
          <label for="rg-name">Full name</label>
          <input name="name" id="rg-name" autocomplete="name" placeholder="e.g. Mutinta Phiri">
        </div>
        <div class="field">
          <label for="rg-phone">Phone number</label>
          <input name="phone" id="rg-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0977 123 456">
          <div class="hint">Your Zambian mobile number — this is how posters reach you.</div>
        </div>
        <div class="field">
          <label for="rg-city">City</label>
          <select name="city" id="rg-city"><option value="">Choose…</option>${CITIES.map(c => `<option>${esc(c)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="rg-pass">Password</label>
          <input name="password" id="rg-pass" type="password" autocomplete="new-password" placeholder="At least 8 characters">
        </div>
        <button class="btn btn-orange" type="submit">Create account</button>
      </form>
    </div>
    <p style="text-align:center">Already registered? <a href="#/login" style="font-weight:700">Sign in</a></p>`;
  const form = document.getElementById('reg-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const { user } = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
      });
      currentUser = user; renderChrome();
      toast(`Welcome to PieceWork, ${user.name.split(' ')[0]}! 🎉`);
      afterAuthRedirect();
    } catch (err2) {
      showFieldErrors(form, err2.fields);
      toast(err2.message, true);
      btn.disabled = false;
    }
  });
}

function viewHow() {
  app.innerHTML = `
    <h1 class="page-title">How PieceWork works</h1>
    <div class="card">
      <ol class="steps">
        <li><h4>Post a job (or find one)</h4>
          <p>Need hands for an event, a move, cleaning or building? Post the job with the pay in Kwacha. Looking for work? Browse jobs near you.</p></li>
        <li><h4>Apply or hire in the app</h4>
          <p>Workers apply with one tap. Posters review applicants, check their ratings, and accept the right people — or chat first on WhatsApp.</p></li>
        <li><h4>Get the work done</h4>
          <p>Show up, do great work. The poster marks the job completed when it's finished.</p></li>
        <li><h4>Get paid by mobile money</h4>
          <p>Payment happens directly between you — most people use <b>MTN Mobile Money</b> or <b>Airtel Money</b>. Agree the amount before you start.</p></li>
        <li><h4>Build your reputation</h4>
          <p>Both sides leave star ratings. Good ratings mean more jobs.</p></li>
      </ol>
    </div>
    ${momoNoteHtml()}
    <div class="card" style="text-align:center">
      <h3 style="margin-top:0">Stay safe 🤝</h3>
      <p style="color:var(--muted);font-size:14px">Meet in public places for first jobs. Never pay any "registration fee" to get work — real jobs on PieceWork never ask for money up front.</p>
      <a class="btn" href="#/register">Get started — it's free</a>
    </div>`;
}

/* ---------------- router ---------------- */
const routes = [
  [/^#\/?$/, viewBrowse],
  [/^#\/job\/(\d+)$/, (m) => viewJobDetail(m[1])],
  [/^#\/post$/, viewPost],
  [/^#\/dashboard$/, viewDashboard],
  [/^#\/profile$/, viewProfile],
  [/^#\/user\/(\d+)$/, (m) => viewUser(m[1])],
  [/^#\/login$/, viewLogin],
  [/^#\/register$/, viewRegister],
  [/^#\/how$/, viewHow],
];

async function router() {
  renderChrome();
  const hash = location.hash || '#/';
  window.scrollTo(0, 0);
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    if (m) { try { await fn(m); } catch (e) { console.error(e); app.innerHTML = emptyHtml('⚠️', 'Something went wrong', e.message); } return; }
  }
  app.innerHTML = emptyHtml('🔍', 'Page not found', 'That page does not exist.', `<a class="btn btn-sm" href="#/">Back home</a>`);
}

window.addEventListener('hashchange', router);

/* ---------------- boot ---------------- */
(async function boot() {
  await refreshMe();
  if (!location.hash) location.hash = '#/';
  router();
})();

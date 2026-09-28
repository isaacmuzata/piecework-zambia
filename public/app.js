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
const PAY_LABEL = { per_job: 'per job', per_hour: 'per hour', per_day: 'per day', per_month: 'per month' };

/* ---------------- thin-line icon set (Lucide/Feather style) ---------------- */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  chevL: '<path d="M15 18l-6-6 6-6"/>',
  chevR: '<path d="M9 18l6-6-6-6"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  tag: '<path d="M12 2H2v10l9.3 9.3a1 1 0 0 0 1.4 0l8.6-8.6a1 1 0 0 0 0-1.4z"/><circle cx="7" cy="7" r="1.4"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  truck: '<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  sparkles: '<path d="M12 3l1.9 5.7 5.7 1.9-5.7 1.9L12 18.2l-1.9-5.7L4.4 10.6l5.7-1.9z"/><path d="M19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z"/>',
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3zm0 0v7"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  paint: '<path d="M18.37 2.63L14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10z"/><path d="M2 22l3.5-3.5"/><circle cx="7.5" cy="12.5" r=".8"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* Category → [icon, tile gradient] */
const CATEGORY_STYLE = {
  'Events Setup': ['calendar', 'linear-gradient(135deg,#0E6B3A,#062B1C)'],
  'Moving Help': ['truck', 'linear-gradient(135deg,#0d9488,#0f766e)'],
  'Cleaning': ['sparkles', 'linear-gradient(135deg,#0891b2,#155e75)'],
  'Construction & Labor': ['wrench', 'linear-gradient(135deg,#b45309,#7c2d12)'],
  'Delivery & Errands': ['truck', 'linear-gradient(135deg,#4d7c0f,#365314)'],
  'Cooking & Catering': ['utensils', 'linear-gradient(135deg,#ea580c,#9a3412)'],
  'Gardening': ['leaf', 'linear-gradient(135deg,#16a34a,#14532d)'],
  'Painting': ['paint', 'linear-gradient(135deg,#7c3aed,#4c1d95)'],
  'Security & Ushering': ['shield', 'linear-gradient(135deg,#475569,#1e293b)'],
  'Other': ['briefcase', 'linear-gradient(135deg,#6B7280,#374151)'],
};
function catStyle(cat) { return CATEGORY_STYLE[cat] || CATEGORY_STYLE.Other; }
function jobThumb(cat) {
  const [ic, bg] = catStyle(cat);
  return `<div class="job-thumb" style="background:${bg}" aria-hidden="true">${icon(ic)}</div>`;
}

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const topbarAuth = document.getElementById('topbar-auth');
let currentUser = null;
let browseState = { q: '', city: '', category: '', page: 1, maxKm: 50 };
let chatTimer = null;

/* ---------------- saved jobs (on this device) ---------------- */
function getSaved() {
  try {
    const v = JSON.parse(localStorage.getItem('pw_saved') || '[]');
    return Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : [];
  } catch { return []; }
}
function isSaved(id) { return getSaved().includes(Number(id)); }
function toggleSave(id) {
  id = Number(id);
  let s = getSaved();
  if (s.includes(id)) {
    s = s.filter(x => x !== id);
    toast('Removed from saved jobs.');
  } else {
    s.push(id);
    toast('Job saved. Find it under Profile → Saved jobs.');
  }
  localStorage.setItem('pw_saved', JSON.stringify(s));
  document.querySelectorAll(`[data-save="${id}"]`).forEach(b => {
    b.classList.toggle('saved', s.includes(id));
    b.setAttribute('aria-pressed', s.includes(id) ? 'true' : 'false');
  });
}

/* ---------------- location (kilometre matching) ---------------- */
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
  return kwacha(job.pay_amount) + ' ' + (PAY_LABEL[job.pay_type] || '');
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
function relTime(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return fmtDateTime(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + (mins === 1 ? ' min ago' : ' mins ago');
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + (hrs === 1 ? ' hr ago' : ' hrs ago');
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + (days === 1 ? ' day ago' : ' days ago');
  return fmtDateTime(iso);
}
function daypart() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
function waLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  return 'https://wa.me/' + digits + (text ? '?text=' + encodeURIComponent(text) : '');
}
function stars(avg) {
  const full = Math.round(Number(avg) || 0);
  let s = '';
  for (let i = 1; i <= 5; i++) {
    s += `<svg viewBox="0 0 24 24" class="${i <= full ? 'on' : ''}" aria-hidden="true"><path d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.57l-5.9 3.1 1.13-6.57L2.45 9.44l6.6-.96z"/></svg>`;
  }
  return `<span class="stars">${s}</span>`;
}
function avatarHtml(user, size) {
  const cls = 'avatar ' + (size || 'md');
  if (user && user.avatar) {
    return `<img class="${cls}" src="${user.avatar}" alt="${esc(user.name || 'Profile photo')}">`;
  }
  const initial = ((user && user.name) || '?').trim().charAt(0).toUpperCase();
  return `<span class="${cls}" aria-hidden="true">${esc(initial)}</span>`;
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

function openDrawer() {
  const d = document.getElementById('drawer');
  const s = document.getElementById('drawer-scrim');
  d.hidden = false;
  s.hidden = false;
  requestAnimationFrame(() => {
    d.classList.add('open');
    s.classList.add('show');
  });
}
function closeDrawer() {
  const d = document.getElementById('drawer');
  const s = document.getElementById('drawer-scrim');
  d.classList.remove('open');
  s.classList.remove('show');
  setTimeout(() => { d.hidden = true; s.hidden = true; }, 320);
}
async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  currentUser = null;
  closeDrawer();
  renderChrome();
  location.hash = '#/';
  toast('Signed out.');
}

function renderChrome() {
  const menuBtn = document.getElementById('menu-btn');
  if (menuBtn && !menuBtn.dataset.wired) {
    menuBtn.innerHTML = icon('menu');
    menuBtn.dataset.wired = '1';
    menuBtn.addEventListener('click', openDrawer);
  }
  if (currentUser) {
    topbarAuth.innerHTML =
      `<a href="#/profile" style="display:flex;align-items:center;gap:8px;color:var(--ink);font-weight:700;font-size:14px">${avatarHtml(currentUser, 'sm')}<span>${esc(currentUser.name.split(' ')[0])}</span></a>`;
  } else {
    topbarAuth.innerHTML = `<a class="btn btn-sm btn-outline" href="#/login">Sign in</a>`;
  }
  const h = location.hash || '#/';
  const nav = document.getElementById('drawer-nav');
  const items = [
    ['#/', 'home', 'Home'],
    ['#/jobs', 'briefcase', 'Find Jobs'],
    ['#/workers', 'users', 'Looking for Work'],
    ['#/post', 'plus', 'Post a Job'],
    ['#/categories', 'grid', 'Categories'],
    ['#/messages', 'message', 'Messages'],
  ];
  if (currentUser) {
    items.push(['#/dashboard', 'clipboard', 'My Gigs']);
    items.push(['#/profile', 'user', 'Profile']);
  }
  items.push(['#/how', 'help', 'Help & Support']);
  nav.innerHTML = items.map(([href, ic, label]) =>
    `<a href="${href}" class="${h === href ? 'active' : ''}">${icon(ic)}<span>${label}</span></a>`
  ).join('') + (currentUser
    ? `<button class="drawer-logout" id="drawer-logout">${icon('logout')}<span>Log out</span></button>`
    : '');
  const lo = document.getElementById('drawer-logout');
  if (lo) lo.addEventListener('click', logout);

  const tabs = [
    { href: '#/', label: 'Home', ic: 'home', match: (hh) => hh === '#/' || hh === '' },
    { href: '#/jobs', label: 'Jobs', ic: 'briefcase', match: (hh) => hh === '#/jobs' || hh.startsWith('#/job/') || hh.startsWith('#/categories') || hh.startsWith('#/saved') },
    { href: '#/post', label: 'Post', fab: true, match: (hh) => hh.startsWith('#/post') },
    { href: '#/messages', label: 'Messages', ic: 'message', match: (hh) => hh.startsWith('#/messages') || hh.startsWith('#/chat/') },
    {
      href: currentUser ? '#/profile' : '#/login', label: currentUser ? 'Profile' : 'Sign in', ic: 'user',
      match: (hh) => hh.startsWith('#/profile') || hh.startsWith('#/user/') || hh.startsWith('#/login') || hh.startsWith('#/register') || hh.startsWith('#/dashboard'),
    },
  ];
  tabbar.innerHTML = tabs.map(t => t.fab
    ? `<a href="${t.href}" class="tab-post ${t.match(h) ? 'active' : ''}" aria-label="Post a job"><span class="post-fab">${icon('plus')}</span><span>${t.label}</span></a>`
    : `<a href="${t.href}" class="${t.match(h) ? 'active' : ''}">${icon(t.ic)}<span>${t.label}</span>${t.href === '#/messages' ? '<span class="tab-badge" id="msg-badge" hidden></span>' : ''}</a>`
  ).join('');
  if (currentUser) {
    api('/api/messages/unread').then(({ unread }) => {
      const b = document.getElementById('msg-badge');
      if (!b) return;
      if (unread > 0) { b.textContent = unread > 9 ? '9+' : unread; b.hidden = false; }
      else b.hidden = true;
    }).catch(() => {});
  }
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
  const saved = isSaved(job.id);
  const area = job.area && job.area.toLowerCase() !== String(job.city || '').toLowerCase() ? job.area : '';
  const statusBadge = job.status === 'open' ? `<span class="badge badge-status-open">Open</span>` : '';
  return `
  <article class="job-card" data-job="${job.id}" tabindex="0" role="link" aria-label="${esc(job.title)}">
    ${jobThumb(job.category)}
    <div class="job-body">
      <h3>${esc(job.title)}</h3>
      <div class="pay">${kwacha(job.pay_amount)}<small style="font-weight:600;color:var(--gray)"> ${esc(PAY_LABEL[job.pay_type] || '')}</small> ${statusBadge}</div>
      <div class="job-meta">
        <span>${icon('pin')}<b>${esc(job.city)}</b>${area ? ' · ' + esc(area) : ''}${job.distance_km != null ? ` · <b>${esc(fmtKm(job.distance_km))}</b> away` : ''}</span>
      </div>
      <div class="job-meta">
        <span>${icon('tag')}${esc(job.category)}</span>
        <span>${icon('calendar')}${esc(fmtDate(job.date_needed))}</span>
      </div>
    </div>
    <button class="job-save ${saved ? 'saved' : ''}" data-save="${job.id}" aria-label="Save this job" aria-pressed="${saved ? 'true' : 'false'}">${icon('bookmark')}</button>
  </article>`;
}

function loadingHtml(msg) {
  return `<div class="loading"><div class="spinner"></div>${esc(msg || 'Loading…')}</div>`;
}
function emptyHtml(icn, title, sub, cta) {
  return `<div class="empty"><div class="empty-ico">${icon(icn)}</div><h3>${esc(title)}</h3><p>${esc(sub)}</p>${cta || ''}</div>`;
}
function momoNoteHtml() {
  return `<div class="momo-note"><b>How payment works:</b> PieceWork Zambia connects you —
    payment happens directly between you and the other person, usually via
    <b>MTN Mobile Money</b> or <b>Airtel Money</b> when the work is done.
    Agree the amount up front and never pay before work starts.</div>`;
}

/* ---------------- views ---------------- */

/** Signed-in home: greeting, search, categories, promo, fresh jobs. */
async function viewHome() {
  const first = currentUser.name.split(' ')[0];
  const tiles = ['Cleaning', 'Construction & Labor', 'Events Setup', 'Delivery & Errands'];
  app.innerHTML = `
  <div class="view">
    <div class="home-hero">
      <div class="hello">${daypart()}, ${esc(first)}</div>
      <h1>Let's get to work</h1>
      <div class="searchbar">${icon('search')}<input id="home-q" type="search" placeholder="Search for jobs, skills or people" aria-label="Search jobs"></div>
    </div>
    <div class="page" style="padding-top:16px">
      <div class="section-title" style="margin-top:0"><span>Browse categories</span><a href="#/categories">View all</a></div>
      <div class="cat-grid" style="grid-template-columns:repeat(4,1fr)">
        ${tiles.map(c => {
          const [ic, bg] = catStyle(c);
          return `<div class="cat-card" data-cat-link="${esc(c)}" tabindex="0" role="link" aria-label="Browse ${esc(c)} jobs"><div class="cat-ico" style="background:${bg}">${icon(ic)}</div><b>${esc(c)}</b></div>`;
        }).join('')}
      </div>
      <a class="promo-card" href="#/jobs" style="text-decoration:none;color:#fff">
        <img src="/img/landing/hero.jpg" alt="Zambians doing piece work" loading="lazy">
        <div class="promo-text"><h3>Skilled People, Stronger Communities</h3><p>Real jobs from real neighbours, matched by distance.</p></div>
      </a>
      <div class="section-title"><span>Fresh opportunities</span><a href="#/jobs">View all</a></div>
      <div id="home-jobs">${loadingHtml('Finding jobs…')}</div>
    </div>
  </div>`;

  const q = document.getElementById('home-q');
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      browseState.q = q.value.trim(); browseState.page = 1; browseState.category = ''; browseState.city = '';
      location.hash = '#/jobs';
    }
  });
  document.querySelectorAll('[data-cat-link]').forEach(el => {
    const go = () => {
      browseState.category = el.dataset.catLink;
      browseState.q = ''; browseState.city = ''; browseState.page = 1;
      location.hash = '#/jobs';
    };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
  try {
    const loc = getLoc();
    const params = new URLSearchParams({ status: 'open', page: '1' });
    if (loc) { params.set('lat', loc.lat); params.set('lng', loc.lng); params.set('max_km', browseState.maxKm); }
    const data = await api('/api/jobs?' + params.toString());
    const box = document.getElementById('home-jobs');
    if (!box) return;
    box.innerHTML = data.jobs.length
      ? data.jobs.slice(0, 4).map(jobCard).join('')
      : emptyHtml('briefcase', 'No open jobs right now', 'Check back soon — or post a job yourself.', `<a class="btn btn-sm btn-primary" href="#/post">Post a job</a>`);
  } catch (e) {
    const box = document.getElementById('home-jobs');
    if (box) box.innerHTML = emptyHtml('briefcase', 'Could not load jobs', e.message);
  }
}

/** Find Jobs — search, city, distance, category chips, real result count. */
async function viewBrowse() {
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Find Jobs</h1>
    <p class="page-sub">Real piece work near you, matched by kilometres.</p>
    <div class="searchbar">${icon('search')}
      <input id="q" type="search" placeholder="Search jobs… e.g. moving, cleaning" value="${esc(browseState.q)}" aria-label="Search jobs">
    </div>
    <div class="filters">
      <div class="locbar">
        <select id="f-city" aria-label="Filter by city">
          <option value="">All cities</option>
          ${CITIES.map(c => `<option ${browseState.city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
        <span id="locslot"></span>
      </div>
    </div>
    <div class="chips" id="chips">
      <button class="chip ${!browseState.category ? 'active' : ''}" data-cat="">All</button>
      ${CATEGORIES.map(c => `<button class="chip ${browseState.category === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>
    <div class="split" style="margin:6px 2px 10px"><span class="small muted" id="res-count"></span><span class="small muted" id="res-order"></span></div>
    <div id="results">${loadingHtml('Finding jobs…')}</div>
    <div id="more-wrap" style="text-align:center;margin:8px 0 16px"></div>
    <div style="text-align:center;margin:18px 0 8px"><a class="link-btn" href="#/how">How PieceWork works</a></div>
  </div></div>`;

  const q = document.getElementById('q');
  let debounce;
  q.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { browseState.q = q.value.trim(); browseState.page = 1; loadJobs(true); }, 350);
  });
  document.getElementById('f-city').addEventListener('change', (e) => {
    browseState.city = e.target.value; browseState.page = 1; loadJobs(true);
  });
  function renderLocBar() {
    const slot = document.getElementById('locslot');
    if (!slot) return;
    const loc = getLoc();
    if (!loc) {
      slot.innerHTML = `<button class="chip" id="btn-near-me">${icon('pin')}Near me</button>`;
      document.getElementById('btn-near-me').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.innerHTML = `${icon('pin')}Locating…`;
        try {
          setLoc(await getGps());
          browseState.page = 1;
          renderLocBar();
          loadJobs(true);
          toast('Location set — showing jobs nearest to you.');
        } catch (err2) {
          toast(err2.message, true);
          btn.disabled = false;
          btn.innerHTML = `${icon('pin')}Near me`;
        }
      });
    } else {
      slot.innerHTML = `<select id="f-maxkm" aria-label="Maximum distance" style="flex:1;padding:11px 14px;border-radius:14px;border:1.5px solid var(--line);font-family:inherit;font-weight:700;font-size:14px;background:#fff;color:var(--ink)">
          ${[5, 10, 25, 50, 100].map(d => `<option value="${d}" ${browseState.maxKm === d ? 'selected' : ''}>within ${d} km</option>`).join('')}
          <option value="any" ${browseState.maxKm === 'any' ? 'selected' : ''}>any distance</option>
        </select>
        <button class="link-btn" id="btn-loc-clear">Clear</button>`;
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
    document.querySelectorAll('#chips .chip').forEach(c => c.classList.toggle('active', c === btn));
    loadJobs(true);
  });
  document.getElementById('more-wrap').addEventListener('click', (e) => {
    if (e.target.id === 'load-more') { browseState.page++; loadJobs(false); }
  });
  await loadJobs(true);

  async function loadJobs(reset) {
    const results = document.getElementById('results');
    if (!results) return;
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
      const count = document.getElementById('res-count');
      if (count) count.textContent = `${data.total} ${data.total === 1 ? 'opportunity' : 'opportunities'}`;
      const order = document.getElementById('res-order');
      if (order) order.textContent = loc ? 'Nearest first' : 'Newest first';
      if (!data.jobs.length && reset) {
        results.innerHTML = emptyHtml('search', 'No jobs found',
          'Try a different search or city — or post the job yourself.',
          `<a class="btn btn-sm btn-primary" href="#/post">Post a job</a>`);
      } else {
        results.insertAdjacentHTML('beforeend', data.jobs.map(jobCard).join(''));
      }
      document.getElementById('more-wrap').innerHTML =
        data.page < data.totalPages ? `<button id="load-more" class="btn btn-ghost btn-sm">Load more (${data.total - data.page * data.limit} remaining)</button>` : '';
    } catch (e) {
      results.innerHTML = emptyHtml('info', 'Could not load jobs', e.message);
    }
  }
}

/** Looking for Work — public directory of opted-in worker profiles. */
function workerCard(w) {
  const skillList = String(w.skills || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 4);
  return `
  <article class="job-card" data-worker="${w.id}" tabindex="0" role="link" aria-label="${esc(w.name)}">
    ${avatarHtml(w, 'md')}
    <div class="job-body">
      <h3>${esc(w.name)}</h3>
      <div class="job-meta"><span>${icon('pin')}<b>${esc(w.city)}</b></span>${w.rating_count ? `<span>${stars(w.rating_avg)} <b>${Number(w.rating_avg).toFixed(1)}</b></span>` : ''}</div>
      ${skillList.length ? `<div class="job-meta"><span>${icon('tag')}${skillList.map(esc).join(' · ')}</span></div>` : ''}
      ${w.bio ? `<p class="worker-bio">${esc(w.bio)}</p>` : ''}
      <div style="margin-top:8px"><a class="whatsapp-btn" href="${waLink(w.phone, 'Hello ' + w.name + ', I found your profile on the PieceWork Zambia Looking for Work page.')}" target="_blank" rel="noopener">${icon('message')}WhatsApp ${esc(w.name.split(' ')[0])}</a></div>
    </div>
  </article>`;
}

async function viewWorkers() {
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Looking for Work</h1>
    <p class="page-sub">Workers who opted in to be found by posters. Tap a card to see the full profile.</p>
    <div class="field" style="max-width:320px">
      <select id="wk-city" aria-label="Filter by city"><option value="">All cities</option>${CITIES.map(c => `<option>${esc(c)}</option>`).join('')}</select>
    </div>
    <div id="wk-results" class="job-list">${loadingHtml('Loading workers…')}</div>
  </div></div>`;
  const results = document.getElementById('wk-results');
  const sel = document.getElementById('wk-city');
  async function load() {
    results.innerHTML = loadingHtml('Loading workers…');
    try {
      const q = sel.value ? '?city=' + encodeURIComponent(sel.value) : '';
      const data = await api('/api/workers' + q);
      if (!data.workers.length) {
        results.innerHTML = emptyHtml('users', 'No workers listed yet',
          'Be the first — tick "I\u2019m looking for work" in your profile settings.',
          currentUser ? `<a class="btn btn-sm btn-primary" href="#/profile/edit">Update my profile</a>` : `<a class="btn btn-sm btn-primary" href="#/register">Join free</a>`);
        return;
      }
      results.innerHTML = data.workers.map(workerCard).join('');
      results.querySelectorAll('[data-worker]').forEach(el => {
        const go = (e) => { if (e.target.closest('a')) return; location.hash = '#/user/' + el.dataset.worker; };
        el.addEventListener('click', go);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(e); });
      });
    } catch (e) {
      results.innerHTML = emptyHtml('info', 'Could not load workers', e.message);
    }
  }
  sel.addEventListener('change', load);
  load();
}

/** Job detail — dark header, client card, apply flow. */
async function viewJobDetail(id) {
  app.innerHTML = loadingHtml('Loading job…');
  let job;
  try {
    const loc = getLoc();
    const qp = loc ? `?lat=${loc.lat}&lng=${loc.lng}` : '';
    ({ job } = await api('/api/jobs/' + id + qp));
  } catch (e) {
    app.innerHTML = `<div class="page">${emptyHtml('search', 'Job not found', 'This job may have been removed.')}</div>`;
    return;
  }
  const isPoster = job.is_poster;
  const waText = `Hello ${job.poster.name}, I saw your job "${job.title}" on PieceWork Zambia and I'm interested.`;
  const applicants = (job.applications || []).filter(a => a.status !== 'withdrawn');
  const pending = applicants.filter(a => a.status === 'pending');
  const saved = isSaved(job.id);

  let actionHtml = '';
  if (isPoster) {
    const open = job.status === 'open' || job.status === 'filled';
    actionHtml = `
      <div class="card">
        <div class="split" style="margin-bottom:8px"><h3 style="margin:0">Manage this job</h3>
          <span class="badge badge-status-${job.status}">${esc(job.status)}</span></div>
        <p class="small muted" style="margin:0 0 6px">${job.accepted_count}/${job.workers_needed} hired · ${applicants.length} applied</p>
        ${open ? `
        <div class="btn-row">
          <button class="btn btn-sm btn-primary" id="btn-complete">Mark completed</button>
          <button class="btn btn-sm btn-danger" id="btn-cancel">Cancel job</button>
        </div>` : `<p class="small muted" style="margin:8px 0 0">This job is ${job.status}.</p>`}
      </div>
      <div class="card">
        <h3 style="margin-top:0">Applicants (${applicants.length})</h3>
        <div id="applicants">${applicants.length ? applicants.map(applicantHtml).join('') : '<p class="small muted">No applications yet. Share the job or wait for workers to apply.</p>'}</div>
      </div>`;
  } else if (!currentUser) {
    actionHtml = `<div class="card" style="text-align:center">
      <p style="margin-top:0">Want this job? Sign in to apply.</p>
      <a class="btn btn-primary full" href="#/login">Sign in / Register</a></div>`;
  } else if (job.my_application) {
    const s = job.my_application.status;
    actionHtml = `<div class="card"><h3 style="margin-top:0">Your application</h3>
      <p>Status: <span class="badge badge-app-${s}">${esc(s)}</span></p>
      ${s === 'pending' ? `<button class="link-btn" id="btn-withdraw">Withdraw application</button>` : ''}
      ${s === 'accepted' && job.whatsapp ? `<div style="margin-top:8px"><a class="whatsapp-btn" href="${waLink(job.whatsapp, waText)}" target="_blank" rel="noopener">${icon('message')}Chat on WhatsApp</a></div>` : ''}
    </div>`;
  } else if (job.status === 'open') {
    actionHtml = `
      <div class="btn-row" style="margin-bottom:14px">
        <button class="btn btn-primary" id="btn-to-apply">${icon('send')}Apply for this job</button>
        ${job.whatsapp ? `<a class="btn btn-outline" href="${waLink(job.whatsapp, waText)}" target="_blank" rel="noopener">${icon('message')}Message</a>` : ''}
      </div>
      <div class="card" id="apply-card">
        <h3 style="margin-top:0">Apply for this job</h3>
        <div class="card-row" style="margin-bottom:12px">
          ${jobThumb(job.category)}
          <div><b>${esc(job.title)}</b><div class="pay" style="font-size:15px">${payText(job)}</div></div>
        </div>
        <form id="apply-form">
          <div class="field">
            <label for="app-msg">Tell the client about yourself</label>
            <textarea name="message" id="app-msg" maxlength="500" placeholder="e.g. I have done this work before and I stay nearby. I can start early."></textarea>
          </div>
          <button class="btn btn-primary full" type="submit">Submit Application</button>
        </form>
      </div>`;
  } else {
    actionHtml = `<div class="card"><p class="small muted" style="margin:0">This job is ${job.status} and no longer accepting applications.</p></div>`;
  }

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
      reviewHtml = `<div class="card"><h3 style="margin-top:0">Rate your experience</h3>
        <p class="small muted" style="margin-top:0">The job is done — let others know how it went.</p>
        ${reviewees.map(r => `
          <div class="field" style="border-top:1px solid var(--line);padding-top:10px">
            <label>${esc(r.name)}</label>
            <div style="display:flex;gap:8px">
              <select data-review-for="${r.id}" data-review-job="${job.id}" aria-label="Rating">
                <option value="">Choose…</option>
                <option value="5">5 — Excellent</option>
                <option value="4">4 — Good</option>
                <option value="3">3 — Okay</option>
                <option value="2">2 — Poor</option>
                <option value="1">1 — Terrible</option>
              </select>
              <button class="btn btn-sm btn-primary" data-review-btn="${r.id}">Send</button>
            </div>
            <input data-review-comment="${r.id}" placeholder="Short comment (optional)" style="margin-top:8px">
          </div>`).join('')}
      </div>`;
    }
  }

  app.innerHTML = `
  <div class="view">
    <div class="detail-hero">
      <div class="detail-top">
        <button class="icon-btn" id="d-back" aria-label="Back to jobs">${icon('back')}</button>
        <div class="detail-actions">
          <button class="icon-btn ${saved ? 'saved' : ''}" data-save="${job.id}" aria-label="Save this job" aria-pressed="${saved ? 'true' : 'false'}">${icon('bookmark')}</button>
        </div>
      </div>
      <span class="badge badge-cat">${esc(job.category)}</span>
      <h1>${esc(job.title)}</h1>
      <div class="pay">${kwacha(job.pay_amount)}<small> ${esc(PAY_LABEL[job.pay_type] || '')}</small></div>
      <div class="detail-meta">
        <span>${icon('pin')}${esc(job.city)}${job.area && job.area.toLowerCase() !== String(job.city || '').toLowerCase() ? ' · ' + esc(job.area) : ''}${job.distance_km != null ? ` · ${esc(fmtKm(job.distance_km))} away` : ''}</span>
        <span>${icon('calendar')}${esc(fmtDate(job.date_needed))}</span>
        <span>${icon('clock')}Posted ${esc(relTime(job.created_at))}</span>
      </div>
    </div>
    <div class="page">
      <div class="card">
        <h3 style="margin-top:0">About this job</h3>
        <p style="margin:0">${esc(job.description).replace(/\n/g, '<br>')}</p>
        <div class="tagrow">
          <span class="tag">${esc(job.category)}</span>
          <span class="tag">${esc(PAY_LABEL[job.pay_type] || 'Fixed price')}</span>
          <span class="tag">${job.workers_needed} ${job.workers_needed === 1 ? 'worker' : 'workers'} needed</span>
        </div>
      </div>
      <a class="card card-row" href="#/user/${job.poster.id}" style="text-decoration:none;color:inherit">
        ${avatarHtml(job.poster, 'md')}
        <div style="flex:1"><div class="small muted">About the client</div>
          <b>${esc(job.poster.name)}</b>
          <div>${stars(job.poster.rating_avg)} <span class="small muted">(${job.poster.rating_count} reviews)</span></div>
        </div>
        <span class="ico" style="color:var(--gray-soft)">${icon('chevR')}</span>
      </a>
      ${actionHtml}
      ${momoNoteHtml()}
      ${reviewHtml}
    </div>
  </div>`;

  document.getElementById('d-back').addEventListener('click', () => { location.hash = '#/jobs'; });
  const toApply = document.getElementById('btn-to-apply');
  if (toApply) toApply.addEventListener('click', () => {
    document.getElementById('apply-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
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
      toast('Job marked as completed.');
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
  document.querySelectorAll('[data-msg]').forEach(btn => btn.addEventListener('click', () => openChat(id, btn.dataset.msg, btn)));
  document.querySelectorAll('[data-review-btn]').forEach(btn => btn.addEventListener('click', async () => {
    const forId = btn.dataset.reviewBtn;
    const sel = document.querySelector(`select[data-review-for="${forId}"]`);
    const com = document.querySelector(`input[data-review-comment="${forId}"]`);
    if (!sel.value) { toast('Choose a star rating first.', true); return; }
    btn.disabled = true;
    try {
      await api('/api/reviews', {
        method: 'POST', body: JSON.stringify({
          job_id: Number(sel.dataset.reviewJob), reviewee_id: Number(forId),
          rating: Number(sel.value), comment: com.value.trim(),
        })
      });
      toast('Thanks for the review!');
      viewJobDetail(id);
    } catch (e) { toast(e.message, true); btn.disabled = false; }
  }));

  function applicantHtml(a) {
    return `<div class="applicant">
      <div class="applicant-top">
        ${avatarHtml({ name: a.worker_name, avatar: a.worker_avatar }, 'md')}
        <div style="flex:1"><a href="#/user/${a.worker_id}"><b>${esc(a.worker_name)}</b></a>
          <div class="small muted">${esc(a.worker_city)} · ${stars(a.worker_rating)} (${a.worker_rating_count})</div>
        </div>
        <span class="badge badge-app-${a.status}">${esc(a.status)}</span>
      </div>
      ${a.message ? `<div class="applicant-msg">${esc(a.message)}</div>` : ''}
      ${a.status === 'pending' ? `<div class="btn-row">
        <button class="btn btn-sm btn-primary" data-accept="${a.id}">${icon('check')}Accept</button>
        <button class="btn btn-sm btn-danger" data-decline="${a.id}">Decline</button>
      </div>` : ''}
      ${(a.status === 'pending' || a.status === 'accepted') ? `
      <div class="btn-row" style="margin-top:8px">
        <button class="btn btn-sm btn-outline" data-msg="${a.worker_id}">${icon('message')}Message</button>
      </div>` : ''}
      ${a.status === 'pending' ? `
      <div style="margin-top:8px"><a class="whatsapp-btn" href="${waLink(a.worker_phone, 'Hello ' + a.worker_name + ', about your application for "' + job.title + '" on PieceWork Zambia…')}" target="_blank" rel="noopener">${icon('message')}WhatsApp ${esc(a.worker_name.split(' ')[0])}</a></div>` : ''}
    </div>`;
  }

  async function decideApplication(appId, status) {
    const verb = status === 'accepted' ? 'Accept' : 'Decline';
    if (!confirm(`${verb} this applicant?`)) return;
    try {
      await api(`/api/applications/${appId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast(status === 'accepted' ? 'Worker hired!' : 'Application declined.');
      viewJobDetail(id);
    } catch (e) { toast(e.message, true); }
  }
}

/** Post a job. */
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
    <div style="display:flex;gap:10px">
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
    <div style="display:flex;gap:10px">
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
          <option value="per_month" ${prefill.pay_type === 'per_month' ? 'selected' : ''}>Per month</option>
        </select>
      </div>
      <div class="field" style="flex:1">
        <label for="jf-workers">Workers</label>
        <input name="workers_needed" id="jf-workers" type="number" min="1" max="50" inputmode="numeric" value="${esc(prefill.workers_needed || '1')}">
      </div>
    </div>
    <div class="field">
      <label>Pinpoint location <span class="hint-inline">(optional)</span></label>
      <input type="hidden" name="lat" id="jf-lat">
      <input type="hidden" name="lng" id="jf-lng">
      <div class="hint" id="jf-loc-status">No GPS pinned — distance matching will use your city centre.</div>
      <button type="button" class="btn btn-sm btn-outline" id="btn-pin-loc" style="margin-top:8px">${icon('pin')}Pin my current location</button>
    </div>
    <div class="field">
      <label for="jf-wa">WhatsApp number <span class="hint-inline">(optional)</span></label>
      <input name="whatsapp" id="jf-wa" type="tel" inputmode="tel" value="${esc(prefill.whatsapp || (currentUser ? currentUser.phone : ''))}" placeholder="0977 123 456">
      <div class="hint">Workers can message you directly. Leave blank to keep applications in the app only.</div>
    </div>
    <button class="btn btn-primary full" type="submit">${icon('send')}Post job</button>
  </form>`;
}

async function viewPost() {
  if (!requireAuth('#/post')) return;
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Post a job</h1>
    <p class="page-sub">Describe the piece work — workers nearby will see it instantly.</p>
    <div class="card">${jobFormHtml()}</div>
    ${momoNoteHtml()}
  </div></div>`;
  const form = document.getElementById('job-form');
  document.getElementById('btn-pin-loc').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `${icon('pin')}Locating…`;
    try {
      const { lat, lng } = await getGps();
      document.getElementById('jf-lat').value = lat;
      document.getElementById('jf-lng').value = lng;
      document.getElementById('jf-loc-status').innerHTML = '<b>Location pinned</b> — workers will see how many km away the job is.';
      toast('Location pinned.');
    } catch (err2) {
      toast(err2.message, true);
    }
    btn.disabled = false;
    btn.innerHTML = `${icon('pin')}Pin my current location`;
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const { id } = await api('/api/jobs', { method: 'POST', body: JSON.stringify(data) });
      toast('Job posted!');
      location.hash = '#/job/' + id;
    } catch (err2) {
      showFieldErrors(form, err2.fields);
      toast(err2.message, true);
      btn.disabled = false;
    }
  });
}

/** My Gigs — postings + applications. */
async function viewDashboard() {
  if (!requireAuth('#/dashboard')) return;
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">My Gigs</h1>
    <p class="page-sub">Jobs you posted and jobs you applied for.</p>
    <div class="seg">
      <button id="seg-postings" class="active">My Postings</button>
      <button id="seg-gigs">Jobs I Applied To</button>
    </div>
    <div id="dash-body">${loadingHtml()}</div>
  </div></div>`;
  const body = document.getElementById('dash-body');
  const segP = document.getElementById('seg-postings');
  const segG = document.getElementById('seg-gigs');

  async function showPostings() {
    segP.classList.add('active'); segG.classList.remove('active');
    body.innerHTML = loadingHtml();
    try {
      const lists = await Promise.all(
        ['open', 'filled', 'completed', 'cancelled'].map(s => api('/api/jobs?mine=1&status=' + s + '&page=1').catch(() => ({ jobs: [] })))
      );
      const mine = lists.flatMap(l => l.jobs)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      body.innerHTML = mine.length ? mine.map(jobCard).join('')
        : emptyHtml('clipboard', 'No postings yet', 'Post your first job and find helping hands fast.', `<a class="btn btn-sm btn-primary" href="#/post">Post a job</a>`);
    } catch (e) { body.innerHTML = emptyHtml('info', 'Could not load', e.message); }
  }
  async function showGigs() {
    segG.classList.add('active'); segP.classList.remove('active');
    body.innerHTML = loadingHtml();
    try {
      const { applications } = await api('/api/applications/mine');
      if (!applications.length) {
        body.innerHTML = emptyHtml('briefcase', 'No applications yet', 'Browse open jobs and apply to your first gig.', `<a class="btn btn-sm btn-primary" href="#/jobs">Browse jobs</a>`);
        return;
      }
      body.innerHTML = applications.map(a => `
        <article class="job-card" data-job="${a.job_id}" tabindex="0" role="link" aria-label="${esc(a.title)}">
          ${jobThumb(a.category)}
          <div class="job-body">
            <div style="margin-bottom:6px"><span class="badge badge-app-${a.app_status}">${esc(a.app_status)}</span></div>
            <h3>${esc(a.title)}</h3>
            <div class="pay">${kwacha(a.pay_amount)}<small style="font-weight:600;color:var(--gray)"> ${esc(PAY_LABEL[a.pay_type] || '')}</small></div>
            <div class="job-meta"><span>${icon('pin')}<b>${esc(a.city)}</b></span><span>${icon('calendar')}${esc(fmtDate(a.date_needed))}</span></div>
            <div class="job-meta"><span>by ${esc(a.poster_name)} · applied ${esc(fmtDateTime(a.applied_at))}</span></div>
          </div>
        </article>`).join('');
    } catch (e) { body.innerHTML = emptyHtml('info', 'Could not load', e.message); }
  }
  segP.addEventListener('click', showPostings);
  segG.addEventListener('click', showGigs);
  showPostings();
}

/** Rich profile: dark hero, stats, tabs, menu. */
async function viewProfile() {
  if (!requireAuth('#/profile')) return;
  app.innerHTML = `
  <div class="view">
    <div class="profile-hero">
      <button class="icon-btn" id="pf-edit" aria-label="Edit profile">${icon('gear')}</button>
      ${avatarHtml(currentUser, 'lg')}
      <h2>${esc(currentUser.name)}</h2>
      <div class="sub">${esc(currentUser.city)} · ${stars(currentUser.rating_avg)} (${currentUser.rating_count} reviews)</div>
      <div style="margin-top:12px"><a class="btn btn-sm btn-primary" href="#/user/${currentUser.id}">${icon('eye')}View public profile</a></div>
    </div>
    <div class="profile-stats" id="pf-stats">
      <div><strong>–</strong><span>Loading</span></div><div><strong>–</strong><span></span></div><div><strong>–</strong><span></span></div>
    </div>
    <div class="page">
      <div class="seg">
        <button id="tab-overview" class="active">Overview</button>
        <button id="tab-reviews">Reviews</button>
      </div>
      <div id="pf-overview" class="card">${loadingHtml()}</div>
      <div id="pf-reviews" class="card" hidden></div>
      <div class="section-title"><span>Menu</span></div>
      <div class="menu-list">
        <a href="#/dashboard">${icon('clipboard')}<span>My gigs</span><span class="chev">${icon('chevR')}</span></a>
        <a href="#/saved">${icon('bookmark')}<span>Saved jobs</span><span class="chev">${icon('chevR')}</span></a>
        <a href="#/how">${icon('help')}<span>Help &amp; support</span><span class="chev">${icon('chevR')}</span></a>
        <button id="pf-logout">${icon('logout')}<span>Sign out</span></button>
      </div>
    </div>
  </div>`;

  document.getElementById('pf-edit').addEventListener('click', () => { location.hash = '#/profile/edit'; });
  document.getElementById('pf-logout').addEventListener('click', logout);
  const tabO = document.getElementById('tab-overview');
  const tabR = document.getElementById('tab-reviews');
  const paneO = document.getElementById('pf-overview');
  const paneR = document.getElementById('pf-reviews');
  tabO.addEventListener('click', () => { tabO.classList.add('active'); tabR.classList.remove('active'); paneO.hidden = false; paneR.hidden = true; });
  tabR.addEventListener('click', () => { tabR.classList.add('active'); tabO.classList.remove('active'); paneR.hidden = false; paneO.hidden = true; });

  try {
    const [{ user, completed_jobs, reviews }, mine] = await Promise.all([
      api('/api/users/' + currentUser.id),
      api('/api/jobs?mine=1&status=open&page=1').catch(() => ({ total: 0 })),
    ]);
    const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    const positive = reviews.length ? Math.round(avg / 5 * 100) + '%' : '–';
    document.getElementById('pf-stats').innerHTML = `
      <div><strong>${completed_jobs}</strong><span>Jobs completed</span></div>
      <div><strong>${positive}</strong><span>Positive reviews</span></div>
      <div><strong>${mine.total || 0}</strong><span>Active listings</span></div>`;
    const skills = (user.skills || '').split(',').map(s => s.trim()).filter(Boolean);
    paneO.innerHTML = `
      ${user.bio ? `<p style="margin-top:0">${esc(user.bio)}</p>` : `<p class="small muted" style="margin-top:0">No bio yet — <a href="#/profile/edit"><b>tell people who you are</b></a>.</p>`}
      ${skills.length ? `<div class="tagrow" style="margin:0 0 12px">${skills.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div>` : ''}
      <ul class="detail-list" style="margin:0">
        <li>${icon('phone')}<div><b>${esc(user.phone)}</b><br><span class="small muted">Phone</span></div></li>
        <li>${icon('pin')}<div><b>${esc(user.city)}</b><br><span class="small muted">City</span></div></li>
        <li>${icon('calendar')}<div><b>${esc(fmtDateTime(user.created_at))}</b><br><span class="small muted">Member since</span></div></li>
      </ul>`;
    paneR.innerHTML = reviews.length
      ? `<h3 style="margin-top:0">Reviews (${reviews.length})</h3>` + reviews.map(r => `
        <div class="review">
          <div class="review-head"><b>${esc(r.reviewer_name)}</b>${stars(r.rating)}</div>
          <div class="small muted">on “${esc(r.job_title)}” · ${esc(fmtDateTime(r.created_at))}</div>
          ${r.comment ? `<p>${esc(r.comment)}</p>` : ''}
        </div>`).join('')
      : emptyHtml('message', 'No reviews yet', 'Complete jobs to earn your first reviews.');
  } catch (e) {
    document.getElementById('pf-stats').innerHTML = `<div><strong>–</strong><span>Unavailable</span></div>`;
    paneO.innerHTML = emptyHtml('info', 'Could not load profile', e.message);
  }
}

/** Edit profile with photo upload. */
function viewProfileEdit() {
  if (!requireAuth('#/profile/edit')) return;
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Edit profile</h1>
    <p class="page-sub">This is how you appear to posters and workers.</p>
    <div class="card" style="text-align:center">
      <div id="av-preview" style="display:flex;justify-content:center">${avatarHtml(currentUser, 'lg')}</div>
      <input type="file" id="av-file" accept="image/*" hidden>
      <button class="btn btn-sm btn-outline" id="av-btn" style="margin-top:12px">${icon('camera')}Change photo</button>
      <div class="hint" style="margin-top:8px">Square photos work best. Kept small automatically.</div>
    </div>
    <div class="card">
      <form id="profile-form" novalidate>
        <div class="field"><label for="pf-name">Full name</label><input name="name" id="pf-name" value="${esc(currentUser.name)}"></div>
        <div class="field"><label for="pf-city">City</label>
          <select name="city" id="pf-city">${CITIES.map(c => `<option ${currentUser.city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="field"><label for="pf-bio">About you</label>
          <textarea name="bio" id="pf-bio" maxlength="500" placeholder="Tell posters who you are and what you do best…">${esc(currentUser.bio || '')}</textarea></div>
        <div class="field"><label for="pf-skills">Skills <span class="hint-inline">(comma separated)</span></label>
          <input name="skills" id="pf-skills" maxlength="300" value="${esc(currentUser.skills || '')}" placeholder="e.g. Moving, Cleaning, Painting"></div>
        <label class="check-row" for="pf-open">
          <input type="checkbox" name="open_to_work" id="pf-open" value="1" ${currentUser.open_to_work ? 'checked' : ''}>
          <span><b>I'm looking for work</b><br><span class="hint">Show my profile on the Looking for Work page so posters can find me.</span></span>
        </label>
        <div class="field">
          <label>Your location</label>
          <div class="hint" id="pf-loc-status">${currentUser.lat != null ? '<b>Location saved</b> — jobs are matched by distance to you in kilometres.' : 'No precise location saved — distance matching uses your city centre.'}</div>
          <button type="button" class="btn btn-sm btn-outline" id="btn-save-loc" style="margin-top:8px">${icon('pin')}Set my location</button>
        </div>
        <button class="btn btn-primary full" type="submit">${icon('check')}Save changes</button>
      </form>
    </div>
  </div></div>`;

  let newAvatar = null;
  const fileInput = document.getElementById('av-file');
  document.getElementById('av-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      newAvatar = await fileToAvatar(file);
      document.getElementById('av-preview').innerHTML = `<img class="avatar lg" src="${newAvatar}" alt="New profile photo">`;
      toast('Photo ready — tap Save changes to keep it.');
    } catch (e) { toast(e.message, true); }
    fileInput.value = '';
  });

  document.getElementById('btn-save-loc').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `${icon('pin')}Locating…`;
    try {
      const { lat, lng } = await getGps();
      const { user } = await api('/api/users/me', { method: 'PATCH', body: JSON.stringify({ lat, lng }) });
      currentUser = user; renderChrome();
      document.getElementById('pf-loc-status').innerHTML = '<b>Location saved</b> — jobs are matched by distance to you in kilometres.';
      toast('Location saved.');
    } catch (err2) { toast(err2.message, true); }
    btn.disabled = false;
    btn.innerHTML = `${icon('pin')}Set my location`;
  });

  const form = document.getElementById('profile-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    const payload = {
      name: form.name.value.trim(),
      city: form.city.value,
      bio: form.bio.value.trim(),
      skills: form.skills.value.trim(),
      open_to_work: form.open_to_work.checked,
    };
    if (newAvatar) payload.avatar = newAvatar;
    try {
      const { user } = await api('/api/users/me', { method: 'PATCH', body: JSON.stringify(payload) });
      currentUser = user; renderChrome();
      toast('Profile updated.');
      location.hash = '#/profile';
    } catch (err2) { showFieldErrors(form, err2.fields); toast(err2.message, true); }
    btn.disabled = false;
  });
}

/** Shrink a photo to a 256px square JPEG data URL. */
function fileToAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Please choose an image file.')); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch (e) { reject(new Error('Could not process that image.')); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

/** Public profile. */
async function viewUser(id) {
  app.innerHTML = loadingHtml('Loading profile…');
  try {
    const { user, completed_jobs, reviews } = await api('/api/users/' + id);
    const skills = (user.skills || '').split(',').map(s => s.trim()).filter(Boolean);
    const isSelf = currentUser && currentUser.id === user.id;
    app.innerHTML = `
    <div class="view">
      <div class="profile-hero">
        ${avatarHtml(user, 'lg')}
        <h2>${esc(user.name)}</h2>
        <div class="sub">${esc(user.city)} · ${stars(user.rating_avg)} (${user.rating_count} reviews)</div>
      </div>
      <div class="profile-stats">
        <div><strong>${completed_jobs}</strong><span>Jobs completed</span></div>
        <div><strong>${user.rating_avg ? Number(user.rating_avg).toFixed(1) : '–'}</strong><span>Avg rating</span></div>
        <div><strong>${reviews.length}</strong><span>Reviews</span></div>
      </div>
      <div class="page">
        <div class="card">
          ${user.bio ? `<p style="margin-top:0">${esc(user.bio)}</p>` : `<p class="small muted" style="margin-top:0">No bio yet.</p>`}
          ${skills.length ? `<div class="tagrow" style="margin:0 0 4px">${skills.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div>` : ''}
          <ul class="detail-list" style="margin-bottom:0">
            <li>${icon('phone')}<div><b>${esc(user.phone)}</b><br><span class="small muted">Phone</span></div></li>
            <li>${icon('pin')}<div><b>${esc(user.city)}</b><br><span class="small muted">City</span></div></li>
          </ul>
          ${!isSelf ? `<div style="margin-top:12px"><a class="whatsapp-btn" href="${waLink(user.phone, 'Hello ' + user.name + ', I found you on PieceWork Zambia.')}" target="_blank" rel="noopener">${icon('message')}Chat on WhatsApp</a></div>` : ''}
          ${isSelf ? `<div style="margin-top:12px"><a class="btn btn-sm btn-outline" href="#/profile/edit">${icon('edit')}Edit my profile</a></div>` : ''}
        </div>
        <div class="card">
          <h3 style="margin-top:0">Reviews (${reviews.length})</h3>
          ${reviews.length ? reviews.map(r => `
            <div class="review">
              <div class="review-head"><b>${esc(r.reviewer_name)}</b>${stars(r.rating)}</div>
              <div class="small muted">on “${esc(r.job_title)}” · ${esc(fmtDateTime(r.created_at))}</div>
              ${r.comment ? `<p>${esc(r.comment)}</p>` : ''}
            </div>`).join('')
            : '<p class="small muted">No reviews yet.</p>'}
        </div>
      </div>
    </div>`;
  } catch (e) {
    app.innerHTML = `<div class="page">${emptyHtml('search', 'Profile not found', e.message)}</div>`;
  }
}

/** Explore categories — real categories, tap to filter. */
function viewCategories() {
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Explore Categories</h1>
    <p class="page-sub">Find piece work that matches your skills.</p>
    <div class="cat-grid">
      ${CATEGORIES.map(c => {
        const [ic, bg] = catStyle(c);
        return `<div class="cat-card" data-cat-link="${esc(c)}" tabindex="0" role="link" aria-label="Browse ${esc(c)} jobs"><div class="cat-ico" style="background:${bg}">${icon(ic)}</div><b>${esc(c)}</b></div>`;
      }).join('')}
    </div>
    <a class="promo-card" href="#/jobs" style="text-decoration:none;color:#fff">
      <img src="/img/landing/hero.jpg" alt="Zambians doing piece work" loading="lazy">
      <div class="promo-text"><h3>Work skills build stronger communities.</h3><p>Every job done well builds your reputation — and your income.</p></div>
    </a>
  </div></div>`;
  document.querySelectorAll('[data-cat-link]').forEach(el => {
    const go = () => {
      browseState.category = el.dataset.catLink;
      browseState.q = ''; browseState.city = ''; browseState.page = 1;
      location.hash = '#/jobs';
    };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
}

/** Saved jobs (bookmarked on this device). */
async function viewSaved() {
  const ids = getSaved();
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Saved jobs</h1>
    <p class="page-sub">Jobs you bookmarked for later — kept on this device.</p>
    <div id="saved-list">${loadingHtml()}</div>
  </div></div>`;
  const box = document.getElementById('saved-list');
  if (!ids.length) {
    box.innerHTML = emptyHtml('bookmark', 'No saved jobs yet', 'Tap the bookmark on any job to keep it here.', `<a class="btn btn-sm btn-primary" href="#/jobs">Browse jobs</a>`);
    return;
  }
  try {
    const jobs = (await Promise.all(
      ids.map(jid => api('/api/jobs/' + jid).then(d => d.job).catch(() => null))
    )).filter(Boolean);
    box.innerHTML = jobs.length
      ? jobs.map(jobCard).join('')
      : emptyHtml('bookmark', 'Nothing here', 'Those jobs are no longer available.', `<a class="btn btn-sm btn-primary" href="#/jobs">Browse jobs</a>`);
  } catch (e) {
    box.innerHTML = emptyHtml('info', 'Could not load saved jobs', e.message);
  }
}

/** Messages — honest placeholder until in-app chat ships. */
/** Messages — conversation list. */
async function viewMessages() {
  if (!requireAuth('#/messages')) return;
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Messages</h1>
    <p class="page-sub">Your conversations with posters and workers, about your jobs.</p>
    <div id="conv-list">${loadingHtml('Loading conversations…')}</div>
  </div></div>`;
  const list = document.getElementById('conv-list');
  try {
    const { conversations } = await api('/api/conversations');
    if (!conversations.length) {
      list.innerHTML = emptyHtml('message', 'No conversations yet',
        'Posters message their applicants here. Applied for a job? The poster will message you here first.',
        `<a class="btn btn-sm btn-primary" href="#/jobs">Browse jobs</a>`);
      return;
    }
    list.innerHTML = conversations.map(c => `
      <a class="conv-card" href="#/chat/${c.id}">
        ${avatarHtml({ name: c.other_name, avatar: c.other_avatar }, 'md')}
        <div class="conv-body">
          <div class="conv-top"><b>${esc(c.other_name)}</b><span class="small muted">${esc(relTime(c.last_at))}</span></div>
          <div class="small muted">${esc(c.job_title)}</div>
          <div class="conv-preview">${c.last_body ? esc(c.last_body) : '<span class="small muted">Say hello…</span>'}</div>
        </div>
        ${c.unread ? `<span class="conv-unread">${c.unread}</span>` : ''}
      </a>`).join('');
  } catch (e) {
    list.innerHTML = emptyHtml('info', 'Could not load messages', e.message);
  }
}

/** Open (find-or-create) a conversation, then jump to it. */
async function openChat(jobId, workerId, btn) {
  if (btn) btn.disabled = true;
  try {
    const { conversation_id } = await api('/api/conversations', {
      method: 'POST', body: JSON.stringify({ job_id: jobId, worker_id: workerId }),
    });
    location.hash = '#/chat/' + conversation_id;
  } catch (e) { toast(e.message, true); if (btn) btn.disabled = false; }
}

/** Chat thread. */
async function viewChat(id) {
  if (!requireAuth('#/chat/' + id)) return;
  app.innerHTML = `
  <div class="view"><div class="page chat-page">
    <div class="chat-head">
      <a class="icon-btn" href="#/messages" aria-label="Back to messages">${icon('back')}</a>
      <div id="chat-peer" style="flex:1;min-width:0">${loadingHtml()}</div>
    </div>
    <div id="chat-msgs" class="chat-msgs">${loadingHtml('Loading messages…')}</div>
    <form id="chat-form" class="chat-form">
      <input id="chat-input" maxlength="1000" placeholder="Type a message…" autocomplete="off" aria-label="Type a message">
      <button class="btn btn-primary" type="submit" aria-label="Send">${icon('send')}</button>
    </form>
  </div></div>`;
  const msgsEl = document.getElementById('chat-msgs');
  const peerEl = document.getElementById('chat-peer');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  let lastMsgId = 0;
  let peerId = null;

  function bubble(m) {
    const mine = m.sender_id === currentUser.id;
    return `<div class="msg ${mine ? 'mine' : 'theirs'}"><div class="msg-bubble">${esc(m.body)}</div>
      <div class="msg-time">${esc(relTime(m.created_at))}</div></div>`;
  }
  function scrollBottom() { msgsEl.scrollTop = msgsEl.scrollHeight; }

  async function load(initial) {
    try {
      const { conversation, messages } = await api('/api/conversations/' + id);
      peerId = conversation.other_id;
      peerEl.innerHTML = `
        <a href="#/user/${conversation.other_id}" style="display:flex;align-items:center;gap:10px;min-width:0">
          ${avatarHtml({ name: conversation.other_name, avatar: conversation.other_avatar }, 'sm')}
          <span style="min-width:0"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(conversation.other_name)}</b>
          <span class="small muted" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(conversation.job_title)}</span></span>
        </a>`;
      if (initial) {
        msgsEl.innerHTML = messages.length ? messages.map(bubble).join('')
          : `<div class="empty" style="padding:24px"><p>Start the conversation — agree on the details, time, and pay.</p></div>`;
        lastMsgId = messages.length ? messages[messages.length - 1].id : 0;
        scrollBottom();
      } else if (messages.length && messages[messages.length - 1].id !== lastMsgId) {
        const fresh = messages.filter(m => m.id > lastMsgId);
        if (fresh.length) {
          msgsEl.querySelector('.empty')?.remove();
          msgsEl.insertAdjacentHTML('beforeend', fresh.map(bubble).join(''));
          lastMsgId = messages[messages.length - 1].id;
          const nearBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 120;
          if (nearBottom || fresh.some(m => m.sender_id === currentUser.id)) scrollBottom();
        }
      }
      renderChrome();
    } catch (e) {
      if (initial) msgsEl.innerHTML = emptyHtml('info', 'Could not load chat', e.message);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      const { message } = await api('/api/conversations/' + id + '/messages', {
        method: 'POST', body: JSON.stringify({ body: text }),
      });
      msgsEl.querySelector('.empty')?.remove();
      msgsEl.insertAdjacentHTML('beforeend', bubble(message));
      lastMsgId = message.id;
      scrollBottom();
    } catch (err2) { toast(err2.message, true); input.value = text; }
  });

  await load(true);
  chatTimer = setInterval(() => load(false), 4000);
}

/** Sign in. */
function viewLogin() {
  if (currentUser) { location.hash = '#/dashboard'; return; }
  app.innerHTML = `
  <div class="view"><div class="page" style="max-width:420px;margin:0 auto">
    <h1 class="page-title">Welcome back</h1>
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
        <button class="btn btn-primary full" type="submit">Sign in</button>
      </form>
    </div>
    <p style="text-align:center">New here? <a href="#/register" style="font-weight:700">Create an account</a></p>
  </div></div>`;
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

/** Register. */
function viewRegister() {
  if (currentUser) { location.hash = '#/dashboard'; return; }
  app.innerHTML = `
  <div class="view"><div class="page" style="max-width:420px;margin:0 auto">
    <h1 class="page-title">Join PieceWork</h1>
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
          <div class="hint">Your mobile number — this is how posters reach you on call or WhatsApp.</div>
        </div>
        <div class="field">
          <label for="rg-city">City</label>
          <select name="city" id="rg-city"><option value="">Choose…</option>${CITIES.map(c => `<option>${esc(c)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="rg-pass">Password</label>
          <input name="password" id="rg-pass" type="password" autocomplete="new-password" placeholder="At least 8 characters">
        </div>
        <label class="check-row" for="rg-open">
          <input type="checkbox" name="open_to_work" id="rg-open" value="1">
          <span><b>I'm looking for work</b><br><span class="hint">Show my profile on the Looking for Work page so posters can find me. Optional.</span></span>
        </label>
        <button class="btn btn-primary full" type="submit">Create account</button>
      </form>
    </div>
    <p style="text-align:center">Already registered? <a href="#/login" style="font-weight:700">Sign in</a></p>
  </div></div>`;
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
      toast(`Welcome to PieceWork, ${user.name.split(' ')[0]}!`);
      afterAuthRedirect();
    } catch (err2) {
      showFieldErrors(form, err2.fields);
      toast(err2.message, true);
      btn.disabled = false;
    }
  });
}

/** Landing page (signed-out home). */
function viewLanding() {
  const cats = ['Cleaning', 'Construction & Labor', 'Gardening', 'Painting', 'Delivery & Errands', 'Cooking & Catering'];
  app.innerHTML = `
  <div class="view">
    <section class="hero">
      <img class="bg" src="/img/landing/hero.jpg" alt="Zambian workers doing piece work — bricklaying, gardening, painting and deliveries" fetchpriority="high">
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <span class="kicker">Zambia's piece-work marketplace</span>
        <h1>Quick jobs.<br><span class="hl">Quick cash.</span></h1>
        <p>Need a quick gig done today? Post it in minutes and hire helping hands near you. Looking for work? Find piece work and get paid by mobile money — as soon as the job is done.</p>
        <div class="hero-ctas">
          <a class="btn btn-primary" href="#/jobs">${icon('search')}Find work</a>
          <a class="btn btn-outline" href="#/post">${icon('plus')}Post a job</a>
        </div>
      </div>
    </section>
    <div class="landing">
      <h2>Popular piece work</h2>
      <p class="lede">Tap a category to see open jobs.</p>
      <div class="cat-grid">
        ${cats.map(c => {
          const [ic, bg] = catStyle(c);
          return `<div class="cat-card" data-cat-link="${esc(c)}" tabindex="0" role="link" aria-label="Browse ${esc(c)} jobs"><div class="cat-ico" style="background:${bg}">${icon(ic)}</div><b>${esc(c)}</b></div>`;
        }).join('')}
      </div>
      <h2 style="margin-top:26px">How it works</h2>
      <div class="steps">
        <div class="card"><div class="step-n">1</div><div><h4>Browse gigs near you</h4><p>Jobs are matched by kilometres — nearest first. Or post a gig in minutes.</p></div></div>
        <div class="card"><div class="step-n">2</div><div><h4>Apply in one tap</h4><p>Posters review applicants, check ratings, and hire.</p></div></div>
        <div class="card"><div class="step-n">3</div><div><h4>Get paid by mobile money</h4><p>MTN Mobile Money or Airtel Money — the amount is agreed before you start.</p></div></div>
      </div>
      <div class="split" style="align-items:stretch">
        <div class="card" style="flex:1">
          <h3 style="margin-top:0">For workers</h3>
          <p class="small muted">Free for workers, always. Create an account, find piece work near you, build your rating.</p>
          <a class="btn btn-sm btn-primary" href="#/register">Join free</a>
        </div>
        <div class="card" style="flex:1">
          <h3 style="margin-top:0">For posters</h3>
          <p class="small muted">Need hands? Post the job with the pay in Kwacha and hire today.</p>
          <a class="btn btn-sm btn-outline" href="#/post">Post a job</a>
        </div>
      </div>
      <div class="card" style="margin-top:14px;text-align:center">
        <h3 style="margin-top:0">Built for Zambia's youth</h3>
        <p class="small muted">PieceWork is a product of Isaac “Zac” Muzata — complementing government's efforts on unemployment, one job at a time.</p>
        <a class="link-btn" href="#/about">Our story</a>
      </div>
      <p class="landing-foot">PieceWork Zambia · A product of Isaac Muzata (Zac), <a href="https://2911itservices.com" target="_blank" rel="noopener">2911 IT Services</a></p>
    </div>
  </div>`;
  document.querySelectorAll('[data-cat-link]').forEach(el => {
    const go = () => {
      browseState.category = el.dataset.catLink;
      browseState.q = ''; browseState.city = ''; browseState.page = 1;
      location.hash = '#/jobs';
    };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
}

function viewAbout() {
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">About PieceWork</h1>
    <div class="card">
      <h3 style="margin-top:0">Our story</h3>
      <p>PieceWork Zambia is a product of <b>Isaac Muzata</b>, known as <b>Zac</b> — CEO of <b>2911 IT Services</b>, a Zambian based in Georgia, United States.</p>
      <p>Zac has a deep love for seeing young people grow and become the best they can be in life. That love is what built this platform: a simple system that connects young people to piece work — quick jobs, quick cash — so they can earn with dignity, build real skills, and take charge of their future.</p>
      <p>PieceWork Zambia is his effort to complement the government's efforts on unemployment — and to stand behind every push to create opportunity for the next generation.</p>
      <p style="margin-bottom:0"><b>One job at a time, we're putting Zambia's youth to work.</b></p>
    </div>
    <div class="card" style="text-align:center">
      <h3 style="margin-top:0">Meet the founder</h3>
      <p class="small muted">Isaac “Zac” Muzata · CEO, 2911 IT Services<br><a href="https://2911itservices.com" target="_blank" rel="noopener">2911itservices.com</a></p>
      <a class="btn btn-primary" href="#/register">Join free today</a>
    </div>
  </div></div>`;
}

function viewHow() {
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">How PieceWork works</h1>
    <p class="page-sub">Help &amp; support — the short version.</p>
    <div class="steps">
      <div class="card"><div class="step-n">1</div><div><h4>Post a job (or find one)</h4><p>Need hands for an event, a move, cleaning or building? Post the job with the pay in Kwacha. Looking for work? Browse jobs near you.</p></div></div>
      <div class="card"><div class="step-n">2</div><div><h4>Apply or hire in the app</h4><p>Workers apply with one tap. Posters review applicants, check their ratings, and accept the right people — or chat first on WhatsApp.</p></div></div>
      <div class="card"><div class="step-n">3</div><div><h4>Get the work done</h4><p>Show up, do great work. The poster marks the job completed when it's finished.</p></div></div>
      <div class="card"><div class="step-n">4</div><div><h4>Get paid by mobile money</h4><p>Payment happens directly between you — most people use <b>MTN Mobile Money</b> or <b>Airtel Money</b>. Agree the amount before you start.</p></div></div>
      <div class="card"><div class="step-n">5</div><div><h4>Build your reputation</h4><p>Both sides leave star ratings. Good ratings mean more jobs.</p></div></div>
    </div>
    ${momoNoteHtml()}
    <div class="card" style="text-align:center">
      <h3 style="margin-top:0">Stay safe</h3>
      <p class="small muted">Meet in public places for first jobs. Never pay any “registration fee” to get work — real jobs on PieceWork never ask for money up front.</p>
      <a class="btn btn-primary" href="#/register">Get started — it's free</a>
      <div style="margin-top:10px"><a class="link-btn" href="#/about">Our story — why Zac built this</a></div>
    </div>
  </div></div>`;
}

/* ---------------- router ---------------- */
const routes = [
  [/^#\/?$/, () => (currentUser ? viewHome() : viewLanding())],
  [/^#\/jobs$/, viewBrowse],
  [/^#\/job\/(\d+)$/, (m) => viewJobDetail(m[1])],
  [/^#\/workers$/, viewWorkers],
  [/^#\/post$/, viewPost],
  [/^#\/dashboard$/, viewDashboard],
  [/^#\/profile\/edit$/, viewProfileEdit],
  [/^#\/profile$/, viewProfile],
  [/^#\/user\/(\d+)$/, (m) => viewUser(m[1])],
  [/^#\/login$/, viewLogin],
  [/^#\/register$/, viewRegister],
  [/^#\/categories$/, viewCategories],
  [/^#\/messages$/, viewMessages],
  [/^#\/chat\/(\d+)$/, (m) => viewChat(m[1])],
  [/^#\/saved$/, viewSaved],
  [/^#\/how$/, viewHow],
  [/^#\/about$/, viewAbout],
];

async function router() {
  if (chatTimer) { clearInterval(chatTimer); chatTimer = null; }
  renderChrome();
  const hash = location.hash || '#/';
  window.scrollTo(0, 0);
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    if (m) {
      try { await fn(m); }
      catch (e) { console.error(e); app.innerHTML = `<div class="page">${emptyHtml('info', 'Something went wrong', e.message)}</div>`; }
      return;
    }
  }
  app.innerHTML = `<div class="page">${emptyHtml('search', 'Page not found', 'That page does not exist.', `<a class="btn btn-sm btn-primary" href="#/">Back home</a>`)}</div>`;
}

window.addEventListener('hashchange', router);

/* ---------------- global click delegation ---------------- */
document.addEventListener('click', (e) => {
  const saveBtn = e.target.closest('[data-save]');
  if (saveBtn) {
    e.preventDefault();
    e.stopPropagation();
    toggleSave(saveBtn.dataset.save);
    return;
  }
  const card = e.target.closest('.job-card[data-job], [data-cat-link]');
  if (card && card.dataset.job && !e.target.closest('a') && !e.target.closest('button')) {
    location.hash = '#/job/' + card.dataset.job;
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const card = e.target.closest && e.target.closest('.job-card[data-job]');
    if (card) location.hash = '#/job/' + card.dataset.job;
  }
});

/* ---------------- boot ---------------- */
(async function boot() {
  const scrim = document.getElementById('drawer-scrim');
  if (scrim) scrim.addEventListener('click', closeDrawer);
  const drawerClose = document.getElementById('drawer-close');
  if (drawerClose) {
    drawerClose.innerHTML = icon('x');
    drawerClose.addEventListener('click', closeDrawer);
  }
  const drawerNav = document.getElementById('drawer-nav');
  if (drawerNav) drawerNav.addEventListener('click', (ev) => {
    if (ev.target.closest('a')) closeDrawer();
  });
  await refreshMe();
  if (!location.hash) location.hash = '#/';
  router();
})();

// Installable PWA: cache the app shell for fast, offline-capable loads.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

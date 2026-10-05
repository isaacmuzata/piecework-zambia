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
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
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

/* ---------------- share a job ---------------- */
function shareJob(id, title) {
  const url = 'https://pieceworkzambia.com/#/job/' + id;
  const text = '"' + title + '" — see this job on PieceWork Zambia';
  // Bottom-sheet with explicit options so a link can always be copied,
  // even where the native share sheet is unavailable.
  const overlay = document.createElement('div');
  overlay.className = 'share-overlay';
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const opt = (icn, label, fn) =>
    `<button class="share-opt" data-act="${icn}">${icon(icn)}${label}</button>`;
  overlay.innerHTML = `
    <div class="share-sheet" role="dialog" aria-label="Share this job">
      <h3>Share this job</h3>
      <p class="share-sub">${esc(url)}</p>
      <div class="share-row">
        ${opt('copy', 'Copy link')}
        ${opt('message', 'WhatsApp')}
        ${opt('facebook', 'Facebook')}
        ${navigator.share ? opt('share', 'More…') : ''}
      </div>
      <button class="btn btn-outline full share-close">Close</button>
    </div>`;
  overlay.querySelector('.share-close').addEventListener('click', close);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e2) {}
      ta.remove();
    }
    toast('Job link copied. Paste it anywhere to share.');
    close();
  };
  overlay.querySelector('[data-act="copy"]').addEventListener('click', copyLink);
  overlay.querySelector('[data-act="message"]').addEventListener('click', () => {
    window.open('https://wa.me/?text=' + encodeURIComponent(text + '\n' + url), '_blank', 'noopener');
    close();
  });
  overlay.querySelector('[data-act="facebook"]').addEventListener('click', () => {
    window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url), '_blank', 'noopener');
    close();
  });
  const more = overlay.querySelector('[data-act="share"]');
  if (more) more.addEventListener('click', () => {
    navigator.share({ title: 'PieceWork Zambia', text, url }).catch(() => {});
    close();
  });
  document.body.appendChild(overlay);
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
    if (currentUser.is_admin || currentUser.is_support) items.push(['#/admin', 'shield', 'Admin']);
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
/* Drop any duplicate job rows by id — the API should never send them,
   but a repeated card is worse than a skipped one. */
function dedupeJobs(jobs) {
  const seen = new Set();
  return (jobs || []).filter(j => {
    if (!j || seen.has(j.id)) return false;
    seen.add(j.id);
    return true;
  });
}

function jobCard(job) {
  const saved = isSaved(job.id);  const area = job.area && job.area.toLowerCase() !== String(job.city || '').toLowerCase() ? job.area : '';
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
    <button class="job-share" data-share="${job.id}" data-title="${esc(job.title)}" aria-label="Share this job">${icon('share')}</button>
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
      <div id="gw-promo"></div>
      <div class="section-title"><span>Fresh opportunities</span><a href="#/jobs">View all</a></div>
      <div id="home-jobs">${loadingHtml('Finding jobs…')}</div>
    </div>
  </div>`;

  const q = document.getElementById('home-q');
  // Giveaway promo — only when a round is active.
  api('/api/giveaways/current').then(({ giveaway }) => {
    const slot = document.getElementById('gw-promo');
    if (!slot || !giveaway) return;
    slot.innerHTML = `
      <a class="promo-card" href="#/invite" style="text-decoration:none;color:#fff;background:linear-gradient(135deg,#062b1c,#0e6b3a);display:flex;align-items:center;gap:14px;padding:18px">
        <div style="font-size:34px">🎉</div>
        <div class="promo-text"><h3>Win K${Number(giveaway.prize_kwacha).toLocaleString()}!</h3><p>Invite friends, earn raffle entries. Drawn live on Facebook.</p></div>
      </a>`;
  }).catch(() => {});
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
      ? dedupeJobs(data.jobs).slice(0, 4).map(jobCard).join('')
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
        results.insertAdjacentHTML('beforeend', dedupeJobs(data.jobs).map(jobCard).join(''));
      }
      const moreWrap = document.getElementById('more-wrap');
      if (moreWrap) moreWrap.innerHTML =
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
          <a class="btn btn-sm btn-outline" href="#/job/${job.id}/edit">${icon('edit')}Edit</a>
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
  } else if (job.my_application && job.my_application.status !== 'withdrawn') {
    const s = job.my_application.status;
    actionHtml = `<div class="card"><h3 style="margin-top:0">Your application</h3>
      <p>Status: <span class="badge badge-app-${s}">${esc(s)}</span></p>
      ${s === 'pending' ? `<button class="link-btn" id="btn-withdraw">Withdraw application</button>` : ''}
      ${s === 'accepted' ? `<p class="small muted" style="margin-bottom:0">You've been hired! The poster will message you in the app to arrange the details. Check your <a href="#/messages" style="font-weight:700">messages</a>.</p>` : ''}
    </div>`;
  } else if (job.status === 'open') {
    actionHtml = `
      <div class="btn-row" style="margin-bottom:14px">
        <button class="btn btn-primary" id="btn-to-apply">${icon('send')}Apply for this job</button>
      </div>
      <div class="card" id="apply-card">
        <h3 style="margin-top:0">Apply for this job</h3>
        ${job.my_application ? `<p class="small muted" style="margin-top:0">You withdrew your earlier application. You are welcome to apply again below.</p>` : ''}
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
          <button class="icon-btn" data-share="${job.id}" data-title="${esc(job.title)}" aria-label="Share this job">${icon('share')}</button>
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
  document.querySelectorAll('[data-nrc]').forEach(btn => btn.addEventListener('click', () => viewNrc(btn.dataset.nrc, btn)));
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
        ${a.status === 'accepted' ? `<button class="btn btn-sm btn-outline" data-nrc="${a.id}">${icon('shield')}View NRC</button>` : ''}
      </div>` : ''}
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

  /** Poster views the hired worker's NRC (auto-deletes after 10 days). */
  async function viewNrc(appId, btn) {
    btn.disabled = true;
    try {
      const doc = await api(`/api/applications/${appId}/nrc`);
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px';
      overlay.innerHTML = `
        <div style="background:#fff;border-radius:12px;max-width:560px;width:100%;overflow:hidden">
          <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center">
            <b>Worker NRC</b>
            <button class="btn btn-sm btn-outline" id="nrc-close">Close</button>
          </div>
          <img src="${doc.image}" alt="NRC" style="width:100%;display:block">
          <div class="small muted" style="padding:12px 16px">Uploaded ${esc(fmtDateTime(doc.uploaded_at))}. Deleted automatically on ${esc(fmtDate(doc.expires_at))}. Only you can see this.</div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#nrc-close').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
    } catch (e) { toast(e.message, true); }
    btn.disabled = false;
  }
}

/** Post a job. */
function jobFormHtml(prefill = {}, mode = 'post') {
  const today = new Date().toISOString().slice(0, 10);
  const isEdit = mode === 'edit';
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
      <input type="hidden" name="lat" id="jf-lat" value="${esc(prefill.lat ?? '')}">
      <input type="hidden" name="lng" id="jf-lng" value="${esc(prefill.lng ?? '')}">
      <div class="hint" id="jf-loc-status">${prefill.lat != null ? '<b>Location pinned</b> — workers will see how many km away the job is.' : 'No GPS pinned — distance matching will use your city centre.'}</div>
      <button type="button" class="btn btn-sm btn-outline" id="btn-pin-loc" style="margin-top:8px">${icon('pin')}Pin my current location</button>
    </div>
    ${isEdit ? '' : (currentUser && currentUser.terms_accepted_at ? `
    <div class="field">
      <div class="hint">${icon('shield')} You accepted the <a href="#/terms">Terms and Conditions</a> on ${esc(String(currentUser.terms_accepted_at).slice(0, 10))}.</div>
    </div>` : `
    <div class="field">
      <label class="check-row" for="jf-terms">
        <input type="checkbox" name="terms_accepted" id="jf-terms" value="1">
        <span class="small">I have read and agree to the <a href="#/terms" target="_blank" rel="noopener">Terms and Conditions</a> — including that PieceWork is not liable for any damage or theft, and that I am responsible for my own safety precautions when hiring.</span>
      </label>
    </div>`)}
    <button class="btn btn-primary full" type="submit">${icon(isEdit ? 'check' : 'send')}${isEdit ? 'Save changes' : 'Post job'}</button>
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
    // Capture before the GPS await: navigating away mid-lookup detaches these
    // (harmless) instead of leaving null lookups (which would throw).
    const latEl = document.getElementById('jf-lat');
    const lngEl = document.getElementById('jf-lng');
    const locStatus = document.getElementById('jf-loc-status');
    btn.disabled = true;
    btn.innerHTML = `${icon('pin')}Locating…`;
    try {
      const { lat, lng } = await getGps();
      latEl.value = lat;
      lngEl.value = lng;
      locStatus.innerHTML = '<b>Location pinned</b> — workers will see how many km away the job is.';
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
      if (currentUser) currentUser.terms_accepted_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
      toast('Job posted!');
      location.hash = '#/job/' + id;
    } catch (err2) {
      showFieldErrors(form, err2.fields);
      toast(err2.message, true);
      btn.disabled = false;
    }
  });
}

/** Edit a job the current user posted (open or filled only). */
async function viewJobEdit(id) {
  if (!requireAuth('#/job/' + id + '/edit')) return;
  app.innerHTML = `<div class="view"><div class="page"><div id="edit-body">${loadingHtml('Loading job…')}</div></div></div>`;
  const body = document.getElementById('edit-body');
  let job;
  try {
    job = await api('/api/jobs/' + id);
  } catch (e) {
    body.innerHTML = emptyHtml('info', 'Could not load job', e.message);
    return;
  }
  if (!job.is_poster) {
    const me = currentUser ? `${currentUser.name} (${currentUser.phone || 'no number'})` : 'nobody';
    body.innerHTML = emptyHtml('shield', 'Not authorized',
      `You are signed in as ${me}. Only the account that posted this job can edit it. If you posted it with a different number, sign out and sign in with that one.`);
    return;
  }
  if (!['open', 'filled'].includes(job.status)) {
    body.innerHTML = emptyHtml('info', 'Cannot edit', `This job is ${job.status} and can no longer be edited.`);
    return;
  }
  body.innerHTML = `
    <h1 class="page-title">Edit job</h1>
    <p class="page-sub">Fix a mistake or add details. Workers see the update immediately.</p>
    <div class="card">${jobFormHtml(job, 'edit')}</div>`;
  const form = document.getElementById('job-form');
  document.getElementById('btn-pin-loc').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const latEl = document.getElementById('jf-lat');
    const lngEl = document.getElementById('jf-lng');
    const locStatus = document.getElementById('jf-loc-status');
    btn.disabled = true;
    btn.innerHTML = `${icon('pin')}Locating…`;
    try {
      const { lat, lng } = await getGps();
      latEl.value = lat;
      lngEl.value = lng;
      locStatus.innerHTML = '<b>Location pinned</b> — workers will see how many km away the job is.';
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
    delete data.terms_accepted;
    try {
      await api('/api/jobs/' + id, { method: 'PATCH', body: JSON.stringify(data) });
      toast('Job updated!');
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

  // NRC banner: hired workers must upload their NRC for the poster to verify.
  try {
    const { pending } = await api('/api/nrc/pending').catch(() => ({ pending: [] }));
    if (pending && pending.length) {
      const banner = document.createElement('div');
      banner.className = 'card';
      banner.style.border = '2px solid var(--amber, #d97706)';
      banner.innerHTML = `
        <h3 style="margin-top:0">🪪 NRC needed</h3>
        <p class="small muted" style="margin-top:0">You were hired for ${pending.length === 1 ? 'this job' : 'these jobs'}. Upload a photo of your NRC so the poster can verify you. It is only visible to the poster and is deleted automatically after 10 days.</p>
        ${pending.map(p => `
          <div class="split" style="padding:10px 0;border-top:1px solid var(--line);align-items:center">
            <div><b>${esc(p.title)}</b></div>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="file" id="nrc-file-${p.application_id}" accept="image/*" hidden>
              <button class="btn btn-sm btn-primary" id="nrc-btn-${p.application_id}">${icon('camera')}Upload NRC</button>
            </div>
          </div>`).join('')}`;
      body.parentElement.insertBefore(banner, body);
      pending.forEach(p => {
        const btn = document.getElementById(`nrc-btn-${p.application_id}`);
        const fileInput = document.getElementById(`nrc-file-${p.application_id}`);
        btn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async () => {
          const file = fileInput.files[0];
          if (!file) return;
          btn.disabled = true;
          try {
            const image = await fileToDoc(file);
            await api(`/api/applications/${p.application_id}/nrc`, { method: 'POST', body: JSON.stringify({ image }) });
            toast('NRC uploaded. The poster can now verify you.');
            viewDashboard(); renderChrome();
          } catch (e) { toast(e.message, true); btn.disabled = false; }
          fileInput.value = '';
        });
      });
    }
  } catch (e) { /* banner is optional */ }

  async function showPostings() {
    segP.classList.add('active'); segG.classList.remove('active');
    body.innerHTML = loadingHtml();
    try {
      const lists = await Promise.all(
        ['open', 'filled', 'completed', 'cancelled'].map(s => api('/api/jobs?mine=1&status=' + s + '&page=1').catch(() => ({ jobs: [] })))
      );
      const mine = lists.flatMap(l => l.jobs)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      body.innerHTML = mine.length ? dedupeJobs(mine).map(jobCard).join('')
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
        <a href="#/invite">${icon('sparkles')}<span>Win cash — invite friends</span><span class="chev">${icon('chevR')}</span></a>
        <a href="#/how">${icon('help')}<span>Help &amp; support</span><span class="chev">${icon('chevR')}</span></a>
        <a href="#/terms">${icon('shield')}<span>Terms and conditions</span><span class="chev">${icon('chevR')}</span></a>
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
  // Capture before any await: if the user navigates away mid-request these
  // become detached (harmless) instead of null (which would throw).
  const statsEl = document.getElementById('pf-stats');
  tabO.addEventListener('click', () => { tabO.classList.add('active'); tabR.classList.remove('active'); paneO.hidden = false; paneR.hidden = true; });
  tabR.addEventListener('click', () => { tabR.classList.add('active'); tabO.classList.remove('active'); paneR.hidden = false; paneO.hidden = true; });

  try {
    const [{ user, completed_jobs, reviews }, mine] = await Promise.all([
      api('/api/users/' + currentUser.id),
      api('/api/jobs?mine=1&status=open&page=1').catch(() => ({ total: 0 })),
    ]);
    const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    const positive = reviews.length ? Math.round(avg / 5 * 100) + '%' : '–';
    statsEl.innerHTML = `
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
    statsEl.innerHTML = `<div><strong>–</strong><span>Unavailable</span></div>`;
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
  return fileToSizedImage(file, 256, true);
}

/**
 * Shrink a photo to a JPEG data URL, max dimension maxDim. Square-crop when
 * square is true (avatars), otherwise keep aspect ratio (selfies, documents).
 */
function fileToSizedImage(file, maxDim, square) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Please choose an image file.')); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        let sw, sh, dw, dh;
        if (square) {
          const s = Math.min(img.width, img.height);
          sw = sh = s; dw = dh = maxDim;
          var sx = (img.width - s) / 2, sy = (img.height - s) / 2;
        } else {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          sw = img.width; sh = img.height; dw = Math.round(img.width * scale); dh = Math.round(img.height * scale);
          var sx = 0, sy = 0;
        }
        const canvas = document.createElement('canvas');
        canvas.width = dw; canvas.height = dh;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch (e) { reject(new Error('Could not process that image.')); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

/** Shrink a document/ID photo (keeps aspect ratio so text stays readable). */
function fileToDoc(file) {
  return fileToSizedImage(file, 1024, false);
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
        <p style="text-align:right;margin:-4px 0 12px"><a href="#/forgot" class="small" style="font-weight:600">Forgot password?</a></p>
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

/** Forgot password — step 1: request a reset code (delivered over WhatsApp). */
function viewForgot() {
  if (currentUser) { location.hash = '#/dashboard'; return; }
  app.innerHTML = `
  <div class="view"><div class="page" style="max-width:420px;margin:0 auto">
    <h1 class="page-title">Reset password</h1>
    <p class="page-sub">Enter your phone number. We will send a 6-digit reset code to you on WhatsApp.</p>
    <div class="card">
      <form id="forgot-form" novalidate>
        <div class="field">
          <label for="fp-phone">Phone number</label>
          <input name="phone" id="fp-phone" type="tel" inputmode="tel" placeholder="0977 123 456" autocomplete="tel">
        </div>
        <button class="btn btn-primary full" type="submit">Send reset code</button>
      </form>
      <div id="forgot-done" style="display:none"></div>
    </div>
    <p style="text-align:center"><a href="#/login" style="font-weight:600">Back to sign in</a></p>
  </div></div>`;
  const form = document.getElementById('forgot-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const { sms_sent, whatsapp, account_found } = await api('/api/auth/forgot', {
        method: 'POST',
        body: JSON.stringify({ phone: form.phone.value.trim() }),
      });
      const phone = form.phone.value.trim();
      form.style.display = 'none';
      const done = document.getElementById('forgot-done');
      done.style.display = 'block';
      if (account_found === false) {
        done.innerHTML = `
        <p><b>No account found.</b></p>
        <p class="small muted">We could not find a PieceWork account with <b>${esc(phone)}</b>. Check the number and try again, or <a href="#/register" style="font-weight:700">sign up for a new account</a>.</p>`;
        return;
      }
      done.innerHTML = sms_sent ? `
        <p><b>Code sent by SMS.</b></p>
        <p class="small muted">Check your texts for the 6-digit code. It expires in 30 minutes.</p>
        <p style="text-align:center;margin:12px 0 0"><a href="#/reset" class="btn btn-primary full">Enter my code</a></p>
        <p class="small muted" style="text-align:center">No text arrived? <a href="${waLink(whatsapp, 'Hello PieceWork, I need a password reset code for ' + phone)}" target="_blank" rel="noopener" style="font-weight:700">Message us on WhatsApp</a></p>`
      : `
        <p><b>Request received.</b></p>
        <p class="small muted">Message us on WhatsApp from <b>${esc(phone)}</b> and we will reply with your 6-digit reset code. It expires in 30 minutes. This WhatsApp line handles password resets only.</p>
        <a class="btn btn-primary full" target="_blank" rel="noopener"
           href="${waLink(whatsapp, 'Hello PieceWork, I need a password reset code for ' + phone)}">${icon('message')}Message us on WhatsApp</a>
        <p style="text-align:center;margin:12px 0 0"><a href="#/reset" style="font-weight:700">I have my code — set a new password</a></p>`;
    } catch (err2) { toast(err2.message, true); btn.disabled = false; }
  });
}

/** Forgot password — step 2: redeem the code with a new password. */
function viewReset() {
  if (currentUser) { location.hash = '#/dashboard'; return; }
  app.innerHTML = `
  <div class="view"><div class="page" style="max-width:420px;margin:0 auto">
    <h1 class="page-title">New password</h1>
    <p class="page-sub">Enter the 6-digit code we sent you on WhatsApp, then choose a new password.</p>
    <div class="card">
      <form id="reset-form" novalidate>
        <div class="field">
          <label for="rp-phone">Phone number</label>
          <input name="phone" id="rp-phone" type="tel" inputmode="tel" placeholder="0977 123 456" autocomplete="tel">
        </div>
        <div class="field">
          <label for="rp-code">6-digit code</label>
          <input name="code" id="rp-code" inputmode="numeric" maxlength="6" placeholder="123456" autocomplete="one-time-code">
        </div>
        <div class="field">
          <label for="rp-pass">New password</label>
          <input name="new_password" id="rp-pass" type="password" autocomplete="new-password" placeholder="At least 8 characters">
        </div>
        <button class="btn btn-primary full" type="submit">Set new password</button>
      </form>
    </div>
    <p style="text-align:center"><a href="#/login" style="font-weight:600">Back to sign in</a></p>
  </div></div>`;
  const form = document.getElementById('reset-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const { user } = await api('/api/auth/reset', {
        method: 'POST',
        body: JSON.stringify({
          phone: form.phone.value.trim(),
          code: form.code.value.trim(),
          new_password: form.new_password.value,
        }),
      });
      currentUser = user; renderChrome();
      toast('Password updated. You are signed in.');
      location.hash = '#/dashboard';
    } catch (err2) { toast(err2.message, true); btn.disabled = false; }
  });
}

/** Register. */
function viewRegister() {
  if (currentUser) { location.hash = '#/dashboard'; return; }
  const invRef = getInviteRef();
  app.innerHTML = `
  <div class="view"><div class="page" style="max-width:420px;margin:0 auto">
    <h1 class="page-title">Join PieceWork</h1>
    <p class="page-sub">Free to join. Find work or find workers in minutes.</p>
    ${invRef ? `<div class="card" style="border:2px solid var(--green);background:#f0faf4">
      <b>🎉 You were invited by a friend!</b>
      <p class="small muted" style="margin:6px 0 0">Create your account and they earn entries into the giveaway draw.</p>
    </div>` : ''}
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
        <div class="field">
          <label>Profile photo <span class="hint-inline">(required)</span></label>
          <div style="display:flex;align-items:center;gap:12px">
            <div id="rg-av-preview" style="width:64px;height:64px;border-radius:50%;background:var(--line);display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none"><span style="font-size:24px">📷</span></div>
            <div>
              <input type="file" id="rg-av-file" accept="image/*" hidden>
              <button type="button" class="btn btn-sm btn-outline" id="rg-av-btn">${icon('camera')}Choose photo</button>
              <div class="hint" style="margin-top:6px">How posters recognise you.</div>
            </div>
          </div>
        </div>
        <div class="field">
          <label>Verification selfie <span class="hint-inline">(required)</span></label>
          <div style="display:flex;align-items:center;gap:12px">
            <div id="rg-sf-preview" style="width:64px;height:64px;border-radius:12px;background:var(--line);display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none"><span style="font-size:24px">🤳</span></div>
            <div>
              <input type="file" id="rg-sf-file" accept="image/*" hidden>
              <button type="button" class="btn btn-sm btn-outline" id="rg-sf-btn">${icon('camera')}Take selfie</button>
              <div class="hint" style="margin-top:6px">A clear photo of your face. Our team reviews it to keep the community safe.</div>
            </div>
          </div>
        </div>
        <button class="btn btn-primary full" type="submit">Create account</button>
      </form>
    </div>
    <p style="text-align:center">Already registered? <a href="#/login" style="font-weight:700">Sign in</a></p>
  </div></div>`;
  const form = document.getElementById('reg-form');
  let regAvatar = null, regSelfie = null;
  const wirePhotoPicker = (btnId, fileId, previewId, setter, maxDim, square) => {
    const btn = document.getElementById(btnId), fileInput = document.getElementById(fileId);
    btn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        const dataUrl = await fileToSizedImage(file, maxDim, square);
        setter(dataUrl);
        document.getElementById(previewId).innerHTML = `<img src="${dataUrl}" alt="Preview" style="width:100%;height:100%;object-fit:cover">`;
      } catch (e) { toast(e.message, true); }
      fileInput.value = '';
    });
  };
  wirePhotoPicker('rg-av-btn', 'rg-av-file', 'rg-av-preview', (v) => { regAvatar = v; }, 256, true);
  wirePhotoPicker('rg-sf-btn', 'rg-sf-file', 'rg-sf-preview', (v) => { regSelfie = v; }, 512, false);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      const ref = getInviteRef();
      if (ref) payload.ref = ref;
      if (!regAvatar) throw { message: 'Please add a profile photo.', fields: { avatar: 'A profile photo is required.' } };
      if (!regSelfie) throw { message: 'Please take a verification selfie.', fields: { selfie: 'A verification selfie is required.' } };
      payload.avatar = regAvatar;
      payload.selfie = regSelfie;
      const { user } = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
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
      <p class="small muted">Isaac “Zac” Muzata · CEO, 2911 IT Services<br><a href="https://2911itservices.com" target="_blank" rel="noopener">2911itservices.com</a><br>Contact: <a href="mailto:info@pieceworkzambia.com">info@pieceworkzambia.com</a></p>
      <a class="btn btn-primary" href="#/register">Join free today</a>
    </div>
  </div></div>`;
}

/** Terms and Conditions — liability waiver, poster responsibilities. */
function viewTerms() {
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Terms and Conditions</h1>
    <p class="page-sub">Last updated: 5 October 2026</p>
    <div class="card">
      <h3 style="margin-top:0">1. What PieceWork is</h3>
      <p>PieceWork Zambia ("PieceWork", "we") is a marketplace that connects people who need piece work done ("posters") with people looking for piece work ("workers"). PieceWork is a product of 2911 IT Services. We provide the platform only. We are <b>not</b> an employer, employment agent, contractor or subcontractor of any worker, and we are <b>not</b> a party to any agreement between a poster and a worker.</p>
    </div>
    <div class="card">
      <h3 style="margin-top:0">2. Your account</h3>
      <p style="margin-bottom:0">One person, one account. Give true information about yourself. Keep your password private. False information or multiple accounts can lead to suspension and disqualification from giveaways.</p>
    </div>
    <div class="card">
      <h3 style="margin-top:0">3. For posters — your responsibilities</h3>
      <p>When you hire through PieceWork, <b>you</b> are responsible for:</p>
      <ul>
        <li>Checking the worker's profile, photo, ratings and reviews before hiring.</li>
        <li>Asking a hired worker to upload their NRC through the app so you can verify their identity.</li>
        <li>Agreeing the work, the pay amount and how payment will happen <b>before</b> work starts.</li>
        <li>Taking sensible safety precautions: meet in safe places, do not share sensitive personal or banking details, and secure your valuables and property when workers are present.</li>
        <li>Treating workers fairly and paying what was agreed.</li>
      </ul>
      <p style="margin-bottom:0">The verification tools in the app (profile photos, selfies, NRC upload, ratings) are there to help you make your own judgement. They are not a guarantee of anyone's identity or behaviour.</p>
    </div>
    <div class="card">
      <h3 style="margin-top:0">4. Limitation of liability</h3>
      <p>To the fullest extent allowed by law:</p>
      <ul>
        <li>PieceWork and 2911 IT Services are <b>not liable for any loss, damage, theft, injury or dispute</b> arising from work arranged through the app. Every work agreement is strictly between the poster and the worker.</li>
        <li>We do not guarantee the identity, qualifications, conduct or reliability of any user.</li>
        <li>The app is provided "as is". We are not liable for downtime, data loss or errors.</li>
      </ul>
    </div>
    <div class="card">
      <h3 style="margin-top:0">5. For workers — your responsibilities</h3>
      <p style="margin-bottom:0">Give true information about your skills, do accepted work to a reasonable standard, behave respectfully, and handle your own tax affairs on what you earn.</p>
    </div>
    <div class="card">
      <h3 style="margin-top:0">6. Giveaways</h3>
      <p style="margin-bottom:0">Giveaway rounds run at our discretion. One account per person — duplicate accounts are disqualified and forfeit entries. We may cancel or change a round if fraud is detected.</p>
    </div>
    <div class="card">
      <h3 style="margin-top:0">7. Changes and contact</h3>
      <p>We may update these terms; continued use of the app means you accept the current version.</p>
      <p style="margin-bottom:0">Questions: <a href="mailto:info@pieceworkzambia.com">info@pieceworkzambia.com</a></p>
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

/** Invite friends — referral link + giveaway. */
async function viewInvite() {
  app.innerHTML = `
  <div class="view"><div class="page" style="max-width:520px;margin:0 auto">
    <h1 class="page-title">Win cash prizes 🎉</h1>
    <p class="page-sub">Invite friends to PieceWork Zambia. Every friend who joins with your link earns you entries into the live giveaway draw.</p>
    <div id="invite-body">${loadingHtml('Loading…')}</div>
  </div></div>`;
  const body = document.getElementById('invite-body');
  const fmtDate = (s) => {
    try { return new Date(String(s).replace(' ', 'T')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch (e) { return s; }
  };
  try {
    const { giveaway } = await api('/api/giveaways/current');
    const gwCard = giveaway ? `
      <div class="card" style="background:linear-gradient(135deg,#062b1c,#0e6b3a);color:#fff;border:0;text-align:center;padding:26px 20px">
        <div class="small" style="color:#bfe6cf;letter-spacing:2px;font-weight:700">${esc(giveaway.title).toUpperCase()}</div>
        <div style="font-size:52px;font-weight:800;margin:8px 0">K${Number(giveaway.prize_kwacha).toLocaleString()}</div>
        <div class="small" style="color:#e6f4ec">Drawn live on Facebook • ${giveaway.entrants} ${giveaway.entrants === 1 ? 'person' : 'people'} in the draw so far</div>
        <div class="small" style="color:#bfe6cf;margin-top:4px">Entries close ${fmtDate(giveaway.ends_at)}</div>
      </div>` : `
      <div class="card" style="text-align:center">
        <b>No active giveaway right now</b>
        <p class="small muted">A new round starts soon. Grab your invite link below so you are ready.</p>
      </div>`;
    const steps = `
      <div class="card"><h3 style="margin-top:0">How it works</h3>
        <div class="split"><span><b>1.</b> Share your personal invite link</span></div>
        <div class="split"><span><b>2.</b> Friends create their free account</span></div>
        <div class="split"><span><b>3.</b> You get <b>1 raffle entry per friend</b> — more friends, better odds</span></div>
        <div class="split" style="border:0"><span><b>4.</b> Winner picked <b>live on Facebook</b> and paid by mobile money</span></div>
      </div>`;
    if (!currentUser) {
      body.innerHTML = gwCard + steps + `
        <a class="btn btn-primary full" href="#/register">Join free to get your invite link</a>
        <p class="small muted" style="text-align:center;margin-top:10px">Already have an account? <a href="#/login" style="font-weight:700">Sign in</a></p>`;
      return;
    }
    const me = await api('/api/referral/me');
    const prize = (me.giveaway || giveaway || {}).prize_kwacha || 1500;
    const text = shareText(me.link, prize);
    body.innerHTML = gwCard + steps + `
      <div class="card">
        <h3 style="margin-top:0">Your invite link</h3>
        <div style="display:flex;gap:8px">
          <input id="inv-link" readonly value="${esc(me.link)}" style="flex:1" onclick="this.select()">
          <button class="btn btn-primary btn-sm" id="inv-copy">Copy</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <a class="btn btn-outline full" style="flex:1" target="_blank" rel="noopener"
             href="https://wa.me/?text=${encodeURIComponent(text)}">WhatsApp</a>
          <a class="btn btn-outline full" style="flex:1" target="_blank" rel="noopener"
             href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(me.link)}">Facebook</a>
        </div>
      </div>
      <div class="stat-grid">
        <div class="card stat-card"><div class="big">${me.referrals}</div><div class="small muted">Friends joined</div></div>
        <div class="card stat-card"><div class="big">${me.referrals}</div><div class="small muted">Raffle entries</div></div>
      </div>
      <p class="small muted" style="line-height:1.6">Fair play rules: one account per phone, browser and person. Accounts from the same IP or device as another account are disqualified from the draw, and their invites earn no entries. Winners are contacted on their registered number.</p>`;
    const copyBtn = document.getElementById('inv-copy');
    copyBtn.addEventListener('click', async () => {
      const link = document.getElementById('inv-link').value;
      try { await navigator.clipboard.writeText(link); toast('Invite link copied!'); }
      catch (e) {
        const i = document.getElementById('inv-link'); i.select();
        document.execCommand('copy'); toast('Invite link copied!');
      }
    });
  } catch (e) {
    body.innerHTML = emptyHtml('info', 'Could not load', e.message);
  }
}

/** Admin — self-serve stats, Zac only. */
async function viewAdmin() {
  if (!requireAuth('#/admin')) return;
  const mod = currentUser.is_admin || currentUser.is_support;
  if (!mod) {
    app.innerHTML = `<div class="view"><div class="page">${emptyHtml('shield', 'Not authorized', 'This page is for the PieceWork team only.')}</div></div>`;
    return;
  }
  if (!currentUser.is_admin) {
    // Support staff: verifications + password resets only, no stats.
    app.innerHTML = `
    <div class="view"><div class="page">
      <h1 class="page-title">Support</h1>
      <p class="page-sub">Selfie reviews and password resets.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn btn-outline" href="#/admin/verifications">🪪 Selfie review</a>
        <a class="btn btn-outline" href="#/admin/resets">🔑 Password resets</a>
      </div>
    </div></div>`;
    return;
  }
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Admin</h1>
    <p class="page-sub">PieceWork Zambia at a glance.</p>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <a class="btn btn-sm btn-outline" href="#/admin/referrals">📊 Referral monitor</a>
      <a class="btn btn-sm btn-outline" href="#/admin/jobs">📋 All jobs</a>
      <a class="btn btn-sm btn-outline" href="#/admin/verifications">🪪 Selfie review</a>
      <a class="btn btn-sm btn-outline" href="#/admin/resets">🔑 Password resets</a>
    </div>
    <div id="admin-body">${loadingHtml('Loading stats…')}</div>
  </div></div>`;
  const body = document.getElementById('admin-body');
  try {
    const s = await api('/api/admin/stats');
    const stat = (label, val) => `<div class="card stat-card"><div class="big">${val}</div><div class="small muted">${label}</div></div>`;
    const openJobs = s.jobs_by_status.open || 0;
    body.innerHTML = `
      <div class="stat-grid">
        ${stat('Total signups', s.users)}
        ${stat('Applications', s.applications)}
        ${stat('Open jobs', openJobs)}
        ${stat('Conversations', s.conversations)}
        ${stat('Messages sent', s.messages)}
        ${stat('Looking for Work', s.open_to_work)}
      </div>
      <div class="card">
        <h3 style="margin-top:0">Signups, last 14 days</h3>
        ${s.signups_by_day.length ? s.signups_by_day.map(r => `
          <div class="split" style="padding:7px 0;border-bottom:1px solid var(--line)">
            <span>${esc(r.day)}</span><b>${r.count}</b>
          </div>`).join('') : '<p class="small muted">No signups in the last 14 days.</p>'}
      </div>
      <div class="card">
        <h3 style="margin-top:0">Applications by status</h3>
        ${Object.entries(s.applications_by_status).map(([k, v]) => `
          <div class="split" style="padding:7px 0;border-bottom:1px solid var(--line)">
            <span style="text-transform:capitalize">${esc(k)}</span><b>${v}</b>
          </div>`).join('') || '<p class="small muted">None yet.</p>'}
      </div>
      <div class="card">
        <h3 style="margin-top:0">Giveaways</h3>
        <div id="gw-admin-list">${loadingHtml('Loading rounds…')}</div>
        <h4 style="margin:18px 0 8px">Start a new round</h4>
        <form id="gw-form">
          <div class="field"><label for="gw-title">Title</label><input name="title" id="gw-title" value="Bi-weekly Giveaway"></div>
          <div class="field"><label for="gw-prize">Prize (Kwacha)</label><input name="prize_kwacha" id="gw-prize" type="number" value="1500" min="1"></div>
          <div class="field"><label for="gw-start">Starts</label><input name="starts_at" id="gw-start" type="datetime-local"></div>
          <div class="field"><label for="gw-end">Ends</label><input name="ends_at" id="gw-end" type="datetime-local"></div>
          <button class="btn btn-primary" type="submit">Create round</button>
        </form>
        <p class="small muted" style="margin-top:10px">One active round at a time. Open the live draw page when you go live on Facebook and screenshare it.</p>
      </div>`;
    loadGiveawayAdmin();
  } catch (e) {
    body.innerHTML = emptyHtml('info', 'Could not load stats', e.message);
  }
}

async function loadGiveawayAdmin() {
  const list = document.getElementById('gw-admin-list');
  if (!list) return;
  try {
    const { giveaways } = await api('/api/admin/giveaways');
    list.innerHTML = giveaways.length ? giveaways.map((g) => `
      <div class="split" style="padding:10px 0;border-bottom:1px solid var(--line);align-items:flex-start">
        <div>
          <b>${esc(g.title)}</b> — K${Number(g.prize_kwacha).toLocaleString()}
          <span class="small muted">(${esc(g.status)})</span><br>
          <span class="small muted">${g.entrants} entrants • ${g.total_entries} entries
          ${g.disqualified_referrers ? ` • <b style="color:#b91c1c">${g.disqualified_referrers} disqualified</b>` : ''}</span>
          ${g.winner ? `<br><span class="small">🏆 Winner: <b>${esc(g.winner.name)}</b> (${esc(g.winner.phone)})</span>` : ''}
        </div>
        ${g.status === 'active' ? `<a class="btn btn-sm btn-primary" href="#/admin/draw/${g.id}">Live draw</a>` : ''}
      </div>`).join('')
      : '<p class="small muted">No rounds yet. Create the first one below.</p>';
  } catch (e) { list.innerHTML = `<p class="small" style="color:#b91c1c">${esc(e.message)}</p>`; }

  // sensible defaults: now → +14 days, formatted for datetime-local
  const toLocal = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const startEl = document.getElementById('gw-start');
  const endEl = document.getElementById('gw-end');
  if (startEl && !startEl.value) startEl.value = toLocal(new Date());
  if (endEl && !endEl.value) endEl.value = toLocal(new Date(Date.now() + 14 * 864e5));

  const form = document.getElementById('gw-form');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      // store as UTC-ish "YYYY-MM-DD HH:MM:SS" for SQLite comparison
      for (const k of ['starts_at', 'ends_at']) payload[k] = String(payload[k]).replace('T', ' ') + ':00';
      await api('/api/admin/giveaways', { method: 'POST', body: JSON.stringify(payload) });
      toast('Giveaway round created!');
      loadGiveawayAdmin();
    } catch (err2) { toast(err2.message, true); }
    btn.disabled = false;
  });
}

/** Admin selfie review — approve or reject new signups' verification selfies. */
async function viewVerifications() {
  if (!requireAuth('#/admin/verifications')) return;
  if (!(currentUser.is_admin || currentUser.is_support)) {
    app.innerHTML = `<div class="view"><div class="page">${emptyHtml('shield', 'Not authorized', 'This page is for the PieceWork admin only.')}</div></div>`;
    return;
  }
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Selfie review</h1>
    <p class="page-sub"><a href="#/admin">← Back to admin</a></p>
    <div id="verif-body">${loadingHtml('Loading pending selfies…')}</div>
  </div></div>`;
  const body = document.getElementById('verif-body');
  async function load() {
    body.innerHTML = loadingHtml('Loading pending selfies…');
    try {
      const { pending } = await api('/api/admin/verifications');
      if (!pending.length) {
        body.innerHTML = emptyHtml('check', 'All caught up', 'No selfies waiting for review.');
        return;
      }
      body.innerHTML = pending.map(u => `
        <div class="card" data-verif="${u.id}">
          <div style="display:flex;gap:12px;align-items:center;margin-bottom:10px">
            ${u.selfie ? `<img src="${u.selfie}" alt="Selfie" style="width:96px;height:96px;object-fit:cover;border-radius:12px">` : ''}
            <div style="flex:1">
              <b>${esc(u.name)}</b><br>
              <span class="small muted">${esc(u.phone)} · ${esc(u.city)} · joined ${esc(fmtDate(u.created_at))}</span>
            </div>
          </div>
          <div class="btn-row">
            <button class="btn btn-sm btn-primary" data-verif-approve="${u.id}">${icon('check')}Approve</button>
            <button class="btn btn-sm btn-danger" data-verif-reject="${u.id}">Reject</button>
          </div>
        </div>`).join('');
      body.querySelectorAll('[data-verif-approve]').forEach(b => b.addEventListener('click', () => decide(b.dataset.verifApprove, 'approved')));
      body.querySelectorAll('[data-verif-reject]').forEach(b => b.addEventListener('click', () => decide(b.dataset.verifReject, 'rejected')));
    } catch (e) { body.innerHTML = emptyHtml('info', 'Could not load', e.message); }
  }
  async function decide(userId, status) {
    try {
      await api(`/api/admin/verifications/${userId}`, { method: 'POST', body: JSON.stringify({ status }) });
      toast(status === 'approved' ? 'Selfie approved.' : 'Selfie rejected.');
      load();
    } catch (e) { toast(e.message, true); }
  }
  load();
}

/** Admin password resets — issue codes and send them over WhatsApp. */
async function viewAdminResets() {
  if (!requireAuth('#/admin/resets')) return;
  if (!(currentUser.is_admin || currentUser.is_support)) {
    app.innerHTML = `<div class="view"><div class="page">${emptyHtml('shield', 'Not authorized', 'This page is for the PieceWork admin only.')}</div></div>`;
    return;
  }
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Password resets</h1>
    <p class="page-sub"><a href="#/admin">← Back to admin</a></p>
    <p class="small muted">When someone asks for a reset on WhatsApp, tap <b>Send code</b> — a fresh 6-digit code is generated and WhatsApp opens with it prefilled to their number. The code expires in 30 minutes and works once.</p>
    <div id="resets-body">${loadingHtml('Loading requests…')}</div>
  </div></div>`;
  const body = document.getElementById('resets-body');
  const fmtDate = (s) => {
    try { return new Date(String(s).replace(' ', 'T')).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return s; }
  };
  const statusBadge = (r) => r.status === 'pending'
    ? '<span class="badge badge-status-open">Pending</span>'
    : r.status === 'expired'
      ? '<span class="badge badge-status-cancelled">Expired</span>'
      : '<span class="badge badge-status-completed">Closed</span>';
  async function load() {
    body.innerHTML = loadingHtml('Loading requests…');
    try {
      const { resets } = await api('/api/admin/resets');
      if (!resets.length) {
        body.innerHTML = emptyHtml('check', 'No requests', 'Nobody has asked for a password reset yet.');
        return;
      }
      body.innerHTML = resets.map(r => `
        <div class="card">
          <div class="split" style="align-items:center">
            <div><b>${esc(r.user_name)}</b><br>
              <span class="small muted">${esc(r.user_phone)} · ${fmtDate(r.created_at)}${r.attempts ? ` · ${r.attempts} wrong ${r.attempts === 1 ? 'try' : 'tries'}` : ''}</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              ${statusBadge(r)}
              ${r.status === 'pending' ? `<button class="btn btn-sm btn-primary" data-issue="${r.id}" data-phone="${esc(r.user_phone)}" data-name="${esc(r.user_name)}">${icon('message')}Send code</button>` : ''}
            </div>
          </div>
        </div>`).join('');
      body.querySelectorAll('[data-issue]').forEach(b => b.addEventListener('click', () => issue(b)));
    } catch (e) { body.innerHTML = emptyHtml('info', 'Could not load', e.message); }
  }
  async function issue(btn) {
    btn.disabled = true;
    try {
      const { code, user_name, user_phone } = await api(`/api/admin/resets/${btn.dataset.issue}/issue`, { method: 'POST' });
      toast(`Code issued for ${user_name}.`);
      window.open(waLink(user_phone, `Hello ${user_name}, your PieceWork password reset code is ${code}. Enter it in the app within 30 minutes. Do not share it with anyone.`), '_blank', 'noopener');
      load();
    } catch (e) { toast(e.message, true); btn.disabled = false; }
  }
  load();
}

/** Admin: every job posted, regardless of city — admin only. */
async function viewAdminJobs() {
  if (!requireAuth('#/admin/jobs')) return;
  if (!currentUser.is_admin) {
    app.innerHTML = `<div class="view"><div class="page">${emptyHtml('shield', 'Not authorized', 'This page is for the PieceWork admin only.')}</div></div>`;
    return;
  }
  const statuses = ['all', 'open', 'filled', 'completed', 'cancelled'];
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">All jobs</h1>
    <p class="page-sub"><a href="#/admin">← Back to admin</a></p>
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <select id="aj-status" class="input" style="flex:1;min-width:130px">
          ${statuses.map(s => `<option value="${s}">${s === 'all' ? 'All statuses' : s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
        </select>
        <select id="aj-city" class="input" style="flex:1;min-width:130px">
          <option value="">All cities</option>
          ${CITIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
        <input id="aj-q" class="input" style="flex:2;min-width:160px" placeholder="Search title or description…">
        <button class="btn btn-primary" id="aj-go">${icon('search')}Filter</button>
      </div>
    </div>
    <div id="aj-body">${loadingHtml('Loading jobs…')}</div>
    <div id="aj-pages" style="display:flex;gap:8px;justify-content:center;margin-top:12px"></div>
  </div></div>`;
  const body = document.getElementById('aj-body');
  const pages = document.getElementById('aj-pages');
  let page = 1;
  async function load() {
    body.innerHTML = loadingHtml('Loading jobs…');
    pages.innerHTML = '';
    try {
      const qs = new URLSearchParams({
        status: document.getElementById('aj-status').value,
        city: document.getElementById('aj-city').value,
        q: document.getElementById('aj-q').value.trim(),
        page: String(page),
      });
      const { jobs, total, pages: totalPages } = await api('/api/admin/jobs?' + qs.toString());
      if (!jobs.length) {
        body.innerHTML = emptyHtml('clipboard', 'No jobs', 'Nothing matches these filters.');
        return;
      }
      body.innerHTML = jobs.map(j => `
        <div class="card">
          <div class="split" style="align-items:center">
            <div><b>${esc(j.title)}</b><br>
              <span class="small muted">${esc(j.poster_name)} · ${esc(j.poster_phone)} · ${esc(j.city)}${j.area ? ' · ' + esc(j.area) : ''} · ${fmtDate(j.created_at)}</span><br>
              <span class="small">${kwacha(j.pay_amount)} ${esc(PAY_LABEL[j.pay_type] || '')} · ${esc(j.category)} · ${j.workers_needed} needed</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <span class="badge badge-status-${j.status}">${esc(j.status)}</span>
              <button class="btn btn-sm btn-outline" data-share="${j.id}" data-title="${esc(j.title)}" aria-label="Share this job">${icon('share')}Share</button>
              <a class="btn btn-sm btn-outline" href="#/job/${j.id}">View</a>
            </div>
          </div>
        </div>`).join('');
      if (totalPages > 1) {
        pages.innerHTML = `
          <button class="btn btn-sm btn-outline" id="aj-prev" ${page <= 1 ? 'disabled' : ''}>← Prev</button>
          <span class="small muted" style="align-self:center">Page ${page} of ${totalPages} · ${total} jobs</span>
          <button class="btn btn-sm btn-outline" id="aj-next" ${page >= totalPages ? 'disabled' : ''}>Next →</button>`;
        const prev = document.getElementById('aj-prev'), next = document.getElementById('aj-next');
        if (prev) prev.onclick = () => { page--; load(); };
        if (next) next.onclick = () => { page++; load(); };
      } else if (total) {
        pages.innerHTML = `<span class="small muted">${total} job${total === 1 ? '' : 's'}</span>`;
      }
    } catch (e) { body.innerHTML = emptyHtml('info', 'Could not load', e.message); }
  }
  document.getElementById('aj-go').onclick = () => { page = 1; load(); };
  document.getElementById('aj-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { page = 1; load(); } });
  load();
}

/** Admin referral monitor — signups, leaderboard, recent joins, cheats. */async function viewReferralDashboard() {
  if (!requireAuth('#/admin/referrals')) return;
  if (!currentUser.is_admin) {
    app.innerHTML = `<div class="view"><div class="page">${emptyHtml('shield', 'Not authorized', 'This page is for the PieceWork admin only.')}</div></div>`;
    return;
  }
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Referral monitor</h1>
    <p class="page-sub"><a href="#/admin">← Back to admin</a></p>
    <div id="refmon-body">${loadingHtml('Loading…')}</div>
  </div></div>`;
  const body = document.getElementById('refmon-body');
  const fmtDate = (s) => {
    try { return new Date(String(s).replace(' ', 'T')).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return s; }
  };
  try {
    const s = await api('/api/admin/referrals/summary');
    const stat = (label, val) => `<div class="card stat-card"><div class="big">${val}</div><div class="small muted">${label}</div></div>`;
    body.innerHTML = `
      <div class="stat-grid">
        ${stat('Total signups', s.total_signups)}
        ${stat('Today', s.signups_today)}
        ${stat('This week', s.signups_this_week)}
        ${stat('Via invite links', s.referred_signups)}
      </div>
      <div class="card">
        <h3 style="margin-top:0">🏆 Referral leaderboard</h3>
        ${s.leaderboard.length ? s.leaderboard.map((r, i) => `
          <div class="split" style="padding:8px 0;border-bottom:1px solid var(--line)">
            <span>${i < 3 ? ['🥇', '🥈', '🥉'][i] + ' ' : ''}<b>${esc(r.name)}</b> <span class="small muted">${esc(r.city)}</span></span>
            <b>${r.referrals} referral${r.referrals === 1 ? '' : 's'}</b>
          </div>`).join('') : '<p class="small muted">Nobody has referred anyone yet.</p>'}
      </div>
      <div class="card">
        <h3 style="margin-top:0">Latest signups</h3>
        ${s.recent.length ? s.recent.map((r) => `
          <div class="split" style="padding:8px 0;border-bottom:1px solid var(--line);align-items:flex-start">
            <div><b>${esc(r.name)}</b> <span class="small muted">${esc(r.city)}</span><br>
              <span class="small muted">${fmtDate(r.created_at)}${r.referrer !== '—' ? ` • invited by <b>${esc(r.referrer)}</b>` : ''}</span>
              ${r.disqualified ? `<br><span class="small" style="color:#b91c1c;font-weight:700">⛔ disqualified (duplicate IP/device)</span>` : ''}
            </div>
            <span class="small muted">${esc(r.phone)}</span>
          </div>`).join('') : '<p class="small muted">No signups yet.</p>'}
      </div>
      <div class="card">
        <h3 style="margin-top:0">⛔ Disqualified (${s.disqualified.length})</h3>
        <p class="small muted" style="margin-top:-6px">Same IP or device as another account — out of the draw.</p>
        ${s.disqualified.length ? s.disqualified.map((r) => `
          <div class="split" style="padding:8px 0;border-bottom:1px solid var(--line)">
            <span><b>${esc(r.name)}</b> <span class="small muted">${esc(r.city)} • ${esc(r.signup_ip)}</span></span>
            <span class="small muted">${fmtDate(r.created_at)}</span>
          </div>`).join('') : '<p class="small muted">None. Clean so far.</p>'}
      </div>`;
  } catch (e) {
    body.innerHTML = emptyHtml('info', 'Could not load', e.message);
  }
}

/** Live draw — admin only, built for screensharing on Facebook Live. */
async function viewGiveawayDraw(id) {
  if (!requireAuth('#/admin/draw/' + id)) return;
  if (!currentUser.is_admin) {
    app.innerHTML = `<div class="view"><div class="page">${emptyHtml('shield', 'Not authorized', 'This page is for the PieceWork admin only.')}</div></div>`;
    return;
  }
  app.innerHTML = `
  <div id="draw-overlay" style="position:fixed;inset:0;z-index:200;background:radial-gradient(ellipse at center,#0e6b3a 0%,#062b1c 70%);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;overflow:hidden">
    <div id="draw-confetti" style="position:absolute;inset:0;pointer-events:none;overflow:hidden"></div>
    <div style="position:relative;z-index:2;max-width:640px;width:100%">
      <div class="small" style="letter-spacing:3px;color:#bfe6cf;font-weight:700">PIECEWORK ZAMBIA • LIVE GIVEAWAY DRAW</div>
      <h1 id="draw-title" style="font-size:34px;margin:10px 0 4px">Loading…</h1>
      <div id="draw-prize" style="font-size:84px;font-weight:800;color:#ffd34d;text-shadow:0 4px 24px rgba(0,0,0,.4)"></div>
      <div id="draw-meta" class="small" style="color:#e6f4ec;margin-top:6px"></div>
      <div id="draw-name" style="font-size:56px;font-weight:800;margin:34px 0;min-height:80px"></div>
      <div id="draw-winner-contact" style="margin-bottom:20px"></div>
      <button id="draw-btn" class="btn" style="background:#ffd34d;color:#062b1c;font-size:22px;font-weight:800;padding:16px 48px;border-radius:999px;border:0;cursor:pointer">🎲 DRAW THE WINNER</button>
      <div style="margin-top:18px"><a href="#/admin" style="color:#bfe6cf" class="small">← Back to admin</a></div>
    </div>
  </div>`;
  const $ = (sid) => document.getElementById(sid);
  const btn = $('draw-btn');
  let data;
  try {
    data = await api('/api/admin/giveaways/' + id + '/entries');
  } catch (e) {
    $('draw-title').textContent = 'Could not load giveaway';
    $('draw-name').textContent = e.message;
    btn.style.display = 'none';
    return;
  }
  const g = data.giveaway;
  $('draw-title').textContent = g.title;
  $('draw-prize').textContent = 'K' + Number(g.prize_kwacha).toLocaleString();
  const totalEntries = data.entries.reduce((s, e) => s + e.entries, 0);
  $('draw-meta').textContent = `${data.entries.length} ${data.entries.length === 1 ? 'person' : 'people'} in the draw • ${totalEntries} total ${totalEntries === 1 ? 'entry' : 'entries'}`;
  if (data.disqualified.disqualified_referrers) {
    $('draw-meta').textContent += ` • ${data.disqualified.disqualified_referrers} disqualified (duplicate device/IP)`;
  }
  if (g.status === 'drawn') {
    btn.style.display = 'none';
    revealWinner({ name: '(already drawn — see admin panel)', phone: '', city: '' }, true);
    // fetch the recorded winner for display
    try {
      const r = await api('/api/admin/giveaways/' + id + '/draw', { method: 'POST', body: '{}' });
      if (r.winner) revealWinner(r.winner, true);
    } catch (e) {}
    return;
  }
  if (!data.entries.length) {
    $('draw-name').textContent = 'No eligible entries yet.';
    btn.style.display = 'none';
    return;
  }
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Drawing…';
    let result;
    try {
      result = await api('/api/admin/giveaways/' + id + '/draw', { method: 'POST', body: '{}' });
    } catch (e) {
      toast(e.message, true);
      btn.disabled = false;
      btn.textContent = '🎲 DRAW THE WINNER';
      return;
    }
    // suspense shuffle, then land on the server-picked winner
    const names = data.entries.map((e) => e.name);
    const nameEl = $('draw-name');
    let delay = 60;
    await new Promise((resolve) => {
      const tick = () => {
        nameEl.textContent = names[Math.floor(Math.random() * names.length)];
        delay *= 1.18;
        if (delay > 650) return resolve();
        setTimeout(tick, delay);
      };
      tick();
    });
    revealWinner(result.winner, false);
    btn.style.display = 'none';
  });

  function revealWinner(winner, quiet) {
    $('draw-name').textContent = '🏆 ' + winner.name + ' 🏆';
    $('draw-winner-contact').innerHTML = winner.phone
      ? `<div style="font-size:20px">${esc(winner.phone)}${winner.city ? ' • ' + esc(winner.city) : ''}</div>
         <div class="small" style="color:#bfe6cf;margin-top:6px">${winner.entries ? winner.entries + ' entries' : ''} — contact to pay the K${Number(g.prize_kwacha).toLocaleString()} via mobile money</div>`
      : '';
    if (!quiet) launchConfetti();
  }
  function launchConfetti() {
    const box = $('draw-confetti');
    const colors = ['#ffd34d', '#ffffff', '#22d3ee', '#f472b6', '#a3e635'];
    for (let i = 0; i < 120; i++) {
      const p = document.createElement('div');
      const s = 6 + Math.random() * 8;
      p.style.cssText = `position:absolute;top:-20px;left:${Math.random() * 100}%;width:${s}px;height:${s * 0.6}px;background:${colors[i % colors.length]};border-radius:2px;transform:rotate(${Math.random() * 360}deg)`;
      box.appendChild(p);
      p.animate(
        [{ transform: p.style.transform + ' translateY(0)', opacity: 1 },
         { transform: `rotate(${Math.random() * 720}deg) translateY(${window.innerHeight + 60}px)`, opacity: 0.8 }],
        { duration: 2500 + Math.random() * 2500, easing: 'cubic-bezier(.2,.6,.6,1)', fill: 'forwards', delay: Math.random() * 800 }
      );
    }
  }
}

/* ---------------- router ---------------- */
const routes = [
  [/^#\/?$/, () => (currentUser ? viewHome() : viewLanding())],
  [/^#\/jobs$/, viewBrowse],
  [/^#\/job\/(\d+)\/edit$/, (m) => viewJobEdit(m[1])],
  [/^#\/job\/(\d+)$/, (m) => viewJobDetail(m[1])],
  [/^#\/workers$/, viewWorkers],
  [/^#\/post$/, viewPost],
  [/^#\/dashboard$/, viewDashboard],
  [/^#\/profile\/edit$/, viewProfileEdit],
  [/^#\/profile$/, viewProfile],
  [/^#\/user\/(\d+)$/, (m) => viewUser(m[1])],
  [/^#\/login$/, viewLogin],
  [/^#\/forgot$/, viewForgot],
  [/^#\/reset$/, viewReset],
  [/^#\/register$/, viewRegister],
  [/^#\/invite$/, viewInvite],
  [/^#\/admin\/draw\/(\d+)$/, (m) => viewGiveawayDraw(m[1])],
  [/^#\/admin\/jobs$/, viewAdminJobs],
  [/^#\/admin\/referrals$/, viewReferralDashboard],
  [/^#\/admin\/verifications$/, viewVerifications],
  [/^#\/admin\/resets$/, viewAdminResets],
  [/^#\/categories$/, viewCategories],
  [/^#\/messages$/, viewMessages],
  [/^#\/chat\/(\d+)$/, (m) => viewChat(m[1])],
  [/^#\/admin$/, viewAdmin],
  [/^#\/terms$/, viewTerms],
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
  const shareBtn = e.target.closest('[data-share]');
  if (shareBtn) {
    e.preventDefault();
    e.stopPropagation();
    shareJob(shareBtn.dataset.share, shareBtn.dataset.title || 'Job on PieceWork Zambia');
    return;
  }
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
/* ---------------- referrals & giveaways ---------------- */
// Capture ?ref=CODE from invite links; it is attached to the register request
// so the inviter earns a raffle entry when the friend joins.
function getInviteRef() {
  try { return localStorage.getItem('pw_ref') || ''; } catch (e) { return ''; }
}
(function captureInviteRef() {
  try {
    const m = new URLSearchParams(location.search).get('ref');
    if (m && /^[A-Za-z0-9]{4,12}$/.test(m)) localStorage.setItem('pw_ref', m.toUpperCase());
  } catch (e) {}
})();

function shareText(link, prize) {
  return `Join me on PieceWork Zambia and find piece work near you! Sign up with my link and I get entries into the K${prize} giveaway draw: ${link}`;
}

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

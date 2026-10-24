'use strict';
/* PieceWork Zambia — vanilla JS single-page app. Hash-routed, no dependencies. */

const CATEGORIES = [
  'Events Setup', 'Moving Help', 'Cleaning', 'Construction & Labor',
  'Carpentry', 'Plumbing', 'Electrical', 'Bricklaying', 'Welding',
  'Delivery & Errands', 'Cooking & Catering', 'Gardening', 'Painting',
  'Security & Ushering', 'Waiter', 'Bartender', 'Mixologist', 'Other',
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
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
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
  eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  edit: '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  truck: '<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  hammer: '<path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"/><path d="m18 15 4-4"/><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"/>',
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
  'Carpentry': ['wrench', 'linear-gradient(135deg,#92400e,#451a03)'],
  'Plumbing': ['gear', 'linear-gradient(135deg,#0284c7,#0c4a6e)'],
  'Electrical': ['sparkles', 'linear-gradient(135deg,#eab308,#713f12)'],
  'Bricklaying': ['grid', 'linear-gradient(135deg,#78716c,#292524)'],
  'Welding': ['wrench', 'linear-gradient(135deg,#dc2626,#7f1d1d)'],
  'Delivery & Errands': ['truck', 'linear-gradient(135deg,#4d7c0f,#365314)'],
  'Cooking & Catering': ['utensils', 'linear-gradient(135deg,#ea580c,#9a3412)'],
  'Gardening': ['leaf', 'linear-gradient(135deg,#16a34a,#14532d)'],
  'Painting': ['paint', 'linear-gradient(135deg,#7c3aed,#4c1d95)'],
  'Security & Ushering': ['shield', 'linear-gradient(135deg,#475569,#1e293b)'],
  'Waiter': ['utensils', 'linear-gradient(135deg,#0d9488,#115e59)'],
  'Bartender': ['utensils', 'linear-gradient(135deg,#7c3aed,#4c1d95)'],
  'Mixologist': ['sparkles', 'linear-gradient(135deg,#db2777,#831843)'],
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
let browseState = { q: '', city: '', category: '', page: 1, maxKm: 50, payMin: '', payMax: '', duration: '', urgent: false, sort: '' };
let chatTimer = null;
let deliveryWatchId = null;

/** Stop any active delivery location sharing (called on navigation). */
function stopDeliverySharing() {
  if (deliveryWatchId !== null && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(deliveryWatchId);
  }
  deliveryWatchId = null;
}
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', stopDeliverySharing);
}

/**
 * Prompt for location permission and stream the worker's GPS to the server
 * while a delivery is active. Throttled to one update per 20 seconds.
 */
function startDeliverySharing(jobId, onUpdate) {
  stopDeliverySharing();
  if (!('geolocation' in navigator)) {
    toast('This device does not support location sharing.', true);
    return false;
  }
  let lastSent = 0;
  const sendPos = (pos) => {
    const now = Date.now();
    if (now - lastSent < 20000) return;
    lastSent = now;
    api(`/api/jobs/${jobId}/location`, {
      method: 'POST',
      body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    }).then(() => { if (onUpdate) onUpdate(new Date()); }).catch(() => {});
  };
  deliveryWatchId = navigator.geolocation.watchPosition(
    sendPos,
    () => toast('Location permission is needed to share your delivery. Please allow it in your browser settings.', true),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
  );
  // Send one reading immediately so the poster isn't staring at a blank map.
  navigator.geolocation.getCurrentPosition(sendPos, () => {}, { enableHighAccuracy: true, timeout: 15000 });
  return true;
}

/* ---------------- marketplace categories (2.0 M3) ---------------- */
const MARKET_CATEGORIES = [
  'Vehicles & Parts', 'Electronics', 'Phones & Tablets', 'Computers & IT',
  'Home & Furniture', 'Appliances', 'Fashion & Clothing', 'Beauty & Health',
  'Building & Hardware', 'Agriculture & Livestock', 'Food & Produce',
  'Baby & Kids', 'Sports & Leisure', 'Books & Education', 'Property & Rentals',
  'Other',
];

/* ---------------- saved products (on this device, 2.0 M3) ---------------- */
function getSavedProducts() {
  try {
    const v = JSON.parse(localStorage.getItem('pw_saved_products') || '[]');
    return Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : [];
  } catch { return []; }
}
function isSavedProduct(id) { return getSavedProducts().includes(Number(id)); }
function toggleSaveProduct(id) {
  id = Number(id);
  let s = getSavedProducts();
  if (s.includes(id)) { s = s.filter(x => x !== id); toast('Removed from saved items.'); }
  else { s.push(id); toast('Item saved on this device.'); }
  localStorage.setItem('pw_saved_products', JSON.stringify(s));
  document.querySelectorAll(`[data-psave="${id}"]`).forEach(b => {
    b.classList.toggle('saved', s.includes(id));
    b.setAttribute('aria-pressed', s.includes(id) ? 'true' : 'false');
  });
}

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

/* ---------------- sharing ---------------- */
const PUBLIC_ORIGIN = 'https://pieceworkzambia.com';

function openShareSheet({ heading, url, text, copiedMessage }) {
  // Bottom-sheet with explicit options so a link can always be copied,
  // even where the native share sheet is unavailable.
  const overlay = document.createElement('div');
  overlay.className = 'share-overlay';
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const opt = (icn, label) =>
    `<button class="share-opt" data-act="${icn}">${icon(icn)}${label}</button>`;
  overlay.innerHTML = `
    <div class="share-sheet" role="dialog" aria-label="${esc(heading)}">
      <h3>${esc(heading)}</h3>
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
    toast(copiedMessage);
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

function shareJob(id, title) {
  const url = PUBLIC_ORIGIN + '/s/job/' + id;
  openShareSheet({
    heading: 'Share this job',
    url,
    text: '"' + title + '" — see this job on PieceWork Zambia',
    copiedMessage: 'Job link copied. Paste it anywhere to share.',
  });
}

function shareProduct(id, title) {
  const url = PUBLIC_ORIGIN + '/s/product/' + id;
  openShareSheet({
    heading: 'Share this item',
    url,
    text: '"' + title + '" — see this item on PieceWork Zambia',
    copiedMessage: 'Product link copied. Paste it anywhere to share.',
  });
}

function shareBusiness(slug, name) {
  const url = PUBLIC_ORIGIN + '/s/business/' + encodeURIComponent(slug);
  openShareSheet({
    heading: 'Share this storefront',
    url,
    text: '"' + name + '" — visit this storefront on PieceWork Zambia',
    copiedMessage: 'Storefront link copied. Paste it anywhere to share.',
  });
}

function shareProfile(id, name) {
  const url = PUBLIC_ORIGIN + '/s/user/' + id;
  openShareSheet({
    heading: 'Share this profile',
    url,
    text: '"' + name + '" · see this profile on PieceWork Zambia',
    copiedMessage: 'Profile link copied. Paste it anywhere to share.',
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
/** Presence: ported from production v52 (Oct 22, 2026). Green dot +
 * Active now, or Last seen, from the other person's last_seen_at. */
function presenceHtml(c) {
  if (!c) return '';
  if (c.other_online) return '<span class="presence-dot online"></span>Active now';
  if (c.other_last_seen_at) return '<span class="presence-dot"></span>Last seen ' + esc(relTime(c.other_last_seen_at));
  return '';
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
    return `<img class="${cls} zoomable" src="${user.avatar}" alt="${esc(user.name || 'Profile photo')}" data-zoom-avatar="${esc(user.avatar)}" title="Tap to enlarge">`;
  }
  const initial = ((user && user.name) || '?').trim().charAt(0).toUpperCase();
  return `<span class="${cls}" aria-hidden="true">${esc(initial)}</span>`;
}
/** Full-screen profile photo viewer. One delegated listener covers every avatar. */
function openAvatarZoom(src, alt) {
  closeAvatarZoom();
  const overlay = document.createElement('div');
  overlay.id = 'avatar-zoom';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Profile photo enlarged');
  overlay.innerHTML = `
    <button class="avatar-zoom-close" aria-label="Close">${icon('x')}</button>
    <img src="${esc(src)}" alt="${esc(alt || 'Profile photo')}">`;
  overlay.addEventListener('click', closeAvatarZoom);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', escCloseAvatarZoom);
}
function escCloseAvatarZoom(e) { if (e.key === 'Escape') closeAvatarZoom(); }
function closeAvatarZoom() {
  const o = document.getElementById('avatar-zoom');
  if (o) o.remove();
  document.removeEventListener('keydown', escCloseAvatarZoom);
}
document.addEventListener('click', (ev) => {
  const t = ev.target && ev.target.closest ? ev.target.closest('[data-zoom-avatar]') : null;
  if (!t) return;
  ev.preventDefault();
  ev.stopPropagation();
  openAvatarZoom(t.getAttribute('data-zoom-avatar'), t.getAttribute('alt'));
});
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

/** Password visibility (Zac, Oct 24): an eye toggle on every password
 * field, so people can check what they typed. */
function wirePasswordEyes(scope) {
  (scope || document).querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.dataset.eyeWired) return;
    input.dataset.eyeWired = '1';
    const wrap = document.createElement('span');
    wrap.className = 'pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-eye';
    btn.setAttribute('aria-label', 'Show password');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = icon('eye');
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = icon(show ? 'eyeOff' : 'eye');
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
      input.focus();
    });
    wrap.appendChild(btn);
  });
}

/** Dark mode: <html data-theme> is set early in index.html; this keeps the
 * topbar toggle in sync and persists the choice on the device. */
function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('pwz-theme', t); } catch { /* private mode */ }
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
}

function renderChrome() {
  const menuBtn = document.getElementById('menu-btn');
  if (menuBtn && !menuBtn.dataset.wired) {
    menuBtn.innerHTML = icon('menu');
    menuBtn.dataset.wired = '1';
    menuBtn.addEventListener('click', openDrawer);
  }
  const themeBtn = document.getElementById('theme-btn');
  if (themeBtn && !themeBtn.dataset.wired) {
    themeBtn.dataset.wired = '1';
    themeBtn.addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
  }
  if (themeBtn) themeBtn.textContent = currentTheme() === 'dark' ? '☀️' : '🌙';
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
    ['#/jobs', 'briefcase', 'Find Work'],
    ['#/workers', 'users', 'Looking for Work'],
    ['#/post', 'plus', 'Hire Workers'],
    ['#/categories', 'grid', 'Categories'],
    ['#/market', 'tag', 'Marketplace'],
    ['#/businesses', 'grid', 'Businesses'],
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

  // Desktop top nav (visible at >=900px via CSS).
  const dnav = document.getElementById('desktop-nav');
  if (dnav) {
    const dMatch = (href) => {
      if (href === '#/') return h === '#/' || h === '';
      if (href === '#/jobs') return h === '#/jobs' || h.startsWith('#/job/') || h.startsWith('#/categories') || h.startsWith('#/saved');
      if (href === '#/messages') return h.startsWith('#/messages') || h.startsWith('#/chat/');
      if (href === '#/market') return h.startsWith('#/market') || h.startsWith('#/product/') || h.startsWith('#/sell') || h.startsWith('#/selling');
      if (href === '#/profile') return h.startsWith('#/profile') || h.startsWith('#/user/') || h.startsWith('#/dashboard') || h.startsWith('#/login') || h.startsWith('#/register');
      return h.startsWith(href);
    };
    const ditems = [
      ['#/', 'Home'],
      ['#/jobs', 'Find Work'],
      ['#/workers', 'Looking for Work'],
      ['#/post', 'Hire Workers'],
      ['#/market', 'Marketplace'],
      ['#/messages', 'Messages'],
    ];
    if (currentUser) {
      ditems.push(['#/dashboard', 'My Gigs']);
      ditems.push(['#/profile', 'Profile']);
      if (currentUser.is_admin || currentUser.is_support) ditems.push(['#/admin', 'Admin']);
    }
    ditems.push(['#/how', 'Help']);
    dnav.innerHTML = ditems.map(([href, label]) =>
      `<a href="${href}" class="${dMatch(href) ? 'active' : ''}">${label}</a>`
    ).join('') + (currentUser ? `<button class="dnav-logout" id="dnav-logout">Log out</button>` : '');
    const dlo = document.getElementById('dnav-logout');
    if (dlo) dlo.addEventListener('click', logout);
  }

  // Tab bar: Home, Find Work, Marketplace (live since 2.0 M3),
  // Messages, Profile. Posting lives in the drawer, the desktop nav,
  // and the home hero quick actions.
  const tabs = [
    { href: '#/', label: 'Home', ic: 'home', match: (hh) => hh === '#/' || hh === '' },
    { href: '#/jobs', label: 'Jobs', ic: 'briefcase', match: (hh) => hh === '#/jobs' || hh.startsWith('#/job/') || hh.startsWith('#/categories') || hh.startsWith('#/saved') || hh.startsWith('#/search') },
    { href: '#/market', label: 'Marketplace', ic: 'tag', match: (hh) => hh.startsWith('#/market') || hh.startsWith('#/product/') || hh.startsWith('#/sell') || hh.startsWith('#/selling') },
    { href: '#/messages', label: 'Messages', ic: 'message', match: (hh) => hh.startsWith('#/messages') || hh.startsWith('#/chat/') },
    {
      href: currentUser ? '#/profile' : '#/login', label: currentUser ? 'Profile' : 'Sign in', ic: 'user',
      match: (hh) => hh.startsWith('#/profile') || hh.startsWith('#/user/') || hh.startsWith('#/login') || hh.startsWith('#/register') || hh.startsWith('#/dashboard'),
    },
  ];
  tabbar.innerHTML = tabs.map(t =>
    `<a href="${t.href}" class="${t.match(h) ? 'active' : ''}">${icon(t.ic)}<span>${t.label}</span>${t.href === '#/messages' ? '<span class="tab-badge" id="msg-badge" hidden></span>' : ''}</a>`
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
  const statusBadge = job.status === 'open' ? '' : `<span class="badge badge-status-${esc(job.status)}">${esc(job.status)}</span>`;
  const urgentBadge = job.is_urgent ? `<span class="badge badge-urgent">Urgent</span>` : '';
  const draftBadge = job.is_draft ? `<span class="badge badge-draft">Draft</span>` : '';
  const durText = job.expected_duration || (job.pay_type && job.pay_type !== 'per_job' ? (PAY_LABEL[job.pay_type] || '').replace('per ', '') : '');
  return `
  <article class="job-card" data-job="${job.id}" tabindex="0" role="link" aria-label="${esc(job.title)}">
    ${job.cover_photo ? `<img class="job-cover" src="${esc(job.cover_photo)}" alt="" loading="lazy">` : jobThumb(job.category)}
    <div class="job-body">
      <h3>${esc(job.title)}</h3>
      <div class="job-meta">
        <span>${icon('pin')}${esc(job.city)}${area ? ' · ' + esc(area) : ''}${job.distance_km != null ? ` · ${esc(fmtKm(job.distance_km))} away` : ''}</span>
      </div>
      <div class="pay">${kwacha(job.pay_amount)}${durText ? `<small style="font-weight:600;color:var(--gray)"> · ${esc(durText)}</small>` : ''} ${statusBadge} ${urgentBadge} ${draftBadge}</div>
      <div class="job-meta">
        <span>${icon('tag')}${esc(job.category)}</span>
        <span>${icon('users')}${job.workers_needed || 1} worker${Number(job.workers_needed || 1) === 1 ? '' : 's'}</span>
        <span>${esc(relTime(job.created_at))}</span>
      </div>
      ${job.poster ? `<div class="job-poster">${avatarHtml(job.poster, 'xs')}<span>Posted by <b>${esc(job.poster.name)}</b></span>${job.poster.verified ? '<span class="verified-inline">✓ Verified Poster</span>' : ''}<span style="margin-left:auto">${stars(job.poster.rating_avg || 0)} <span class="muted">(${job.poster.rating_count || 0})</span></span></div>` : ''}
    </div>
    <button class="job-share" data-share="${job.id}" data-title="${esc(job.title)}" aria-label="Share this job">${icon('share')}</button>
    <button class="job-save ${saved ? 'saved' : ''}" data-save="${job.id}" aria-label="Save this job" aria-pressed="${saved ? 'true' : 'false'}">${icon('heart')}</button>
  </article>`;
}

function loadingHtml(msg) {
  return `<div class="loading"><div class="spinner"></div>${esc(msg || 'Loading…')}</div>`;
}
function emptyHtml(icn, title, sub, cta) {
  return `<div class="empty"><div class="empty-ico">${icon(icn)}</div><h3>${esc(title)}</h3><p>${esc(sub)}</p>${cta || ''}</div>`;
}
/** 2.0 M2: skeleton placeholder cards while a list loads. */
function skeletonCards(n) {
  const card = `<div class="skel-card" aria-hidden="true"><span class="skel" style="width:55%;height:16px"></span><span class="skel" style="width:85%;height:12px;margin-top:10px"></span><span class="skel" style="width:40%;height:12px;margin-top:8px"></span></div>`;
  return `<div role="status" aria-label="Loading">${card.repeat(n || 3)}</div>`;
}
/** 2.0 M2: standard error state with a working retry (re-runs the route). */
function errorHtml(msg) {
  return `<div class="empty"><div class="empty-ico">${icon('info')}</div><h3>Something went wrong</h3><p>${esc(msg || 'Please try again.')}</p><button class="btn btn-sm btn-primary" data-retry-view>Try again</button></div>`;
}
function momoNoteHtml() {
  return `<div class="momo-note"><b>How payment works:</b> PieceWork Zambia connects you —
    payment happens directly between you and the other person, usually via
    <b>MTN Mobile Money</b> or <b>Airtel Money</b> when the work is done.
    Agree the amount up front and never pay before work starts.</div>`;
}

/* ---------------- views ---------------- */

/** Signed-in home: greeting, search, categories, promo, fresh jobs. */
/* ---------------- ads banner ----------------
   Rotating banner of promoted products, jobs and storefronts, shown at
   the top of Home and Marketplace. Ads are free during the growth phase.
   Slides come from GET /api/ads, which only ever returns real accounts'
   live listings, so the banner just renders what it is given. */
let adsTimer = null;
function stopAdsRotation() { if (adsTimer) { clearInterval(adsTimer); adsTimer = null; } }

function adsBannerHtml(ads) {
  return `<div class="ads-banner" role="region" aria-label="Featured ads">
    ${ads.map((a, i) => `
    <a class="ad-slide${i === 0 ? ' active' : ''}" href="${esc(a.url)}" data-ad-slide="${i}"${i === 0 ? '' : ' hidden'}>
      ${a.image_url
        ? `<img class="ad-img" src="${esc(a.image_url)}" alt="" loading="lazy">`
        : `<span class="ad-fallback"><span class="ad-initial">${esc((a.title || 'P').charAt(0).toUpperCase())}</span></span>`}
      <span class="ad-shade"></span>
      <span class="ad-chip">Ad</span>
      <span class="ad-text"><b>${esc(a.title)}</b><span>${esc(a.subtitle || '')}</span></span>
    </a>`).join('')}
    ${ads.length > 1 ? `<span class="ad-dots">${ads.map((_, i) => `<button type="button" class="ad-dot${i === 0 ? ' active' : ''}" data-ad-dot="${i}" aria-label="Show ad ${i + 1}"></button>`).join('')}</span>` : ''}
  </div>`;
}

function wireAdsBanner(root) {
  const slides = [...root.querySelectorAll('[data-ad-slide]')];
  if (slides.length < 2) return;
  const dots = [...root.querySelectorAll('[data-ad-dot]')];
  let cur = 0;
  const show = (n) => {
    cur = (n + slides.length) % slides.length;
    slides.forEach((s, i) => { s.classList.toggle('active', i === cur); s.hidden = i !== cur; });
    dots.forEach((d, i) => d.classList.toggle('active', i === cur));
  };
  const start = () => { stopAdsRotation(); adsTimer = setInterval(() => show(cur + 1), 5000); };
  dots.forEach(d => d.addEventListener('click', () => { show(Number(d.dataset.adDot)); start(); }));
  root.addEventListener('pointerenter', stopAdsRotation);
  root.addEventListener('pointerleave', start);
  root.addEventListener('touchstart', stopAdsRotation, { passive: true });
  root.addEventListener('touchend', start, { passive: true });
  start();
}

async function mountAdsBanner(slotId) {
  try {
    const d = await api('/api/ads');
    const slot = document.getElementById(slotId);
    if (!slot || !d.ads || !d.ads.length) return;
    slot.innerHTML = adsBannerHtml(d.ads);
    wireAdsBanner(slot);
  } catch (e) { /* the banner is a bonus, never break the view */ }
}

function adUntilText(iso) {
  try { return new Date(String(iso).replace(' ', 'T') + 'Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch (e) { return iso; }
}

/** Owner-facing promote box for product, job and business detail pages. */
function adPromoHtml(activeAd) {
  if (activeAd) {
    return `<div class="ad-promo">
      <span class="ad-promo-text">In the ads banner until ${esc(adUntilText(activeAd.ends_at))}</span>
      <button class="btn btn-sm btn-outline" data-ad-remove="${activeAd.id}">Remove</button>
    </div>`;
  }
  return `<div class="ad-promo">
    <span class="ad-promo-text">Get more eyes on this listing in the Home and Marketplace banner.</span>
    <button class="btn btn-sm btn-primary" data-ad-promote>Promote in the ads banner, FREE</button>
  </div>`;
}

function wireAdPromo(root, kind, refId, refresh) {
  if (!root) return;
  const promoteBtn = root.querySelector('[data-ad-promote]');
  if (promoteBtn) promoteBtn.addEventListener('click', async () => {
    promoteBtn.disabled = true;
    try {
      await api('/api/ads', { method: 'POST', body: JSON.stringify({ kind, ref_id: refId }) });
      toast('Added to the ads banner. It is free right now.');
      refresh();
    } catch (e) { toast(e.message, true); promoteBtn.disabled = false; }
  });
  const removeBtn = root.querySelector('[data-ad-remove]');
  if (removeBtn) removeBtn.addEventListener('click', async () => {
    removeBtn.disabled = true;
    try {
      await api('/api/ads/' + removeBtn.dataset.adRemove, { method: 'DELETE' });
      toast('Removed from the ads banner.');
      refresh();
    } catch (e) { toast(e.message, true); removeBtn.disabled = false; }
  });
}

async function viewHome() {
  const first = currentUser.name.split(' ')[0];
  app.innerHTML = `
  <div class="view">
    <div class="home-head">
      <div class="home-town">${icon('pin')}<span>${esc(currentUser.city || 'Zambia')}</span></div>
      <h1>${daypart()}, ${esc(first)} 👋</h1>
      <p class="muted" style="margin:0 0 10px">Find work, hire workers, buy and sell. Get things done.</p>
      <div class="searchbar">${icon('search')}<input id="home-q" type="search" placeholder="Search jobs, products, services" aria-label="Search jobs, products and people"></div>
    </div>
    <section class="hero-card">
      <div class="hero-copy">
        <h2>Find Reliable Help Near You</h2>
        <p>Hire trusted workers for everyday tasks, or find work in ${esc(currentUser.city || 'your area')}.</p>
        <a class="btn btn-primary" href="#/workers">Find Workers</a>
      </div>
      <img class="hero-img" src="/img/landing/hero-pro.jpg" alt="A trusted PieceWork professional" loading="lazy">
    </section>
    <div class="qa4">
      <a class="qa4-item" href="#/post"><span class="qa4-ico" style="background:#E6F7F0;color:#0B8562">${icon('plus')}</span>Post a Job</a>
      <a class="qa4-item" href="#/workers"><span class="qa4-ico" style="background:#E3EBFE;color:#2563EB">${icon('users')}</span>Find Workers</a>
      <a class="qa4-item" href="#/market"><span class="qa4-ico" style="background:#FEF3D8;color:#B45309">${icon('tag')}</span>Marketplace</a>
      <a class="qa4-item" href="#/saved"><span class="qa4-ico" style="background:#FDE8E8;color:#C81E1E">${icon('heart')}</span>Saved</a>
    </div>
    <div class="page" style="padding-top:6px">
      <div id="home-ads"></div>
      <div class="section-title"><span>Popular Services</span><a href="#/categories">See all</a></div>
      <div class="svc-strip">
        ${[['Cleaning', 'Home Cleaning', 'cleaning', 'sparkles', '#E6F7F0', '#0B8562'], ['Gardening', 'Gardening &amp; Landscaping', 'gardening', 'leaf', '#E6F7F0', '#0B8562'], ['Plumbing', 'Plumbing', 'plumbing', 'wrench', '#E3EBFE', '#2563EB'], ['Construction & Labor', 'Construction &amp; Repairs', 'construction', 'hammer', '#FEF3D8', '#B45309'], ['Moving Help', 'Moving &amp; Heavy Lifting', 'moving', 'truck', '#FDE8E8', '#C81E1E'], ['Painting', 'Painting', 'painting', 'paint', '#EFE9FE', '#6D28D9']].map(([cat, label, img, ic, tint, color]) => `
          <div class="svc-card" data-cat-link="${esc(cat)}" tabindex="0" role="link" aria-label="Browse ${esc(cat)} jobs">
            <img src="/img/services/${img}.jpg" alt="${esc(cat)}" loading="lazy">
            <div class="svc-body">
              <span class="svc-ico" style="background:${tint};color:${color}">${icon(ic)}</span>
              <span class="svc-text"><b>${label}</b><span class="svc-count" data-svc-count="${esc(cat)}" hidden></span></span>
            </div>
          </div>`).join('')}
      </div>
      <div id="home-workers"></div>
      <div id="gw-promo"></div>
      <div id="home-reco"></div>
      <div class="section-title"><span>${getLoc() ? 'Jobs Near You' : 'Recent Jobs'}</span><a href="#/jobs">See all</a></div>
      <div id="home-jobs">${skeletonCards(3)}</div>
      <div id="home-picks"></div>
      <div class="card safety-card" style="margin-top:18px">
        <div class="safety-ico">${icon('shield')}</div>
        <div>
          <b>Stay safe on PieceWork</b>
          <ul>
            <li>Meet in a public or familiar place first</li>
            <li>Agree the pay before any work starts</li>
            <li>Never send money in advance to a stranger</li>
          </ul>
          <a class="small" href="#/how">Help and safety</a>
        </div>
      </div>
    </div>
  </div>`;

  const q = document.getElementById('home-q');
  mountAdsBanner('home-ads');
  // Giveaway promo — only when a round is active.
  api('/api/giveaways/current').then(({ giveaway }) => {
    const slot = document.getElementById('gw-promo');
    if (!slot || !giveaway) return;
    slot.innerHTML = `
      <a class="promo-card" href="#/invite" style="text-decoration:none;color:#fff;background:linear-gradient(135deg,#0B1F3B,#2563EB);display:flex;align-items:center;gap:14px;padding:18px">
        <div style="font-size:34px">🎉</div>
        <div class="promo-text"><h3>Win K${Number(giveaway.prize_kwacha).toLocaleString()}!</h3><p>Invite friends, earn raffle entries. Drawn live on Facebook.</p></div>
      </a>`;
  }).catch(() => {});
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = q.value.trim();
      if (v) location.hash = '#/search?q=' + encodeURIComponent(v);
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
  // 2.0 M1: rules-based recommendations (city, skills, distance).
  api('/api/jobs/recommended').then((d) => {
    const slot = document.getElementById('home-reco');
    if (!slot || !d.jobs || !d.jobs.length) return;
    slot.innerHTML = `
      <div class="section-title"><span>Recommended Jobs Near You</span><a href="#/jobs">See all</a></div>
      <div class="card-grid">${d.jobs.slice(0, 3).map(j => `<div class="reco-item"><div class="small reco-reason">⭐ ${esc(j.recommend_reason || 'Recommended for you')}</div>${jobCard(j)}</div>`).join('')}</div>`;
  }).catch(() => {});
  // Redesign: Featured Workers from the real open-to-work directory.
  api('/api/workers').then((d) => {
    // Popular Services counts: real open-to-work directory members whose
    // own listed skills match the trade. Shown only when at least 1.
    const SVC_KEYS = { 'Cleaning': ['clean'], 'Gardening': ['garden', 'landscap'], 'Plumbing': ['plumb'], 'Construction & Labor': ['construct', 'build', 'brick', 'carpent', 'weld', 'labour', 'labor', 'mason'], 'Moving Help': ['moving', 'mover', 'lifting', 'loading', 'offload', 'relocat'], 'Painting': ['paint'] };
    Object.keys(SVC_KEYS).forEach((cat) => {
      const keys = SVC_KEYS[cat];
      const n = (d.workers || []).filter((w) => keys.some((k) => String(w.skills || '').toLowerCase().includes(k))).length;
      if (n > 0) document.querySelectorAll('[data-svc-count="' + cat + '"]').forEach((el) => { el.textContent = n + (n === 1 ? ' worker' : ' workers'); el.hidden = false; });
    });
    const slot = document.getElementById('home-workers');
    if (!slot) return;
    const ws = (d.workers || []).slice(0, 8);
    if (!ws.length) {
      slot.innerHTML = `
      <div class="section-title"><span>Featured Workers</span><a href="#/workers">See all</a></div>
      <div class="card" style="display:flex;gap:12px;align-items:center">
        <div><b>No workers listed yet</b><p class="small muted" style="margin:2px 0 0">Post a job and let workers come to you.</p></div>
        <a class="btn btn-sm btn-primary" href="#/post" style="margin-left:auto">Post a Job</a>
      </div>`;
      return;
    }
    slot.innerHTML = `
      <div class="section-title"><span>Featured Workers</span><a href="#/workers">See all</a></div>
      <div class="fw-scroll">${ws.map(w => `
        <a class="fw-card" href="#/user/${w.id}">
          ${avatarHtml(w, 'lg')}
          <b>${esc(w.name)}</b>
          ${w.rating_count ? `<span class="fw-rate">${stars(w.rating_avg)} ${Number(w.rating_avg).toFixed(1)}</span>` : ''}
          <span class="fw-skills">${esc(String(w.skills || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 2).join(' · '))}</span>
          <span class="fw-city">${icon('pin')}${esc(w.city || '')}</span>
        </a>`).join('')}
      </div>`;
  }).catch(() => {});
  // Redesign: Marketplace Picks from real listings.
  api('/api/products').then((d) => {
    const slot = document.getElementById('home-picks');
    if (!slot) return;
    const ps = (d.products || []).slice(0, 8);
    if (!ps.length) return;
    slot.innerHTML = `
      <div class="section-title"><span>Marketplace Picks</span><a href="#/market">See all</a></div>
      <div class="hscroll">${ps.map(productCard).join('')}</div>`;
    slot.querySelectorAll('[data-product]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        location.hash = '#/product/' + el.dataset.product;
      });
    });
  }).catch(() => {});
  try {
    const loc = getLoc();
    const params = new URLSearchParams({ status: 'open', page: '1' });
    if (loc) { params.set('lat', loc.lat); params.set('lng', loc.lng); params.set('max_km', browseState.maxKm); }
    const data = await api('/api/jobs?' + params.toString());
    const box = document.getElementById('home-jobs');
    if (!box) return;
    box.innerHTML = data.jobs.length
      ? dedupeJobs(data.jobs).slice(0, 4).map(jobCard).join('')
      : emptyHtml('briefcase', 'No open jobs right now', 'Check back soon — or hire workers yourself.', `<a class="btn btn-sm btn-primary" href="#/post">Hire workers</a>`);
  } catch (e) {
    const box = document.getElementById('home-jobs');
    if (box) box.innerHTML = errorHtml(e.message);
  }
}

/** 2.0 M2: global search across jobs and people (marketplace joins at M3). */
async function viewSearch() {
  const q = (new URLSearchParams((location.hash.split('?')[1] || '')).get('q') || '').trim();
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Search</h1>
    <p class="page-sub">${q ? `Results for "${esc(q)}"` : 'Search jobs and people.'}</p>
    <form class="search-again" id="search-form">
      <div class="searchbar">${icon('search')}<input id="search-q" type="search" value="${esc(q)}" placeholder="Search jobs, skills or people" aria-label="Search again"></div>
      <button class="btn btn-primary" type="submit">Search</button>
    </form>
    <div class="section-title"><span>Jobs</span></div>
    <div id="search-jobs">${skeletonCards(2)}</div>
    <div class="section-title"><span>Items for sale</span></div>
    <div id="search-products">${skeletonCards(2)}</div>
    <div class="section-title"><span>People looking for work</span></div>
    <div id="search-people">${skeletonCards(2)}</div>
  </div></div>`;
  document.getElementById('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = document.getElementById('search-q').value.trim();
    if (v) location.hash = '#/search?q=' + encodeURIComponent(v);
  });
  const jobsBox = document.getElementById('search-jobs');
  const prodBox = document.getElementById('search-products');
  const pplBox = document.getElementById('search-people');
  if (!q) { jobsBox.innerHTML = ''; prodBox.innerHTML = ''; pplBox.innerHTML = ''; return; }
  api('/api/products?q=' + encodeURIComponent(q)).then((data) => {
    if (!document.getElementById('search-products')) return;
    prodBox.innerHTML = data.products.length
      ? `<div class="product-grid">${data.products.map(productCard).join('')}</div>`
      : emptyHtml('tag', 'No items match', 'Nothing for sale matches that search yet.');
  }).catch((e) => { if (document.getElementById('search-products')) prodBox.innerHTML = errorHtml(e.message); });
  api('/api/jobs?q=' + encodeURIComponent(q) + '&page=1').then((data) => {
    if (!document.getElementById('search-jobs')) return;
    jobsBox.innerHTML = data.jobs.length
      ? `<div class="card-grid">${data.jobs.map(jobCard).join('')}</div>`
      : emptyHtml('briefcase', 'No jobs match', 'Try different words, or browse everything.', `<a class="btn btn-sm btn-primary" href="#/jobs">Browse jobs</a>`);
  }).catch((e) => { if (document.getElementById('search-jobs')) jobsBox.innerHTML = errorHtml(e.message); });
  api('/api/workers?q=' + encodeURIComponent(q)).then((data) => {
    if (!document.getElementById('search-people')) return;
    pplBox.innerHTML = data.workers.length
      ? `<div class="card-grid">${data.workers.map(workerCard).join('')}</div>`
      : emptyHtml('users', 'No people match', 'Nobody looking for work matches that search yet.');
    pplBox.querySelectorAll('[data-worker]').forEach(el => {
      const go = (ev) => { if (ev.target.closest('a')) return; location.hash = '#/user/' + el.dataset.worker; };
      el.addEventListener('click', go);
      el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(ev); });
    });
  }).catch((e) => { if (document.getElementById('search-people')) pplBox.innerHTML = errorHtml(e.message); });
}

/** Find Jobs — search, city, distance, category chips, real result count. */
async function viewBrowse() {
  app.innerHTML = `
  <div class="view"><div class="page">
    <div class="browse-hero">
    <h1 class="page-title">Find Work</h1>
    <p class="page-sub">Discover jobs near you</p>
    <div class="searchbar">${icon('search')}
      <input id="q" type="search" placeholder="Search for jobs, e.g. cleaner, cashier" value="${esc(browseState.q)}" aria-label="Search jobs">
    </div>
    <div class="chips" id="quick-chips" style="margin-top:10px">
      <button class="chip ${browseState.sort !== 'pay_high' && browseState.maxKm !== 25 && !browseState.urgent ? 'active' : ''}" id="q-all">All</button>
      <button class="chip ${browseState.maxKm === 25 ? 'active' : ''}" id="q-near">Near Me</button>
      <button class="chip ${browseState.sort === 'pay_high' ? 'active' : ''}" id="q-pay">Highest Pay</button>
      <button class="chip ${browseState.urgent ? 'active' : ''}" id="f-urgent" aria-pressed="${browseState.urgent ? 'true' : 'false'}">Urgent</button>
    </div>
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
    <div class="filters" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px">
      <input id="f-paymin" type="number" min="0" inputmode="numeric" placeholder="Min K" value="${esc(browseState.payMin)}" aria-label="Minimum pay" style="width:92px;padding:10px 12px;border-radius:12px;border:1.5px solid var(--line);font-family:inherit;font-size:14px">
      <input id="f-paymax" type="number" min="0" inputmode="numeric" placeholder="Max K" value="${esc(browseState.payMax)}" aria-label="Maximum pay" style="width:92px;padding:10px 12px;border-radius:12px;border:1.5px solid var(--line);font-family:inherit;font-size:14px">
      <select id="f-duration" aria-label="Filter by expected duration" style="padding:10px 12px;border-radius:12px;border:1.5px solid var(--line);font-family:inherit;font-size:14px;background:var(--card);color:var(--ink)">
        <option value="">Any duration</option>
        ${JOB_DURATIONS.map(d => `<option ${browseState.duration === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
      </select>
    </div>
    <div class="split" style="margin:6px 2px 10px"><span class="small muted" id="res-count"></span><span class="small muted" id="res-order"></span></div>
    <div id="results">${skeletonCards(3)}</div>
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
  const payDebounce = (key, el) => {
    let t;
    el.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { browseState[key] = el.value.trim(); browseState.page = 1; loadJobs(true); }, 400);
    });
  };
  payDebounce('payMin', document.getElementById('f-paymin'));
  payDebounce('payMax', document.getElementById('f-paymax'));
  document.getElementById('q-all').addEventListener('click', () => {
    browseState.sort = ''; browseState.urgent = false; browseState.maxKm = 50; browseState.page = 1;
    document.getElementById('q-pay').classList.remove('active');
    document.getElementById('q-near').classList.remove('active');
    const u = document.getElementById('f-urgent'); u.classList.remove('active'); u.setAttribute('aria-pressed', 'false');
    loadJobs(true);
  });
  document.getElementById('q-near').addEventListener('click', (e) => {
    if (!getLoc()) { toast('Set your location first: tap Use my location above.', 'error'); return; }
    browseState.maxKm = browseState.maxKm === 25 ? 50 : 25; browseState.page = 1;
    e.currentTarget.classList.toggle('active', browseState.maxKm === 25);
    loadJobs(true);
  });
  document.getElementById('q-pay').addEventListener('click', (e) => {
    browseState.sort = browseState.sort === 'pay_high' ? '' : 'pay_high'; browseState.page = 1;
    e.currentTarget.classList.toggle('active', browseState.sort === 'pay_high');
    loadJobs(true);
  });
  document.getElementById('f-duration').addEventListener('change', (e) => {
    browseState.duration = e.target.value; browseState.page = 1; loadJobs(true);
  });
  document.getElementById('f-urgent').addEventListener('click', (e) => {
    browseState.urgent = !browseState.urgent; browseState.page = 1;
    e.currentTarget.classList.toggle('active', browseState.urgent);
    e.currentTarget.setAttribute('aria-pressed', browseState.urgent ? 'true' : 'false');
    loadJobs(true);
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
    if (browseState.payMin) params.set('pay_min', browseState.payMin);
    if (browseState.payMax) params.set('pay_max', browseState.payMax);
    if (browseState.duration) params.set('duration', browseState.duration);
    if (browseState.urgent) params.set('urgent', '1');
    if (browseState.sort) params.set('sort', browseState.sort);
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
      if (order) order.textContent = browseState.sort === 'pay_high' ? 'Highest pay first' : (loc ? 'Nearest first' : 'Newest first');
      if (!data.jobs.length && reset) {
        results.innerHTML = emptyHtml('search', 'No jobs found',
          'Try a different search or city — or hire workers for it.',
          `<a class="btn btn-sm btn-primary" href="#/post">Hire workers</a>`);
      } else {
        results.insertAdjacentHTML('beforeend', dedupeJobs(data.jobs).map(jobCard).join(''));
      }
      const moreWrap = document.getElementById('more-wrap');
      if (moreWrap) moreWrap.innerHTML =
        data.page < data.totalPages ? `<button id="load-more" class="btn btn-ghost btn-sm">Load more (${data.total - data.page * data.limit} remaining)</button>` : '';
    } catch (e) {
      results.innerHTML = errorHtml(e.message);
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
      ${trustBadgesHtml(w.badges, w.vouch_count)}
      ${w.has_intro_video ? `<div class="job-meta"><span class="tbadge tb-vouched">▶ Intro video</span></div>` : ''}
      ${skillList.length ? `<div class="job-meta"><span>${icon('tag')}${skillList.map(esc).join(' · ')}</span></div>` : ''}
      ${w.bio ? `<p class="worker-bio">${esc(w.bio)}</p>` : ''}
    </div>
  </article>`;
}

async function viewWorkers() {
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Find Workers</h1>
    <p class="page-sub">Workers who marked themselves open to work. Search by name or skill, and tap a card for the full profile.</p>
    <div class="searchbar" style="margin-bottom:10px">${icon('search')}<input id="wk-q" type="search" placeholder="Search name, skill or town" aria-label="Search workers"></div>
    <div class="field" style="max-width:320px">
      <select id="wk-city" aria-label="Filter by city"><option value="">All cities</option>${CITIES.map(c => `<option>${esc(c)}</option>`).join('')}</select>
    </div>
    <div id="wk-results" class="job-list">${skeletonCards(3)}</div>
  </div></div>`;
  const results = document.getElementById('wk-results');
  const sel = document.getElementById('wk-city');
  const wq = document.getElementById('wk-q');
  async function load() {
    results.innerHTML = skeletonCards(3);
    try {
      const params = new URLSearchParams();
      if (sel.value) params.set('city', sel.value);
      if (wq.value.trim()) params.set('q', wq.value.trim());
      const qs = params.toString();
      const data = await api('/api/workers' + (qs ? '?' + qs : ''));
      if (!data.workers.length) {
        results.innerHTML = emptyHtml('users', 'No workers found',
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
      results.innerHTML = errorHtml(e.message);
    }
  }
  sel.addEventListener('change', load);
  let wkT;
  wq.addEventListener('input', () => { clearTimeout(wkT); wkT = setTimeout(load, 250); });
  load();
}

/* ================= Marketplace (2.0 M3) ================= */

let marketState = { q: '', category: '', city: '', condition: '', condGroup: '', sort: 'newest', page: 1 };
const MARKET_CAT_ICONS = { 'Vehicles & Parts': 'truck', 'Electronics': 'grid', 'Phones & Tablets': 'phone', 'Computers & IT': 'briefcase', 'Home & Furniture': 'home', 'Appliances': 'sparkles', 'Fashion & Clothing': 'tag', 'Beauty & Health': 'heart', 'Building & Hardware': 'wrench', 'Agriculture & Livestock': 'leaf', 'Food & Produce': 'utensils', 'Baby & Kids': 'user', 'Sports & Leisure': 'sparkles', 'Books & Education': 'clipboard', 'Property & Rentals': 'pin', 'Other': 'grid' };
// Real category photos for the marketplace strip (Zac, Oct 23, 2026: the
// category icons should be pictures). Self-hosted under /img/cats.
const MARKET_CAT_PHOTOS = { 'Vehicles & Parts': 'vehicles', 'Electronics': 'electronics', 'Phones & Tablets': 'phones', 'Computers & IT': 'computers', 'Home & Furniture': 'furniture', 'Appliances': 'appliances', 'Fashion & Clothing': 'fashion', 'Beauty & Health': 'beauty', 'Building & Hardware': 'building', 'Agriculture & Livestock': 'agriculture', 'Food & Produce': 'food', 'Baby & Kids': 'baby', 'Sports & Leisure': 'sports', 'Books & Education': 'books', 'Property & Rentals': 'property', 'Other': 'other' };

function fmtK(n) { return 'K' + Number(n || 0).toLocaleString('en-ZM'); }

function productCard(p) {
  const savedP = isSavedProduct(p.id);
  return `
  <article class="product-card-g" data-product="${p.id}">
    <div class="pg-media">
      ${p.cover_photo
        ? `<img src="${esc(p.cover_photo)}" alt="${esc(p.title)}" loading="lazy">`
        : `<div class="job-thumb product-thumb">${icon('tag')}</div>`}
      <button class="job-save product-share" data-share-product="${p.id}" data-title="${esc(p.title)}" aria-label="Share this item">${icon('share')}</button>
      <button class="job-save ${savedP ? 'saved' : ''}" data-psave="${p.id}" aria-label="Save this item" aria-pressed="${savedP ? 'true' : 'false'}">${icon('heart')}</button>
    </div>
    <div class="pg-body">
      <h3>${esc(p.title)}</h3>
      <div class="product-price">${fmtK(p.price)}${p.negotiable ? ' <span class="neg-pill">Negotiable</span>' : ''}</div>
      <div class="pg-meta">${icon('pin')}<span>${esc(p.city)}${p.area ? ' · ' + esc(p.area) : ''}${p.distance_km != null ? ' · ' + p.distance_km + ' km away' : ''}</span></div>
      <div class="pg-meta"><span class="badge badge-cond">${esc(p.condition)}</span>${p.status !== 'active' ? `<span class="badge badge-status-${p.status === 'sold' ? 'completed' : 'cancelled'}">${esc(p.status)}</span>` : ''}</div>
      ${p.business ? `<div class="pg-meta">by <b>${esc(p.business.name)}</b>${p.business.verified ? ' ✓' : ''}</div>` : ''}
    </div>
  </article>`;
}

async function viewMarket() {
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Marketplace</h1>
    <p class="page-sub">Buy and sell with people near you. You pay the seller directly, PieceWork never handles the money.</p>
    <div id="market-ads"></div>
    ${currentUser ? `<a class="btn btn-primary" href="#/sell" style="margin-bottom:12px">${icon('plus')} Sell an item</a>
    <a class="btn btn-outline" href="#/selling" style="margin-bottom:12px">My selling</a>` : ''}
    <a class="btn btn-outline" href="#/businesses" style="margin-bottom:12px">Browse businesses</a>
    <div class="searchbar" style="margin-bottom:10px">${icon('search')}<input id="m-q" type="search" placeholder="Search items" value="${esc(marketState.q)}" aria-label="Search items"></div>
    <div class="mcat-strip" id="m-chips">
      <button class="mcat-item ${!marketState.category ? 'active' : ''}" data-mcat=""><span class="mcat-ico">${icon('grid')}</span>All</button>
      ${MARKET_CATEGORIES.map(c => `<button class="mcat-item ${marketState.category === c ? 'active' : ''}" data-mcat="${esc(c)}">${MARKET_CAT_PHOTOS[c] ? `<span class="mcat-ico mcat-photo"><img src="/img/cats/${MARKET_CAT_PHOTOS[c]}.jpg" alt="" loading="lazy"></span>` : `<span class="mcat-ico">${icon(MARKET_CAT_ICONS[c] || 'tag')}</span>`}${esc(c.split(' ')[0])}</button>`).join('')}
    </div>
    <div class="chips" id="m-quick" style="margin-top:8px">
      <button class="chip ${!marketState.condGroup && marketState.sort !== 'nearby' ? 'active' : ''}" id="mq-all">All</button>
      <button class="chip ${marketState.condGroup === 'new' ? 'active' : ''}" id="mq-new">New</button>
      <button class="chip ${marketState.condGroup === 'used' ? 'active' : ''}" id="mq-used">Used</button>
      <button class="chip ${marketState.sort === 'nearby' ? 'active' : ''}" id="mq-near">Near Me</button>
    </div>
    <div class="filters" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0 4px">
      <select id="m-city" aria-label="Filter by town" style="padding:10px 12px;border-radius:12px;border:1.5px solid var(--line);font-family:inherit;font-size:14px;background:var(--card);color:var(--ink)">
        <option value="">All towns</option>
        ${CITIES.map(c => `<option ${marketState.city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      <select id="m-sort" aria-label="Sort items" style="padding:10px 12px;border-radius:12px;border:1.5px solid var(--line);font-family:inherit;font-size:14px;background:var(--card);color:var(--ink)">
        <option value="newest" ${marketState.sort === 'newest' ? 'selected' : ''}>Newest first</option>
        <option value="price_low" ${marketState.sort === 'price_low' ? 'selected' : ''}>Price: low to high</option>
        <option value="price_high" ${marketState.sort === 'price_high' ? 'selected' : ''}>Price: high to low</option>
        <option value="nearby" ${marketState.sort === 'nearby' ? 'selected' : ''}>Nearest first</option>
      </select>
    </div>
    <div id="m-results">${skeletonCards(3)}</div>
    <div id="m-more" style="text-align:center;margin-top:10px"></div>
  </div></div>`;

  mountAdsBanner('market-ads');
  const results = document.getElementById('m-results');
  const more = document.getElementById('m-more');
  async function load(reset) {
    if (reset) { marketState.page = 1; results.innerHTML = skeletonCards(3); more.innerHTML = ''; }
    try {
      const params = new URLSearchParams({ page: String(marketState.page), sort: marketState.sort });
      if (marketState.q) params.set('q', marketState.q);
      if (marketState.category) params.set('category', marketState.category);
      if (marketState.city) params.set('city', marketState.city);
      if (marketState.condGroup === 'new') params.set('condition', 'New');
      if (marketState.condGroup === 'used') params.set('used', '1');
      const mLoc = getLoc();
      if (mLoc) { params.set('lat', mLoc.lat); params.set('lng', mLoc.lng); }
      const data = await api('/api/products?' + params.toString());
      const html = data.products.map(productCard).join('');
      if (reset) {
        results.innerHTML = data.products.length
          ? `<div class="product-grid">${html}</div>`
          : emptyHtml('tag', 'Nothing for sale here yet', 'Try another category or town, or be the first to sell.', currentUser ? `<a class="btn btn-sm btn-primary" href="#/sell">Sell an item</a>` : `<a class="btn btn-sm btn-primary" href="#/register">Join free</a>`);
      } else {
        const grid = results.querySelector('.product-grid');
        if (grid) grid.insertAdjacentHTML('beforeend', html);
      }
      more.innerHTML = data.page < data.totalPages
        ? `<button class="btn btn-outline" id="m-loadmore">Load more (${data.total - marketState.page * 24 > 0 ? data.total - marketState.page * 24 : 0} more)</button>`
        : '';
      const lm = document.getElementById('m-loadmore');
      if (lm) lm.addEventListener('click', () => { marketState.page++; load(false); });
    } catch (e) {
      if (reset) results.innerHTML = errorHtml(e.message);
    }
  }
  let qt;
  document.getElementById('m-q').addEventListener('input', (e) => {
    clearTimeout(qt);
    qt = setTimeout(() => { marketState.q = e.target.value.trim(); load(true); }, 400);
  });
  document.getElementById('m-quick').addEventListener('click', (e) => {
    const id = e.target.closest('button') && e.target.closest('button').id;
    if (!id) return;
    if (id === 'mq-all') { marketState.condGroup = ''; if (marketState.sort === 'nearby') marketState.sort = 'newest'; }
    if (id === 'mq-new') marketState.condGroup = marketState.condGroup === 'new' ? '' : 'new';
    if (id === 'mq-used') marketState.condGroup = marketState.condGroup === 'used' ? '' : 'used';
    if (id === 'mq-near') {
      if (!getLoc()) { toast('Set your location first: tap Use my location on Find Work.', 'error'); return; }
      marketState.sort = marketState.sort === 'nearby' ? 'newest' : 'nearby';
      const sortSel = document.getElementById('m-sort'); if (sortSel) sortSel.value = marketState.sort === 'nearby' ? 'nearby' : 'newest';
    }
    document.querySelectorAll('#m-quick .chip').forEach(c => c.classList.toggle('active',
      (c.id === 'mq-all' && !marketState.condGroup && marketState.sort !== 'nearby') ||
      (c.id === 'mq-new' && marketState.condGroup === 'new') ||
      (c.id === 'mq-used' && marketState.condGroup === 'used') ||
      (c.id === 'mq-near' && marketState.sort === 'nearby')));
    load(true);
  });
  document.getElementById('m-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-mcat]');
    if (!chip) return;
    marketState.category = chip.dataset.mcat;
    document.querySelectorAll('#m-chips .mcat-item').forEach(c => c.classList.toggle('active', c === chip));
    load(true);
  });
  document.getElementById('m-city').addEventListener('change', (e) => { marketState.city = e.target.value; load(true); });
  /* condition is owned by the quick chips (All / New / Used) */
  document.getElementById('m-sort').addEventListener('change', (e) => { marketState.sort = e.target.value; load(true); });
  load(true);
}

async function viewProduct(id) {
  if (!requireAuth('#/product/' + id)) return;
  app.innerHTML = `<div class="view"><div class="page"><div id="product-box">${skeletonCards(2)}</div></div></div>`;
  const box = document.getElementById('product-box');
  try {
    const { product: p, my_offer, offers } = await api('/api/products/' + id);
    const isOwner = currentUser && currentUser.id === p.seller_id;
    box.innerHTML = `
      <a class="small" href="#/market">← Back to Marketplace</a>
      ${p.photos && p.photos.length ? `<div class="pd-gallery">
        <img class="pd-main" id="pd-main" src="${esc(p.photos[0].url)}" alt="${esc(p.title)}">
        <span class="pd-count" id="pd-count">1/${p.photos.length}</span>
        ${p.photos.length > 1 ? `<div class="pd-thumbs">${p.photos.map((ph, i) => `<img class="pd-thumb ${i === 0 ? 'active' : ''}" data-pd-thumb="${esc(ph.url)}" data-pd-idx="${i}" src="${esc(ph.url)}" alt="Photo ${i + 1} of this item" loading="lazy">`).join('')}</div>` : ''}
      </div>` : ''}
      <div class="card" style="margin-top:12px">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
          <h1 class="page-title" style="font-size:22px;margin:0">${esc(p.title)}</h1>
          <span style="display:inline-flex;gap:8px;flex:none"><button class="icon-btn" data-share-product="${p.id}" data-title="${esc(p.title)}" aria-label="Share this item">${icon('share')}</button><button class="icon-btn ${isSavedProduct(p.id) ? 'saved' : ''}" data-psave="${p.id}" aria-label="Save this item" aria-pressed="${isSavedProduct(p.id) ? 'true' : 'false'}">${icon('heart')}</button></span>
        </div>
        <div class="product-price" style="font-size:24px">${fmtK(p.price)}${p.negotiable ? ' <span class="neg-pill">Negotiable</span>' : ''}</div>
        <div class="job-meta" style="margin-top:6px">
          <span class="badge badge-cond">${esc(p.condition)}</span>
          <span>${esc(p.category)}</span>
          <span>${icon('pin')} ${esc(p.city)}${p.area ? ' · ' + esc(p.area) : ''}</span>
          ${p.status !== 'active' ? `<span class="badge badge-status-completed">${esc(p.status)}</span>` : ''}
        </div>
        <div class="pd-stats">
          <div class="pd-stat"><span>Condition</span><b>${esc(p.condition)}</b></div>
          <div class="pd-stat"><span>Category</span><b>${esc(p.category)}</b></div>
          <div class="pd-stat"><span>Posted</span><b>${esc(relTime(p.created_at))}</b></div>
        </div>
        <p style="margin-top:12px;white-space:pre-wrap">${esc(p.description)}</p>
        <p class="small muted" style="margin-top:8px"><span class="job-meta" style="display:inline-flex;align-items:center;gap:4px">${icon('eye')} ${p.view_count} views</span></p>
      </div>
      ${p.business ? `<a class="card" href="#/business/${esc(p.business.slug)}" style="display:flex;align-items:center;gap:10px;color:var(--ink);margin-top:12px"><span style="flex:1">Sold by <b>${esc(p.business.name)}</b>${p.business.verified ? ' <span class="badge badge-verified">✓ Verified business</span>' : ''}</span><span class="chev">${icon('chevR')}</span></a>` : ''}
      <div class="card">
        <h3 style="margin-top:0">Seller</h3>
        <a href="#/user/${p.seller_id}" style="display:flex;align-items:flex-start;gap:10px;color:var(--ink)">
          ${avatarHtml({ name: p.seller_name, avatar: p.seller_avatar }, 'md')}
          <span><b>${esc(p.seller_name)}</b>
          <span class="small muted" style="display:block">${esc(p.seller_city || '')}${p.seller_since ? ' · Member since ' + esc(String(p.seller_since).slice(0, 4)) : ''}</span>
          <span style="display:block">${stars(p.seller_rating || 0)} <span class="small muted">(${p.seller_rating_count || 0} reviews)</span></span>
          ${p.seller_verified ? '<span class="badge badge-status-open">ID verified</span>' : '<span class="small muted">ID not verified yet</span>'}</span>
        </a>
        ${p.seller_stats ? `<div class="trust-strip"><span>${icon('check')} ${p.seller_stats.jobs_completed} job${p.seller_stats.jobs_completed === 1 ? '' : 's'} completed</span><span>${p.seller_stats.items_sold} item${p.seller_stats.items_sold === 1 ? '' : 's'} sold</span><span>${p.seller_stats.items_listed} listed now</span></div>` : ''}
        ${!isOwner ? `
        <div class="btn-row" style="margin-top:12px">
          <button class="btn btn-primary" id="btn-msg-seller">${icon('message')} Message seller</button>
          <button class="btn btn-outline" data-share-product="${p.id}" data-title="${esc(p.title)}">${icon('share')} Share</button>
          <button class="btn btn-outline" id="btn-report-product">${icon('shield')} Report</button>
        </div>
        ${p.status === 'active' ? `
        <div style="margin-top:14px">
          <h4 style="margin:0 0 6px">Make an offer</h4>
          ${my_offer ? `<p class="small">Your offer: <b>${fmtK(my_offer.amount)}</b> · ${esc(my_offer.status)}${my_offer.status === 'pending' ? ` · <a href="#" id="lnk-withdraw-offer">Withdraw</a>` : ''}</p>` : ''}
          <form id="offer-form" style="display:flex;gap:8px;flex-wrap:wrap">
            <input id="of-amount" type="number" min="1" inputmode="numeric" placeholder="Your price (K)" required style="flex:1;min-width:130px;padding:11px 12px;border-radius:12px;border:1.5px solid var(--line);font-family:inherit;font-size:14px">
            <input id="of-message" type="text" maxlength="500" placeholder="Message (optional)" style="flex:2;min-width:160px;padding:11px 12px;border-radius:12px;border:1.5px solid var(--line);font-family:inherit;font-size:14px">
            <button class="btn btn-primary" type="submit">Send offer</button>
          </form>
          <p class="small muted" style="margin-top:6px">An offer is a proposal, not a payment. You pay the seller directly when you meet.</p>
        </div>` : '<p class="small muted" style="margin-top:10px">This item is not on sale right now.</p>'}
        ` : `
        <div class="btn-row owner-actions" style="margin-top:12px">
          <button class="btn btn-outline" data-share-product="${p.id}" data-title="${esc(p.title)}">${icon('share')} Share</button>
          <a class="btn btn-outline" href="#/product/${p.id}/edit">${icon('edit')} Edit listing</a>
          ${p.status === 'active' ? `<button class="btn btn-outline" id="btn-mark-sold">Mark as sold</button><button class="btn btn-outline" id="btn-hide">Hide</button>` : ''}
          ${p.status === 'hidden' ? `<button class="btn btn-outline" id="btn-unhide">Show again</button>` : ''}
          <button class="btn btn-outline" id="btn-delete-product">Remove</button>
        </div>
        ${adPromoHtml(p.active_ad)}
        <div style="margin-top:14px">
          <h4 style="margin:0 0 6px">Offers received (${(offers || []).length})</h4>
          ${(offers && offers.length) ? offers.map(o => `
            <div class="offer-row">
              <span><b>${fmtK(o.amount)}</b> from ${esc(o.buyer_name)} <span class="small muted">(${esc(o.buyer_city || '')})</span>
              ${o.message ? `<span class="small" style="display:block">${esc(o.message)}</span>` : ''}
              <span class="small muted" style="display:block">${esc(relTime(o.created_at))}</span></span>
              ${o.status === 'pending'
                ? `<span class="btn-row"><button class="btn btn-sm btn-primary" data-offer-accept="${o.id}">Accept</button><button class="btn btn-sm btn-outline" data-offer-decline="${o.id}">Decline</button></span>`
                : `<span class="badge badge-app-${o.status === 'accepted' ? 'accepted' : 'declined'}">${esc(o.status)}</span>`}
            </div>`).join('') : '<p class="small muted">No offers yet.</p>'}
        </div>`}
      ${!isOwner && p.status === 'active' ? `<div class="sticky-cta pd-cta"><button class="btn btn-outline" id="pd-msg">Message</button><button class="btn btn-primary" id="pd-offer">Make Offer</button></div>` : ''}
      </div>`;
    box.querySelectorAll('[data-pd-thumb]').forEach(t => t.addEventListener('click', () => {
      const main = document.getElementById('pd-main');
      if (main) main.src = t.dataset.pdThumb;
      const cnt = document.getElementById('pd-count');
      if (cnt) cnt.textContent = (Number(t.dataset.pdIdx || 0) + 1) + '/' + p.photos.length;
      box.querySelectorAll('.pd-thumb').forEach(x => x.classList.toggle('active', x === t));
    }));
    if (isOwner) wireAdPromo(box, 'product', p.id, () => viewProduct(id));
    const pdMsgBtn = document.getElementById('pd-msg');
    if (pdMsgBtn) pdMsgBtn.addEventListener('click', () => { const b = document.getElementById('btn-msg-seller'); if (b) b.click(); });
    const pdOfferBtn = document.getElementById('pd-offer');
    if (pdOfferBtn) pdOfferBtn.addEventListener('click', () => { const f = document.getElementById('offer-form'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    const msgBtn = document.getElementById('btn-msg-seller');
    if (msgBtn) msgBtn.addEventListener('click', async () => {
      msgBtn.disabled = true;
      try {
        const { conversation_id } = await api('/api/conversations/product', { method: 'POST', body: JSON.stringify({ product_id: p.id }) });
        location.hash = '#/chat/' + conversation_id;
      } catch (e) { toast(e.message, true); msgBtn.disabled = false; }
    });
    const repBtn = document.getElementById('btn-report-product');
    if (repBtn) repBtn.addEventListener('click', async () => {
      const reason = prompt('Why are you reporting this item?');
      if (!reason || !reason.trim()) return;
      try {
        await api('/api/reports', { method: 'POST', body: JSON.stringify({ target_type: 'product', target_id: p.id, reason: reason.trim() }) });
        toast('Reported. Our team will take a look.');
      } catch (e) { toast(e.message, true); }
    });
    const offerForm = document.getElementById('offer-form');
    if (offerForm) offerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api(`/api/products/${p.id}/offers`, { method: 'POST', body: JSON.stringify({ amount: Number(document.getElementById('of-amount').value), message: document.getElementById('of-message').value.trim() }) });
        toast('Offer sent to the seller.');
        viewProduct(id);
      } catch (e2) { toast(e2.message, true); }
    });
    const withdraw = document.getElementById('lnk-withdraw-offer');
    if (withdraw && my_offer) withdraw.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await api('/api/offers/' + my_offer.id, { method: 'PATCH', body: JSON.stringify({ status: 'withdrawn' }) });
        toast('Offer withdrawn.');
        viewProduct(id);
      } catch (e2) { toast(e2.message, true); }
    });
    box.querySelectorAll('[data-offer-accept]').forEach(b => b.addEventListener('click', async () => {
      try { await api('/api/offers/' + b.dataset.offerAccept, { method: 'PATCH', body: JSON.stringify({ status: 'accepted' }) }); toast('Offer accepted. Message the buyer to arrange meeting and payment.'); viewProduct(id); }
      catch (e2) { toast(e2.message, true); }
    }));
    box.querySelectorAll('[data-offer-decline]').forEach(b => b.addEventListener('click', async () => {
      try { await api('/api/offers/' + b.dataset.offerDecline, { method: 'PATCH', body: JSON.stringify({ status: 'declined' }) }); viewProduct(id); }
      catch (e2) { toast(e2.message, true); }
    }));
    const patchStatus = async (status, msg) => {
      try { await api('/api/products/' + p.id, { method: 'PATCH', body: JSON.stringify({ status }) }); toast(msg); viewProduct(id); }
      catch (e2) { toast(e2.message, true); }
    };
    const soldBtn = document.getElementById('btn-mark-sold');
    if (soldBtn) soldBtn.addEventListener('click', () => patchStatus('sold', 'Marked as sold.'));
    const hideBtn = document.getElementById('btn-hide');
    if (hideBtn) hideBtn.addEventListener('click', () => patchStatus('hidden', 'Listing hidden from the marketplace.'));
    const unhideBtn = document.getElementById('btn-unhide');
    if (unhideBtn) unhideBtn.addEventListener('click', () => patchStatus('active', 'Listing is live again.'));
    const delBtn = document.getElementById('btn-delete-product');
    if (delBtn) delBtn.addEventListener('click', async () => {
      if (!confirm('Remove this listing for good?')) return;
      try { await api('/api/products/' + p.id, { method: 'DELETE' }); toast('Listing removed.'); location.hash = '#/selling'; }
      catch (e2) { toast(e2.message, true); }
    });
  } catch (e) {
    box.innerHTML = errorHtml(e.message);
  }
}

function productFormHtml(prefill, isEdit) {
  const p = prefill || {};
  const condGroup = p.condition && p.condition !== 'New' ? 'used' : 'new';
  return `
  <form id="product-form" class="card" style="padding:20px">
    <div class="wiz-steps" id="pf-steps">
      <div class="wiz-step active" data-wstep="1"><span class="n">1</span>Details</div>
      <div class="wiz-step" data-wstep="2"><span class="n">2</span>Photos</div>
      <div class="wiz-step" data-wstep="3"><span class="n">3</span>Review</div>
    </div>
    <div data-wiz="1">
      <div class="field"><label for="pf-title">Product Title *</label>
        <input id="pf-title" maxlength="120" required value="${esc(p.title || '')}" placeholder="e.g. iPhone 13, Sofa Set, Men's Shoes"></div>
      <div class="field"><label for="pf-category">Category *</label>
        <select id="pf-category" required>${MARKET_CATEGORIES.map(c => `<option ${p.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="field"><label for="pf-price">Price (ZMW) *</label>
        <input id="pf-price" type="number" min="1" inputmode="numeric" required value="${p.price || ''}" placeholder="e.g. 1500">
        <label class="switch-row"><span>Negotiable</span><input type="checkbox" id="pf-negotiable" ${p.negotiable ? 'checked' : ''}><span class="switch"></span></label></div>
      <div class="field"><label>Condition</label>
        <div class="seg" id="pf-cond-seg">
          <button type="button" class="seg-btn ${condGroup === 'new' ? 'active' : ''}" data-cond-group="new">New</button>
          <button type="button" class="seg-btn ${condGroup === 'used' ? 'active' : ''}" data-cond-group="used">Used</button>
        </div>
        <select id="pf-condition" style="margin-top:8px;${condGroup === 'new' ? 'display:none' : ''}">${['New', 'Like new', 'Good', 'Fair'].map(c => `<option ${p.condition === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      </div>
      <div class="field"><label for="pf-desc">Description *</label>
        <textarea id="pf-desc" rows="4" maxlength="2000" required placeholder="Describe your item: details, what is included, any faults, where to meet">${esc(p.description || '')}</textarea></div>
      <div class="form-2col">
        <div class="field"><label for="pf-city">Town *</label>
          <select id="pf-city" required>${CITIES.map(c => `<option ${p.city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="field"><label for="pf-area">Area</label>
          <input id="pf-area" maxlength="80" value="${esc(p.area || '')}" placeholder="e.g. Kamwala"></div>
      </div>
      <div id="pf-business-slot"></div>
    </div>
    <div data-wiz="2" hidden>
      <div class="field"><label for="pf-photos">Photos (up to 5)</label>
        <input id="pf-photos" type="file" accept="image/*" multiple>
        <div id="pf-photo-previews" class="job-gallery" style="margin-top:6px"></div>
        ${isEdit && p.photos && p.photos.length ? `<button type="button" class="btn btn-sm btn-outline" id="pf-remove-photos">Remove all photos</button>` : ''}
        <div class="hint">Clear photos sell faster. The first photo is the cover.</div></div>
    </div>
    <div data-wiz="3" hidden>
      <h3 style="margin-top:0">Review your listing</h3>
      <div id="pf-review"></div>
      <p class="small muted">Buyers pay you directly when you meet. PieceWork never takes a cut and never handles the money.</p>
    </div>
    <div class="wiz-nav">
      <button class="btn btn-outline" type="button" id="pf-back" hidden>Back</button>
      <button class="btn btn-primary" type="button" id="pf-next">Continue</button>
      <button class="btn btn-primary" type="submit" id="pf-submit" hidden>${isEdit ? 'Save changes' : 'List it for sale'}</button>
    </div>
  </form>`;
}

function wireSellWizard(form) {
  let step = 1;
  const sections = { 1: form.querySelector('[data-wiz="1"]'), 2: form.querySelector('[data-wiz="2"]'), 3: form.querySelector('[data-wiz="3"]') };
  const back = form.querySelector('#pf-back');
  const next = form.querySelector('#pf-next');
  const submit = form.querySelector('#pf-submit');
  function show(n) {
    step = n;
    Object.entries(sections).forEach(([k, el]) => { if (el) el.hidden = Number(k) !== n; });
    form.querySelectorAll('.wiz-step').forEach(el => {
      const k = Number(el.dataset.wstep);
      el.classList.toggle('active', k === n);
      el.classList.toggle('done', k < n);
    });
    back.hidden = n === 1;
    next.hidden = n === 3;
    submit.hidden = n !== 3;
    if (n === 3) renderReview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function renderReview() {
    const d = collectProductData(form);
    const photoCount = form.querySelectorAll('#pf-photo-previews img').length;
    document.getElementById('pf-review').innerHTML = `
      <div class="detail-rows">
        <div class="drow"><span>Title</span><b>${esc(d.title || '')}</b></div>
        <div class="drow"><span>Category</span><b>${esc(d.category || '')}</b></div>
        <div class="drow"><span>Price</span><b>${fmtK(d.price || 0)}${d.negotiable ? ' · Negotiable' : ''}</b></div>
        <div class="drow"><span>Condition</span><b>${esc(d.condition || '')}</b></div>
        <div class="drow"><span>Town</span><b>${esc(d.city || '')}${d.area ? ' · ' + esc(d.area) : ''}</b></div>
        <div class="drow"><span>Photos</span><b>${photoCount}</b></div>
      </div>
      <p style="margin-top:10px;white-space:pre-wrap">${esc(d.description || '')}</p>`;
  }
  function validStep1() {
    const title = document.getElementById('pf-title').value.trim();
    const price = Number(document.getElementById('pf-price').value);
    const desc = document.getElementById('pf-desc').value.trim();
    if (title.length < 3) { toast('Give your item a clear title first.', 'error'); const el = document.getElementById('pf-title'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus(); return false; }
    if (!price || price < 1) { toast('Add a price in Kwacha.', 'error'); const el = document.getElementById('pf-price'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus(); return false; }
    if (desc.length < 10) { toast('Add a short description so buyers trust the listing.', 'error'); const el = document.getElementById('pf-desc'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus(); return false; }
    return true;
  }
  next.addEventListener('click', () => { if (step === 1 && !validStep1()) return; show(step + 1); });
  back.addEventListener('click', () => show(step - 1));
  form.addEventListener('submit', (e) => {
    if (step !== 3) { e.preventDefault(); e.stopImmediatePropagation(); if (step === 1 && !validStep1()) return; show(step + 1); }
  }, true);
  const seg = form.querySelector('#pf-cond-seg');
  const condSel = form.querySelector('#pf-condition');
  seg.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cond-group]');
    if (!btn) return;
    seg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b === btn));
    if (btn.dataset.condGroup === 'new') { condSel.value = 'New'; condSel.style.display = 'none'; }
    else { condSel.style.display = ''; if (condSel.value === 'New') condSel.value = 'Good'; }
  });
  show(1);
}

function wireProductPhotos(form, existing) {
  form._photos = null;
  const input = form.querySelector('#pf-photos');
  const previews = form.querySelector('#pf-photo-previews');
  function renderPreviews() {
    if (form._photos && form._photos.length) {
      previews.innerHTML = form._photos.map(src => `<img src="${src}" alt="Item photo">`).join('');
    } else if (form._photos) {
      previews.innerHTML = '';
    } else if (existing && existing.length) {
      previews.innerHTML = existing.map(ph => `<img src="${esc(ph.url)}" alt="Item photo">`).join('')
        + '<p class="small muted" style="align-self:center">Picking new photos replaces these.</p>';
    }
  }
  renderPreviews();
  const rm = form.querySelector('#pf-remove-photos');
  if (rm) rm.addEventListener('click', () => { form._photos = []; renderPreviews(); rm.remove(); });
  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []).slice(0, 5);
    if (!files.length) return;
    try {
      form._photos = [];
      for (const f of files) form._photos.push(await fileToDoc(f));
      renderPreviews();
    } catch (e) { toast('Could not read that photo.', true); }
  });
}

function collectProductData(form) {
  const data = {
    title: document.getElementById('pf-title').value.trim(),
    category: document.getElementById('pf-category').value,
    condition: document.getElementById('pf-condition').value,
    price: Number(document.getElementById('pf-price').value),
    description: document.getElementById('pf-desc').value.trim(),
    city: document.getElementById('pf-city').value,
    area: document.getElementById('pf-area').value.trim(),
    negotiable: !!(document.getElementById('pf-negotiable') && document.getElementById('pf-negotiable').checked),
  };
  if (form._photos) data.photos = form._photos;
  const bizSel = document.getElementById('pf-business');
  if (bizSel) data.business_id = bizSel.value ? Number(bizSel.value) : null;
  return data;
}

/** If the user runs a live storefront, offer listing the item under it. */
async function mountBusinessSelect(form, currentBusinessId) {
  try {
    const data = await api('/api/businesses/mine');
    const live = (data.businesses || []).filter(b => b.status === 'active');
    const slot = form.querySelector('#pf-business-slot');
    if (!slot || !live.length) return;
    slot.innerHTML = `
    <div class="field"><label for="pf-business">Sell as</label>
      <select id="pf-business">
        <option value="">Myself (personal listing)</option>
        ${live.map(b => `<option value="${b.id}" ${currentBusinessId === b.id ? 'selected' : ''}>${esc(b.name)} (business)</option>`).join('')}
      </select>
      <div class="hint">Business listings appear in the shop catalogue too.</div></div>`;
  } catch (e) { /* personal listing only */ }
}

async function viewSell() {
  if (!requireAuth('#/sell')) return;
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Sell an item</h1>
    <p class="page-sub">List it in under a minute. Buyers message you in the app and pay you directly.</p>
    ${productFormHtml({ city: currentUser.city }, false)}
  </div></div>`;
  const form = document.getElementById('product-form');
  wireProductPhotos(form, []);
  wireSellWizard(form);
  mountBusinessSelect(form, null);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { id } = await api('/api/products', { method: 'POST', body: JSON.stringify(collectProductData(form)) });
      toast('Your item is live on the Marketplace.');
      location.hash = '#/product/' + id;
    } catch (e2) { toast(e2.message, true); }
  });
}

async function viewProductEdit(id) {
  if (!requireAuth('#/product/' + id + '/edit')) return;
  app.innerHTML = `<div class="view"><div class="page">${loadingHtml('Loading your listing…')}</div></div>`;
  try {
    const { product: p } = await api('/api/products/' + id);
    if (!currentUser || currentUser.id !== p.seller_id) {
      app.innerHTML = `<div class="view"><div class="page">${emptyHtml('shield', 'Not your listing', 'You can only edit items you are selling.', `<a class="btn btn-sm btn-primary" href="#/market">Back to Marketplace</a>`)}</div></div>`;
      return;
    }
    app.innerHTML = `
    <div class="view"><div class="page">
      <h1 class="page-title">Edit listing</h1>
      <p class="page-sub">${esc(p.title)}</p>
      ${productFormHtml(p, true)}
    </div></div>`;
    const form = document.getElementById('product-form');
    wireProductPhotos(form, p.photos || []);
    wireSellWizard(form);
    mountBusinessSelect(form, p.business ? p.business.id : null);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/products/' + id, { method: 'PATCH', body: JSON.stringify(collectProductData(form)) });
        toast('Listing updated.');
        location.hash = '#/product/' + id;
      } catch (e2) { toast(e2.message, true); }
    });
  } catch (e) {
    app.innerHTML = `<div class="view"><div class="page">${errorHtml(e.message)}</div></div>`;
  }
}

async function viewSelling() {
  if (!requireAuth('#/selling')) return;
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">My selling</h1>
    <p class="page-sub">Your listings and offers, in one place.</p>
    <div id="sell-summary">${skeletonCards(1)}</div>
    <div class="btn-row" style="margin:10px 0"><a class="btn btn-primary" href="#/sell">${icon('plus')} Sell an item</a></div>
    <div class="section-title"><span>My listings</span></div>
    <div id="sell-listings">${skeletonCards(2)}</div>
    <div class="section-title"><span>Offers received</span></div>
    <div id="sell-offers">${skeletonCards(1)}</div>
    <div class="section-title"><span>Offers I made</span></div>
    <div id="sell-myoffers">${skeletonCards(1)}</div>
  </div></div>`;
  api('/api/selling/summary').then((s) => {
    const el = document.getElementById('sell-summary');
    if (el) el.innerHTML = `
      <div class="stat-grid">
        <div class="card stat-card"><h3>${s.active}</h3><p class="small muted">Active</p></div>
        <div class="card stat-card"><h3>${s.sold}</h3><p class="small muted">Sold</p></div>
        <div class="card stat-card"><h3>${s.offers_pending}</h3><p class="small muted">Offers waiting</p></div>
        <div class="card stat-card"><h3>${s.hidden}</h3><p class="small muted">Hidden</p></div>
      </div>`;
  }).catch(() => {});
  api('/api/products?mine=1').then((d) => {
    const el = document.getElementById('sell-listings');
    if (!el) return;
    el.classList.toggle('product-grid', !!d.products.length);
    el.innerHTML = d.products.length
      ? d.products.map(productCard).join('')
      : emptyHtml('tag', 'No listings yet', 'List your first item and reach buyers near you.', `<a class="btn btn-sm btn-primary" href="#/sell">Sell an item</a>`);
  }).catch((e) => { const el = document.getElementById('sell-listings'); if (el) el.innerHTML = errorHtml(e.message); });
  api('/api/selling/offers').then((d) => {
    const rEl = document.getElementById('sell-offers');
    if (rEl) rEl.innerHTML = d.received.length ? d.received.map(o => `
      <div class="offer-row"><span><b>${fmtK(o.amount)}</b> for <a href="#/product/${o.product_id}">${esc(o.product_title)}</a>
        <span class="small muted" style="display:block">from ${esc(o.buyer_name)} · ${esc(relTime(o.created_at))}</span></span>
        <span class="badge badge-app-${o.status === 'accepted' ? 'accepted' : o.status === 'pending' ? 'pending' : 'declined'}">${esc(o.status)}</span></div>`).join('')
      : '<p class="small muted">No offers received yet.</p>';
    const mEl = document.getElementById('sell-myoffers');
    if (mEl) mEl.innerHTML = d.made.length ? d.made.map(o => `
      <div class="offer-row"><span><b>${fmtK(o.amount)}</b> for <a href="#/product/${o.product_id}">${esc(o.product_title)}</a>
        <span class="small muted" style="display:block">to ${esc(o.seller_name)} · ${esc(relTime(o.created_at))}</span></span>
        <span class="badge badge-app-${o.status === 'accepted' ? 'accepted' : o.status === 'pending' ? 'pending' : 'declined'}">${esc(o.status)}</span></div>`).join('')
      : '<p class="small muted">You have not made any offers yet.</p>';
  }).catch(() => {});
}

/* ================= Businesses (2.0 M4) ================= */

function bizBadge(b) {
  return b.verified
    ? '<span class="badge badge-verified">✓ Verified business</span>'
    : '<span class="badge badge-unverified">Unverified</span>';
}

function businessCard(b) {
  return `
  <a class="card biz-card" href="#/business/${esc(b.slug)}">
    ${b.logo ? `<img class="biz-logo" src="${b.logo}" alt="${esc(b.name)} logo">` : `<div class="biz-logo biz-logo-fallback">${icon('tag')}</div>`}
    <span class="biz-card-body">
      <b>${esc(b.name)}</b> ${bizBadge(b)}
      ${b.tagline ? `<span class="small muted" style="display:block">${esc(b.tagline)}</span>` : ''}
      <span class="small muted" style="display:block">${esc(b.category)} · ${esc(b.city)}${b.owner_rating ? ` · ⭐ ${Number(b.owner_rating).toFixed(1)} (${b.owner_reviews})` : ''}</span>
      <span class="small" style="display:block">${b.product_count || 0} items for sale</span>
    </span>
  </a>`;
}

async function viewBusinesses() {
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Businesses</h1>
    <p class="page-sub">Local shops and formal businesses on PieceWork. Verified shops have shown their registration documents.</p>
    ${currentUser ? `<a class="btn btn-primary" href="#/business/apply" style="margin-bottom:12px">${icon('plus')} Open a business storefront</a>
    <a class="btn btn-outline" href="#/business/mine" style="margin-bottom:12px">My businesses</a>` : ''}
    <div class="searchbar" style="margin-bottom:10px">${icon('search')}<input id="bz-q" type="search" placeholder="Search businesses" aria-label="Search businesses"></div>
    <div class="chips" id="bz-chips">
      <button class="chip active" data-bzcat="">All</button>
      ${MARKET_CATEGORIES.map(c => `<button class="chip" data-bzcat="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>
    <div id="bz-results" style="margin-top:12px">${skeletonCards(2)}</div>
  </div></div>`;
  const results = document.getElementById('bz-results');
  let cat = '', q = '';
  async function load() {
    results.innerHTML = skeletonCards(2);
    try {
      const params = new URLSearchParams();
      if (cat) params.set('category', cat);
      if (q) params.set('q', q);
      const data = await api('/api/businesses?' + params.toString());
      results.innerHTML = data.businesses.length
        ? data.businesses.map(businessCard).join('')
        : emptyHtml('tag', 'No businesses found', 'Try another search, or open the first storefront in this category.', currentUser ? `<a class="btn btn-sm btn-primary" href="#/business/apply">Open a storefront</a>` : '');
    } catch (e) { results.innerHTML = errorHtml(e.message); }
  }
  let qt;
  document.getElementById('bz-q').addEventListener('input', (e) => {
    clearTimeout(qt);
    qt = setTimeout(() => { q = e.target.value.trim(); load(); }, 400);
  });
  document.getElementById('bz-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-bzcat]');
    if (!chip) return;
    cat = chip.dataset.bzcat;
    document.querySelectorAll('#bz-chips .chip').forEach(c => c.classList.toggle('active', c === chip));
    load();
  });
  load();
}

async function viewBusiness(slug) {
  app.innerHTML = `<div class="view"><div class="page"><div id="biz-box">${skeletonCards(2)}</div></div></div>`;
  const box = document.getElementById('biz-box');
  try {
    const { business: b, products, jobs, reviews } = await api('/api/businesses/' + encodeURIComponent(slug));
    const isOwner = currentUser && currentUser.id === b.owner_id;
    box.innerHTML = `
      ${b.cover ? `<img class="biz-cover" src="${b.cover}" alt="${esc(b.name)}">` : ''}
      <div class="card" style="margin-top:${b.cover ? '-30px' : '0'};position:relative;z-index:1">
        <div style="display:flex;gap:12px;align-items:flex-start">
          ${b.logo ? `<img class="biz-logo" src="${b.logo}" alt="${esc(b.name)} logo">` : `<div class="biz-logo biz-logo-fallback">${icon('tag')}</div>`}
          <div style="flex:1;min-width:0">
            <h1 class="page-title" style="font-size:22px;margin:0">${esc(b.name)}</h1>
            <div style="margin:4px 0">${bizBadge(b)}</div>
            ${b.tagline ? `<p class="muted" style="margin:2px 0">${esc(b.tagline)}</p>` : ''}
            <p class="small muted" style="margin:2px 0">${esc(b.category)} · ${esc(b.city)}${b.area ? ' · ' + esc(b.area) : ''}${b.owner_rating ? ` · ⭐ ${Number(b.owner_rating).toFixed(1)} from ${b.owner_reviews} reviews` : ''}</p>
          </div>
        </div>
        ${b.description ? `<p style="margin-top:12px;white-space:pre-wrap">${esc(b.description)}</p>` : ''}
        ${isOwner ? `<div class="btn-row" style="margin-top:12px"><a class="btn btn-outline" href="#/business/${b.id}/manage">${icon('edit')} Manage storefront</a></div>${adPromoHtml(b.active_ad)}` : `
        <div class="btn-row" style="margin-top:12px">
          <a class="btn btn-outline" href="#/user/${b.owner_id}">${icon('message')} Message</a>
          ${currentUser ? `<button class="btn ${b.following ? 'btn-outline' : 'btn-primary'}" id="biz-follow">${b.following ? 'Following' : 'Follow'}</button>` : `<a class="btn btn-primary" href="#/login">Follow</a>`}
          <span class="small muted" id="biz-followers">${b.follower_count || 0} followers</span>
        </div>`}
        <div class="btn-row" style="margin-top:8px">
          <button class="btn btn-outline" data-share-business="${esc(b.slug)}" data-title="${esc(b.name)}" aria-label="Share this storefront">${icon('share')} Share storefront</button>
        </div>
      </div>
      <div class="biz-tabs" role="tablist">
        <button class="biz-tab active" data-btab="products">Products</button>
        <button class="biz-tab" data-btab="about">About</button>
        <button class="biz-tab" data-btab="reviews">Reviews (${(reviews || []).length})</button>
      </div>
      <div data-bpanel="products">
        ${products.length ? `<div class="product-grid">${products.map(productCard).join('')}</div>` : '<p class="small muted">Nothing listed right now.</p>'}
        ${jobs.length ? `<div class="section-title"><span>Jobs from this business</span></div>${jobs.map(jobCard).join('')}` : ''}
      </div>
      <div data-bpanel="about" hidden>
        <div class="card">
          <h3 style="margin-top:0">Contact and hours</h3>
          ${b.address ? `<p class="small icon-line">${icon('pin')} ${esc(b.address)}, ${esc(b.city)}</p>` : ''}
          ${b.hours_text ? `<p class="small icon-line">${icon('clock')} ${esc(b.hours_text)}</p>` : ''}
          ${b.phone ? `<p class="small icon-line">${icon('phone')} <a href="tel:${esc(b.phone.replace(/\D/g, ''))}">${esc(b.phone)}</a></p>` : ''}
          ${b.email ? `<p class="small icon-line">${icon('send')} <a href="mailto:${esc(b.email)}">${esc(b.email)}</a></p>` : ''}
          <p class="small muted">Run by <a href="#/user/${b.owner_id}">${esc(b.owner_name)}</a></p>
        </div>
      </div>
      <div data-bpanel="reviews" hidden>
        ${(reviews || []).length ? reviews.map(r => `
          <div class="card" style="display:flex;gap:10px">
            ${avatarHtml({ name: r.reviewer_name, avatar: r.reviewer_avatar }, 'sm')}
            <div style="flex:1;min-width:0">
              <b>${esc(r.reviewer_name)}</b> ${stars(r.rating)}
              ${r.job_title ? `<div class="small muted">for ${esc(r.job_title)}</div>` : ''}
              ${r.comment ? `<p style="margin:4px 0 0">${esc(r.comment)}</p>` : ''}
              <div class="small muted">${esc(relTime(r.created_at))}</div>
            </div>
          </div>`).join('') : emptyHtml('star', 'No reviews yet', 'Reviews from completed jobs with this business will appear here.')}
      </div>
    `;
    box.querySelectorAll('[data-btab]').forEach(btn => btn.addEventListener('click', () => {
      box.querySelectorAll('[data-btab]').forEach(x => x.classList.toggle('active', x === btn));
      box.querySelectorAll('[data-bpanel]').forEach(pn => { pn.hidden = pn.dataset.bpanel !== btn.dataset.btab; });
    }));
    if (isOwner) wireAdPromo(box, 'business', b.id, () => viewBusiness(slug));
    const followBtn = document.getElementById('biz-follow');
    if (followBtn) followBtn.addEventListener('click', async () => {
      followBtn.disabled = true;
      try {
        const now = followBtn.textContent.trim() === 'Following';
        const r = await api('/api/businesses/' + b.id + '/follow', { method: now ? 'DELETE' : 'POST' });
        followBtn.textContent = r.following ? 'Following' : 'Follow';
        followBtn.className = 'btn ' + (r.following ? 'btn-outline' : 'btn-primary');
        const fc = document.getElementById('biz-followers');
        if (fc) fc.textContent = r.follower_count + ' followers';
      } catch (e) { toast(e.message, 'error'); }
      followBtn.disabled = false;
    });
  } catch (e) {
    box.innerHTML = errorHtml(e.message);
  }
}

function businessFormHtml(prefill, isEdit) {
  const p = prefill || {};
  return `
  <form id="business-form" class="card" style="padding:20px">
    <div class="field"><label for="bf-name">Business name *</label>
      <input id="bf-name" maxlength="80" required value="${esc(p.name || '')}" placeholder="e.g. Kamwala Phone Repairs"></div>
    <div class="field"><label for="bf-tagline">Tagline</label>
      <input id="bf-tagline" maxlength="120" value="${esc(p.tagline || '')}" placeholder="One short line about the business"></div>
    <div class="form-2col">
      <div class="field"><label for="bf-category">Category *</label>
        <select id="bf-category" required>${MARKET_CATEGORIES.map(c => `<option ${p.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="field"><label for="bf-city">Town *</label>
        <select id="bf-city" required>${CITIES.map(c => `<option ${p.city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label for="bf-desc">About the business *</label>
      <textarea id="bf-desc" rows="4" maxlength="2000" required placeholder="What you sell or do, how long you have traded, what makes you different">${esc(p.description || '')}</textarea></div>
    <div class="form-2col">
      <div class="field"><label for="bf-area">Area</label>
        <input id="bf-area" maxlength="80" value="${esc(p.area || '')}" placeholder="e.g. Kamwala"></div>
      <div class="field"><label for="bf-address">Street address</label>
        <input id="bf-address" maxlength="200" value="${esc(p.address || '')}" placeholder="Shop number, street"></div>
    </div>
    <div class="form-2col">
      <div class="field"><label for="bf-phone">Phone</label>
        <input id="bf-phone" maxlength="30" value="${esc(p.phone || '')}" placeholder="09..."></div>
      <div class="field"><label for="bf-email">Email</label>
        <input id="bf-email" type="email" maxlength="120" value="${esc(p.email || '')}" placeholder="shop@example.com"></div>
    </div>
    <div class="field"><label for="bf-hours">Opening hours</label>
      <input id="bf-hours" maxlength="200" value="${esc(p.hours_text || '')}" placeholder="e.g. Mon to Sat, 8:00 to 17:30"></div>
    <div class="form-2col">
      <div class="field"><label for="bf-logo">Logo</label>
        <input id="bf-logo" type="file" accept="image/*">
        ${p.logo ? `<img src="${p.logo}" alt="Current logo" style="width:56px;height:56px;border-radius:14px;object-fit:cover;margin-top:6px">` : ''}</div>
      <div class="field"><label for="bf-cover">Cover photo</label>
        <input id="bf-cover" type="file" accept="image/*">
        ${p.cover ? `<img src="${p.cover}" alt="Current cover" style="width:100%;height:56px;border-radius:14px;object-fit:cover;margin-top:6px">` : ''}</div>
    </div>
    <button class="btn btn-primary btn-block" type="submit">${isEdit ? 'Save changes' : 'Submit for approval'}</button>
    ${isEdit ? '' : '<p class="small muted" style="margin-top:8px">An admin reviews every new storefront before it goes public. You can upload registration documents after applying to earn the Verified badge.</p>'}
  </form>`;
}

async function wireBusinessForm(form, existing) {
  form._logo = undefined;
  form._cover = undefined;
  const bind = (inputId, key) => {
    const input = form.querySelector(inputId);
    if (input) input.addEventListener('change', async () => {
      const f = (input.files || [])[0];
      if (!f) return;
      try { form[key] = await fileToDoc(f); toast('Image ready.'); }
      catch (e) { toast('Could not read that image.', true); }
    });
  };
  bind('#bf-logo', '_logo');
  bind('#bf-cover', '_cover');
}

function collectBusinessData(form) {
  const data = {
    name: document.getElementById('bf-name').value.trim(),
    tagline: document.getElementById('bf-tagline').value.trim(),
    category: document.getElementById('bf-category').value,
    city: document.getElementById('bf-city').value,
    description: document.getElementById('bf-desc').value.trim(),
    area: document.getElementById('bf-area').value.trim(),
    address: document.getElementById('bf-address').value.trim(),
    phone: document.getElementById('bf-phone').value.trim(),
    email: document.getElementById('bf-email').value.trim(),
    hours_text: document.getElementById('bf-hours').value.trim(),
  };
  if (form._logo !== undefined) data.logo = form._logo;
  if (form._cover !== undefined) data.cover = form._cover;
  return data;
}

async function viewBusinessApply() {
  if (!requireAuth('#/business/apply')) return;
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Open a business storefront</h1>
    <p class="page-sub">Your own shop page on PieceWork: logo, hours, contact, and your catalogue in one link.</p>
    ${businessFormHtml({ city: currentUser.city }, false)}
  </div></div>`;
  const form = document.getElementById('business-form');
  wireBusinessForm(form, null);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { id } = await api('/api/businesses', { method: 'POST', body: JSON.stringify(collectBusinessData(form)) });
      toast('Application sent. Your storefront goes public after admin approval.');
      location.hash = '#/business/' + id + '/manage';
    } catch (e2) { toast(e2.message, true); }
  });
}

async function viewMyBusinesses() {
  if (!requireAuth('#/business/mine')) return;
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">My businesses</h1>
    <p class="page-sub">Your storefronts and their approval state.</p>
    <a class="btn btn-primary" href="#/business/apply" style="margin-bottom:12px">${icon('plus')} New storefront</a>
    <div id="mybiz-list">${skeletonCards(2)}</div>
  </div></div>`;
  try {
    const data = await api('/api/businesses/mine');
    const el = document.getElementById('mybiz-list');
    el.innerHTML = data.businesses.length ? data.businesses.map(b => `
      <div class="card" style="display:flex;gap:12px;align-items:center">
        ${b.logo ? `<img class="biz-logo" src="${b.logo}" alt="">` : `<div class="biz-logo biz-logo-fallback">${icon('tag')}</div>`}
        <span style="flex:1;min-width:0"><b>${esc(b.name)}</b> ${bizBadge(b)}
          <span class="small muted" style="display:block">Status: ${esc(b.status)} · ${esc(b.city)}</span></span>
        <a class="btn btn-sm btn-outline" href="#/business/${b.id}/manage">Manage</a>
        ${b.status === 'active' ? `<a class="btn btn-sm btn-outline" href="#/business/${esc(b.slug)}">View</a>` : ''}
      </div>`).join('')
      : emptyHtml('tag', 'No storefronts yet', 'Open a storefront to give your business its own page.', `<a class="btn btn-sm btn-primary" href="#/business/apply">Open a storefront</a>`);
  } catch (e) {
    document.getElementById('mybiz-list').innerHTML = errorHtml(e.message);
  }
}

async function viewBusinessManage(id) {
  if (!requireAuth('#/business/' + id + '/manage')) return;
  app.innerHTML = `<div class="view"><div class="page">${skeletonCards(2)}</div></div>`;
  try {
    const data = await api('/api/businesses/mine');
    const b = data.businesses.find(x => x.id === Number(id));
    if (!b) {
      app.innerHTML = `<div class="view"><div class="page">${emptyHtml('shield', 'Business not found', 'This storefront is not yours, or it does not exist.', `<a class="btn btn-sm btn-primary" href="#/business/mine">My businesses</a>`)}</div></div>`;
      return;
    }
    const docs = await api('/api/businesses/' + b.id + '/documents').catch(() => ({ documents: [] }));
    const verLabel = { unverified: 'Not verified yet', pending: 'Documents with the admin, under review', verified: 'Verified', rejected: 'Verification was not approved' }[b.verification_status];
    app.innerHTML = `
    <div class="view"><div class="page">
      <h1 class="page-title">Manage storefront</h1>
      <p class="page-sub">${esc(b.name)} · Status: <b>${esc(b.status)}</b>${b.status === 'pending' ? ' (waiting for admin approval)' : ''}</p>
      <div class="card">
        <h3 style="margin-top:0">Verified badge</h3>
        <p class="small"><b>${esc(verLabel)}</b></p>
        ${b.verification_note ? `<p class="small muted">Admin note: ${esc(b.verification_note)}</p>` : ''}
        <p class="small muted">Upload a clear photo or scan of your PACRA certificate, TPIN certificate, or trading licence. Verified shops show a green badge everywhere.</p>
        <p class="small">Documents on file: ${docs.documents.length ? docs.documents.map(d => esc(d.kind.toUpperCase())).join(', ') : 'none yet'}</p>
        <form id="doc-form" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <select id="doc-kind" style="padding:10px 12px;border-radius:12px;border:1.5px solid var(--line);font-family:inherit;font-size:14px">
            <option value="pacra">PACRA certificate</option>
            <option value="tpin">TPIN certificate</option>
            <option value="licence">Trading licence</option>
            <option value="other">Other document</option>
          </select>
          <input id="doc-file" type="file" accept="image/*" required>
          <button class="btn btn-primary" type="submit">Upload document</button>
        </form>
      </div>
      ${businessFormHtml(b, true)}
    </div></div>`;
    const form = document.getElementById('business-form');
    wireBusinessForm(form, b);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/businesses/' + b.id, { method: 'PATCH', body: JSON.stringify(collectBusinessData(form)) });
        toast('Storefront updated.');
        viewBusinessManage(id);
      } catch (e2) { toast(e2.message, true); }
    });
    document.getElementById('doc-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = (document.getElementById('doc-file').files || [])[0];
      if (!f) return;
      try {
        const image = await fileToDoc(f);
        await api('/api/businesses/' + b.id + '/documents', { method: 'POST', body: JSON.stringify({ kind: document.getElementById('doc-kind').value, image }) });
        toast('Document uploaded. Verification is now under review.');
        viewBusinessManage(id);
      } catch (e2) { toast(e2.message, true); }
    });
  } catch (e) {
    app.innerHTML = `<div class="view"><div class="page">${errorHtml(e.message)}</div></div>`;
  }
}

async function viewAdminBusinesses() {
  if (!requireAuth('#/admin/businesses')) return;
  if (!currentUser.is_admin) {
    app.innerHTML = `<div class="view"><div class="page">${emptyHtml('shield', 'Not authorized', 'This page is for the PieceWork team only.')}</div></div>`;
    return;
  }
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Businesses</h1>
    <p class="page-sub">Approve storefronts and verify registration documents.</p>
    <div class="chips" id="ab-filter">
      <button class="chip active" data-abstatus="pending">Pending approval</button>
      <button class="chip" data-abstatus="active">Live</button>
      <button class="chip" data-abstatus="">All</button>
    </div>
    <div id="ab-list" style="margin-top:12px">${skeletonCards(2)}</div>
  </div></div>`;
  const list = document.getElementById('ab-list');
  async function load(status) {
    list.innerHTML = skeletonCards(2);
    try {
      const data = await api('/api/admin/businesses' + (status ? '?status=' + status : ''));
      list.innerHTML = data.businesses.length ? data.businesses.map(b => `
        <div class="card" style="margin-bottom:10px">
          <b>${esc(b.name)}</b> ${bizBadge(b)}
          <span class="small muted" style="display:block">by ${esc(b.owner_name)} · ${esc(b.category)} · ${esc(b.city)} · status ${esc(b.status)} · verification ${esc(b.verification_status)} · ${b.doc_count} documents</span>
          <div class="btn-row" style="margin-top:8px">
            ${b.status === 'pending' ? `<button class="btn btn-sm btn-primary" data-ab-approve="${b.id}">Approve</button><button class="btn btn-sm btn-outline" data-ab-status="rejected" data-ab-id="${b.id}">Reject</button>` : ''}
            ${b.status === 'active' ? `<button class="btn btn-sm btn-outline" data-ab-status="suspended" data-ab-id="${b.id}">Suspend</button>` : ''}
            ${b.status === 'suspended' ? `<button class="btn btn-sm btn-primary" data-ab-status="active" data-ab-id="${b.id}">Reinstate</button>` : ''}
            ${b.doc_count ? `<button class="btn btn-sm btn-outline" data-ab-docs="${b.id}">View documents</button>` : ''}
            ${b.verification_status === 'pending' ? `<button class="btn btn-sm btn-primary" data-ab-verify="${b.id}">Verify</button><button class="btn btn-sm btn-outline" data-ab-unverify="${b.id}">Refuse verification</button>` : ''}
          </div>
          <div id="ab-docs-${b.id}"></div>
        </div>`).join('')
        : emptyHtml('tag', 'Nothing here', 'No businesses in this state right now.');
      list.querySelectorAll('[data-ab-approve]').forEach(btn => btn.addEventListener('click', async () => {
        try { await api('/api/admin/businesses/' + btn.dataset.abApprove, { method: 'PATCH', body: JSON.stringify({ status: 'active' }) }); toast('Storefront approved and live.'); load(current); }
        catch (e) { toast(e.message, true); }
      }));
      list.querySelectorAll('[data-ab-status]').forEach(btn => btn.addEventListener('click', async () => {
        try { await api('/api/admin/businesses/' + btn.dataset.abId, { method: 'PATCH', body: JSON.stringify({ status: btn.dataset.abStatus }) }); toast('Updated.'); load(current); }
        catch (e) { toast(e.message, true); }
      }));
      list.querySelectorAll('[data-ab-verify]').forEach(btn => btn.addEventListener('click', async () => {
        try { await api('/api/admin/businesses/' + btn.dataset.abVerify + '/verification', { method: 'PATCH', body: JSON.stringify({ decision: 'verified' }) }); toast('Business verified.'); load(current); }
        catch (e) { toast(e.message, true); }
      }));
      list.querySelectorAll('[data-ab-unverify]').forEach(btn => btn.addEventListener('click', async () => {
        const note = prompt('Why is verification refused? The owner sees this note.') || '';
        try { await api('/api/admin/businesses/' + btn.dataset.abUnverify + '/verification', { method: 'PATCH', body: JSON.stringify({ decision: 'rejected', note }) }); toast('Verification refused.'); load(current); }
        catch (e) { toast(e.message, true); }
      }));
      list.querySelectorAll('[data-ab-docs]').forEach(btn => btn.addEventListener('click', async () => {
        const slot = document.getElementById('ab-docs-' + btn.dataset.abDocs);
        try {
          const d = await api('/api/admin/businesses/' + btn.dataset.abDocs + '/documents');
          slot.innerHTML = `<div class="job-gallery" style="margin-top:8px">${d.documents.map(doc => `<img src="${doc.image}" alt="${esc(doc.kind)} document">`).join('')}</div>`;
        } catch (e) { toast(e.message, true); }
      }));
    } catch (e) { list.innerHTML = errorHtml(e.message); }
  }
  let current = 'pending';
  document.getElementById('ab-filter').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-abstatus]');
    if (!chip) return;
    current = chip.dataset.abstatus;
    document.querySelectorAll('#ab-filter .chip').forEach(c => c.classList.toggle('active', c === chip));
    load(current);
  });
  load(current);
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
        ${job.delivery_status === 'active' ? `<a class="btn btn-sm btn-primary" href="#/job/${job.id}/track" style="margin-bottom:8px">${icon('pin')}Track delivery — live</a>` : ''}
        ${open ? `
        <div class="btn-row">
          <a class="btn btn-sm btn-outline" href="#/job/${job.id}/edit">${icon('edit')}Edit</a>
          <button class="btn btn-sm btn-primary" id="btn-complete">Mark completed</button>
          <button class="btn btn-sm btn-danger" id="btn-cancel">Cancel job</button>
        </div>` : `<p class="small muted" style="margin:8px 0 0">This job is ${job.status}.</p>`}
        ${!job.is_draft ? `<div class="btn-row" style="margin-top:8px"><button class="btn btn-sm btn-outline" id="btn-repost">↻ Repost this job</button></div>` : ''}
        ${job.active_ad || (job.status === 'open' && !job.is_draft) ? adPromoHtml(job.active_ad) : ''}
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
    const isDelivery = job.category === 'Delivery & Errands';
    const tracking = job.delivery_status || 'none';
    actionHtml = `<div class="card"><h3 style="margin-top:0">Your application</h3>
      <p>Status: <span class="badge badge-app-${s}">${esc(s)}</span></p>
      ${(s === 'pending' || s === 'shortlisted') ? `<button class="link-btn" id="btn-withdraw">Withdraw application</button>` : ''}
      ${s === 'shortlisted' ? `<p class="small muted" style="margin-bottom:0">⭐ You have been shortlisted for this job. The poster is seriously considering you, watch your <a href="#/messages" style="font-weight:700">messages</a>.</p>` : ''}
      ${s === 'accepted' ? `<p class="small muted" style="margin-bottom:0">You've been hired! The poster will message you in the app to arrange the details. Check your <a href="#/messages" style="font-weight:700">messages</a>.</p>` : ''}
    </div>`;
    if (s === 'accepted' && isDelivery) {
      if (tracking === 'active') {
        actionHtml += `
        <div class="card" style="border:2px solid var(--green,#16a34a);text-align:center" id="delivery-card">
          <h3 style="margin-top:0">${icon('pin')}Sharing live location</h3>
          <p class="small muted" id="delivery-status">The poster can see where you are. Keep this page open while you deliver.</p>
          <button class="btn btn-primary full" id="btn-delivered">${icon('check')}Mark as delivered</button>
        </div>`;
      } else if (tracking !== 'delivered') {
        actionHtml += `
        <div class="card" style="text-align:center" id="delivery-card">
          <h3 style="margin-top:0">${icon('truck')}Delivering this parcel?</h3>
          <p class="small muted">Once you collect the parcel, share your live location so the poster can follow the delivery.</p>
          <button class="btn btn-primary full" id="btn-collect">${icon('pin')}Parcel collected — share live location</button>
        </div>`;
      }
    }
  } else if (job.status === 'open') {
    const oriented = !!(currentUser && currentUser.orientation_accepted_at);
    const licenseOk = !job.requires_food_license || !!(currentUser && currentUser.food_license_valid);
    if (!oriented) {
      actionHtml = `
      <div class="card" style="text-align:center">
        <h3 style="margin-top:0">${icon('clipboard')}One quick step first</h3>
        <p class="small muted">Before you apply, complete a short orientation on the Worker Code of Conduct. It takes two minutes and you only do it once.</p>
        <button class="btn btn-primary full" id="btn-to-orientation">Start orientation</button>
      </div>`;
    } else if (!licenseOk) {
      actionHtml = `
      <div class="card" style="text-align:center">
        <h3 style="margin-top:0">${icon('utensils')}Food handler's license required</h3>
        <p class="small muted">This job needs a valid food handler's license. Upload yours under Profile and wait for approval, then come back and apply.</p>
        <a class="btn btn-primary full" href="#/profile/edit">Upload my license</a>
      </div>`;
    } else {
    actionHtml = `
      <div class="btn-row" style="margin-bottom:14px">
        <button class="btn btn-primary" id="btn-to-apply">${icon('send')}Apply for this job</button>
      </div>
      <div class="card" id="apply-card">
        <h3 style="margin-top:0">Apply for this job</h3>
        ${job.requires_food_license ? `<p class="small" style="margin-top:0"><span class="tbadge tb-food">${icon('utensils')}Food handler's license required</span></p>` : ''}
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
    }
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
    ${job.photos && job.photos.length ? `<img class="detail-photo" src="${esc(job.photos[0].url)}" alt="Photo of the job">` : ''}
    <div class="detail-hero detail-light">
      <div class="detail-top">
        <button class="icon-btn" id="d-back" aria-label="Back to jobs">${icon('back')}</button>
        <div class="detail-actions">
          <button class="icon-btn" data-share="${job.id}" data-title="${esc(job.title)}" aria-label="Share this job">${icon('share')}</button>
          <button class="icon-btn ${saved ? 'saved' : ''}" data-save="${job.id}" aria-label="Save this job" aria-pressed="${saved ? 'true' : 'false'}">${icon('heart')}</button>
        </div>
      </div>
      <span class="badge badge-cat">${esc(job.category)}</span>${job.is_urgent ? ' <span class="badge badge-urgent">Urgent</span>' : ''}
      <h1>${esc(job.title)}</h1>
      <div class="pay">${kwacha(job.pay_amount)}<small> ${esc(PAY_LABEL[job.pay_type] || '')}</small></div>
      <div class="detail-meta">
        <span>${icon('pin')}${esc(job.city)}${job.area && job.area.toLowerCase() !== String(job.city || '').toLowerCase() ? ' · ' + esc(job.area) : ''}${job.distance_km != null ? ` · ${esc(fmtKm(job.distance_km))} away` : ''}</span>
        <span>${icon('calendar')}${esc(fmtDate(job.date_needed))}</span>
        <span>${icon('clock')}Posted ${esc(relTime(job.created_at))}</span>
      </div>
    </div>
    <div class="page">
      ${job.photos && job.photos.length > 1 ? `<div class="job-gallery">${job.photos.slice(1).map(p => `<img src="${esc(p.url)}" alt="Photo of the job" loading="lazy">`).join('')}</div>` : ''}
      ${job.is_draft && isPoster ? `
      <div class="card" style="border:2px solid #b45309">
        <h3 style="margin-top:0">📝 This job is a draft</h3>
        <p class="small muted">Only you can see it. Finish any missing details, then publish it so workers can apply.</p>
        <div class="btn-row">
          <button class="btn btn-primary" id="btn-publish-draft">Publish this job</button>
          <a class="btn btn-outline" href="#/job/${job.id}/edit">Edit draft</a>
        </div>
      </div>` : ''}
      <div class="card">
        <h3 style="margin-top:0">About this job</h3>
        <p style="margin:0">${esc(job.description).replace(/\n/g, '<br>')}</p>
        <div class="detail-rows">
          <div class="drow"><span>${icon('tag')}Category</span><b>${esc(job.category)}</b></div>
          <div class="drow"><span>${icon('wallet')}Pay</span><b>${kwacha(job.pay_amount)} ${esc(PAY_LABEL[job.pay_type] || '')}</b></div>
          <div class="drow"><span>${icon('users')}Workers needed</span><b>${job.workers_needed}</b></div>
          <div class="drow"><span>${icon('calendar')}Start date</span><b>${esc(fmtDate(job.date_needed))}</b></div>
          ${job.start_time ? `<div class="drow"><span>${icon('clock')}Start time</span><b>${esc(job.start_time)}</b></div>` : ''}
          ${job.expected_duration ? `<div class="drow"><span>${icon('clock')}Expected duration</span><b>${esc(job.expected_duration)}</b></div>` : ''}
          <div class="drow"><span>${icon('check')}Materials provided</span><b>${job.materials_provided ? 'Yes' : 'No'}</b></div>
          <div class="drow"><span>${icon('truck')}Transport provided</span><b>${job.transport_provided ? 'Yes' : 'No'}</b></div>
        </div>
      </div>
      ${job.instructions ? `
      <div class="card">
        <h3 style="margin-top:0">Instructions for workers</h3>
        <p style="margin:0">${esc(job.instructions).replace(/\n/g, '<br>')}</p>
      </div>` : ''}
      <a class="card card-row" href="#/user/${job.poster.id}" style="text-decoration:none;color:inherit">
        ${avatarHtml(job.poster, 'md')}
        <div style="flex:1"><div class="small muted">Posted by</div>
          <b>${esc(job.poster.name)}</b> ${job.poster.verified ? '<span class="badge badge-verified">✓ Verified Poster</span>' : ''}
          <div>${stars(job.poster.rating_avg)} <span class="small muted">(${job.poster.rating_count} reviews)</span></div>
        </div>
        <span class="ico" style="color:var(--gray-soft)">${icon('chevR')}</span>
      </a>
      <span id="apply-anchor"></span>
      ${actionHtml}
      ${momoNoteHtml()}
      ${reviewHtml}
      ${currentUser && !isPoster ? `<div style="text-align:center;margin-top:6px"><button class="btn btn-sm btn-outline" id="report-job-btn">🚩 Report this job</button></div>` : ''}
    </div>
    ${!isPoster && currentUser && job.status === 'open' && !(job.my_application && job.my_application.status !== 'withdrawn') ? `<div class="sticky-cta"><button class="btn btn-primary" id="sticky-apply">Apply for This Job</button></div>` : ''}
  </div>`;

  document.getElementById('d-back').addEventListener('click', () => { location.hash = '#/jobs'; });
  const reportJobBtn = document.getElementById('report-job-btn');
  if (reportJobBtn) reportJobBtn.addEventListener('click', async () => {
    const reason = prompt('Why are you reporting this job? The PieceWork team will review.');
    if (!reason || !reason.trim()) return;
    reportJobBtn.disabled = true;
    try {
      await api('/api/reports', { method: 'POST', body: JSON.stringify({ target_type: 'job', target_id: job.id, reason: reason.trim() }) });
      toast('Thank you. The team will review this report.');
    } catch (e) { toast(e.message, true); reportJobBtn.disabled = false; }
  });
  const stickyApply = document.getElementById('sticky-apply');
  if (stickyApply) stickyApply.addEventListener('click', () => {
    const t = document.getElementById('apply-card') || document.getElementById('apply-anchor');
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const toApply = document.getElementById('btn-to-apply');
  if (toApply) toApply.addEventListener('click', () => {
    document.getElementById('apply-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const toOrientation = document.getElementById('btn-to-orientation');
  if (toOrientation) toOrientation.addEventListener('click', () => {
    sessionStorage.setItem('orientation_next', '#/job/' + id);
    location.hash = '#/orientation';
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
  // Delivery tracking: worker shares live GPS after collecting the parcel.
  const collectBtn = document.getElementById('btn-collect');
  if (collectBtn) collectBtn.addEventListener('click', async () => {
    collectBtn.disabled = true;
    try {
      await api(`/api/jobs/${id}/collect`, { method: 'POST' });
      toast('Parcel collected. Sharing your live location with the poster.');
      viewJobDetail(id); renderChrome();
    } catch (e) { toast(e.message, true); collectBtn.disabled = false; }
  });
  const deliveredBtn = document.getElementById('btn-delivered');
  if (deliveredBtn) {
    const statusEl = document.getElementById('delivery-status');
    startDeliverySharing(id, (when) => {
      if (statusEl) statusEl.textContent = `Sharing live location — last update ${when.toLocaleTimeString()}. Keep this page open while you deliver.`;
    });
    deliveredBtn.addEventListener('click', async () => {
      if (!confirm('Mark this delivery as delivered? Location sharing will stop.')) return;
      try {
        await api(`/api/jobs/${id}/delivered`, { method: 'POST' });
        stopDeliverySharing();
        toast('Delivered. Location sharing stopped.');
        viewJobDetail(id); renderChrome();
      } catch (e) { toast(e.message, true); }
    });
  }
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
  const publishBtn = document.getElementById('btn-publish-draft');
  if (publishBtn) publishBtn.addEventListener('click', async () => {
    publishBtn.disabled = true;
    try {
      await api(`/api/jobs/${id}/publish`, { method: 'POST', body: JSON.stringify({}) });
      toast('Job published! Workers can now apply.');
      viewJobDetail(id);
    } catch (e) {
      if (e.fields && e.fields.terms_accepted) {
        if (confirm('Publishing means you accept the Terms and Conditions. Continue?')) {
          try {
            await api(`/api/jobs/${id}/publish`, { method: 'POST', body: JSON.stringify({ terms_accepted: '1' }) });
            if (currentUser) currentUser.terms_accepted_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
            toast('Job published! Workers can now apply.');
            viewJobDetail(id);
            return;
          } catch (e2) { toast(e2.message, true); }
        }
      } else if (e.fields) {
        toast('Some details are missing. Opening the editor so you can finish them.', true);
        location.hash = '#/job/' + id + '/edit';
        return;
      } else {
        toast(e.message, true);
      }
      publishBtn.disabled = false;
    }
  });
  const repostBtn = document.getElementById('btn-repost');
  if (repostBtn) repostBtn.addEventListener('click', async () => {
    const suggested = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const date = prompt('Repost with a new date needed (YYYY-MM-DD):', suggested);
    if (!date) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) { toast('Use the date format YYYY-MM-DD.', true); return; }
    repostBtn.disabled = true;
    try {
      const r = await api(`/api/jobs/${id}/repost`, { method: 'POST', body: JSON.stringify({ date_needed: date.trim(), terms_accepted: '1' }) });
      toast('Job reposted as a fresh listing.');
      location.hash = '#/job/' + r.id;
    } catch (e) { toast(e.message, true); repostBtn.disabled = false; }
  });
  if (isPoster) wireAdPromo(document, 'job', job.id, () => viewJobDetail(id));
  document.querySelectorAll('[data-accept]').forEach(btn => btn.addEventListener('click', () => decideApplication(btn.dataset.accept, 'accepted')));
  document.querySelectorAll('[data-decline]').forEach(btn => btn.addEventListener('click', () => decideApplication(btn.dataset.decline, 'declined')));
  document.querySelectorAll('[data-shortlist]').forEach(btn => btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await api(`/api/applications/${btn.dataset.shortlist}`, { method: 'PATCH', body: JSON.stringify({ status: 'shortlisted' }) });
      toast('Shortlisted. This worker stays at the top of your list.');
      viewJobDetail(id);
    } catch (e) { toast(e.message, true); btn.disabled = false; }
  }));
  document.querySelectorAll('[data-unshortlist]').forEach(btn => btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await api(`/api/applications/${btn.dataset.unshortlist}`, { method: 'PATCH', body: JSON.stringify({ status: 'pending' }) });
      viewJobDetail(id);
    } catch (e) { toast(e.message, true); btn.disabled = false; }
  }));
  document.querySelectorAll('[data-msg]').forEach(btn => btn.addEventListener('click', () => openChat(id, btn.dataset.msg, btn)));
  document.querySelectorAll('[data-nrc]').forEach(btn => btn.addEventListener('click', () => viewNrc(btn.dataset.nrc, btn)));
  document.querySelectorAll('[data-arrival-ok]').forEach(btn => btn.addEventListener('click', () => decideArrival(btn.dataset.arrivalOk, true, btn)));
  document.querySelectorAll('[data-arrival-no]').forEach(btn => btn.addEventListener('click', () => decideArrival(btn.dataset.arrivalNo, false, btn)));
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
      ${(a.status === 'pending' || a.status === 'shortlisted') ? `<div class="btn-row">
        <button class="btn btn-sm btn-primary" data-accept="${a.id}">${icon('check')}Accept</button>
        ${a.status === 'pending'
          ? `<button class="btn btn-sm btn-outline" data-shortlist="${a.id}">⭐ Shortlist</button>`
          : `<button class="btn btn-sm btn-outline" data-unshortlist="${a.id}">↩ Move back to pending</button>`}
        <button class="btn btn-sm btn-danger" data-decline="${a.id}">Decline</button>
      </div>` : ''}
      ${(a.status === 'pending' || a.status === 'shortlisted' || a.status === 'accepted') ? `
      <div class="btn-row" style="margin-top:8px">
        <button class="btn btn-sm btn-outline" data-msg="${a.worker_id}">${icon('message')}Message</button>
        ${a.status === 'accepted' ? `<button class="btn btn-sm btn-outline" data-nrc="${a.id}">${icon('shield')}View NRC</button>` : ''}
        ${a.status === 'accepted' && a.worker_phone ? `<a class="btn btn-sm btn-outline" href="tel:${esc(String(a.worker_phone).replace(/\D/g, ''))}">${icon('phone')}Call worker</a>` : ''}
      </div>` : ''}
      ${a.status === 'accepted' ? `<div class="small" style="margin-top:6px">${a.arrival_confirmed_at
        ? `<b style="color:#166534">Job in progress since ${esc(fmtDateTime(a.arrival_confirmed_at))}</b>`
        : a.arrived_at
          ? `Worker says they've arrived (${esc(relTime(a.arrived_at))}).
             <div class="btn-row" style="margin-top:6px">
               <button class="btn btn-sm btn-primary" data-arrival-ok="${a.id}">${icon('check')}Confirm job started</button>
               <button class="btn btn-sm btn-outline" data-arrival-no="${a.id}">Not yet</button>
             </div>`
          : `<span class="muted">Worker has not arrived yet</span>`}</div>` : ''}
    </div>`;
  }

  async function decideApplication(appId, status) {
    const verb = status === 'accepted' ? 'Accept' : 'Decline';
    if (!confirm(`${verb} this applicant?`)) return;
    try {
      await api(`/api/applications/${appId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast(status === 'accepted' ? 'Worker hired! You can now see each other\'s numbers.' : 'Application declined.');
      viewJobDetail(id);
    } catch (e) { toast(e.message, true); }
  }

  async function decideArrival(appId, confirmed, btn) {
    const verb = confirmed ? 'Confirm the job has started?' : 'Mark as not arrived yet? The worker can tap "I\'ve arrived" again later.';
    if (!confirm(verb)) return;
    btn.disabled = true;
    try {
      await api(`/api/applications/${appId}/arrival-${confirmed ? 'confirm' : 'reject'}`, { method: 'POST' });
      toast(confirmed ? 'Job started!' : 'Noted. The worker can mark arrival again.');
      viewJobDetail(id);
    } catch (e) { toast(e.message, true); btn.disabled = false; }
  }

  /** Poster views the hired worker's NRC (auto-deletes after 10 days).
   * Protection pack (Oct 22, 2026): the photo is not fetched until the
   * poster taps Reveal (every fetch is logged server-side), it is shown
   * under a watermark naming the viewer, it hides itself after 30
   * seconds, and save gestures (long-press, right-click, drag) are
   * blocked as friction. Screenshots cannot be blocked in a web app;
   * the watermark makes any leaked copy name its source. */
  async function viewNrc(appId, btn) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:var(--card);color:var(--ink);border-radius:12px;max-width:560px;width:100%;overflow:hidden">
        <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center">
          <b>Worker NRC</b>
          <button class="btn btn-sm btn-outline" id="nrc-close">Close</button>
        </div>
        <div id="nrc-stage" style="padding:16px">
          <p class="small" style="margin-top:0">This is a private ID document, shared with you only because you hired this worker.</p>
          <p class="small muted">Every view is recorded with your name and the time. While you view it, the photo carries a watermark with your name, and it hides itself after 30 seconds.</p>
          <button class="btn btn-primary" id="nrc-reveal">Reveal NRC</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    let timer = null;
    let ticker = null;
    const cleanup = () => { if (timer) clearTimeout(timer); if (ticker) clearInterval(ticker); timer = null; ticker = null; };
    const close = () => { cleanup(); overlay.remove(); };
    overlay.querySelector('#nrc-close').addEventListener('click', close);
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
    overlay.addEventListener('contextmenu', (ev) => ev.preventDefault());

    overlay.querySelector('#nrc-reveal').addEventListener('click', async (ev) => {
      const revealBtn = ev.currentTarget;
      revealBtn.disabled = true;
      revealBtn.textContent = 'Loading…';
      try {
        const doc = await api(`/api/applications/${appId}/nrc`);
        const stage = overlay.querySelector('#nrc-stage');
        const wmText = `${currentUser.name} • ${currentUser.phone} • ${new Date().toLocaleDateString('en-GB')}`;
        const wmSpans = Array.from({ length: 8 }, () =>
          `<span style="display:block;white-space:nowrap;font-weight:800;font-size:17px;letter-spacing:.04em;color:rgba(255,255,255,.5);text-shadow:0 0 4px rgba(0,0,0,.65);padding:14px 0">${esc(wmText)}</span>`).join('');
        stage.innerHTML = `
          <div style="position:relative;overflow:hidden;border-radius:8px;-webkit-touch-callout:none;user-select:none">
            <img src="${doc.image}" alt="NRC" draggable="false" style="width:100%;display:block;pointer-events:none">
            <div style="position:absolute;inset:-30%;display:flex;flex-direction:column;justify-content:space-around;align-items:center;transform:rotate(-18deg);pointer-events:none">${wmSpans}</div>
          </div>
          <div class="small" style="padding-top:12px">
            ${doc.nrc_number ? `<div style="margin-bottom:8px"><b>NRC number:</b> ${esc(doc.nrc_number)}</div>` : ''}
            <a class="btn btn-sm btn-outline" href="https://www.zra.org.zm" target="_blank" rel="noopener">${icon('shield')}Verify on ZRA</a>
            <p class="small muted" style="margin:8px 0 0">On the ZRA site, open <b>Taxpayer Search</b> and enter the NRC number. If the name matches the card, the ID is genuine. No result only means they are not tax-registered, not that the ID is fake.</p>
            <p class="small muted" style="margin:8px 0 0">Uploaded ${esc(fmtDateTime(doc.uploaded_at))}. Deleted automatically on ${esc(fmtDate(doc.expires_at))}. Only you can see this. <b id="nrc-countdown">Hides in 30s.</b></p>
          </div>`;
        let left = 30;
        const cd = stage.querySelector('#nrc-countdown');
        ticker = setInterval(() => { left -= 1; if (cd) cd.textContent = `Hides in ${left}s.`; }, 1000);
        timer = setTimeout(() => {
          cleanup();
          stage.innerHTML = `
            <p class="small" style="margin-top:0">Hidden again to protect the worker's ID.</p>
            <button class="btn btn-primary" id="nrc-reveal-again">Reveal again</button>`;
          stage.querySelector('#nrc-reveal-again').addEventListener('click', () => { close(); viewNrc(appId, btn); });
        }, 30000);
      } catch (e) {
        toast(e.message, true);
        close();
      }
    });
  }
}

/** Poster (or worker) watches the live delivery on a map. */
async function viewTrackDelivery(id) {
  if (!requireAuth('#/job/' + id + '/track')) return;
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Live delivery</h1>
    <p class="page-sub"><a href="#/job/${id}">← Back to job</a><span id="track-status"></span></p>
    <div class="card" style="padding:8px">
      <div id="track-map" style="height:420px;border-radius:12px;z-index:0"></div>
    </div>
    <p class="small muted" id="track-note"></p>
  </div></div>`;
  const statusEl = document.getElementById('track-status');
  const noteEl = document.getElementById('track-note');
  async function leaflet() {
    if (window.L) return window.L;
    await new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    return window.L;
  }
  let map = null, marker = null, timer = null, L = null;
  async function refresh() {
    try {
      const t = await api(`/api/jobs/${id}/track`);
      if (t.status === 'none') {
        statusEl.innerHTML = ' · <b>No tracking yet</b>';
        noteEl.textContent = 'Tracking starts when the worker collects the parcel.';
        return;
      }
      if (t.status === 'delivered') {
        statusEl.innerHTML = ' · <b>Delivered</b>';
        noteEl.textContent = 'This delivery is complete. Location sharing has stopped.';
        if (timer) clearInterval(timer);
        return;
      }
      statusEl.innerHTML = ` · <b>Live</b>${t.updated_at ? ` — updated ${esc(fmtDateTime(t.updated_at))}` : ''}`;
      if (t.lat != null && t.lng != null && map) {
        const p = [t.lat, t.lng];
        if (!marker) { marker = L.marker(p).addTo(map); map.setView(p, 14); }
        else marker.setLatLng(p);
        noteEl.textContent = '';
      } else {
        noteEl.textContent = 'Waiting for the first location update from the worker…';
      }
    } catch (e) { noteEl.textContent = 'Could not load tracking: ' + e.message; }
  }
  try {
    L = await leaflet();
    map = L.map('track-map').setView([-15.3875, 28.3228], 12); // Lusaka default
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
  } catch (e) {
    noteEl.textContent = 'Could not load the map. Check your connection and try again.';
    return;
  }
  refresh();
  timer = setInterval(refresh, 15000);
  window.addEventListener('hashchange', () => clearInterval(timer), { once: true });
}

/** Post a job. */
const JOB_DURATIONS = ['A few hours', '1 day', '2-3 days', 'About a week', '2-4 weeks', '1 month or more'];

/**
 * 2.0 M1: photo picker wiring for the job form. Chosen files are sized
 * with the existing image pipeline and kept on form._photos (data URIs).
 * form._photos stays null when the picker was never touched, so edits
 * leave existing photos alone; an empty array means "remove all".
 */
function wireJobPhotos(form, existing) {
  form._photos = null;
  const input = document.getElementById('jf-photos');
  const box = document.getElementById('jf-photo-previews');
  if (!input || !box) return;
  const renderPreviews = (urls, note) => {
    box.innerHTML = (urls.length
      ? urls.map(u => `<img src="${u}" alt="Job photo" style="width:64px;height:64px;object-fit:cover;border-radius:10px">`).join('')
      : '') + (note ? `<div class="hint" style="align-self:center">${note}</div>` : '');
  };
  if (existing && existing.length) {
    renderPreviews(existing.map(p => p.url), 'Current photos. Picking new ones replaces all of them.');
    const rm = document.getElementById('jf-photos-remove');
    if (rm) rm.addEventListener('click', () => { form._photos = []; renderPreviews([], 'Photos will be removed when you save.'); rm.remove(); });
  }
  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []).slice(0, 3);
    if (!files.length) return;
    box.innerHTML = '<div class="hint">Preparing photos…</div>';
    try {
      const urls = [];
      for (const f of files) urls.push(await fileToDoc(f));
      form._photos = urls;
      renderPreviews(urls, urls.length + ' photo' + (urls.length === 1 ? '' : 's') + ' ready.');
    } catch (e) {
      box.innerHTML = '<div class="hint">Could not read those photos. Try different ones.</div>';
    }
    input.value = '';
  });
}

function jobFormHtml(prefill = {}, mode = 'post') {
  const today = new Date().toISOString().slice(0, 10);
  const isEdit = mode === 'edit';
  return `
  <form id="job-form" novalidate>
    <div class="jf-step"><span>1</span>Job details</div>
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
    <div class="jf-step"><span>2</span>Where and when</div>
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
    <div class="jf-step"><span>3</span>Pay and team</div>
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
      <label for="jf-photos">Photos <span class="hint-inline">(optional, up to 3)</span></label>
      <input type="file" id="jf-photos" accept="image/*" multiple>
      <div id="jf-photo-previews" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"></div>
      ${isEdit && prefill.photos && prefill.photos.length ? '<button type="button" class="link-btn" id="jf-photos-remove">Remove all photos</button>' : ''}
      <div class="hint">Jobs with photos get more and better applications.</div>
    </div>
    <div style="display:flex;gap:10px">
      <div class="field" style="flex:1">
        <label for="jf-duration">Expected duration</label>
        <select name="expected_duration" id="jf-duration">
          <option value="">Not sure yet</option>
          ${JOB_DURATIONS.map(d => `<option ${prefill.expected_duration === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="flex:1">
        <label for="jf-start">Start time</label>
        <input name="start_time" id="jf-start" maxlength="20" value="${esc(prefill.start_time || '')}" placeholder="e.g. 07:30">
      </div>
    </div>
    <div class="field">
      <label class="check-row" for="jf-transport">
        <input type="checkbox" name="transport_provided" id="jf-transport" value="1" ${prefill.transport_provided ? 'checked' : ''}>
        <span><b>Transport provided</b><br><span class="hint">You will transport workers to or from the job, or pay their transport.</span></span>
      </label>
      <label class="check-row" for="jf-materials">
        <input type="checkbox" name="materials_provided" id="jf-materials" value="1" ${prefill.materials_provided ? 'checked' : ''}>
        <span><b>Materials and tools provided</b><br><span class="hint">Workers do not need to bring their own materials or equipment.</span></span>
      </label>
      <label class="check-row" for="jf-urgent">
        <input type="checkbox" name="is_urgent" id="jf-urgent" value="1" ${prefill.is_urgent ? 'checked' : ''}>
        <span><b>Urgent</b><br><span class="hint">This job needs workers fast. It gets an Urgent badge.</span></span>
      </label>
    </div>
    <div class="jf-step"><span>4</span>Instructions and location</div>
    <div class="field">
      <label for="jf-instructions">Instructions for workers <span class="hint-inline">(optional)</span></label>
      <textarea name="instructions" id="jf-instructions" maxlength="1000" placeholder="e.g. Report to the security gate at 07:00 and ask for Mr Banda. Bring your own gloves.">${esc(prefill.instructions || '')}</textarea>
    </div>
    <div class="field">
      <label>Pinpoint location <span class="hint-inline">(optional)</span></label>
      <input type="hidden" name="lat" id="jf-lat" value="${esc(prefill.lat ?? '')}">
      <input type="hidden" name="lng" id="jf-lng" value="${esc(prefill.lng ?? '')}">
      <div class="hint" id="jf-loc-status">${prefill.lat != null ? '<b>Location pinned</b> — workers will see how many km away the job is.' : 'No GPS pinned — distance matching will use your city centre.'}</div>
      <button type="button" class="btn btn-sm btn-outline" id="btn-pin-loc" style="margin-top:8px">${icon('pin')}Pin my current location</button>
    </div>
    <div class="field">
      <label class="check-row" for="jf-foodlic">
        <input type="checkbox" name="requires_food_license" id="jf-foodlic" value="1" ${prefill.requires_food_license ? 'checked' : ''}>
        <span><b>Require a food handler's license</b><br><span class="hint">Only workers with a valid, PieceWork-verified food handler's license can apply. Use this for waiter, bartender, mixologist, cooking and catering jobs.</span></span>
      </label>
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
    <div class="form-actions">
      <button class="btn btn-primary" type="submit">${icon(isEdit ? 'check' : 'send')}${isEdit ? 'Save changes' : 'Post job'}</button>
      ${isEdit ? '' : '<button class="btn btn-outline" type="button" id="btn-save-draft">Save draft</button>'}
    </div>
  </form>`;
}

async function viewPost() {
  if (!requireAuth('#/post')) return;
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Post a Job</h1>
    <p class="page-sub">Have work that needs doing? Describe it here and nearby workers will apply. <b>Looking for work yourself?</b> Do not post here — <a href="#/profile">tick &ldquo;I&rsquo;m looking for work&rdquo; in your profile</a> instead.</p>
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
  wireJobPhotos(form, []);
  const collectJobData = () => {
    const data = Object.fromEntries(new FormData(form).entries());
    for (const k of ['transport_provided', 'materials_provided', 'is_urgent']) {
      data[k] = form[k] && form[k].checked ? '1' : '0';
    }
    if (form._photos) data.photos = form._photos;
    return data;
  };
  const draftBtn = document.getElementById('btn-save-draft');
  if (draftBtn) draftBtn.addEventListener('click', async () => {
    draftBtn.disabled = true;
    try {
      const data = collectJobData();
      data.draft = true;
      delete data.terms_accepted;
      await api('/api/jobs', { method: 'POST', body: JSON.stringify(data) });
      toast('Draft saved. Find it under My Gigs when you are ready.');
      location.hash = '#/dashboard';
    } catch (err2) {
      showFieldErrors(form, err2.fields);
      toast(err2.message, true);
      draftBtn.disabled = false;
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    const data = collectJobData();
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
  wireJobPhotos(form, job.photos || []);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    const data = Object.fromEntries(new FormData(form).entries());
    delete data.terms_accepted;
    data.requires_food_license = form.requires_food_license && form.requires_food_license.checked ? '1' : '0';
    for (const k of ['transport_provided', 'materials_provided', 'is_urgent']) {
      data[k] = form[k] && form[k].checked ? '1' : '0';
    }
    if (form._photos) data.photos = form._photos;
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
    <a class="card" href="#/selling" style="display:flex;align-items:center;gap:12px;color:var(--ink);margin-bottom:14px">
      <div class="safety-ico" style="width:42px;height:42px;border-radius:13px;background:var(--green-tint);color:var(--green);display:flex;align-items:center;justify-content:center">${icon('tag')}</div>
      <span style="flex:1"><b>Marketplace selling</b><span class="small muted" style="display:block" id="dash-sell-line">Your listings and offers</span></span>
      <span class="chev">${icon('chevR')}</span>
    </a>
    <div class="seg">
      <button id="seg-postings" class="active">My Postings</button>
      <button id="seg-gigs">Jobs I Applied To</button>
    </div>
    <div id="dash-body">${loadingHtml()}</div>
  </div></div>`;
  const body = document.getElementById('dash-body');
  const segP = document.getElementById('seg-postings');
  const segG = document.getElementById('seg-gigs');
  api('/api/selling/summary').then((s) => {
    const el = document.getElementById('dash-sell-line');
    if (el) el.textContent = `${s.active} active listings · ${s.offers_pending} offers waiting · ${s.sold} sold`;
  }).catch(() => {});

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
          <div style="padding:10px 0;border-top:1px solid var(--line)">
            <div class="split" style="align-items:center;margin-bottom:8px">
              <div><b>${esc(p.title)}</b></div>
              <div style="display:flex;gap:8px;align-items:center">
                <input type="file" id="nrc-file-${p.application_id}" accept="image/*" hidden>
                <button class="btn btn-sm btn-primary" id="nrc-btn-${p.application_id}">${icon('camera')}Upload NRC</button>
              </div>
            </div>
            <div class="field" style="margin-bottom:0">
              <label for="nrc-num-${p.application_id}">Your NRC number</label>
              <input id="nrc-num-${p.application_id}" inputmode="numeric" autocomplete="off" maxlength="11" placeholder="e.g. 123456/11/1">
              <div class="hint">Just type the 9 digits on your card. The slashes are added for you.</div>
            </div>
          </div>`).join('')}`;
      body.parentElement.insertBefore(banner, body);
      pending.forEach(p => {
        const btn = document.getElementById(`nrc-btn-${p.application_id}`);
        const fileInput = document.getElementById(`nrc-file-${p.application_id}`);
        const numInput = document.getElementById(`nrc-num-${p.application_id}`);
        // Auto-format: users type digits only (phone keypads have no slash key);
        // the slashes are inserted as 123456/11/1 while they type or paste.
        const fmtNrc = () => {
          const d = numInput.value.replace(/\D/g, '').slice(0, 9);
          let v = d;
          if (d.length > 6) v = d.slice(0, 6) + '/' + d.slice(6);
          if (d.length > 8) v = d.slice(0, 6) + '/' + d.slice(6, 8) + '/' + d.slice(8);
          numInput.value = v;
        };
        numInput.addEventListener('input', fmtNrc);
        btn.addEventListener('click', () => {
          fmtNrc();
          if (!/^\d{6}\/\d{2}\/\d$/.test(numInput.value.trim())) {
            toast('Enter your NRC number first, in the format 123456/11/1.', true);
            numInput.focus();
            return;
          }
          fileInput.click();
        });
        fileInput.addEventListener('change', async () => {
          const file = fileInput.files[0];
          if (!file) return;
          const nrcNumber = numInput.value.trim();
          btn.disabled = true;
          try {
            const raw = await fileToDoc(file);
            // The stored NRC itself is stamped CONFIDENTIAL before upload.
            const image = await stampConfidential(raw).catch(() => raw);
            await api(`/api/applications/${p.application_id}/nrc`, { method: 'POST', body: JSON.stringify({ image, nrc_number: nrcNumber }) });
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
      const drafts = mine.filter(j => j.is_draft);
      const live = mine.filter(j => !j.is_draft);
      const draftsHtml = drafts.length ? `
        <div class="section-title" style="margin-top:0"><span>📝 Drafts (${drafts.length})</span></div>
        <p class="small muted" style="margin-top:-4px">Drafts are only visible to you. Open one to finish it and publish.</p>
        ${drafts.map(jobCard).join('')}` : '';
      body.innerHTML = mine.length ? draftsHtml + (live.length ? dedupeJobs(live).map(jobCard).join('') : '')
        : emptyHtml('clipboard', 'No postings yet', 'Hire your first workers and find helping hands fast.', `<a class="btn btn-sm btn-primary" href="#/post">Hire workers</a>`);
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
            ${a.app_status === 'accepted' ? `<div class="btn-row" style="margin-top:8px">
              ${a.poster_phone ? `<a class="btn btn-sm btn-outline" href="tel:${esc(String(a.poster_phone).replace(/\D/g, ''))}">${icon('phone')}Call poster</a>` : ''}
              ${a.arrival_confirmed_at
                ? `<span class="badge" style="background:#DCFCE7;color:#166534">In progress since ${esc(fmtDateTime(a.arrival_confirmed_at))}</span>`
                : a.arrived_at
                  ? `<span class="badge" style="background:#FEF3C7;color:#92400E">Arrival sent — waiting for client</span>`
                  : `<button class="btn btn-sm btn-primary" data-arrive="${a.id}">${icon('pin')}I've arrived — start job</button>`}
            </div>` : ''}
          </div>
        </article>`).join('');
      body.querySelectorAll('[data-arrive]').forEach(b => b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const btn = ev.currentTarget;
        if (!confirm("Mark yourself as arrived? The client will confirm to start the job.")) return;
        btn.disabled = true;
        try {
          await api(`/api/applications/${btn.dataset.arrive}/arrive`, { method: 'POST' });
          toast('You have arrived — the job has begun!');
          showGigs();
        } catch (e) { toast(e.message, true); btn.disabled = false; }
      }));
    } catch (e) { body.innerHTML = emptyHtml('info', 'Could not load', e.message); }
  }
  segP.addEventListener('click', showPostings);
  segG.addEventListener('click', showGigs);
  showPostings();
}

/* ---------------- Web Push notifications ----------------
 * The server sends the same events as the SMS texts (offers, applications,
 * acceptances) to subscribed browsers. Opt-in lives on My Profile; the
 * subscription belongs to this browser, so turning it off here only
 * affects this device. */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
async function postPushSubscribe(sub) {
  await api('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
  });
}
/** Silently re-register the existing subscription when permission is
 * already granted. Never creates one: an explicit Off must stay off. */
async function syncPushSubscription() {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const sub = await currentPushSubscription().catch(() => null);
  if (sub) { try { await postPushSubscribe(sub); } catch { /* offline etc. */ } }
}
async function refreshPushRow(stateEl) {
  if (!stateEl) return;
  if (!pushSupported()) { stateEl.textContent = 'Not supported'; return; }
  if (Notification.permission === 'denied') { stateEl.textContent = 'Blocked by browser'; return; }
  const sub = await currentPushSubscription().catch(() => null);
  stateEl.textContent = sub ? 'On' : 'Off';
}
async function togglePush(stateEl) {
  if (!pushSupported()) { toast('Push notifications are not supported in this browser.', true); return; }
  if (Notification.permission === 'denied') {
    toast('Notifications are blocked by your browser. Allow them in the browser settings, then try again.', true);
    return;
  }
  try {
    const existing = await currentPushSubscription();
    if (existing) {
      const endpoint = existing.endpoint;
      try { await existing.unsubscribe(); } catch { /* already gone */ }
      try {
        await api('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) });
      } catch { /* server copy expires via 410 pruning if unreachable */ }
      toast('Notifications off on this device.');
    } else {
      const { publicKey } = await api('/api/push/public-key');
      if (!publicKey) { toast('Notifications are not available yet.'); return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('Permission was not granted, so notifications stay off.', true); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await postPushSubscribe(sub);
      toast('Notifications on: offers, applications and results will reach this device.');
    }
  } catch (e) {
    toast(e.message || 'Could not change notification settings.', true);
  }
  refreshPushRow(stateEl);
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
      ${currentUser.selfie_status === 'approved' ? '<div style="margin-top:6px"><span class="badge badge-verified">✓ Verified Member</span></div>' : ''}
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><a class="btn btn-sm btn-primary" href="#/user/${currentUser.id}">${icon('eye')}View public profile</a><button class="btn btn-sm btn-outline" id="pf-share">${icon('share')}Share my profile</button></div>
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
        <a href="#/dashboard">${icon('clipboard')}<span>My Jobs</span><span class="chev">${icon('chevR')}</span></a>
        <a href="#/selling">${icon('tag')}<span>My Products</span><span class="chev">${icon('chevR')}</span></a>
        <a href="#/business/mine">${icon('grid')}<span>My Business Store</span><span class="chev">${icon('chevR')}</span></a>
        <a href="#/saved">${icon('heart')}<span>Saved Items</span><span class="chev">${icon('chevR')}</span></a>
        <a href="#/invite">${icon('sparkles')}<span>Win cash — invite friends</span><span class="chev">${icon('chevR')}</span></a>
        <a href="#/how">${icon('help')}<span>Help &amp; support</span><span class="chev">${icon('chevR')}</span></a>
        <a href="#/terms">${icon('shield')}<span>Terms and conditions</span><span class="chev">${icon('chevR')}</span></a>
        <button id="pf-push">${icon('bell')}<span>Notifications</span><span class="small muted" id="pf-push-state" style="margin-left:auto">Off</span></button>
        <button id="pf-logout">${icon('logout')}<span>Sign out</span></button>
      </div>
    </div>
  </div>`;

  document.getElementById('pf-edit').addEventListener('click', () => { location.hash = '#/profile/edit'; });
  document.getElementById('pf-share').addEventListener('click', () => shareProfile(currentUser.id, currentUser.name));
  document.getElementById('pf-logout').addEventListener('click', logout);
  const pushBtn = document.getElementById('pf-push');
  const pushState = document.getElementById('pf-push-state');
  if (pushBtn && pushState) {
    refreshPushRow(pushState);
    // Permission already granted in a past visit: quietly re-register the
    // existing subscription (the account on this device may have changed).
    syncPushSubscription().then(() => refreshPushRow(pushState)).catch(() => {});
    pushBtn.addEventListener('click', () => togglePush(pushState));
  }
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
    const [{ user, completed_jobs, reviews }, stats] = await Promise.all([
      api('/api/users/' + currentUser.id),
      api('/api/users/me/stats').catch(() => null),
    ]);
    statsEl.innerHTML = `
      <div><strong>${stats ? stats.jobs_completed : completed_jobs}</strong><span>Jobs Completed</span></div>
      <div><strong>${stats ? stats.items_sold : 0}</strong><span>Items Sold</span></div>
      <div><strong>${stats ? stats.rating_count : reviews.length}</strong><span>Reviews</span></div>`;
    const skills = (user.skills || '').split(',').map(s => s.trim()).filter(Boolean);
    paneO.innerHTML = `
      ${trustBadgesHtml(user.badges, user.vouch_count)}
      ${user.bio ? `<p style="margin-top:12px">${esc(user.bio)}</p>` : `<p class="small muted" style="margin-top:12px">No bio yet — <a href="#/profile/edit"><b>tell people who you are</b></a>.</p>`}
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
    <div class="card" style="text-align:center">
      <div id="iv-preview"></div>
      <input type="file" id="iv-file" accept="video/*" hidden>
      <div>
        <button type="button" class="btn btn-sm btn-outline" id="iv-btn" style="margin-top:12px">${icon('camera')}Add intro video</button>
        <button type="button" class="btn btn-sm btn-outline" id="iv-remove" style="margin-top:12px;margin-left:8px" hidden>Remove</button>
      </div>
      <div class="hint" style="margin-top:8px">10 seconds max. Say your name, what you do, and why someone should hire you. Posters trust a face they have seen.</div>
    </div>
    <div class="card">
      <h3 style="margin-top:0">${icon('utensils')}Food handler's license</h3>
      <p class="small muted" style="margin-top:0">Do waiter, bartender, mixologist or catering work? Upload your council food handler's license. Our team reviews it (and may phone the council to confirm) before approval. Only approved licenses unlock hospitality jobs that require one.</p>
      <div id="fl-status"></div>
      <div id="fl-preview" style="margin-bottom:8px"></div>
      <input type="file" id="fl-file" accept="image/*" hidden>
      <button type="button" class="btn btn-sm btn-outline" id="fl-btn">${icon('camera')}Upload license photo</button>
      <div class="field" style="margin-top:12px"><label for="fl-number">License number</label><input id="fl-number" maxlength="60" placeholder="e.g. LCC/FH/2026/12345"></div>
      <div class="field"><label for="fl-exp">Expiry date</label><input id="fl-exp" type="date"></div>
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

  // Intro video: load existing, add/replace, or remove.
  let ivState = 'unchanged'; // unchanged | changed | removed
  let newIntroVideo = null;
  const ivPreview = document.getElementById('iv-preview');
  const ivFile = document.getElementById('iv-file');
  const ivBtn = document.getElementById('iv-btn');
  const ivRemove = document.getElementById('iv-remove');
  const renderIvPreview = (src) => {
    if (src) {
      ivPreview.innerHTML = `<video src="${src}" controls playsinline preload="metadata" style="width:100%;max-height:300px;border-radius:12px;background:#000"></video>`;
      ivBtn.innerHTML = `${icon('camera')}Replace video`;
      ivRemove.hidden = false;
    } else {
      ivPreview.innerHTML = '';
      ivBtn.innerHTML = `${icon('camera')}Add intro video`;
      ivRemove.hidden = true;
    }
  };
  api('/api/users/' + currentUser.id).then(({ user }) => {
    if (user && user.intro_video) renderIvPreview(user.intro_video);
  }).catch(() => {});
  ivBtn.addEventListener('click', () => ivFile.click());
  ivFile.addEventListener('change', async () => {
    const file = ivFile.files[0];
    if (!file) return;
    try {
      newIntroVideo = await fileToIntroVideo(file);
      ivState = 'changed';
      renderIvPreview(newIntroVideo);
      toast('Video ready — tap Save changes to keep it.');
    } catch (e) { toast(e.message, true); }
    ivFile.value = '';
  });
  ivRemove.addEventListener('click', () => {
    ivState = 'removed';
    newIntroVideo = null;
    renderIvPreview(null);
  });

  // Food handler's license: photo + number + expiry, goes to team review.
  let newFoodLicenseImage = null;
  let flInitNumber = '', flInitExp = '';
  const flStatus = document.getElementById('fl-status');
  const flPreview = document.getElementById('fl-preview');
  const flFile = document.getElementById('fl-file');
  const flNumber = document.getElementById('fl-number');
  const flExp = document.getElementById('fl-exp');
  const FL_LABEL = { none: 'No license on file.', pending: 'Under review by the PieceWork team.', approved: 'Approved.', rejected: 'Not approved — please upload a clear photo of a valid license.' };
  api('/api/users/' + currentUser.id).then(({ user }) => {
    const fl = user && user.food_license;
    if (!fl) return;
    flStatus.innerHTML = `<p class="small"><b>Status:</b> ${esc(FL_LABEL[fl.status] || fl.status)}${fl.expires_at ? ` · expires ${esc(fl.expires_at)}` : ''}</p>`;
    if (fl.number) { flNumber.value = fl.number; flInitNumber = fl.number; }
    if (fl.expires_at) { flExp.value = fl.expires_at; flInitExp = fl.expires_at; }
    if (fl.image) flPreview.innerHTML = `<img src="${fl.image}" alt="Food handler's license" style="width:100%;border-radius:12px">`;
  }).catch(() => {});
  document.getElementById('fl-btn').addEventListener('click', () => flFile.click());
  flFile.addEventListener('change', async () => {
    const file = flFile.files[0];
    if (!file) return;
    try {
      newFoodLicenseImage = await fileToSizedImage(file, 1024, false);
      flPreview.innerHTML = `<img src="${newFoodLicenseImage}" alt="Food handler's license" style="width:100%;border-radius:12px">`;
      toast('License photo ready — tap Save changes to submit it for review.');
    } catch (e) { toast(e.message, true); }
    flFile.value = '';
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
    if (ivState !== 'unchanged') payload.intro_video = ivState === 'removed' ? '' : newIntroVideo;
    if (newFoodLicenseImage || flNumber.value.trim() !== flInitNumber || flExp.value !== flInitExp) {
      payload.food_license_image = newFoodLicenseImage || '';
      payload.food_license_number = flNumber.value.trim();
      payload.food_license_expires_at = flExp.value;
    }
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

/** Read a short intro video as a data URL. Rejects clips over ~12 seconds or 6MB. */
function fileToIntroVideo(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('video/')) return reject(new Error('Please choose a video file.'));
    if (file.size > 6 * 1024 * 1024) return reject(new Error('That video is too large. Record a 10-second clip.'));
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (v.duration && v.duration > 12) {
        return reject(new Error('Keep it to 10 seconds — that clip is ' + Math.round(v.duration) + 's.'));
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read that video.'));
      reader.readAsDataURL(file);
    };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that video.')); };
    v.src = url;
  });
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

/**
 * Burn a CONFIDENTIAL mark into an ID photo before it is uploaded, so the
 * stored copy itself carries the mark (Oct 22, 2026). Diagonal repeated
 * text plus a footer line with the platform name and upload date. Kept
 * light enough that the card stays readable for verification. If stamping
 * fails on an unusual phone, the caller falls back to the plain photo so
 * a hire is never blocked by the stamp.
 */
function stampConfidential(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const diag = Math.sqrt((img.width ** 2) + (img.height ** 2));
        const fontSize = Math.max(28, Math.round(img.width / 11));
        ctx.save();
        ctx.translate(img.width / 2, img.height / 2);
        ctx.rotate(-Math.atan2(img.height, img.width));
        ctx.font = `800 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const stepY = fontSize * 2.8;
        for (let y = -diag / 2; y <= diag / 2; y += stepY) {
          ctx.fillStyle = 'rgba(0,0,0,0.16)';
          ctx.fillText('CONFIDENTIAL', 2, y + 2);
          ctx.fillStyle = 'rgba(255,255,255,0.34)';
          ctx.fillText('CONFIDENTIAL', 0, y);
        }
        ctx.restore();
        const foot = `CONFIDENTIAL • PieceWork Zambia • ${new Date().toLocaleDateString('en-GB')}`;
        const fSize = Math.max(13, Math.round(img.width / 46));
        ctx.font = `700 ${fSize}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillText(foot, 11, img.height - 15);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(foot, 10, img.height - 16);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('Could not stamp that image.'));
    img.src = dataUrl;
  });
}

/** Public profile. */
async function viewUser(id) {
  app.innerHTML = loadingHtml('Loading profile…');
  try {
    const { user, completed_jobs, reviews, vouched_by, viewer_vouched, stats } = await api('/api/users/' + id);
    const skills = (user.skills || '').split(',').map(s => s.trim()).filter(Boolean);
    const isSelf = currentUser && currentUser.id === user.id;
    const canVouch = currentUser && !isSelf && currentUser.selfie_status === 'approved';
    const firstName = esc(String(user.name || '').split(' ')[0]);
    app.innerHTML = `
    <div class="view">
      <div class="profile-hero">
        ${avatarHtml(user, 'lg')}
        <h2>${esc(user.name)}</h2>
        <div class="sub">${esc(user.city)} · ${stars(user.rating_avg)} (${user.rating_count} reviews)</div>
        ${trustBadgesHtml(user.badges, user.vouch_count)}
        <div style="margin-top:12px"><button class="btn btn-sm btn-outline" id="share-profile-btn">${icon('share')}Share profile</button></div>
      </div>
      ${user.intro_video ? `
      <div class="page" style="padding-top:0">
        <div class="card" style="padding:8px">
          <video src="${user.intro_video}" controls playsinline preload="metadata" style="width:100%;border-radius:12px;max-height:440px;background:#000"></video>
        </div>
      </div>` : ''}
      <div class="profile-stats">
        <div><strong>${completed_jobs}</strong><span>Jobs completed</span></div>
        <div><strong>${stats ? stats.items_sold : 0}</strong><span>Items sold</span></div>
        <div><strong>${user.rating_avg ? Number(user.rating_avg).toFixed(1) : '–'}</strong><span>Avg rating</span></div>
        <div><strong>${reviews.length}</strong><span>Reviews</span></div>
      </div>
      <div class="page">
        <div class="card">
          ${user.bio ? `<p style="margin-top:0">${esc(user.bio)}</p>` : `<p class="small muted" style="margin-top:0">No bio yet.</p>`}
          ${skills.length ? `<div class="tagrow" style="margin:0 0 4px">${skills.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div>` : ''}
          <ul class="detail-list" style="margin-bottom:0">
            ${isSelf && user.phone ? `<li>${icon('phone')}<div><b>${esc(user.phone)}</b><br><span class="small muted">Phone</span></div></li>` : ''}
            <li>${icon('pin')}<div><b>${esc(user.city)}</b><br><span class="small muted">City</span></div></li>
          </ul>
          ${isSelf ? `<div style="margin-top:12px"><a class="btn btn-sm btn-outline" href="#/profile/edit">${icon('edit')}Edit my profile</a></div>` : ''}
        </div>
        ${!isSelf && currentUser ? `
        <div class="card hire-cta">
          <h3 style="margin-top:0">Hire ${firstName}</h3>
          <p class="small muted" style="margin-top:0">${user.open_to_work ? `${firstName} is open to work in ${esc(user.city)}.` : `Post a job and ${firstName} can apply with one tap.`} PieceWork hiring runs through job posts, so your agreement stays on the record.</p>
          <a class="btn btn-primary" href="#/post">${icon('plus')}Post a Job</a>
        </div>` : ''}
        ${!isSelf && currentUser ? `
        <div class="card">
          <h3 style="margin-top:0">${icon('users')} Vouch for ${firstName}</h3>
          <p class="small muted" style="margin-top:0">Know ${firstName} in real life? Your vouch tells posters this person can be trusted. Only vouch for people you personally know.</p>
          ${viewer_vouched
            ? `<button class="btn btn-sm btn-outline" id="unvouch-btn">${icon('check')}You vouched — tap to remove</button>`
            : canVouch
              ? `<button class="btn btn-sm btn-primary" id="vouch-btn">${icon('users')}Vouch for ${firstName}</button>`
              : `<p class="small muted" style="margin-bottom:0">Get your own selfie verified to vouch for others.</p>`}
        </div>` : ''}
        ${!isSelf && currentUser ? `
        <div class="card">
          <h3 style="margin-top:0">Safety</h3>
          <p class="small muted" style="margin-top:0">Something wrong with this person? Report them to the PieceWork team, or block them so you cannot message or work with each other.</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-sm btn-outline" id="report-user-btn">🚩 Report ${firstName}</button>
            <button class="btn btn-sm btn-outline" id="block-user-btn">🚫 Block ${firstName}</button>
          </div>
        </div>` : ''}
        ${user.vouch_count ? `
        <div class="card">
          <h3 style="margin-top:0">Vouched by ${user.vouch_count}</h3>
          <p class="small" style="margin-bottom:0">${vouched_by.map(n => `<b>${esc(n)}</b>`).join(' · ')}</p>
        </div>` : ''}
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
    const shareProfileBtn = document.getElementById('share-profile-btn');
    if (shareProfileBtn) shareProfileBtn.addEventListener('click', () => shareProfile(user.id, user.name));
    const vouchBtn = document.getElementById('vouch-btn');
    if (vouchBtn) vouchBtn.addEventListener('click', async () => {
      vouchBtn.disabled = true;
      try {
        await api('/api/vouches', { method: 'POST', body: JSON.stringify({ user_id: user.id }) });
        toast('You vouched for ' + user.name + '.');
        viewUser(id);
      } catch (e) { toast(e.message, true); vouchBtn.disabled = false; }
    });
    const unvouchBtn = document.getElementById('unvouch-btn');
    if (unvouchBtn) unvouchBtn.addEventListener('click', async () => {
      unvouchBtn.disabled = true;
      try {
        await api('/api/vouches/' + user.id, { method: 'DELETE' });
        toast('Vouch removed.');
        viewUser(id);
      } catch (e) { toast(e.message, true); unvouchBtn.disabled = false; }
    });
    const reportUserBtn = document.getElementById('report-user-btn');
    if (reportUserBtn) reportUserBtn.addEventListener('click', async () => {
      const reason = prompt('Why are you reporting ' + user.name + '? The PieceWork team will review.');
      if (!reason || !reason.trim()) return;
      reportUserBtn.disabled = true;
      try {
        await api('/api/reports', { method: 'POST', body: JSON.stringify({ target_type: 'user', target_id: user.id, reason: reason.trim() }) });
        toast('Thank you. The team will review this report.');
      } catch (e) { toast(e.message, true); reportUserBtn.disabled = false; }
    });
    const blockUserBtn = document.getElementById('block-user-btn');
    if (blockUserBtn) {
      let blockedNow = false;
      api('/api/blocks').then((d) => {
        blockedNow = (d.blocked || []).some((b) => b.id === user.id);
        blockUserBtn.textContent = blockedNow ? '✅ Unblock ' + String(user.name || '').split(' ')[0] : '🚫 Block ' + String(user.name || '').split(' ')[0];
      }).catch(() => {});
      blockUserBtn.addEventListener('click', async () => {
        blockUserBtn.disabled = true;
        try {
          if (blockedNow) {
            await api('/api/blocks/' + user.id, { method: 'DELETE' });
            toast('Unblocked. You can message and work with each other again.');
          } else {
            await api('/api/blocks/' + user.id, { method: 'POST', body: JSON.stringify({}) });
            toast('Blocked. You will not be able to message or work with each other.');
          }
          viewUser(id);
        } catch (e) { toast(e.message, true); blockUserBtn.disabled = false; }
      });
    }
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
      <img src="/img/landing/zambia-man.jpg" alt="A Zambian worker" loading="lazy">
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
    <h1 class="page-title">Saved</h1>
    <p class="page-sub">Jobs and items you saved for later, kept on this device.</p>
    <div class="section-title"><span>Saved jobs</span></div>
    <div id="saved-list">${loadingHtml()}</div>
    <div class="section-title"><span>Saved items</span></div>
    <div id="saved-products">${loadingHtml()}</div>
  </div></div>`;
  const box = document.getElementById('saved-list');
  if (!ids.length) {
    box.innerHTML = emptyHtml('heart', 'No saved jobs yet', 'Tap the heart on any job to keep it here.', `<a class="btn btn-sm btn-primary" href="#/jobs">Browse jobs</a>`);
  } else try {
    const jobs = (await Promise.all(
      ids.map(jid => api('/api/jobs/' + jid).then(d => d.job).catch(() => null))
    )).filter(Boolean);
    box.innerHTML = jobs.length
      ? jobs.map(jobCard).join('')
      : emptyHtml('bookmark', 'Nothing here', 'Those jobs are no longer available.', `<a class="btn btn-sm btn-primary" href="#/jobs">Browse jobs</a>`);
  } catch (e) {
    box.innerHTML = errorHtml(e.message);
  }
  const pbox = document.getElementById('saved-products');
  const pids = getSavedProducts();
  if (!pids.length) {
    pbox.innerHTML = emptyHtml('heart', 'No saved items yet', 'Tap the heart on any marketplace item to keep it here.', `<a class="btn btn-sm btn-primary" href="#/market">Open the Marketplace</a>`);
  } else if (!currentUser) {
    pbox.innerHTML = emptyHtml('heart', 'Sign in to view saved items', 'Your saved items are on this device. Sign in to open them.', `<a class="btn btn-sm btn-primary" href="#/login">Sign in</a>`);
  } else {
    try {
      const items = (await Promise.all(
        pids.map(pid => api('/api/products/' + pid).then(d => d.product).catch(() => null))
      )).filter(Boolean);
      pbox.innerHTML = items.length
        ? `<div class="product-grid">${items.map(productCard).join('')}</div>`
        : emptyHtml('heart', 'Nothing here', 'Those items are no longer available.', `<a class="btn btn-sm btn-primary" href="#/market">Open the Marketplace</a>`);
    } catch (e) {
      pbox.innerHTML = errorHtml(e.message);
    }
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
    <div class="searchbar" style="margin-bottom:10px">${icon('search')}<input id="conv-q" type="search" placeholder="Search messages" aria-label="Search conversations"></div>
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
    const renderConvs = (rows) => {
      list.innerHTML = rows.length ? rows.map(c => `
      <a class="conv-card" href="#/chat/${c.id}">
        ${avatarHtml({ name: c.other_name, avatar: c.other_avatar }, 'md')}
        <div class="conv-body">
          <div class="conv-top"><b>${esc(c.other_name)}</b><span class="small muted">${esc(relTime(c.last_at))}</span></div>
          <div class="small muted">${c.kind === 'product' ? '🛒 ' : ''}${esc(c.job_title)}</div>
          ${presenceHtml(c) ? `<div class="small" style="margin-top:2px">${presenceHtml(c)}</div>` : ''}
          <div class="conv-preview">${c.last_body ? esc(c.last_body) : '<span class="small muted">Say hello…</span>'}</div>
        </div>
        ${c.unread ? `<span class="conv-unread">${c.unread}</span>` : ''}
      </a>`).join('') : '<p class="small muted" style="text-align:center;margin-top:16px">No conversations match your search.</p>';
    };
    renderConvs(conversations);
    const convQ = document.getElementById('conv-q');
    if (convQ) convQ.addEventListener('input', () => {
      const q = convQ.value.trim().toLowerCase();
      renderConvs(q ? conversations.filter(c => (c.other_name + ' ' + (c.job_title || '') + ' ' + (c.last_body || '')).toLowerCase().includes(q)) : conversations);
    });
  } catch (e) {
    list.innerHTML = errorHtml(e.message);
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
      peerEl.style.display = 'flex'; peerEl.style.alignItems = 'center';
      peerEl.innerHTML = `
        <a href="#/user/${conversation.other_id}" style="display:flex;align-items:center;gap:10px;min-width:0;flex:1">
          ${avatarHtml({ name: conversation.other_name, avatar: conversation.other_avatar }, 'sm')}
          <span style="min-width:0"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(conversation.other_name)}</b>
          <span class="small muted" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${conversation.kind === 'product' ? '🛒 ' : ''}${esc(conversation.job_title)}</span>
          ${presenceHtml(conversation) ? `<span class="small" style="display:block">${presenceHtml(conversation)}</span>` : ''}</span>
        </a>
        ${conversation.other_phone ? `<a class="icon-btn" href="tel:${esc(String(conversation.other_phone).replace(/\D/g, ''))}" aria-label="Call ${esc(conversation.other_name)}">${icon('phone')}</a>` : ''}`;
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
  wirePasswordEyes(app);
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
  wirePasswordEyes(app);
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
  wirePasswordEyes(app);
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
      <img class="bg" src="/img/landing/cleaner-pro.jpg" alt="A PieceWork cleaning professional" fetchpriority="high">
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <span class="kicker">Zambia's piece-work marketplace</span>
        <h1>Quick jobs.<br><span class="hl">Quick cash.</span></h1>
        <p>Need a quick gig done today? Post it in minutes and hire helping hands near you. Looking for work? Find piece work and get paid by mobile money — as soon as the job is done.</p>
        <div class="hero-ctas">
          <a class="btn btn-primary" href="#/jobs">${icon('search')}Find work</a>
          <a class="btn btn-outline" href="#/post">${icon('plus')}Hire workers</a>
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
          <a class="btn btn-sm btn-outline" href="#/post">Hire workers</a>
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
/** Worker Code of Conduct — orientation every worker completes before applying. */
const ORIENTATION_SECTIONS = [
  { t: 'Show up', b: 'Arrive on time, every time. When you accept a job, someone is counting on you. Running late? Message the poster in the app immediately. No-shows with no warning damage your rating and can get your account suspended.' },
  { t: 'Do the work properly', b: 'Do what was agreed, the way it was described in the job. If you are unsure about something, ask before guessing. Leave the place as you found it, or better.' },
  { t: 'Be honest', b: 'Only apply for work you can actually do. Never take anything that is not yours. Never lie about your skills or experience. Dishonesty ends your time on PieceWork.' },
  { t: 'Respect people and property', b: 'Treat the poster, their family, their staff and their property with respect. No shouting, no insults, no harassment of any kind — in person or in messages.' },
  { t: 'Stay safe', b: 'Do not take risks with your body to finish a job. If the work looks dangerous, or is very different from what was described, stop and report it in the app.' },
  { t: 'Money', b: 'The pay shown on the job is the pay. Do not demand more money once you arrive. Payment happens between you and the poster exactly as agreed.' },
  { t: 'Your rating is your future', b: 'After every job, posters rate you. High ratings bring more work and better pay. Low ratings and complaints push you down the list where nobody hires.' },
  { t: 'One person, one account', b: 'One account per person. Fake or duplicate accounts are removed, together with any giveaway entries tied to them.' },
  { t: 'If something goes wrong', b: 'Talk it through in the app messages first — most problems are misunderstandings. If you cannot resolve it, report the job and the PieceWork team will step in.' },
];

/** Orientation: read the Code of Conduct, agree, then you can apply for jobs. */
async function viewOrientation() {
  if (!requireAuth('#/orientation')) return;
  const next = sessionStorage.getItem('orientation_next') || '#/dashboard';
  if (currentUser && currentUser.orientation_accepted_at) { location.hash = next; return; }
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Worker orientation</h1>
    <p class="page-sub">Read this short code of conduct. You only do it once — then you can apply for any job on PieceWork.</p>
    ${ORIENTATION_SECTIONS.map((s, i) => `
      <div class="card">
        <h3 style="margin:0 0 6px"><span class="tbadge tb-verified" style="margin-right:8px">${i + 1}</span>${esc(s.t)}</h3>
        <p class="small" style="margin:0">${esc(s.b)}</p>
      </div>`).join('')}
    <div class="card">
      <label class="check-row" for="or-agree">
        <input type="checkbox" id="or-agree">
        <span><b>I have read the Worker Code of Conduct and I agree to follow it.</b></span>
      </label>
      <button class="btn btn-primary full" id="or-done" disabled style="margin-top:12px">${icon('check')}Complete orientation</button>
    </div>
  </div></div>`;
  const agree = document.getElementById('or-agree');
  const done = document.getElementById('or-done');
  agree.addEventListener('change', () => { done.disabled = !agree.checked; });
  done.addEventListener('click', async () => {
    done.disabled = true;
    try {
      await api('/api/users/me', { method: 'PATCH', body: JSON.stringify({ orientation_accepted: true }) });
      await refreshMe();
      sessionStorage.removeItem('orientation_next');
      toast('Orientation complete. You can now apply for jobs.');
      location.hash = next;
    } catch (e) { toast(e.message, true); done.disabled = false; }
  });
}

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
      <div class="card"><div class="step-n">1</div><div><h4>Hire workers (or find work)</h4><p>Need hands for an event, a move, cleaning or building? Post the job with the pay in Kwacha. Looking for work? Browse jobs near you.</p></div></div>
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
        <a class="btn btn-outline" href="#/admin/verifications" id="btn-selfie-review">🪪 Selfie review</a>
        <a class="btn btn-outline" href="#/admin/food-licenses" id="btn-food-review">🍽️ Food licenses</a>
        <a class="btn btn-outline" href="#/admin/resets">🔑 Password resets</a>
      </div>
    </div></div>`;
    badgeSelfieCount();
    badgeFoodLicenseCount();
    return;
  }
  app.innerHTML = `
  <div class="view"><div class="page">
    <div id="admin-body">${loadingHtml('Loading stats…')}</div>
    <div id="nrc-views-body" style="margin-top:14px"></div>
  </div></div>`;
  badgeSelfieCount();
  badgeFoodLicenseCount();
  loadNrcViews();
  const body = document.getElementById('admin-body');
  try {
    const s = await api('/api/admin/stats');
    const stat = (label, val) => `<div class="card stat-card"><div class="big">${val}</div><div class="small muted">${label}</div></div>`;
    const openJobs = s.jobs_by_status.open || 0;
    const jobsTotal = Object.values(s.jobs_by_status || {}).reduce((a, b) => a + b, 0);
    const tile = (bg, ic, label, val) => `<div class="dash-tile" style="background:${bg}"><div class="l">${icon(ic)} ${label}</div><div class="n">${val}</div></div>`;
    const mrow = (href, ic, label, badge) => `<a href="${href}">${icon(ic)}<span>${label}</span>${badge ? `<span class="dash-badge">${badge}</span>` : ''}<span class="chev">${icon('chevR')}</span></a>`;
    body.innerHTML = `
      <div class="admin-dash">
        <div class="dash-head"><h2>Admin Dashboard</h2><span>PieceWork Zambia at a glance</span></div>
        <div class="dash-tiles">
          ${tile('#2563EB', 'users', 'Users', s.users)}
          ${tile('#10B981', 'briefcase', 'Jobs', jobsTotal)}
          ${tile('#F59E0B;color:#0B1F3B', 'tag', 'Products', s.products_total || 0)}
          ${tile('#16294F', 'grid', 'Businesses', s.businesses_total || 0)}
          ${tile('#0D9488', 'clipboard', 'Applications', s.applications)}
          ${tile('#E0245E', 'shield', 'Reports open', s.reports_open || 0)}
        </div>
        <div class="dash-menu">
          ${mrow('#/admin/activity', 'users', 'User Management', 0)}
          ${mrow('#/admin/verifications', 'id', 'Verification Queue', s.selfies_pending || 0)}
          ${mrow('#/admin/reports', 'shield', 'Marketplace Moderation', s.reports_open || 0)}
          ${mrow('#/admin/businesses', 'grid', 'Business Applications', s.businesses_pending || 0)}
          ${mrow('#/admin/testers', 'check', 'My Testers', 0)}
          ${mrow('#/admin/jobs', 'briefcase', 'All Jobs', 0)}
          ${mrow('#/admin/categories', 'sliders', 'Categories', 0)}
          ${mrow('#/admin/referrals', 'sparkles', 'Referral Monitor', 0)}
          ${mrow('#/admin/food-licenses', 'utensils', 'Food Licenses', 0)}
          ${mrow('#/admin/resets', 'help', 'Password Resets', 0)}
          ${mrow('#/admin/audit', 'clipboard', 'Audit Log', 0)}
        </div>
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

/** Admin: NRC access log — who viewed whose ID, and when. */
async function loadNrcViews() {
  const body = document.getElementById('nrc-views-body');
  if (!body) return;
  try {
    const s = await api('/api/admin/nrc-views');
    const views = s.views || [];
    body.innerHTML = `
      <div class="card">
        <h3 style="margin-top:0">🪪 NRC access log</h3>
        <p class="small muted" style="margin-top:-6px">Every time a poster opens a worker's NRC photo, it is recorded here. The documents delete themselves after 10 days; this log stays.</p>
        ${views.length ? views.map((v) => `
          <div style="padding:7px 0;border-bottom:1px solid var(--line)">
            <b>${esc(v.viewer_name)}</b> <span class="small muted">viewed the NRC of</span> <b>${esc(v.worker_name)}</b>
            ${v.job_title ? `<span class="small muted">for the job "${esc(v.job_title)}"</span>` : ''}
            <br><span class="small muted">${esc(fmtDateTime(v.viewed_at))}${v.viewer_phone ? ` • viewer phone ${esc(v.viewer_phone)}` : ''}</span>
          </div>`).join('') : '<p class="small muted">No NRC views recorded yet.</p>'}
      </div>`;
  } catch (e) {
    body.innerHTML = '';
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

/** Fetch the pending-selfie count and badge the Selfie review buttons. */
async function badgeSelfieCount() {
  try {
    const { pending_count } = await api('/api/admin/verifications');
    const btn = document.getElementById('btn-selfie-review');
    if (btn && pending_count > 0) btn.innerHTML = `🪪 Selfie review <b class="count-badge">${pending_count}</b>`;
  } catch { /* leave the button unbadged */ }
}

/** Trust badges: vetting tiers shown on profiles and worker cards. */
const TRUST_BADGE_DEFS = {
  verified: { label: 'Verified', icon: 'check', cls: 'tb-verified', hint: 'Identity selfie verified by the PieceWork team' },
  id: { label: 'ID verified', icon: 'shield', cls: 'tb-id', hint: 'National ID on file' },
  vouched: { label: 'Vouched', icon: 'users', cls: 'tb-vouched', hint: 'Vouched for by people who know them' },
  proven: { label: 'Proven', icon: null, cls: 'tb-proven', hint: 'Completed jobs with top ratings' },
  food: { label: 'Food certified', icon: 'utensils', cls: 'tb-food', hint: 'Valid food handler\u2019s license verified' },
};
function trustBadgesHtml(badges, vouchCount) {
  if (!badges || !badges.length) return '';
  return '<div class="tbadge-row">' + badges.map(b => {
    const d = TRUST_BADGE_DEFS[b];
    if (!d) return '';
    const extra = b === 'vouched' && vouchCount ? ' · ' + vouchCount : '';
    const ic = d.icon ? icon(d.icon) : '★';
    return `<span class="tbadge ${d.cls}" title="${esc(d.hint)}">${ic}${esc(d.label)}${extra}</span>`;
  }).join('') + '</div>';
}

/** Quick WhatsApp reason templates for messaging users waiting on selfie review. */
const SELFIE_REASONS = [
  { label: 'Two people in selfie', text: (n) => `Hi ${n}, your PieceWork Zambia verification selfie was not approved because it shows two people. Please take a new selfie with only yourself, face clearly visible, and upload it again under Profile in the app.` },
  { label: 'Face not clear', text: (n) => `Hi ${n}, your PieceWork Zambia verification selfie was not approved because your face is not clearly visible. Please retake it in good light, without sunglasses or a hat, and upload it again under Profile in the app.` },
  { label: '24-hour wait', text: (n) => `Hi ${n}, thanks for joining PieceWork Zambia. Selfie verifications can take up to 24 hours. Yours is in the queue and we will review it soon. You can still browse jobs while you wait.` },
  { label: 'Custom message', text: (n) => `Hi ${n}, this is the PieceWork Zambia team about your verification selfie: ` },
];

/** Fetch the pending food-license count and badge the review buttons. */
async function badgeFoodLicenseCount() {
  try {
    const { pending_count } = await api('/api/admin/food-licenses');
    const btn = document.getElementById('btn-food-review');
    if (btn && pending_count > 0) btn.innerHTML = `🍽️ Food licenses <b class="count-badge">${pending_count}</b>`;
  } catch { /* leave the button unbadged */ }
}

/** Admin food handler's license review — approve or reject hospitality workers' licenses. */
async function viewFoodLicenses() {
  if (!requireAuth('#/admin/food-licenses')) return;
  if (!(currentUser.is_admin || currentUser.is_support)) {
    app.innerHTML = `<div class="view"><div class="page">${emptyHtml('shield', 'Not authorized', 'This page is for the PieceWork team only.')}</div></div>`;
    return;
  }
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Food licenses</h1>
    <p class="page-sub"><a href="#/admin">← Back to admin</a><span id="food-count"></span></p>
    <p class="small muted">Check each license photo. To verify, phone the issuing council and quote the license number. Approve only valid, unexpired licenses.</p>
    <div id="food-body">${loadingHtml('Loading licenses…')}</div>
  </div></div>`;
  const body = document.getElementById('food-body');
  const today = new Date().toISOString().slice(0, 10);
  const soonDate = new Date(); soonDate.setDate(soonDate.getDate() + 30);
  const soon = soonDate.toISOString().slice(0, 10);
  async function load() {
    body.innerHTML = loadingHtml('Loading licenses…');
    try {
      const { licenses, pending_count } = await api('/api/admin/food-licenses');
      const cc = document.getElementById('food-count');
      if (cc) cc.innerHTML = pending_count ? ` · <b>${pending_count} waiting</b>` : '';
      if (!licenses.length) {
        body.innerHTML = emptyHtml('check', 'All caught up', 'No food handler licenses to review.');
        return;
      }
      body.innerHTML = licenses.map(l => {
        const expired = l.food_license_expires_at && l.food_license_expires_at < today;
        const expiring = !expired && l.food_license_expires_at && l.food_license_expires_at <= soon;
        return `
        <div class="card" data-food="${l.id}">
          <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:10px">
            ${l.food_license_image ? `<img src="${l.food_license_image}" alt="License" style="width:120px;height:120px;object-fit:cover;border-radius:12px;cursor:zoom-in" data-zoom="${l.food_license_image}">` : ''}
            <div style="flex:1">
              <b>${esc(l.name)}</b><br>
              <span class="small muted">${esc(l.phone)} · ${esc(l.city)}</span><br>
              <span class="small"><b>License no:</b> ${esc(l.food_license_number || '—')}</span><br>
              <span class="small"><b>Expires:</b> ${esc(l.food_license_expires_at || '—')}
                ${expired ? ' <b style="color:#B91C1C">EXPIRED</b>' : expiring ? ' <b style="color:#C2410C">expiring soon</b>' : ''}</span><br>
              <span class="badge badge-app-${l.food_license_status}">${esc(l.food_license_status)}</span>
            </div>
          </div>
          ${l.food_license_status === 'pending' ? `
          <div class="btn-row">
            <button class="btn btn-sm btn-primary" data-food-approve="${l.id}">${icon('check')}Approve</button>
            <button class="btn btn-sm btn-danger" data-food-reject="${l.id}">Reject</button>
            <a class="btn btn-sm btn-outline" href="tel:${esc(String(l.phone).replace(/\D/g, ''))}">${icon('phone')}Call worker</a>
          </div>` : ''}
        </div>`;
      }).join('');
      body.querySelectorAll('[data-food-approve]').forEach(b => b.addEventListener('click', () => decide(b.dataset.foodApprove, 'approved')));
      body.querySelectorAll('[data-food-reject]').forEach(b => b.addEventListener('click', () => decide(b.dataset.foodReject, 'rejected')));
      body.querySelectorAll('[data-zoom]').forEach(img => img.addEventListener('click', () => window.open(img.dataset.zoom, '_blank', 'noopener')));
    } catch (e) { body.innerHTML = emptyHtml('info', 'Could not load', e.message); }
  }
  async function decide(userId, status) {
    try {
      await api(`/api/admin/food-licenses/${userId}`, { method: 'POST', body: JSON.stringify({ status }) });
      toast(status === 'approved' ? 'License approved.' : 'License rejected.');
      badgeFoodLicenseCount();
      load();
    } catch (e) { toast(e.message, true); }
  }
  load();
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
    <p class="page-sub"><a href="#/admin">← Back to admin</a><span id="verif-count"></span></p>
    <div id="verif-body">${loadingHtml('Loading pending selfies…')}</div>
  </div></div>`;
  const body = document.getElementById('verif-body');
  async function load() {
    body.innerHTML = loadingHtml('Loading pending selfies…');
    try {
      const { pending, pending_count } = await api('/api/admin/verifications');
      const cc = document.getElementById('verif-count');
      if (cc) cc.innerHTML = pending_count ? ` · <b>${pending_count} waiting</b>` : '';
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
            <button class="btn btn-sm btn-outline" data-verif-msg="${u.id}" data-phone="${esc(u.phone || '')}" data-name="${esc(u.name || '')}">${icon('message')}Message</button>
          </div>
          <div class="chips" data-reasons-for="${u.id}" hidden style="margin-top:10px"></div>
        </div>`).join('');
      body.querySelectorAll('[data-verif-approve]').forEach(b => b.addEventListener('click', () => decide(b.dataset.verifApprove, 'approved')));
      body.querySelectorAll('[data-verif-reject]').forEach(b => b.addEventListener('click', () => decide(b.dataset.verifReject, 'rejected')));
      body.querySelectorAll('[data-verif-msg]').forEach(b => b.addEventListener('click', () => {
        const box = body.querySelector(`[data-reasons-for="${b.dataset.verifMsg}"]`);
        if (!box) return;
        if (!box.dataset.built) {
          box.dataset.built = '1';
          box.innerHTML = SELFIE_REASONS.map((r, i) => `<button class="chip" data-reason="${i}">${esc(r.label)}</button>`).join('');
          box.querySelectorAll('[data-reason]').forEach(c => c.addEventListener('click', () => {
            const first = (b.dataset.name || 'there').split(' ')[0];
            window.open(waLink(b.dataset.phone, SELFIE_REASONS[+c.dataset.reason].text(first)), '_blank', 'noopener');
          }));
        }
        box.hidden = !box.hidden;
      }));
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
              <span class="small muted">${esc(j.poster_name)} · ${esc(j.city)}${j.area ? ' · ' + esc(j.area) : ''} · ${fmtDate(j.created_at)}</span><br>
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

/** Admin user activity board — last seen per user plus what they did. */
async function viewUserActivity() {
  if (!requireAuth('#/admin/activity')) return;
  if (!currentUser.is_admin) {
    app.innerHTML = `<div class="view"><div class="page">${emptyHtml('shield', 'Not authorized', 'This page is for the PieceWork admin only.')}</div></div>`;
    return;
  }
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">User activity</h1>
    <p class="page-sub"><a href="#/admin">← Back to admin</a></p>
    <div id="activity-body">${loadingHtml('Loading activity…')}</div>
  </div></div>`;
  const body = document.getElementById('activity-body');
  const parseTs = (s) => s ? new Date(String(s).replace(' ', 'T') + 'Z') : null;
  const fmtTs = (s) => {
    const d = parseTs(s);
    if (!d || isNaN(d)) return 'not recorded yet';
    return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  try {
    const s = await api('/api/admin/activity');
    const users = s.users || [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const eff = (u) => parseTs(u.last_seen_at) || parseTs(u.last_action_at);
    const activeToday = users.filter(u => { const d = eff(u); return d && (now - d.getTime()) < dayMs; }).length;
    const activeWeek = users.filter(u => { const d = eff(u); return d && (now - d.getTime()) < 7 * dayMs; }).length;
    const stat = (label, val) => `<div class="card stat-card"><div class="big">${val}</div><div class="small muted">${label}</div></div>`;
    body.innerHTML = `
      <div class="stat-grid">
        ${stat('Active today', activeToday)}
        ${stat('Active this week', activeWeek)}
        ${stat('Users shown', users.length)}
      </div>
      <div class="card">
        <h3 style="margin-top:0">Most recently active first</h3>
        <p class="small muted" style="margin-top:-6px">Last opened is tracked from Oct 22, 2026. Before that, the board shows each person's last recorded action (apply, post, message).</p>
        ${users.length ? users.map((u) => {
          const d = eff(u);
          const today = d && (now - d.getTime()) < dayMs;
          return `
          <div style="padding:9px 0;border-bottom:1px solid var(--line)">
            <div class="split" style="align-items:flex-start">
              <span>${today ? '🟢' : '⚪'} <b>${esc(u.name)}</b> <span class="small muted">${esc(u.city)}</span></span>
              <span class="small muted">${esc(u.phone)}</span>
            </div>
            <div class="small muted" style="margin-top:3px">
              Last active: <b>${d ? fmtTs(u.last_seen_at || u.last_action_at) : 'never'}</b>
              ${u.last_seen_at ? '' : ' (last action, opens not tracked yet)'}<br>
              Signed up: ${fmtTs(u.signed_up_at)} • ${u.orientation_done ? '✅ Orientation done' : '⬜ Orientation not done'} • Selfie: ${esc(u.selfie_status)}<br>
              ${u.applications} application${u.applications === 1 ? '' : 's'} • ${u.jobs_posted} job${u.jobs_posted === 1 ? '' : 's'} posted • ${u.messages_sent} message${u.messages_sent === 1 ? '' : 's'} sent
            </div>
            <button class="btn btn-sm btn-outline tester-toggle" data-id="${u.id}" data-flag="${u.is_tester ? '1' : '0'}" style="margin-top:6px">${u.is_tester ? '⭐ Tester (tap to remove)' : '☆ Mark as tester'}</button>
            ${u.id !== currentUser.id ? `<button class="btn btn-sm ${u.suspended ? 'btn-primary' : 'btn-outline'} suspend-toggle" data-id="${u.id}" data-suspended="${u.suspended ? '1' : '0'}" data-name="${esc(u.name)}" style="margin-top:6px;margin-left:6px">${u.suspended ? '✅ Reinstate account' : '🚫 Suspend account'}</button>` : ''}
            ${u.suspended ? '<div class="small" style="color:#b3261e;margin-top:4px">This account is suspended.</div>' : ''}
          </div>`;
        }).join('') : '<p class="small muted">No users yet.</p>'}
      </div>`;
    body.querySelectorAll('.tester-toggle').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await api('/api/admin/users/' + btn.dataset.id + '/tester', {
            method: 'PATCH',
            body: JSON.stringify({ is_tester: btn.dataset.flag !== '1' }),
          });
          viewUserActivity();
        } catch (e2) { btn.disabled = false; alert(e2.message); }
      });
    });
    body.querySelectorAll('.suspend-toggle').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const suspending = btn.dataset.suspended !== '1';
        let payload = { suspended: true };
        if (suspending) {
          if (!confirm('Suspend ' + btn.dataset.name + '? They will not be able to log in or use the app until reinstated.')) return;
          const reason = prompt('Reason for suspension (optional, kept in the audit log):') || '';
          payload = { suspended: true, reason };
        } else {
          if (!confirm('Reinstate ' + btn.dataset.name + '? They will be able to log in again.')) return;
          payload = { suspended: false };
        }
        btn.disabled = true;
        try {
          await api('/api/admin/users/' + btn.dataset.id + '/suspend', {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
          viewUserActivity();
        } catch (e2) { btn.disabled = false; alert(e2.message); }
      });
    });
  } catch (e) {
    body.innerHTML = emptyHtml('info', 'Could not load activity', e.message);
  }
}

/** 2.0 M0: admin abuse report queue. */
async function viewAdminReports() {
  if (!requireAuth('#/admin/reports')) return;
  if (!currentUser.is_admin) {
    app.innerHTML = `<div class="view"><div class="page">${emptyHtml('shield', 'Not authorized', 'This page is for the PieceWork admin only.')}</div></div>`;
    return;
  }
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Reports</h1>
    <p class="page-sub"><a href="#/admin">← Back to admin</a></p>
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button class="btn btn-sm btn-primary" id="rep-filter-open">Open</button>
      <button class="btn btn-sm btn-outline" id="rep-filter-all">All</button>
    </div>
    <div id="reports-body">${loadingHtml('Loading reports…')}</div>
  </div></div>`;
  const body = document.getElementById('reports-body');
  const fmtTs = (s) => s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  async function load(status) {
    try {
      const s = await api('/api/admin/reports' + (status ? '?status=' + status : ''));
      const rows = s.reports || [];
      body.innerHTML = rows.length ? `<div class="card">${rows.map((r) => `
        <div style="padding:10px 0;border-bottom:1px solid var(--line)">
          <div class="split"><b>${esc(r.target_type === 'job' ? 'Job: ' + (r.target_label || '#' + r.target_id) : 'User: ' + (r.target_label || '#' + r.target_id))}</b>
          <span class="small muted">${esc(r.status)}</span></div>
          <div class="small muted" style="margin-top:3px">Reported by ${esc(r.reporter_name)} • ${fmtTs(r.created_at)}</div>
          <div style="margin-top:4px">${esc(r.reason)}</div>
          ${r.admin_note ? `<div class="small muted" style="margin-top:4px">Admin note: ${esc(r.admin_note)}</div>` : ''}
          ${r.status === 'open' ? `<div style="margin-top:6px;display:flex;gap:6px">
            <button class="btn btn-sm btn-primary rep-resolve" data-id="${r.id}">Resolve</button>
            <button class="btn btn-sm btn-outline rep-dismiss" data-id="${r.id}">Dismiss</button>
          </div>` : ''}
        </div>`).join('')}</div>`
        : emptyHtml('check', 'No reports', status ? 'Nothing waiting in this queue.' : 'No reports have been filed yet.');
      body.querySelectorAll('.rep-resolve, .rep-dismiss').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const note = prompt('Admin note (optional):') || '';
          btn.disabled = true;
          try {
            await api('/api/admin/reports/' + btn.dataset.id, {
              method: 'PATCH',
              body: JSON.stringify({ status: btn.classList.contains('rep-resolve') ? 'resolved' : 'dismissed', note }),
            });
            load('open');
          } catch (e2) { btn.disabled = false; alert(e2.message); }
        });
      });
    } catch (e) {
      body.innerHTML = emptyHtml('info', 'Could not load reports', e.message);
    }
  }
  document.getElementById('rep-filter-open').addEventListener('click', () => load('open'));
  document.getElementById('rep-filter-all').addEventListener('click', () => load(''));
  load('open');
}

/** 2.0 M0: admin audit log viewer. */
async function viewAdminAudit() {
  if (!requireAuth('#/admin/audit')) return;
  if (!currentUser.is_admin) {
    app.innerHTML = `<div class="view"><div class="page">${emptyHtml('shield', 'Not authorized', 'This page is for the PieceWork admin only.')}</div></div>`;
    return;
  }
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Audit log</h1>
    <p class="page-sub"><a href="#/admin">← Back to admin</a></p>
    <p class="page-sub">Every sensitive admin action, newest first. Verification decisions, suspensions, password resets, giveaway draws, category changes.</p>
    <div id="audit-body">${loadingHtml('Loading audit log…')}</div>
  </div></div>`;
  const body = document.getElementById('audit-body');
  const fmtTs = (s) => s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  try {
    const s = await api('/api/admin/audit');
    const rows = s.entries || [];
    body.innerHTML = rows.length ? `<div class="card">${rows.map((e) => `
      <div style="padding:8px 0;border-bottom:1px solid var(--line)">
        <div class="split"><b>${esc(e.action)}</b><span class="small muted">${fmtTs(e.created_at)}</span></div>
        <div class="small muted">By ${esc(e.admin_name || 'admin')}${e.target_type ? ' • ' + esc(e.target_type) + (e.target_id ? ' #' + e.target_id : '') : ''}${e.detail ? ' • ' + esc(e.detail) : ''}</div>
      </div>`).join('')}</div>`
      : emptyHtml('info', 'Nothing logged yet', 'Admin actions will appear here as they happen.');
  } catch (e) {
    body.innerHTML = emptyHtml('info', 'Could not load audit log', e.message);
  }
}

/** 2.0 M0: admin-managed job categories. */
async function viewAdminCategories() {
  if (!requireAuth('#/admin/categories')) return;
  if (!currentUser.is_admin) {
    app.innerHTML = `<div class="view"><div class="page">${emptyHtml('shield', 'Not authorized', 'This page is for the PieceWork admin only.')}</div></div>`;
    return;
  }
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">Categories</h1>
    <p class="page-sub"><a href="#/admin">← Back to admin</a></p>
    <p class="page-sub">Job categories users can pick. Turning one off hides it from new posts; jobs already posted keep theirs.</p>
    <div class="card">
      <h3 style="margin-top:0">Add a category</h3>
      <div style="display:flex;gap:8px">
        <input id="cat-new-name" type="text" maxlength="60" placeholder="e.g. Solar Installation" style="flex:1">
        <button class="btn btn-primary" id="cat-add">Add</button>
      </div>
    </div>
    <div id="categories-body" style="margin-top:14px">${loadingHtml('Loading categories…')}</div>
  </div></div>`;
  const body = document.getElementById('categories-body');
  async function load() {
    try {
      const s = await api('/api/admin/categories');
      const rows = s.categories || [];
      body.innerHTML = `<div class="card">${rows.map((c) => `
        <div class="split" style="padding:8px 0;border-bottom:1px solid var(--line)">
          <span>${esc(c.name)} ${c.active ? '' : '<span class="small muted">(off)</span>'}</span>
          <button class="btn btn-sm btn-outline cat-toggle" data-id="${c.id}" data-active="${c.active ? '1' : '0'}">${c.active ? 'Turn off' : 'Turn on'}</button>
        </div>`).join('')}</div>`;
      body.querySelectorAll('.cat-toggle').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await api('/api/admin/categories/' + btn.dataset.id, {
              method: 'PATCH',
              body: JSON.stringify({ active: btn.dataset.active !== '1' }),
            });
            load();
          } catch (e2) { btn.disabled = false; alert(e2.message); }
        });
      });
    } catch (e) {
      body.innerHTML = emptyHtml('info', 'Could not load categories', e.message);
    }
  }
  document.getElementById('cat-add').addEventListener('click', async () => {
    const input = document.getElementById('cat-new-name');
    const name = input.value.trim();
    if (!name) return;
    try {
      await api('/api/admin/categories', { method: 'POST', body: JSON.stringify({ name }) });
      input.value = '';
      load();
    } catch (e) { alert(e.message); }
  });
  load();
}

/** Admin tester tracker — Zac's flagged testers, day by day. */
async function viewTesters() {
  if (!requireAuth('#/admin/testers')) return;
  if (!currentUser.is_admin) {
    app.innerHTML = `<div class="view"><div class="page">${emptyHtml('shield', 'Not authorized', 'This page is for the PieceWork admin only.')}</div></div>`;
    return;
  }
  app.innerHTML = `
  <div class="view"><div class="page">
    <h1 class="page-title">My testers</h1>
    <p class="page-sub"><a href="#/admin">← Back to admin</a></p>
    <div id="testers-body">${loadingHtml('Loading testers…')}</div>
  </div></div>`;
  const body = document.getElementById('testers-body');
  const parseTs = (s) => s ? new Date(String(s).replace(' ', 'T') + 'Z') : null;
  const fmtTs = (s) => {
    const d = parseTs(s);
    if (!d || isNaN(d)) return 'not recorded yet';
    return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  try {
    const s = await api('/api/admin/testers');
    const testers = s.testers || [];
    // Last 14 Zambia days, ending today (server-supplied).
    const days = [];
    const base = new Date(s.today + 'T00:00:00Z');
    for (let i = 13; i >= 0; i--) days.push(new Date(base.getTime() - i * 86400000).toISOString().slice(0, 10));
    const activeToday = testers.filter(t => t.active_days.includes(s.today)).length;
    const stat = (label, val) => `<div class="card stat-card"><div class="big">${val}</div><div class="small muted">${label}</div></div>`;
    const strip = (t) => days.map((d) => {
      const on = t.active_days.includes(d);
      const num = Number(d.slice(8, 10));
      return `<span title="${d}${on ? ' — active' : ' — no activity'}" style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;font-size:10px;font-weight:700;${on ? 'background:var(--green);color:#fff' : 'background:var(--green-tint);color:var(--gray-soft)'}">${num}</span>`;
    }).join('');
    body.innerHTML = `
      <div class="stat-grid">
        ${stat('Testers tracked', testers.length)}
        ${stat('Active today', activeToday)}
      </div>
      <div class="card">
        <h3 style="margin-top:0">Last 14 days, per tester</h3>
        <p class="small muted" style="margin-top:-6px">Green means the app was opened or used that day (Zambia time). Days before Oct 22 count only real actions: applying, posting, messaging.</p>
        ${testers.length ? testers.map((t) => {
          const in14 = t.active_days.filter(d => days.includes(d)).length;
          return `
          <div style="padding:10px 0;border-bottom:1px solid var(--line)">
            <div class="split" style="align-items:flex-start">
              <span><b>${esc(t.name)}</b> <span class="small muted">${esc(t.city)}</span></span>
              <b>${in14} of 14 days</b>
            </div>
            <div style="display:flex;gap:3px;flex-wrap:wrap;margin:7px 0">${strip(t)}</div>
            <div class="small muted">
              Last opened: ${fmtTs(t.last_seen_at)} • ${t.orientation_done ? '✅ Orientation done' : '⬜ Orientation not done'}<br>
              ${t.applications} application${t.applications === 1 ? '' : 's'} • ${t.jobs_posted} job${t.jobs_posted === 1 ? '' : 's'} posted • ${t.messages_sent} message${t.messages_sent === 1 ? '' : 's'} sent • ${esc(t.phone)}
            </div>
            <button class="btn btn-sm btn-outline tester-untoggle" data-id="${t.id}" style="margin-top:6px">⭐ Tester (tap to remove)</button>
          </div>`;
        }).join('') : '<p class="small muted">No testers flagged yet. Add them below, or from the User activity page.</p>'}
      </div>
      <div class="card">
        <h3 style="margin-top:0">Add or remove testers</h3>
        <p class="small muted" style="margin-top:-6px">Tap ☆ next to each of your testers so the tracker follows the right people. The full user list is on the <a href="#/admin/activity">User activity</a> page.</p>
        <div id="tester-picker">${loadingHtml('Loading users…')}</div>
      </div>`;
    const wireToggles = (root, rerun) => {
      root.querySelectorAll('.tester-untoggle').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await api('/api/admin/users/' + btn.dataset.id + '/tester', { method: 'PATCH', body: JSON.stringify({ is_tester: false }) });
            rerun();
          } catch (e2) { btn.disabled = false; alert(e2.message); }
        });
      });
    };
    wireToggles(body, viewTesters);
    // Picker: every user with a star toggle, most recently active first.
    const picker = document.getElementById('tester-picker');
    try {
      const all = await api('/api/admin/activity');
      const users = all.users || [];
      picker.innerHTML = users.length ? users.map((u) => `
        <div class="split" style="padding:7px 0;border-bottom:1px solid var(--line);align-items:center">
          <span><b>${esc(u.name)}</b> <span class="small muted">${esc(u.city)} • ${esc(u.phone)}</span></span>
          <button class="btn btn-sm ${u.is_tester ? '' : 'btn-outline'} tester-pick" data-id="${u.id}" data-flag="${u.is_tester ? '1' : '0'}">${u.is_tester ? '⭐' : '☆'}</button>
        </div>`).join('') : '<p class="small muted">No users yet.</p>';
      picker.querySelectorAll('.tester-pick').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await api('/api/admin/users/' + btn.dataset.id + '/tester', { method: 'PATCH', body: JSON.stringify({ is_tester: btn.dataset.flag !== '1' }) });
            viewTesters();
          } catch (e2) { btn.disabled = false; alert(e2.message); }
        });
      });
    } catch (e3) {
      picker.innerHTML = '<p class="small muted">Could not load the user list.</p>';
    }
  } catch (e) {
    body.innerHTML = emptyHtml('info', 'Could not load testers', e.message);
  }
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
  [/^#\/search/, viewSearch],
  [/^#\/market$/, viewMarket],
  [/^#\/sell$/, viewSell],
  [/^#\/selling$/, viewSelling],
  [/^#\/product\/(\d+)\/edit$/, (m) => viewProductEdit(m[1])],
  [/^#\/product\/(\d+)$/, (m) => viewProduct(m[1])],
  [/^#\/businesses$/, viewBusinesses],
  [/^#\/business\/apply$/, viewBusinessApply],
  [/^#\/business\/mine$/, viewMyBusinesses],
  [/^#\/business\/(\d+)\/manage$/, (m) => viewBusinessManage(m[1])],
  [/^#\/business\/([a-z0-9-]+)$/, (m) => viewBusiness(m[1])],
  [/^#\/admin\/businesses$/, viewAdminBusinesses],
  [/^#\/job\/(\d+)\/edit$/, (m) => viewJobEdit(m[1])],
  [/^#\/job\/(\d+)\/track$/, (m) => viewTrackDelivery(m[1])],
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
  [/^#\/admin\/activity$/, viewUserActivity],
  [/^#\/admin\/testers$/, viewTesters],
  [/^#\/admin\/verifications$/, viewVerifications],
  [/^#\/admin\/food-licenses$/, viewFoodLicenses],
  [/^#\/admin\/resets$/, viewAdminResets],
  [/^#\/admin\/reports$/, viewAdminReports],
  [/^#\/admin\/audit$/, viewAdminAudit],
  [/^#\/admin\/categories$/, viewAdminCategories],
  [/^#\/categories$/, viewCategories],
  [/^#\/messages$/, viewMessages],
  [/^#\/chat\/(\d+)$/, (m) => viewChat(m[1])],
  [/^#\/admin$/, viewAdmin],
  [/^#\/terms$/, viewTerms],
  [/^#\/orientation$/, viewOrientation],
  [/^#\/saved$/, viewSaved],
  [/^#\/how$/, viewHow],
  [/^#\/about$/, viewAbout],
];

async function router() {
  if (chatTimer) { clearInterval(chatTimer); chatTimer = null; }
  stopAdsRotation();
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
  const productShareBtn = e.target.closest('[data-share-product]');
  if (productShareBtn) {
    e.preventDefault();
    e.stopPropagation();
    shareProduct(productShareBtn.dataset.shareProduct, productShareBtn.dataset.title || 'Item on PieceWork Zambia');
    return;
  }
  const businessShareBtn = e.target.closest('[data-share-business]');
  if (businessShareBtn) {
    e.preventDefault();
    e.stopPropagation();
    shareBusiness(businessShareBtn.dataset.shareBusiness, businessShareBtn.dataset.title || 'Storefront on PieceWork Zambia');
    return;
  }
  const saveBtn = e.target.closest('[data-save]');
  if (saveBtn) {
    e.preventDefault();
    e.stopPropagation();
    toggleSave(saveBtn.dataset.save);
    return;
  }
  if (e.target.closest('[data-retry-view]')) { router(); return; }
  const psaveBtn = e.target.closest('[data-psave]');
  if (psaveBtn) {
    e.preventDefault();
    e.stopPropagation();
    toggleSaveProduct(psaveBtn.dataset.psave);
    return;
  }
  const pcard = e.target.closest('.product-card-g[data-product], .product-card[data-product]');
  if (pcard && !e.target.closest('a') && !e.target.closest('button')) {
    location.hash = '#/product/' + pcard.dataset.product;
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
  // 2.0 M0: categories are admin-managed on the server now. Load the live
  // list over the built-in fallback so new categories appear without an
  // app update. Failure keeps the built-ins, so this can never break boot.
  try {
    const d = await api('/api/categories');
    if (d && Array.isArray(d.categories) && d.categories.length) {
      CATEGORIES.length = 0;
      d.categories.forEach((c) => CATEGORIES.push(c.name));
    }
  } catch (e) { /* built-in list stays */ }
  try {
    const d = await api('/api/categories?kind=market');
    if (d && Array.isArray(d.categories) && d.categories.length) {
      MARKET_CATEGORIES.length = 0;
      d.categories.forEach((c) => MARKET_CATEGORIES.push(c.name));
    }
  } catch (e) { /* built-in list stays */ }
  if (!location.hash) location.hash = '#/';
  router();
})();

// Installable PWA: cache the app shell for fast, offline-capable loads.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

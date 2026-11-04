/* =====================================================================
   js/wip-core.js
   Shared code for Production WIP Audit pages (home.html, admin.html and
   every page you add later): login guard, page layout, database helpers.
   ===================================================================== */
import * as base from './firebase-config.js';

/* Load Firebase from the SAME version that js/firebase-config.js already uses, so the browser
   downloads it only once (two different versions would mean two full downloads). */
const SDK_FALLBACK = '10.12.2';
async function sdkVersion() {
  try {
    const r = await fetch(new URL('./firebase-config.js', import.meta.url));
    const m = (await r.text()).match(/firebasejs\/(\d+\.\d+\.\d+)\//);
    return m ? m[1] : SDK_FALLBACK;
  } catch { return SDK_FALLBACK; }
}
const SDK = `https://www.gstatic.com/firebasejs/${await sdkVersion()}/`;
const [{ initializeApp }, A, F] = await Promise.all([
  import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')
]);
const { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword,
        EmailAuthProvider, reauthenticateWithCredential, updatePassword } = A;
const { getFirestore, initializeFirestore, doc, collection, query, where, getDoc, getDocs, setDoc,
        updateDoc, deleteDoc, writeBatch, serverTimestamp } = F;

/* ---------- Settings you may want to change ---------- */
// Same value as in index.html. An employee ID "12345" logs in as 12345@wipaudit.local
export const EMPLOYEE_ID_DOMAIN = 'wipaudit.local';
// Only fill this if the page says it cannot find your Firebase settings:
const MANUAL_CONFIG = null; // e.g. { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." }

export const DEPARTMENTS = ['All', 'Fabrication', 'Cutting Shop', 'Paint Shop', 'Assembly', 'Quality'];

export const DEFAULT_ADMIN_MESSAGE =
`This is the real-time monitoring system developed for HD Construction Equipment Pvt. Ltd.

Only authorized persons can access this data.

IMPORTANT NOTICE:
This e-mail, including any attachment(s) thereto, is intended for the sole and exclusive use of the addressee(s) named above and may contain information that is legally privileged and/or confidential. If you are not an intended addressee, you are hereby notified that any use, dissemination, distribution or copying of the e-mail or the information obtained therein is STRICTLY PROHIBITED. If you have received the e-mail in error, please notify the sender immediately and permanently delete this e-mail from your system.`;

/* ---------- Menu (edit href here when you build a new page) ---------- */
export const NAV = [
  { key: 'home',          label: 'Home',           icon: 'home',     href: 'home.html' },
  { key: 'dashboard',     label: 'Dashboard',      icon: 'dashboard', href: 'dashboard.html' },
  { key: 'about',         label: 'About',          icon: 'info',     modal: 'about' },
  { key: 'inventory',     label: 'Inventory',      icon: 'box',      href: 'inventory.html' },
  { key: 'issue',         label: 'Issue Report',   icon: 'alert',    href: null },
  { key: 'improvement',   label: 'Improvement',    icon: 'trend',    href: null },
  { key: 'multiskilling', label: 'Multiskilling',  icon: 'users',    href: null },
  { key: 'shift',         label: 'Shift Schedule', icon: 'calendar', href: null },
  { key: 'audit',         label: 'Audit',          icon: 'clipboard', href: null },
  { key: 'inspection',    label: 'Inspection',     icon: 'search',   href: null },
  { key: 'psm',           label: 'PSM',            icon: 'shield',   href: null },
  { key: 'm5',            label: '5M',             icon: 'layers',   href: null },
  { sep: true },
  { key: 'profile',       label: 'User Profile',   icon: 'user',     modal: 'profile' },
  { key: 'admin',         label: 'Admin Control',  icon: 'lock',     href: 'admin.html', adminOnly: true },
  { key: 'settings',      label: 'Settings',       icon: 'sliders',  href: null }
];

/* ---------- Icons ---------- */
const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  box: '<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5"/><path d="M12 12v9"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5"/><path d="M12 18h.01"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.8 0 4.5 1.8 4.5 4.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/><circle cx="12" cy="15.5" r="2.5"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 14l2 2 4-4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.5-4.5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 16l9 5 9-5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/><path d="M12 15v2"/>',
  sliders: '<path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2"/><path d="M4 17h2"/><path d="M10 17h10"/><circle cx="8" cy="17" r="2"/>',
  logout: '<path d="M9 4H5a2 2 0 00-2 2v12a2 2 0 002 2h4"/><path d="M16 8l4 4-4 4"/><path d="M20 12H9"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  msg: '<path d="M4 5h16v11H9l-5 4z"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>'
};
export const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

/* ---------- Small helpers ---------- */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const idToEmail = (id) => {
  const v = String(id || '').trim().toLowerCase().replace(/\s+/g, '');
  return v.includes('@') ? v : `${v}@${EMPLOYEE_ID_DOMAIN}`;
};

export function friendlyError(e) {
  const c = e?.code || '';
  if (c === 'auth/email-already-in-use') return 'This employee ID already has a login.';
  if (c === 'auth/weak-password') return 'The password must be at least 6 characters.';
  if (c === 'auth/invalid-credential' || c === 'auth/wrong-password') return 'The current password is wrong.';
  if (c === 'auth/requires-recent-login') return 'Please sign out, sign in again, then retry.';
  if (c === 'auth/network-request-failed' || c === 'unavailable') return 'Network problem. Check your internet connection and retry.';
  if (c === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes and retry.';
  if (c === 'permission-denied') return 'Not allowed. Your account lacks permission, or the Firestore rules are not published yet.';
  return e?.message || 'Something went wrong.';
}

let toastTimer;
export function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2800);
}

export function openModal({ title, html = '', wide = false, actions = [], onClose, onOpen }) {
  const prev = document.activeElement;
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML = `<div class="dlg ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="dlg-h"><h3>${esc(title)}</h3><button type="button" class="btn btn-ghost btn-sm" data-x aria-label="Close">${icon('x')}</button></div>
      <div class="dlg-b">${html}</div><div class="dlg-f"></div></div>`;
  const api = { el: ov, body: ov.querySelector('.dlg-b'), locked: false, buttons: {} };
  const onKey = (e) => { if (e.key === 'Escape' && !api.locked) api.close(); };
  api.close = () => {
    if (!ov.isConnected) return;
    ov.remove(); document.removeEventListener('keydown', onKey);
    onClose?.(); prev?.focus?.();
  };
  const foot = ov.querySelector('.dlg-f');
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + (a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : 'btn-ghost');
    b.textContent = a.label;
    b.onclick = () => a.onClick?.(api, b);
    api.buttons[a.id || a.label] = b;
    foot.appendChild(b);
  });
  if (!actions.length) foot.remove();
  ov.addEventListener('mousedown', (e) => { if (e.target === ov && !api.locked) api.close(); });
  ov.querySelector('[data-x]').onclick = () => { if (!api.locked) api.close(); };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  (ov.querySelector('input:not([disabled]),select:not([disabled]),textarea') || ov.querySelector('.dlg'))?.focus?.();
  onOpen?.(api);
  return api;
}

export function confirmBox({ title, message, okLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let decided = false;
    openModal({
      title, html: `<p>${esc(message)}</p>`,
      onClose: () => { if (!decided) resolve(false); },
      actions: [
        { label: 'Cancel', onClick: (m) => m.close() },
        { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: (m) => { decided = true; m.close(); resolve(true); } }
      ]
    });
  });
}

/* ---------- Firebase (independent copy, shares the login session) ---------- */
let app = null, auth = null, db = null, initError = null;
try {
  const cfg = MANUAL_CONFIG || base.firebaseConfig || base.default?.firebaseConfig ||
    base.app?.options || base.auth?.app?.options || base.db?.app?.options || null;
  if (!cfg) throw new Error('CONFIG_NOT_FOUND');
  app = initializeApp(cfg);
  auth = getAuth(app);
  try {
    // Falls back to long polling by itself on company networks/proxies that block streaming
    db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  } catch { db = getFirestore(app); } // already started by firebase-config.js
} catch (e) { initError = e; }
export { auth, db };

/* ---------- Styles ---------- */
const CSS = `
:root{--navy:#0b1220;--navy2:#12304f;--green:#16a34a;--green-d:#047857;--mint:#4ade80;--paper:#f3f5f7;--ink:#0f172a;--ink2:#334155;--muted:#64748b;--line:#dde3ea;--danger:#dc2626;--side:264px}
*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',system-ui,-apple-system,Roboto,sans-serif}
html{-webkit-text-size-adjust:100%}
body{background:var(--paper);color:var(--ink);min-height:100vh;min-height:100dvh;font-size:15px;line-height:1.5}
button{font:inherit;color:inherit;cursor:pointer;border:0;background:none}
:focus-visible{outline:3px solid rgba(22,163,74,.55);outline-offset:2px}
svg.i{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
.app{display:flex;min-height:100vh;min-height:100dvh}
.side{width:var(--side);flex:none;background:linear-gradient(180deg,var(--navy),var(--navy2));color:#cbd5e1;display:flex;flex-direction:column;position:sticky;top:0;height:100vh;height:100dvh;overflow-y:auto;z-index:60}
.brand{display:flex;align-items:center;gap:12px;padding:20px 18px 14px}
.brand-logo{width:42px;height:42px;border-radius:10px;background:#fff;display:grid;place-items:center;padding:3px;flex:none}
.brand-logo img{max-width:100%;max-height:100%;object-fit:contain}
.brand b{display:block;color:#fff;font-size:15px;line-height:1.2}
.brand span{font-size:12px;color:#94a3b8}
.nav{padding:8px 10px 24px;display:flex;flex-direction:column;gap:2px}
.nav .sep{height:1px;background:rgba(255,255,255,.1);margin:10px 8px}
.nav button{display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;border-radius:8px;color:#cbd5e1;text-align:left;font-size:14.5px;position:relative;transition:background .15s,color .15s}
.nav button:hover{background:rgba(255,255,255,.07);color:#fff}
.nav button.on{background:rgba(74,222,128,.12);color:#fff}
.nav button.on::before{content:"";position:absolute;left:-10px;top:8px;bottom:8px;width:3px;border-radius:0 3px 3px 0;background:var(--mint)}
.scrim{display:none}
.col{flex:1;min-width:0;display:flex;flex-direction:column}
.top{height:64px;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px;padding:0 24px;position:sticky;top:0;z-index:40}
.top h1{font-size:17px;font-weight:700}
.btn.burger{display:none;padding:8px 10px}
.grow{flex:1}
.me{display:flex;align-items:center;gap:10px}
.avatar{width:36px;height:36px;border-radius:50%;background:var(--navy);color:var(--mint);display:grid;place-items:center;font-weight:700;font-size:13px;flex:none}
.me-txt{line-height:1.25;text-align:right}
.me-txt b{display:block;font-size:14px}
.me-txt small{color:var(--muted);font-size:12px}
main{padding:28px;width:100%;max-width:1200px;margin:0 auto;flex:1}
.page-head h1{font-size:26px;letter-spacing:-.3px}
.page-head p{color:var(--muted);margin-top:4px;max-width:62ch}
.band{position:relative;overflow:hidden;border-radius:18px;background:linear-gradient(120deg,var(--navy),var(--navy2));color:#fff;padding:30px 32px;min-height:160px;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}
.band canvas{position:absolute;inset:0;width:100%;height:100%}
.band>*:not(canvas){position:relative}
.band h2{font-size:clamp(24px,3.4vw,34px);font-weight:700;letter-spacing:-.4px;line-height:1.15}
.band p{color:#cbd5e1;margin-top:6px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.chip{font-size:12.5px;padding:4px 11px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22)}
.band .date{font-size:14px;color:#cbd5e1;text-align:right}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:20px}
.tile{display:flex;align-items:center;gap:16px;padding:18px;background:#fff;border:1px solid var(--line);border-radius:12px;text-align:left;transition:border-color .15s,box-shadow .15s;min-width:0}
.tile .ico{width:48px;height:48px;border-radius:10px;background:var(--navy);color:var(--mint);display:grid;place-items:center;flex:none;transition:background .15s,color .15s}
.tile .ico svg{width:24px;height:24px}
.tile b{display:block;font-size:16px;line-height:1.25}
.tile small{display:block;color:var(--muted);font-size:12.5px;margin-top:2px}
.tile:hover{border-color:#86efac;box-shadow:0 8px 22px rgba(15,23,42,.08)}
.tile:hover .ico{background:var(--green);color:#fff}
.tile.on{border-color:var(--green);box-shadow:inset 0 0 0 1px var(--green)}
.tile.on .ico{background:var(--green);color:#fff}
.lower{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:22px}
.card h2{font-size:17px;margin-bottom:12px}
.card.msg{grid-column:span 2}
.msg-body{white-space:pre-wrap;color:var(--ink2);font-size:14px;line-height:1.65;max-width:78ch}
.msg-meta{margin-top:14px;color:var(--muted);font-size:12.5px}
.card.core{display:flex;flex-direction:column}
.core-img{flex:1;display:grid;place-items:center}
.core-img img{width:100%;max-width:300px;height:auto;display:block}
.alert{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:16px;padding:12px 16px;border-radius:10px;background:#fffbeb;border:1px solid #fde68a;color:#92400e}
.alert span{flex:1;min-width:200px}
.foot{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:28px;padding:22px 4px 8px;border-top:1px solid var(--line);color:var(--muted);font-size:13.5px}
.foot b{display:block;color:var(--ink2);font-size:13.5px;margin-bottom:6px}
.foot a,.foot button,.foot span{display:block;color:var(--muted);text-decoration:none;padding:2px 0;text-align:left}
.foot a:hover,.foot button:hover{color:var(--green-d);text-decoration:underline}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14.5px;border:1px solid transparent;transition:filter .15s,background .15s}
.btn svg{width:18px;height:18px}
.btn-primary{background:linear-gradient(135deg,var(--green),var(--green-d));color:#fff}
.btn-primary:hover{filter:brightness(1.07)}
.btn-ghost{background:#fff;border-color:#cbd5e1;color:var(--ink2)}
.btn-ghost:hover{background:#f1f5f9}
.btn-danger{background:#fff;border-color:#fecaca;color:#b91c1c}
.btn-danger:hover{background:#fef2f2}
.btn-sm{padding:6px 10px;font-size:13px}
.btn:disabled{opacity:.55;cursor:not-allowed}
input,select,textarea{width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:15px;background:#fff;color:var(--ink);outline:none}
input:focus,select:focus,textarea:focus{border-color:var(--green);box-shadow:0 0 0 3px rgba(22,163,74,.16)}
input:disabled,select:disabled{background:#f1f5f9;color:var(--muted)}
textarea{resize:vertical;line-height:1.55}
.fg{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.fg .full{grid-column:1/-1}
.l{display:block;font-weight:600;font-size:13px;color:var(--ink2);margin-bottom:5px}
.hint{font-size:12.5px;color:var(--muted);margin-top:4px}
.err{color:var(--danger);font-size:13.5px;margin-top:12px}
.row{display:flex;gap:8px;align-items:stretch}
.panel{background:#fff;border:1px solid var(--line);border-radius:12px;margin-top:16px;overflow:hidden}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line)}
.search{position:relative;flex:1 1 220px;max-width:340px}
.search svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--muted);width:18px;height:18px}
.search input{padding-left:36px}
.toolbar select{width:auto;min-width:150px}
.tbl-wrap{overflow-x:auto}
.tbl{width:100%;border-collapse:collapse;font-size:14px}
.tbl th{text-align:left;font-weight:600;color:var(--muted);background:#f8fafc;padding:10px 14px;white-space:nowrap;border-bottom:1px solid var(--line)}
.tbl td{padding:10px 14px;border-bottom:1px solid #eef2f6;vertical-align:middle}
.tbl tbody tr:last-child td{border-bottom:0}
.tbl tbody tr:hover{background:#fafcff}
.tbl .num{text-align:right;font-variant-numeric:tabular-nums}
.acts{display:flex;gap:6px;justify-content:flex-end}
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;background:#e2e8f0;color:#334155}
.badge.admin{background:#dcfce7;color:#166534}
.badge.off{background:#fee2e2;color:#991b1b}
.empty{padding:44px 20px;text-align:center;color:var(--muted)}
.note{padding:10px 16px;color:var(--muted);font-size:13px;border-top:1px solid var(--line)}
.prog{height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden;margin:14px 0 6px}
.prog i{display:block;height:100%;width:0;background:var(--green);transition:width .2s}
.sum{width:100%;border-collapse:collapse;font-size:14px;margin-top:10px}
.sum td,.sum th{padding:6px 8px;border-bottom:1px solid #eef2f6;text-align:left}
.sum th{color:var(--muted);font-weight:600}
.ov{position:fixed;inset:0;background:rgba(11,18,32,.6);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;z-index:100;animation:fade .15s}
.dlg{background:#fff;border-radius:14px;width:100%;max-width:520px;max-height:calc(100dvh - 32px);display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,.4);animation:pop .18s ease;outline:none}
.dlg.wide{max-width:760px}
.dlg-h{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 14px 20px;border-bottom:1px solid var(--line)}
.dlg-h h3{font-size:17px}
.dlg-b{padding:20px;overflow:auto}
.dlg-b p+p{margin-top:10px}
.dlg-f{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid var(--line);flex-wrap:wrap}
.kv{display:grid;grid-template-columns:130px 1fr;gap:8px 12px;font-size:14.5px}
.kv dt{color:var(--muted)}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--navy);color:#fff;padding:11px 18px;border-radius:10px;z-index:200;font-size:14px;box-shadow:0 12px 30px rgba(0,0,0,.3);max-width:calc(100vw - 32px)}
.screen{min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:20px;background:linear-gradient(135deg,var(--navy),var(--navy2))}
.screen .box{background:#fff;border-radius:16px;max-width:540px;width:100%;padding:32px}
.screen h1{font-size:22px}
.screen p{color:var(--ink2);margin-top:10px}
.screen pre{background:#0f172a;color:#e2e8f0;padding:12px 14px;border-radius:8px;margin-top:12px;font-size:13px;overflow:auto}
.screen .acts{justify-content:flex-start;margin-top:22px}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes pop{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}
@media (max-width:1000px){
  .side{position:fixed;left:0;top:0;transform:translateX(-100%);transition:transform .22s ease}
  .side.open{transform:none;box-shadow:0 0 40px rgba(0,0,0,.4)}
  .scrim.open{display:block;position:fixed;inset:0;background:rgba(11,18,32,.55);z-index:55}
  .btn.burger{display:inline-flex}
  .top{padding:0 14px}
  main{padding:18px 16px}
}
@media (max-width:860px){
  .tiles,.lower{grid-template-columns:repeat(2,1fr)}
  .card.msg{grid-column:1/-1}
  .lower .core{grid-column:1/-1}
  .tiles .tile:last-child:nth-child(odd){grid-column:1/-1}
}
@media (max-width:560px){
  .tiles{gap:10px}
  .tile{flex-direction:column;align-items:flex-start;gap:12px;padding:14px}
  .band{padding:22px 20px;min-height:150px}
  .band .date{text-align:left}
  .me-txt{display:none}
  .foot{grid-template-columns:1fr}
  .fg{grid-template-columns:1fr}
  .kv{grid-template-columns:1fr}
  .toolbar select{flex:1 1 140px;min-width:0}
  .search{max-width:none}
  .tbl thead{display:none}
  .tbl,.tbl tbody,.tbl tr,.tbl td{display:block;width:100%}
  .tbl tr{padding:10px 14px;border-bottom:1px solid var(--line)}
  .tbl td{display:flex;justify-content:space-between;gap:16px;padding:4px 0;border:0;text-align:right}
  .tbl td::before{content:attr(data-label);font-weight:600;color:var(--muted);text-align:left}
  .tbl td.acts-td{justify-content:flex-end;padding-top:8px}
  .tbl td.acts-td::before{display:none}
  .tbl .num{text-align:right}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
const st = document.createElement('style');
st.id = 'wip-style';
st.textContent = CSS;
document.head.appendChild(st);

/* ---------- Page start: login guard + layout ---------- */
const never = () => new Promise(() => {});

function screen({ title, body, buttons = [] }) {
  document.body.innerHTML = `<div class="screen"><div class="box"><h1>${esc(title)}</h1>${body}<div class="acts"></div></div></div>`;
  const acts = document.querySelector('.screen .acts');
  buttons.forEach((b) => {
    const el = document.createElement('button');
    el.className = 'btn ' + (b.kind === 'primary' ? 'btn-primary' : 'btn-ghost');
    el.textContent = b.label; el.onclick = b.onClick; acts.appendChild(el);
  });
  return never();
}

const store = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } }
};

export async function logout() {
  try { await signOut(auth); } catch { /* ignore */ }
  location.replace('index.html');
}

function goLogin() {
  const hops = Number(store.get('wipHops') || 0);
  if (hops >= 2) {
    store.set('wipHops', '0');
    return screen({
      title: 'Your sign-in could not be shared with this page',
      body: '<p>The login page says you are signed in, but this page cannot see the session. Open <b>js/firebase-config.js</b> and check that it does not use session-only persistence, then try again. If you are unsure, send that file to Claude.</p>',
      buttons: [{ label: 'Back to login', kind: 'primary', onClick: () => location.replace('index.html') }]
    });
  }
  store.set('wipHops', String(hops + 1));
  location.replace('index.html');
  return never();
}

function explainDbError(e) {
  const c = e?.code || '';
  if (c === 'permission-denied') return 'The database refused access. This usually means the Firestore security rules have not been published yet, or your user profile has not been created.';
  if (c === 'unavailable' || c === 'auth/network-request-failed') return 'The database could not be reached. Check your internet connection and reload.';
  if (c === 'failed-precondition' || c === 'not-found') return 'Cloud Firestore does not seem to be enabled for this Firebase project.';
  return e?.message || 'Unknown error.';
}

export async function startPage({ active, adminOnly = false, title }) {
  if (initError) {
    return screen({
      title: 'Setup check: Firebase settings not found',
      body: `<p>This page reads your Firebase settings from <b>js/firebase-config.js</b> and could not find them (${esc(initError.message)}).</p>
             <p>Open that file and add one of these lines at the bottom, save, then push again. Use the name that matches your file:</p>
             <pre>export { app };\nexport { firebaseConfig };</pre>
             <p>Not sure? Send <b>js/firebase-config.js</b> to Claude and it will be fixed in one step.</p>`,
      buttons: [{ label: 'Back to login', onClick: () => location.replace('index.html') }]
    });
  }

  const user = await new Promise((res) => { const un = onAuthStateChanged(auth, (u) => { un(); res(u); }); });
  if (!user) return goLogin();
  store.set('wipHops', '0');

  let profile;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    profile = snap.exists() ? snap.data() : null;
  } catch (e) {
    return screen({
      title: 'Could not open your account',
      body: `<p>${esc(explainDbError(e))}</p>`,
      buttons: [{ label: 'Try again', kind: 'primary', onClick: () => location.reload() }, { label: 'Sign out', onClick: logout }]
    });
  }
  if (!profile) {
    return screen({
      title: 'Your account is not set up yet',
      body: '<p>You are signed in, but there is no profile for your account. Ask an administrator to add you under Admin Control, User Database.</p>',
      buttons: [{ label: 'Sign out', kind: 'primary', onClick: logout }]
    });
  }
  if (profile.active === false) {
    return screen({
      title: 'Your access is switched off',
      body: '<p>An administrator has deactivated this account. Contact them if you need access again.</p>',
      buttons: [{ label: 'Sign out', kind: 'primary', onClick: logout }]
    });
  }

  const isAdmin = profile.role === 'admin';
  if (adminOnly && !isAdmin) {
    setTimeout(() => location.replace('home.html'), 3500);
    return screen({
      title: 'Admin access only',
      body: '<p>Admin Control is available to administrators only. Taking you back to Home.</p>',
      buttons: [{ label: 'Go to Home', kind: 'primary', onClick: () => location.replace('home.html') }]
    });
  }

  onAuthStateChanged(auth, (u) => { if (!u) location.replace('index.html'); });

  const name = profile.name || (user.email || '').split('@')[0] || 'User';
  const ctx = {
    uid: user.uid, user, profile, isAdmin, name,
    employeeId: profile.employeeId || (user.email || '').split('@')[0],
    departments: Array.isArray(profile.departments) ? profile.departments : []
  };
  ctx.main = renderShell(ctx, active, title || (NAV.find((n) => n.key === active)?.label ?? ''));
  return ctx;
}

function renderShell(ctx, active, title) {
  const nav = NAV.filter((n) => !n.adminOnly || ctx.isAdmin).map((n) => n.sep
    ? '<div class="sep"></div>'
    : `<button type="button" data-k="${n.key}" class="${n.key === active ? 'on' : ''}" ${n.key === active ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${esc(n.label)}</span></button>`).join('');
  const initials = ctx.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const shell = document.createElement('div');
  shell.className = 'app';
  shell.innerHTML = `
    <aside class="side" id="side">
      <div class="brand"><div class="brand-logo"><img src="images/logo.png" alt="" onerror="this.remove()"></div>
        <div><b>Production WIP Audit</b><span>Real-time monitoring</span></div></div>
      <nav class="nav" aria-label="Main menu">${nav}</nav>
    </aside>
    <div class="scrim" id="scrim"></div>
    <div class="col">
      <header class="top">
        <button type="button" class="btn btn-ghost burger" id="burger" aria-label="Open menu">${icon('menu')}</button>
        <h1>${esc(title)}</h1><span class="grow"></span>
        <div class="me">
          <div class="me-txt"><b>${esc(ctx.name)}</b><small>${ctx.isAdmin ? 'Administrator' : 'ID ' + esc(ctx.employeeId)}</small></div>
          <div class="avatar" aria-hidden="true">${esc(initials)}</div>
          <button type="button" class="btn btn-ghost btn-sm" id="logoutBtn">${icon('logout')}<span>Sign out</span></button>
        </div>
      </header>
      <main id="main"></main>
    </div>`;
  document.body.innerHTML = '';
  document.body.appendChild(shell);

  const side = shell.querySelector('#side'), scrim = shell.querySelector('#scrim');
  const setOpen = (o) => { side.classList.toggle('open', o); scrim.classList.toggle('open', o); };
  shell.querySelector('#burger').onclick = () => setOpen(!side.classList.contains('open'));
  scrim.onclick = () => setOpen(false);
  shell.querySelector('#logoutBtn').onclick = logout;
  shell.querySelectorAll('.nav button').forEach((b) => {
    b.onclick = () => { setOpen(false); go(ctx, NAV.find((n) => n.key === b.dataset.k)); };
  });
  return shell.querySelector('#main');
}

export function go(ctx, item) {
  if (!item) return;
  if (item.modal === 'about') return openAbout();
  if (item.modal === 'profile') return openProfile(ctx);
  if (item.href) { if (!location.pathname.endsWith('/' + item.href)) location.href = item.href; return; }
  toast(`${item.label} is coming soon.`);
}

/* ---------- Welcome-band animation (digital network) ---------- */
export function startNetwork(canvas) {
  const c = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0, h = 0, pts = [], bits = [];
  const size = () => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    w = r.width; h = r.height; canvas.width = w * dpr; canvas.height = h * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.max(14, Math.round(w / 22));
    pts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3 }));
    bits = Array.from({ length: Math.round(n / 2) }, () => ({ x: Math.random() * w, y: Math.random() * h, v: .2 + Math.random() * .4, s: 11 + Math.random() * 9, c: Math.random() > .5 ? '1' : '0', a: .06 + Math.random() * .14 }));
  };
  const frame = () => {
    c.clearRect(0, 0, w, h);
    for (const b of bits) {
      c.font = b.s + 'px monospace'; c.fillStyle = `rgba(74,222,128,${b.a})`; c.fillText(b.c, b.x, b.y);
      if (!reduce) { b.y -= b.v; if (b.y < -20) { b.y = h + 20; b.x = Math.random() * w; } }
    }
    const max = 120;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!reduce) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1; }
      c.beginPath(); c.arc(p.x, p.y, 1.6, 0, 6.283); c.fillStyle = 'rgba(147,197,253,.75)'; c.fill();
      for (let j = i + 1; j < pts.length; j++) {
        const q = pts[j], d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < max) { c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.strokeStyle = `rgba(96,165,250,${.3 * (1 - d / max)})`; c.stroke(); }
      }
    }
    if (!reduce) requestAnimationFrame(frame);
  };
  new ResizeObserver(() => { size(); if (reduce) frame(); }).observe(canvas);
  size(); frame();
}

/* ---------- About, profile, password ---------- */
export function openAbout() {
  openModal({
    title: 'About',
    html: `<p>${esc(DEFAULT_ADMIN_MESSAGE.split('\n\n')[0])}</p><p>${esc(DEFAULT_ADMIN_MESSAGE.split('\n\n')[1])}</p>`,
    actions: [{ label: 'Close', onClick: (m) => m.close() }]
  });
}

export function openProfile(ctx) {
  const dep = ctx.departments.length ? ctx.departments.join(', ') : 'Not set';
  openModal({
    title: 'User profile',
    html: `<dl class="kv"><dt>Name</dt><dd>${esc(ctx.name)}</dd><dt>Employee ID</dt><dd>${esc(ctx.employeeId)}</dd>
      <dt>Role</dt><dd>${ctx.isAdmin ? 'Administrator' : 'User'}</dd><dt>Access</dt><dd>${esc(dep)}</dd></dl>
      <h3 style="margin:22px 0 10px;font-size:16px">Change password</h3>
      <form id="pwForm" class="fg" autocomplete="off">
        <div class="full"><label class="l" for="pw0">Current password</label><input id="pw0" type="password" autocomplete="current-password"></div>
        <div><label class="l" for="pw1">New password</label><input id="pw1" type="password" autocomplete="new-password"></div>
        <div><label class="l" for="pw2">Repeat new password</label><input id="pw2" type="password" autocomplete="new-password"></div>
      </form>
      <p class="hint">At least 8 characters, and not your employee ID.</p><div class="err" id="pwErr"></div>`,
    actions: [
      { label: 'Close', onClick: (m) => m.close() },
      {
        label: 'Save password', kind: 'primary', id: 'save',
        onClick: async (m, btn) => {
          const [a, b, c] = ['pw0', 'pw1', 'pw2'].map((i) => m.el.querySelector('#' + i).value);
          const err = m.el.querySelector('#pwErr');
          err.textContent = '';
          if (!a || !b) { err.textContent = 'Fill in the current and the new password.'; return; }
          if (b.length < 8) { err.textContent = 'The new password must be at least 8 characters.'; return; }
          if (b === String(ctx.employeeId)) { err.textContent = 'The new password cannot be your employee ID.'; return; }
          if (b !== c) { err.textContent = 'The two new passwords do not match.'; return; }
          btn.disabled = true;
          try { await changeMyPassword(a, b); toast('Password changed.'); ctx.profile.mustChangePassword = false; document.getElementById('pwBanner')?.remove(); m.close(); }
          catch (e) { err.textContent = friendlyError(e); btn.disabled = false; }
        }
      }
    ]
  });
}

export async function changeMyPassword(current, next) {
  const u = auth.currentUser;
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
  await updatePassword(u, next);
  try { await updateDoc(doc(db, 'users', u.uid), { mustChangePassword: false }); } catch { /* not critical */ }
}

/* ---------- Database helpers ---------- */
export async function getAdminMessage() {
  try { const s = await getDoc(doc(db, 'config', 'adminMessage')); return s.exists() ? s.data() : null; }
  catch { return null; }
}
export async function setAdminMessage(text, by) {
  await setDoc(doc(db, 'config', 'adminMessage'), { text, updatedBy: by, updatedAt: serverTimestamp() });
}

export async function listUsers() {
  const s = await getDocs(collection(db, 'users'));
  return s.docs.map((d) => ({ uid: d.id, ...d.data() }));
}
export async function updateUser(uid, data) {
  await updateDoc(doc(db, 'users', uid), { ...data, updatedAt: serverTimestamp() });
}

let secondary = null;
// Creates the login with a second app instance so the admin stays signed in.
export async function createUser({ employeeId, name, password, role = 'user', departments = [], userNo = null, mustChangePassword = true }) {
  if (!secondary) secondary = initializeApp(app.options, 'wip-secondary');
  const a2 = getAuth(secondary);
  const email = idToEmail(employeeId);
  const cred = await createUserWithEmailAndPassword(a2, email, password);
  const uid = cred.user.uid;
  try { await signOut(a2); } catch { /* ignore */ }
  const profile = {
    name, employeeId: String(employeeId).trim(), email, role, departments,
    active: true, mustChangePassword, userNo
  };
  await setDoc(doc(db, 'users', uid), { ...profile, createdAt: serverTimestamp(), createdBy: auth.currentUser.uid });
  return { uid, ...profile };
}

export async function listStations() {
  const s = await getDocs(collection(db, 'inventory'));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || String(a.stationName).localeCompare(String(b.stationName)));
}
export const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const stationId = (s) => slug([s.department, s.line, s.stationCode || s.stationName].join('|'));
// Fresh read of one department (used by the Inventory check page so limits are always current)
export async function listStationsByDepartment(dept) {
  const s = await getDocs(query(collection(db, 'inventory'), where('department', '==', dept)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || String(a.stationName).localeCompare(String(b.stationName)));
}

/* ---------- Inventory checks ---------- */
const lineKey = (dept, line) => slug(`${dept}|${line}`);

export async function getLatestCheck(dept, line) {
  try { const s = await getDoc(doc(db, 'inventoryLatest', lineKey(dept, line))); return s.exists() ? s.data() : null; }
  catch { return null; }
}

// items: [{ stationId, stationName, stationCode, min, max, actual, status: 'OK' | 'Not OK', reason }]
export async function saveInventoryCheck({ department, line, items, name, employeeId }) {
  const okCount = items.filter((i) => i.status === 'OK').length;
  const now = new Date(), p = (n) => String(n).padStart(2, '0');
  const record = {
    department, line, lineKey: lineKey(department, line),
    uid: auth.currentUser.uid, name, employeeId,
    items, total: items.length, okCount, notOkCount: items.length - okCount,
    dateKey: `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`,
    createdAt: serverTimestamp()
  };
  const ref = doc(collection(db, 'inventoryChecks'));
  const batch = writeBatch(db);
  batch.set(ref, record);                                                        // full history
  batch.set(doc(db, 'inventoryLatest', record.lineKey), { ...record, checkId: ref.id }); // newest per line
  await batch.commit();
  return { id: ref.id, ...record, createdAt: now };
}

export async function saveStation(id, data) {
  await setDoc(doc(db, 'inventory', id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}
export async function deleteStation(id) { await deleteDoc(doc(db, 'inventory', id)); }

// stations: [{ id, department, line, stationCode, stationName, min, max, order }]
export async function writeStations(stations, { replace = false, onProgress } = {}) {
  const ops = stations.map((s) => ({ type: 'set', id: s.id, data: { ...s, updatedAt: serverTimestamp() } }));
  if (replace) {
    const keep = new Set(stations.map((s) => s.id));
    (await listStations()).forEach((s) => { if (!keep.has(s.id)) ops.push({ type: 'del', id: s.id }); });
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach((o) => {
      const ref = doc(db, 'inventory', o.id);
      if (o.type === 'set') { const { id, ...rest } = o.data; batch.set(ref, rest, { merge: true }); } else batch.delete(ref);
    });
    await batch.commit();
    onProgress?.(Math.min(i + 400, ops.length), ops.length);
  }
  return ops.length;
}
/* ---------- Inventory History (Admin) ---------- */

export async function listInventoryChecks({ department = null, line = null, fromDate = null, toDate = null } = {}) {
  const snap = await getDocs(collection(db, 'inventoryChecks'));
  let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (department) list = list.filter(c => c.department === department);
  if (line) list = list.filter(c => c.line === line);

  if (fromDate) {
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);
    list = list.filter(c => {
      const d = c.createdAt?.toDate?.() || (c.dateKey ? new Date(c.dateKey) : new Date(0));
      return d >= from;
    });
  }
  if (toDate) {
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);
    list = list.filter(c => {
      const d = c.createdAt?.toDate?.() || (c.dateKey ? new Date(c.dateKey) : new Date(0));
      return d <= to;
    });
  }

  // Newest first
  list.sort((a, b) => {
    const da = a.createdAt?.toDate?.() || (a.dateKey ? new Date(a.dateKey) : new Date(0));
    const db = b.createdAt?.toDate?.() || (b.dateKey ? new Date(b.dateKey) : new Date(0));
    return db - da;
  });

  return list;
}

export async function getInventoryCheck(id) {
  const snap = await getDoc(doc(db, 'inventoryChecks', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateInventoryCheck(id, data) {
  const checkRef = doc(db, 'inventoryChecks', id);
  const snap = await getDoc(checkRef);
  if (!snap.exists()) throw new Error('Check not found');

  const old = snap.data();
  const updated = {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid || null
  };

  await updateDoc(checkRef, updated);

  // Keep inventoryLatest in sync if this is the current latest check
  try {
    const latestRef = doc(db, 'inventoryLatest', old.lineKey);
    const latestSnap = await getDoc(latestRef);
    if (latestSnap.exists() && latestSnap.data().checkId === id) {
      await setDoc(latestRef, {
        ...old,
        ...updated,
        checkId: id
      }, { merge: true });
    }
  } catch (e) {
    console.warn('Could not update inventoryLatest', e);
  }
}

export async function deleteInventoryCheck(id) {
  const checkRef = doc(db, 'inventoryChecks', id);
  const snap = await getDoc(checkRef);
  if (!snap.exists()) return;

  const check = { id, ...snap.data() };
  await deleteDoc(checkRef);

  // If this was the latest check, promote the previous one (or remove the pointer)
  try {
    const latestRef = doc(db, 'inventoryLatest', check.lineKey);
    const latestSnap = await getDoc(latestRef);

    if (latestSnap.exists() && latestSnap.data().checkId === id) {
      // Find the next most recent check for the same line
      const allSnap = await getDocs(collection(db, 'inventoryChecks'));
      const sameLine = allSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => c.lineKey === check.lineKey)
        .sort((a, b) => {
          const da = a.createdAt?.toDate?.() || (a.dateKey ? new Date(a.dateKey) : new Date(0));
          const db = b.createdAt?.toDate?.() || (b.dateKey ? new Date(b.dateKey) : new Date(0));
          return db - da;
        });

      if (sameLine.length > 0) {
        const next = sameLine[0];
        await setDoc(latestRef, {
          ...next,
          checkId: next.id
        });
      } else {
        await deleteDoc(latestRef);
      }
    }
  } catch (e) {
    console.warn('Could not update inventoryLatest after delete', e);
  }
}
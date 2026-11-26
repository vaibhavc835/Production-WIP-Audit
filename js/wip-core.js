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
  // Remembered from the previous page, so this page does not wait for an extra download before it can start
  try { const c = localStorage.getItem('wipSdkVersion'); if (c) return c; } catch { /* storage blocked */ }
  try {
    const r = await fetch(new URL('./firebase-config.js', import.meta.url));
    const m = (await r.text()).match(/firebasejs\/(\d+\.\d+\.\d+)\//);
    const v = m ? m[1] : SDK_FALLBACK; try { localStorage.setItem('wipSdkVersion', v); } catch { /* ignore */ }
    return v;
  } catch { return SDK_FALLBACK; }
}
const SDK = `https://www.gstatic.com/firebasejs/${await sdkVersion()}/`;
const [{ initializeApp }, A, F] = await Promise.all([
  import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')
]);
const { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword,
        EmailAuthProvider, reauthenticateWithCredential, updatePassword, sendPasswordResetEmail } = A;
const { getFirestore, initializeFirestore, doc, collection, query, where, getDoc, getDocs, setDoc,
        updateDoc, deleteDoc, writeBatch, serverTimestamp, runTransaction, Timestamp, orderBy, limit } = F;

/* ---------- Settings you may want to change ---------- */
// Same value as in index.html. An employee ID "12345" logs in as 12345@wipaudit.local
export const EMPLOYEE_ID_DOMAIN = 'wipaudit.local';
// Password reset by email. Leave empty to keep the internal addresses (id@wipaudit.local, which cannot receive mail).
// Put the administrator's real mailbox here (for example 'name@gmail.com'). New accounts are then created as
// name+<employeeId>@gmail.com. Every reset link lands in that one mailbox. Same value as in index.html.
export const RESET_MAILBOX = '';
// TESTING ONLY. true = every password (first one and later changes) is also saved where only admins can read it,
// so the admin can use "Temp password" on any user who forgot theirs. Set to false before real launch.
export const STORE_PASSWORDS_FOR_TESTING = true;
// Only fill this if the page says it cannot find your Firebase settings:
const MANUAL_CONFIG = null; // e.g. { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." }

// Pages every signed-in user can open. All other pages can be switched on or off per user (Admin Control, User Database).
export const PAGE_ALWAYS = ['home', 'about', 'profile'];
export function hasPage(profile, key) {
  if (!key || PAGE_ALWAYS.includes(key) || profile?.role === 'admin') return true;
  return Array.isArray(profile?.pages) ? profile.pages.includes(key) : true;   // no list saved = all pages
}
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
  { key: 'issue',         label: 'Issue Report',   icon: 'alert',    href: 'issues.html' },
  { key: 'improvement',   label: 'Improvement',    icon: 'trend',    href: 'improvement.html' },
  { key: 'multiskilling', label: 'Multiskilling',  icon: 'users',    href: null },
  { key: 'shift',         label: 'Shift Schedule', icon: 'calendar', href: null },
  { key: 'audit',         label: 'Audit',          icon: 'clipboard', href: 'audit.html' },
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
  if (v.includes('@')) return v;
  const box = String(RESET_MAILBOX || '').trim().toLowerCase();
  if (box.includes('@')) { const [l, d] = box.split('@'); return `${l.split('+')[0]}+${v}@${d}`; }
  return `${v}@${EMPLOYEE_ID_DOMAIN}`;
};
export const hasRealMailbox = (email) => !!email && !String(email).toLowerCase().endsWith('@' + EMPLOYEE_ID_DOMAIN);
// Sends Firebase's reset email to the account's login address and asks the user to choose a new password at next sign-in.
export async function sendResetLink(uid, email) {
  await sendPasswordResetEmail(auth, email);
  try { await updateDoc(doc(db, 'users', uid), { mustChangePassword: true }); } catch { /* not critical */ }
}

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

export const pageOptions = () => NAV.filter((n) => n.key && !n.adminOnly && !PAGE_ALWAYS.includes(n.key)).map((n) => ({ key: n.key, label: n.label }));

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

  const t0 = performance.now(), lap = {};
  const user = await new Promise((res) => { const un = onAuthStateChanged(auth, (u) => { un(); res(u); }); });
  if (!user) return goLogin();
  store.set('wipHops', '0');
  lap.auth = Math.round(performance.now() - t0);
  // Master Data is needed by most pages: ask for it now, at the same time as the profile, instead of after the page has opened
  if (['inventory', 'issue', 'improvement', 'audit', 'dashboard', 'admin'].includes(active)) getMaster().catch(() => null);

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

  if (!hasPage(profile, active)) {
    return screen({
      title: 'You do not have access to this page',
      body: '<p>Your account is not set up to open this page. Ask an administrator to give you access under Admin Control, User Database.</p>',
      buttons: [{ label: 'Go to Home', kind: 'primary', onClick: () => location.replace('home.html') }, { label: 'Sign out', onClick: logout }]
    });
  }

  onAuthStateChanged(auth, (u) => { if (!u) location.replace('index.html'); });
  lap.profile = Math.round(performance.now() - t0) - lap.auth;

  const name = profile.name || (user.email || '').split('@')[0] || 'User';
  const ctx = {
    uid: user.uid, user, profile, isAdmin, name,
    employeeId: profile.employeeId || (user.email || '').split('@')[0],
    departments: Array.isArray(profile.departments) ? profile.departments : []
  };
  ctx.main = renderShell(ctx, active, title || (NAV.find((n) => n.key === active)?.label ?? ''));
  // Open the browser console to see where the time goes: sign-in check, profile, then the page's own data
  console.info(`[WIP load] ${active}: sign-in check ${lap.auth} ms, profile ${lap.profile} ms, page shown at ${Math.round(performance.now())} ms`);
  ctx.t0 = t0;
  return ctx;
}

function renderShell(ctx, active, title) {
  const nav = NAV.filter((n) => (!n.adminOnly || ctx.isAdmin) && (n.sep || hasPage(ctx.profile, n.key))).map((n) => n.sep
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
  try {
    if (STORE_PASSWORDS_FOR_TESTING) await setDoc(doc(db, 'tempPasswords', u.uid), { password: next, setAt: serverTimestamp(), setBy: u.uid });
    else await deleteDoc(doc(db, 'tempPasswords', u.uid));
  } catch { /* not critical */ }
}
// Temporary passwords (testing phase): only admins can read them; deleted as soon as the user sets their own password.
export async function getTempPassword(uid) {
  try { const s = await getDoc(doc(db, 'tempPasswords', uid)); return s.exists() ? s.data().password : null; } catch { return null; }
}
export async function saveTempPassword(uid, password) {
  await setDoc(doc(db, 'tempPasswords', uid), { password, setAt: serverTimestamp(), setBy: auth.currentUser.uid });
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
// Where a user works, by level: Level 0 = a station, Level 1 and 2 = a line, Level 3 to 5 = a department. All optional.
export function scopeOf(level, { dept = '', line = '', station = '' } = {}) {
  const lv = lvOf(level);
  return { scopeDept: dept || '', scopeLine: lv <= 2 ? (line || '') : '', scopeStation: lv === 0 ? (station || '') : '' };
}
export const scopeLabel = (u) => [u.scopeDept, u.scopeLine, u.scopeStation].filter(Boolean).join(' › ');
export async function updateUser(uid, data) {
  await updateDoc(doc(db, 'users', uid), { ...data, updatedAt: serverTimestamp() });
}

let secondary = null;
// Creates the login with a second app instance so the admin stays signed in.
export async function createUser({ employeeId, name, password, role = 'user', departments = [], userNo = null, mustChangePassword = true, level = 1, pages = null, reportsTo = '', scopeDept = '', canExport = false, scopeLine = '', scopeStation = '' }) {
  if (!secondary) secondary = initializeApp(app.options, 'wip-secondary');
  const a2 = getAuth(secondary);
  const email = idToEmail(employeeId);
  const cred = await createUserWithEmailAndPassword(a2, email, password);
  const uid = cred.user.uid;
  try { await signOut(a2); } catch { /* ignore */ }
  const profile = {
    name, employeeId: String(employeeId).trim(), email, role, departments,
    active: true, mustChangePassword, userNo, level: lvOf(level), pages: Array.isArray(pages) ? pages : null, reportsTo: reportsTo || '', canExport: !!canExport, ...scopeOf(level, { dept: scopeDept, line: scopeLine, station: scopeStation })
  };
  await setDoc(doc(db, 'users', uid), { ...profile, createdAt: serverTimestamp(), createdBy: auth.currentUser.uid });
  if (mustChangePassword || STORE_PASSWORDS_FOR_TESTING) { try { await saveTempPassword(uid, password); } catch { /* not critical */ } }
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


/* ---------- Master data: departments, lines, stations (one list for every page) ---------- */
// One document, config/master:  stations [{ id, dept, line, lineCode, station, nWork, issue, imp, audit }]
//                               inv      [{ id, dept, line, group, name, min, max }]   (inventory points)
let _master = null;
export async function getMaster(force = false) {
  if (_master && !force) return _master;
  let d = {};
  try { const sn = await getDoc(doc(db, 'config', 'master')); d = sn.exists() ? sn.data() : {}; } catch { /* no master yet */ }
  _master = { stations: Array.isArray(d.stations) ? d.stations : [], inv: Array.isArray(d.inv) ? d.inv : [], updatedMs: d.updatedMs || 0 };
  _master.has = _master.stations.length > 0;
  applyMasterDepartments(_master);
  return _master;
}
// The inventory access list (tick boxes on the user form, Inventory page) follows the departments that have inventory points
function applyMasterDepartments(m) {
  const depts = [...new Set((m.inv || []).map((x) => x.dept))];
  if (depts.length) DEPARTMENTS.splice(0, DEPARTMENTS.length, 'All', ...depts);
}
// Every department in Master Data (stations or inventory), used for the user Access departments list and for Support required
export const allMasterDepts = (m) => [...new Set([...(m.stations || []).map((x) => x.dept), ...(m.inv || []).map((x) => x.dept)].filter(Boolean))];
export async function saveMaster({ stations, inv }, { syncInv = true } = {}) {
  await setDoc(doc(db, 'config', 'master'), { stations, inv, updatedAt: serverTimestamp(), updatedMs: Date.now() });
  _master = { stations, inv, updatedMs: Date.now(), has: stations.length > 0 };
  applyMasterDepartments(_master);
  if (syncInv) await syncInventoryFromMaster(_master);
  return _master;
}
const uniqBy = (arr, f) => { const seen = new Set(), out = []; arr.forEach((x) => { const k = f(x); if (!seen.has(k)) { seen.add(k); out.push(x); } }); return out; };
const flagOK = (st, flag) => !flag || st[flag];
export const masterDepts = (m, flag) => [...new Set(m.stations.filter((x) => flagOK(x, flag)).map((x) => x.dept))];
export const masterLines = (m, dept, flag) => [...new Set(m.stations.filter((x) => x.dept === dept && flagOK(x, flag)).map((x) => x.line))];
export const masterStationNames = (m, dept, line, flag) => [...new Set(m.stations.filter((x) => x.dept === dept && x.line === line && x.station && flagOK(x, flag)).map((x) => x.station))];
// Issue form: a line without stations is itself the place, so its name is used as the station
export function issueStationsFromMaster(m) {
  return uniqBy(m.stations.filter((x) => x.issue).map((x) => ({ area: x.dept, line: x.line, station: x.station || x.line })), (x) => [x.area, x.line, x.station].join('|'))
    .map((x) => ({ id: slug([x.area, x.line, x.station].join('|')), ...x }));
}
export function improvementFromMaster(m) {
  const rows = m.stations.filter((x) => x.imp);
  const lines = uniqBy(rows, (x) => x.dept + '|' + x.line).map((x) => ({ dept: x.dept, line: x.line, code: x.lineCode || '' }));
  const stations = uniqBy(rows.filter((x) => x.station), (x) => [x.dept, x.line, x.station].join('|')).map((x) => ({ dept: x.dept, line: x.line, name: x.station }));
  return { lines, stations };
}
export function auditPlacesFromMaster(m) {
  const places = new Map();
  m.stations.filter((x) => x.audit).forEach((x) => { if (!places.has(x.dept)) places.set(x.dept, new Set()); places.get(x.dept).add(x.line); });
  return places;
}
// Inventory points become the documents of the inventory collection (what the Inventory page and the exports read)
export function inventoryFromMaster(m) {
  const used = new Map(), out = [];
  (m.inv || []).forEach((p, i) => {
    const base = p.group && p.group !== p.name ? `${p.name} (${p.group})` : p.name;
    const k = [p.dept, p.line, base].join('|'); const n = (used.get(k) || 0) + 1; used.set(k, n);
    const stationName = n > 1 ? `${base} ${n}` : base;
    const d = { department: p.dept, line: p.line, stationCode: '', stationName, point: p.name, group: p.group || '', min: Number(p.min) || 0, max: Number(p.max) || 0, order: i + 1 };
    out.push({ id: stationId(d), ...d });
  });
  return out;
}
export async function syncInventoryFromMaster(m) {
  const list = inventoryFromMaster(m);
  return writeStations(list, { replace: true });
}

/* ---------- Inventory checks ---------- */
const lineKey = (dept, line) => slug(`${dept}|${line}`);

export async function getLatestCheck(dept, line) {
  try { const s = await getDoc(doc(db, 'inventoryLatest', lineKey(dept, line))); return s.exists() ? s.data() : null; }
  catch { return null; }
}

// items: [{ stationId, stationName, stationCode, min, max, actual, status: 'OK' | 'Not OK', reason }]
// dateKey: optional check date "YYYY-MM-DD" (past-dated entry). Default is today.
// extra: optional extra fields stored on the record (for example { imported: true, importBatch })
export async function saveInventoryCheck({ department, line, items, name, employeeId, dateKey = null, extra = {} }) {
  const okCount = items.filter((i) => i.status === 'OK').length;
  const now = new Date(), p = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || '')) ? dateKey : today;
  const record = {
    department, line, lineKey: lineKey(department, line),
    uid: auth.currentUser.uid, name, employeeId,
    items, total: items.length, okCount, notOkCount: items.length - okCount,
    totalQty: items.reduce((a, i) => a + (Number(i.actual) || 0), 0),
    dateKey: day, backdated: day !== today, ...extra,
    createdAt: serverTimestamp()
  };
  const ref = doc(collection(db, 'inventoryChecks'));
  const batch = writeBatch(db);
  batch.set(ref, record);                                                        // full history
  // "latest" must stay the newest check DATE, so an older check never replaces a newer one
  let newest = true;
  if (day !== today) { const cur = await getLatestCheck(department, line); newest = !cur || String(cur.dateKey || '') <= day; }
  if (newest) batch.set(doc(db, 'inventoryLatest', record.lineKey), { ...record, checkId: ref.id });
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

// The check date (what the audit is about), not the upload time
export const checkDay = (c) => c.dateKey ? new Date(c.dateKey + 'T00:00:00') : (c.createdAt?.toDate?.() || new Date(0));
const byNewest = (a, b) => (checkDay(b) - checkDay(a)) ||
  ((b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

export async function listInventoryChecks({ department = null, line = null, fromDate = null, toDate = null } = {}) {
  const snap = await getDocs(collection(db, 'inventoryChecks'));
  let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (department) list = list.filter(c => c.department === department);
  if (line) list = list.filter(c => c.line === line);

  if (fromDate) {
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);
    list = list.filter(c => checkDay(c) >= from);
  }
  if (toDate) {
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);
    list = list.filter(c => checkDay(c) <= to);
  }

  // Newest check date first
  list.sort(byNewest);

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
        .sort(byNewest);

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
// Deletes many checks at once (400 per batch), then repairs the "latest" record of every affected line
export async function deleteInventoryChecksBulk(ids, onProgress) {
  const all = (await getDocs(collection(db, 'inventoryChecks'))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const gone = new Set(ids), byId = new Map(all.map((c) => [c.id, c]));
  const lines = new Set(ids.map((id) => byId.get(id)?.lineKey).filter(Boolean));
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => batch.delete(doc(db, 'inventoryChecks', id)));
    await batch.commit();
    onProgress?.(Math.min(i + 400, ids.length), ids.length);
  }
  for (const lk of lines) {
    const left = all.filter((c) => c.lineKey === lk && !gone.has(c.id)).sort(byNewest);
    const ref = doc(db, 'inventoryLatest', lk);
    if (left.length) { const { id, ...rest } = left[0]; await setDoc(ref, { ...rest, checkId: id }); }
    else await deleteDoc(ref);
  }
  return ids.length;
}


/* =====================================================================
   Issue Report: organisation, masters, routing, workflow
   ===================================================================== */
export const ORG_LEVELS = [
  { n: 0, label: 'Level 0 (Workman)' }, { n: 1, label: 'Level 1 (Engineer)' }, { n: 2, label: 'Level 2 (Manager)' }, { n: 3, label: 'Level 3 (HOD)' },
  { n: 4, label: 'Level 4 (GM)' }, { n: 5, label: 'Level 5 (MD)' }
];
// A user's level as a number from 0 (workman) to 5 (MD). Missing or invalid values count as Level 1.
export const lvOf = (n) => { const v = Number(n); return n !== '' && n != null && Number.isInteger(v) && v >= 0 && v <= 5 ? v : 1; };
export const levelLabel = (n) => (ORG_LEVELS.find((l) => l.n === lvOf(n))).label;

// Which step of the issue form asks for which field. "locked" fields cannot be moved to another step.
export const FIELD_DEFS = [
  { key: 'area',        label: 'Dept. / Area',                 stage: 'initiator',   required: true,  locked: true },
  { key: 'line',        label: 'Line',                          stage: 'initiator',   required: true },
  { key: 'nature',      label: 'Nature of issue',               stage: 'initiator',   required: true },
  { key: 'station',     label: 'Station name',                  stage: 'initiator',   required: true },
  { key: 'model',       label: 'Model & MSN-PSN',               stage: 'initiator',   required: false },
  { key: 'partNumber',  label: 'Part number',                   stage: 'initiator',   required: false },
  { key: 'description', label: 'Problem description',           stage: 'initiator',   required: true },
  { key: 'category',    label: 'Issue category',                stage: 'initiator',   required: true,  locked: true },
  { key: 'respDept',    label: 'Responsibility (department)',   stage: 'initiator',   required: true,  locked: true },
  { key: 'containment', label: 'Containment action',            stage: 'responsible', required: true,  locked: true },
  { key: 'mp',          label: 'Total MP',                      stage: 'responsible', required: false },
  { key: 'mc',          label: 'No. of M-C',                    stage: 'responsible', required: false },
  { key: 'downtimeH',   label: 'Downtime hours (automatic)',    stage: 'auto',        required: false, locked: true },
  { key: 'approvalNote', label: 'Approver comment',             stage: 'approver',    required: false }
];
export const DEFAULT_LEAD = { target: 450, t3: 900, t4: 1440, t5: 2880 };   // minutes from the report time
export const DEFAULT_ISSUE_SETUP = {
  areas: ['Fabrication', 'Cutting Shop', 'Paint Shop', 'Assembly', 'Testing', 'PPIC', 'Quality'],
  natures: ['Abnormal', 'Day to Day'],
  categories: ['Poor Quality', 'Lack of Parts', 'Facility Breakdown', 'Others', 'BOM/Design Error'],
  respDepts: ['Assembly', 'SQA', 'Fabrication', 'PPIC', 'MPL', 'Design', 'Quality', 'Gray Zone', 'Sales', 'Maintenance', 'PE', 'PD', 'HR', 'Cutting Shop', 'CKD', 'MHB'],
  psm: { minRepeats: 5, minLossHours: 0, windowDays: 90 },   // 0 = rule switched off
  approval: { hodHours: 2, gmHours: 4 },                      // downtime above this: HOD / GM may also approve (optional)
  rate: 300                                                  // cost per man-hour lost
};

export async function getIssueSetup() {
  let d = {};
  try { const s = await getDoc(doc(db, 'config', 'issueSetup')); d = s.exists() ? s.data() : {}; } catch { /* use defaults */ }
  const fields = {};
  FIELD_DEFS.forEach((f) => {
    const c = d.fields?.[f.key] || {};
    fields[f.key] = { label: f.label, locked: !!f.locked, stage: f.locked ? f.stage : (c.stage || f.stage), required: f.locked && f.key !== 'approvalNote' && f.stage !== 'auto' ? true : (c.required ?? f.required) };
  });
  const arr = (k) => (Array.isArray(d[k]) && d[k].length ? d[k] : DEFAULT_ISSUE_SETUP[k]);
  const m = await getMaster();
  const areas = m.has ? masterDepts(m, 'issue') : arr('areas'), respDepts = m.has ? masterDepts(m) : arr('respDepts');
  return { fromMaster: m.has, areas, natures: arr('natures'), categories: arr('categories'), respDepts,
    psm: { ...DEFAULT_ISSUE_SETUP.psm, ...(d.psm || {}) }, approval: { ...DEFAULT_ISSUE_SETUP.approval, ...(d.approval || {}) }, rate: Number(d.rate ?? DEFAULT_ISSUE_SETUP.rate), fields };
}
export async function listIssueStations() {
  const m = await getMaster();
  return m.has ? issueStationsFromMaster(m) : listColl('issueStations');
}
export async function saveIssueSetup(patch) {
  await setDoc(doc(db, 'config', 'issueSetup'), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

// Simple master collections: issueStations, issueResp, issueLead
// Admin > Database: read every document of a collection as plain data, count, and delete them in batches
const plain = (v) => {
  if (v == null || typeof v !== 'object') return v;
  if (typeof v.toDate === 'function') { try { return v.toDate().toISOString(); } catch { return null; } }
  if (Array.isArray(v)) return v.map(plain);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
};
export async function readCollPlain(name) {
  const s = await getDocs(collection(db, name));
  return s.docs.map((d) => ({ id: d.id, ...plain(d.data()) }));
}
export async function deleteCollection(name, onProgress) {
  const s = await getDocs(collection(db, name)); let n = 0;
  for (let i = 0; i < s.docs.length; i += 400) {
    const b = writeBatch(db); s.docs.slice(i, i + 400).forEach((d) => b.delete(doc(db, name, d.id))); await b.commit(); n += Math.min(400, s.docs.length - i);
    if (onProgress) onProgress(n, s.docs.length);
  }
  return n;
}
export async function listColl(name) {
  const s = await getDocs(collection(db, name));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function saveColl(name, id, data) {
  await setDoc(doc(db, name, id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}
export async function deleteColl(name, id) { await deleteDoc(doc(db, name, id)); }
export async function deleteColls(name, ids, onProgress) {
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => batch.delete(doc(db, name, id)));
    await batch.commit();
    onProgress?.(Math.min(i + 400, ids.length), ids.length);
  }
  return ids.length;
}
export async function writeColl(name, items, { replace = false, onProgress } = {}) {
  const ops = items.map((it) => ({ id: it.id, data: (({ id, ...r }) => r)(it) }));
  if (replace) {
    const keep = new Set(items.map((i) => i.id));
    (await listColl(name)).forEach((r) => { if (!keep.has(r.id)) ops.push({ id: r.id, del: true }); });
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach((o) => { const ref = doc(db, name, o.id); if (o.del) batch.delete(ref); else batch.set(ref, { ...o.data, updatedAt: serverTimestamp() }, { merge: true }); });
    await batch.commit();
    onProgress?.(Math.min(i + 400, ops.length), ops.length);
  }
  return ops.length;
}

/* ----- organisation chart: each user has a level (1 to 5) and a superior (reportsTo = uid) ----- */
export function orgChain(users, uid) {
  const by = new Map(users.map((u) => [u.uid, u])), out = [], seen = new Set([uid]);
  let cur = by.get(uid);
  while (cur && cur.reportsTo && by.has(cur.reportsTo) && !seen.has(cur.reportsTo)) { cur = by.get(cur.reportsTo); seen.add(cur.uid); out.push(cur); }
  return out;                                               // nearest superior first
}
export const tierUser = (users, uid, k) => orgChain(users, uid).find((a) => lvOf(a.level) >= k && a.active !== false) || null;

/* ----- routing: who is responsible, who is above them, how long each step may take ----- */
const isAny = (c) => !c || c === '*';
export const pickResp = (resps, dept, cat) =>
  resps.find((r) => r.department === dept && r.category === cat) || resps.find((r) => r.department === dept && isAny(r.category)) || null;
export function pickLead(leads, dept, cat) {
  const r = leads.find((x) => x.department === dept && x.category === cat) || leads.find((x) => x.department === dept && isAny(x.category))
    || leads.find((x) => isAny(x.department) && x.category === cat) || leads.find((x) => isAny(x.department) && isAny(x.category));
  return { target: Number(r?.target ?? DEFAULT_LEAD.target), t3: Number(r?.t3 ?? DEFAULT_LEAD.t3), t4: Number(r?.t4 ?? DEFAULT_LEAD.t4), t5: Number(r?.t5 ?? DEFAULT_LEAD.t5), custom: !!r };
}
export function buildRoute({ users, resps, leads, respDept, respLine = '', category, initiatorUid, chosenUid = '' }) {
  const r = pickResp(resps, respDept, category);
  const lc = (x) => String(x || '').trim().toLowerCase();
  const live = (u) => u.active !== false && lvOf(u.level) >= 1;
  // People who work in the chosen responsible department (and line) come from their assigned area in User Control.
  // A department-level user (HOD, GM, MD) is listed for every line of the department.
  let cands = users.filter((u) => live(u) && respDept && lc(u.scopeDept) === lc(respDept) && (!respLine || !u.scopeLine || lc(u.scopeLine) === lc(respLine)));
  cands.sort((a, b) => (respLine ? (lc(b.scopeLine) === lc(respLine)) - (lc(a.scopeLine) === lc(respLine)) : 0) || lvOf(a.level) - lvOf(b.level) || String(a.name || '').localeCompare(String(b.name || '')));
  const fromScope = cands.length > 0;
  let uids = fromScope ? cands.map((u) => u.uid) : (r?.userUids || []).filter((u) => users.some((x) => x.uid === u && x.active !== false));
  const canPick = fromScope || (!!r?.pick && uids.length > 1);
  const pickUids = canPick ? uids.slice() : [];
  if (canPick) uids = [chosenUid && uids.includes(chosenUid) ? chosenUid : uids[0], ...[]].filter(Boolean);
  const primary = uids[0] || null;
  const tiers = { l2: null, l3: null, l4: null, l5: null };
  if (primary) [2, 3, 4, 5].forEach((k) => { tiers['l' + k] = tierUser(users, primary, k)?.uid || null; });
  // The initiator approves (mandatory). Their manager, HOD and GM may also approve, but it is not required.
  const optTiers = { l2: null, l3: null, l4: null };
  if (initiatorUid) [2, 3, 4].forEach((k) => { optTiers['l' + k] = tierUser(users, initiatorUid, k)?.uid || null; });
  // The initiator approves. A workman (Level 0) cannot approve, so the nearest superior of Level 1 or above does.
  const ini = users.find((u) => u.uid === initiatorUid);
  const approverUid = !initiatorUid ? null : (ini && lvOf(ini.level) === 0 ? (tierUser(users, initiatorUid, 1)?.uid || initiatorUid) : initiatorUid);
  return { responsibleUids: uids, primaryUid: primary, tiers, lead: pickLead(leads, respDept, category), approverUid, optTiers, canPick, pickUids, fromScope };
}

/* ----- dates and ids ----- */
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const issueMs = (i) => i.reportedAt?.toMillis?.() ?? i.reportedMs ?? 0;
export const dayKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const weekMonthOf = (d) => `${Math.ceil(d.getDate() / 7)}W-${MON3[d.getMonth()]}-${d.getFullYear()}`;
export const fmtDur = (m) => { m = Math.round(Math.abs(m)); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h} h ${r} m` : `${h} h`) : `${r} m`; };
export const issueNo = (i) => i.sn ? 'ISS-' + String(i.sn).padStart(4, '0') : (i.importSn ? 'Old-' + i.importSn : '-');
export const repeatKey = (i) => [i.area, i.line, i.station, i.category].map((x) => String(x || '').trim().toLowerCase()).join('|');

/* ----- who sees an issue, and in which role ----- */
export function issueRole(issue, uid, now = Date.now()) {
  const mins = (now - issueMs(issue)) / 60000, L = issue.lead || DEFAULT_LEAD, T = issue.tiers || {};
  const out = { role: null, level: 0, mins, overdue: issue.status === 'open' && mins > (L.target ?? 450) };
  if (issue.status === 'open') {
    if ((issue.responsibleUids || []).includes(uid)) { out.role = 'action'; out.level = 1; }
    else if (T.l2 === uid) { out.role = 'info'; out.level = 2; }
    else if (T.l3 === uid && mins >= L.t3) { out.role = 'escalated'; out.level = 3; }
    else if (T.l4 === uid && mins >= L.t4) { out.role = 'escalated'; out.level = 4; }
    else if (T.l5 === uid && mins >= L.t5) { out.role = 'escalated'; out.level = 5; }
  } else if (issue.status === 'pending') {
    if (issue.approverUid === uid) out.role = 'approve';
    else if ((issue.optApprovalUids || []).includes(uid)) out.role = (issue.signoffs || []).some((x) => x.uid === uid) ? 'signed' : 'cosign';
    else if ((issue.responsibleUids || []).includes(uid)) out.role = 'waiting';
  }
  if (!out.role && issue.initiatorUid === uid) out.role = 'mine';
  return out;
}
export function currentLevel(issue, now = Date.now()) {
  const mins = (now - issueMs(issue)) / 60000, L = issue.lead || DEFAULT_LEAD;
  return mins >= L.t5 ? 5 : mins >= L.t4 ? 4 : mins >= L.t3 ? 3 : 2;
}

/* ----- issues ----- */
export async function listIssues(statuses) {
  const s = await getDocs(statuses ? query(collection(db, 'issues'), where('status', 'in', statuses)) : collection(db, 'issues'));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function listIssuesAtStation(station) {
  const s = await getDocs(query(collection(db, 'issues'), where('station', '==', station)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function createIssue(data) {
  const ref = doc(collection(db, 'issues')), cref = doc(db, 'counters', 'issues');
  let sn = 0;
  await runTransaction(db, async (tx) => {
    const c = await tx.get(cref);
    sn = (c.exists() ? Number(c.data().n) || 0 : 0) + 1;
    tx.set(cref, { n: sn });
    tx.set(ref, { ...data, sn, createdAt: serverTimestamp(), reportedAt: serverTimestamp() });
  });
  return { id: ref.id, sn };
}
export async function updateIssue(id, data) { await updateDoc(doc(db, 'issues', id), { ...data, updatedAt: serverTimestamp() }); }

export async function submitContainment(issue, actor, vals, setup = {}) {
  const rate = typeof setup === 'number' ? setup : Number(setup.rate ?? 300);
  const ap = { ...DEFAULT_ISSUE_SETUP.approval, ...(setup.approval || {}) };
  const delayMin = Math.max(0, Math.round((Date.now() - issueMs(issue)) / 60000));
  const target = issue.lead?.target ?? DEFAULT_LEAD.target;
  // Downtime is the time from the issue report to the containment action
  const mp = Number(vals.mp) || 0, mc = Number(vals.mc) || 0, dt = Math.round((delayMin / 60) * 100) / 100;
  const O = issue.optTiers || {};
  const opt = [O.l2, dt > Number(ap.hodHours) ? O.l3 : null, dt > Number(ap.gmHours) ? O.l4 : null]
    .filter((u) => u && u !== issue.initiatorUid && u !== actor.uid);
  const hoursTotal = Math.round(mp * (mc > 0 ? mc : 1) * dt * 100) / 100;
  // Optional corrected loss when the response was late. The system downtime above is never changed.
  let corr = {};
  if (vals.correctedLossH !== undefined && vals.correctedLossH !== null && vals.correctedLossH !== '') {
    const cl = Number(vals.correctedLossH), why = String(vals.correctedReason || '').trim();
    if (!(cl >= 0)) throw new Error('Enter the corrected loss as hours (0 or more).');
    if (!why) throw new Error('Write the reason for the corrected loss.');
    corr = { lossCorrectedH: Math.round(cl * 100) / 100, lossCorrectedCost: Math.round(cl * rate), lossCorrectedReason: why, lossCorrectedBy: actor.name };
  }
  const data = {
    lossCorrectedH: null, lossCorrectedCost: null, lossCorrectedReason: '', lossCorrectedBy: '', ...corr,
    status: 'pending', containment: String(vals.containment || '').trim(), containmentBy: { uid: actor.uid, name: actor.name, employeeId: actor.employeeId },
    escalationLevel: Number(actor.level) || 1, delayMin, leadResult: delayMin >= target ? 'Not Achieved' : 'Achieved',
    mp, mc, downtimeH: dt, hoursTotal, mhCost: Math.round(hoursTotal * rate), containmentAt: serverTimestamp(),
    optApprovalUids: [...new Set(opt)], signoffs: [],
    approvalLevels: { hod: dt > Number(ap.hodHours), gm: dt > Number(ap.gmHours) }
  };
  await updateIssue(issue.id, data);
  return data;
}
export async function returnIssue(issue, actor, note) {
  await updateIssue(issue.id, {
    status: 'open', returnCount: (issue.returnCount || 0) + 1, returnNote: String(note || '').trim(),
    prevContainments: [...(issue.prevContainments || []), { text: issue.containment || '', by: issue.containmentBy?.name || '', returnedBy: actor.name }],
    containment: '', containmentAt: null, optApprovalUids: [], signoffs: [], lossCorrectedH: null, lossCorrectedCost: null, lossCorrectedReason: '', lossCorrectedBy: ''
  });
}
// Live repeat information for one issue: how many other issues share its station and category inside the PSM window
export function repeatInfo(issue, list, windowDays = 90, now = Date.now()) {
  const key = repeatKey(issue), win = (Number(windowDays) || 90) * 86400000, t0 = issueMs(issue);
  const same = list.filter((x) => x.id !== issue.id && repeatKey(x) === key && now - issueMs(x) <= win);
  const earlier = same.filter((x) => issueMs(x) < t0 || !t0).length;
  const loss = Math.round(same.reduce((a, x) => a + (Number(x.hoursTotal) || 0), 0) * 10) / 10;
  const last = same.reduce((m, x) => Math.max(m, issueMs(x)), 0);
  return { others: same.length, earlier, total: same.length + 1, loss, last, windowDays: Number(windowDays) || 90, repeated: same.length > 0 };
}
// Repeat count and loss for one issue's station, used to decide a PSM referral
export function psmCheck(issue, sameStation, psm, now = Date.now()) {
  const key = repeatKey(issue), win = (Number(psm.windowDays) || 90) * 86400000;
  const group = sameStation.filter((x) => repeatKey(x) === key && now - issueMs(x) <= win);
  if (!group.some((x) => x.id === issue.id)) group.push(issue);
  const loss = Math.round(group.reduce((a, x) => a + (Number(x.hoursTotal) || 0), 0) * 10) / 10;
  const byCount = Number(psm.minRepeats) > 0 && group.length >= Number(psm.minRepeats);
  const byLoss = Number(psm.minLossHours) > 0 && loss >= Number(psm.minLossHours);
  return { refer: byCount || byLoss, count: group.length, loss, reason: byCount ? `${group.length} repeats in ${psm.windowDays} days` : byLoss ? `${loss} loss hours in ${psm.windowDays} days` : '' };
}
// Optional approval by the initiator's manager, HOD or GM. It does not close the issue.
export async function signoffIssue(issue, actor, note) {
  const signoffs = [...(issue.signoffs || []).filter((x) => x.uid !== actor.uid), { uid: actor.uid, name: actor.name, level: Number(actor.level) || 0, note: String(note || '').trim(), at: Date.now() }];
  await updateIssue(issue.id, { signoffs });
  return signoffs;
}
export async function approveIssue(issue, actor, note, setup) {
  const same = await listIssuesAtStation(issue.station);
  const closed = { ...issue, status: 'closed' };
  const p = psmCheck(closed, same, setup.psm);
  const data = { status: 'closed', approvedBy: { uid: actor.uid, name: actor.name }, approvalNote: String(note || '').trim(), approvedAt: serverTimestamp(),
    psmRefer: p.refer, psmReason: p.reason, ...(p.refer && !issue.psmRefer ? { psmReferredAt: serverTimestamp() } : {}) };
  await updateIssue(issue.id, data);
  return { ...data, psm: p };
}
export const tsFromDate = (d) => Timestamp.fromDate(d);

/* =====================================================================
   Audit forms (built by the admin) and their responses
   ===================================================================== */
export async function listAuditForms() {
  const s = await getDocs(collection(db, 'auditForms'));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.title).localeCompare(String(b.title)));
}
// id = null creates a new form. Returns the form id.
export async function saveAuditForm(id, data) {
  if (id) { await setDoc(doc(db, 'auditForms', id), { ...data, updatedAt: serverTimestamp() }, { merge: true }); return id; }
  const ref = doc(collection(db, 'auditForms'));
  await setDoc(ref, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: auth.currentUser.uid });
  return ref.id;
}
export async function deleteAuditForm(id) { await deleteDoc(doc(db, 'auditForms', id)); }
// Without formId: the latest `max` responses of all forms. With formId: every response of that form (newest first).
export async function listAuditResponses({ formId, max = 10 } = {}) {
  const ms = (r) => r.createdAt?.toMillis?.() ?? 0;
  if (formId) {
    const s = await getDocs(query(collection(db, 'auditResponses'), where('formId', '==', formId)));
    return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b) - ms(a));
  }
  const s = await getDocs(query(collection(db, 'auditResponses'), orderBy('createdAt', 'desc'), limit(max)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b) - ms(a)).slice(0, max);
}
export async function submitAudit(data) {
  const ref = doc(collection(db, 'auditResponses'));
  await setDoc(ref, { ...data, auditorUid: auth.currentUser.uid, createdAt: serverTimestamp() });
  return ref.id;
}

/* =====================================================================
   Improvement (ideas): raise, approve (Level 2 manager), complete, sustainability checks
   ===================================================================== */
// Idea number = line code + serial, for example FB001. Codes come from Annexure A and can be changed by the admin.
export const DEFAULT_IMP_SETUP = {
  lines: [
    ['Fabrication', 'Boom Line', 'FB'], ['Fabrication', 'Arm Line', 'FA'], ['Fabrication', 'Upper Line', 'FU'], ['Fabrication', 'Lower Line', 'FL'],
    ['Fabrication', 'Cutting Shop', 'FC'], ['Fabrication', 'Paint Shop', 'FP'],
    ['Assembly', 'Upper Assy', 'AU'], ['Assembly', 'Lower Assy', 'AL'], ['Assembly', 'Main Line', 'AM'], ['Assembly', 'FDI Line', 'AF'], ['Assembly', 'MEX Line', 'MEx'],
    ['Mfg. & Maintenance', 'Mfg. & Maint.', 'MM'],
    ['PPIC', 'Assy Store', 'WS'], ['PPIC', 'Warehouse - 1', 'W1'], ['PPIC', 'Warehouse - 2', 'W2'], ['PPIC', 'Warehouse - 3', 'W3'],
    ['PPIC', 'Testing', 'QT'], ['PPIC', 'Rebuilt Center', 'RC'],
    ['Quality', 'Quality', 'QT'], ['After Service', 'After Service', 'RC'],
    ['HD Hyundai', 'HD Hyundai', 'HD'], ['Other than Field Team', 'Other than Field Team', 'OO']
  ].map(([dept, line, code]) => ({ dept, line, code })),
  stations: [],                                   // { dept, line, name }
  sources: ['3G walk', 'Suggestion', 'SIP', 'Breakdown Analysis', 'Module Name'],
  categories: ['Safety', 'Quality', 'Delivery', 'Cost', 'Productivity'],
  supports: ['PE', 'TD', 'Prod', 'Maintenance', 'Other'],
  notifyUids: []                                  // users who get every idea together with the Level 2 manager (used when a manager is not set)
};
export const IMP_PRIORITIES = ['High', 'Medium', 'Low'];
export async function getImprovementSetup() {
  let d = {};
  try { const s = await getDoc(doc(db, 'config', 'improvementSetup')); d = s.exists() ? s.data() : {}; } catch { /* use defaults */ }
  const arr = (k) => (Array.isArray(d[k]) && d[k].length ? d[k] : DEFAULT_IMP_SETUP[k]);
  const m = await getMaster(), fm = m.has ? improvementFromMaster(m) : null;
  return { fromMaster: !!fm, lines: fm ? fm.lines : arr('lines'), stations: fm ? fm.stations : (Array.isArray(d.stations) ? d.stations : []), sources: arr('sources'), categories: arr('categories'), supports: m.has ? masterDepts(m) : arr('supports'), supportsFromMaster: !!m.has,
    notifyUids: Array.isArray(d.notifyUids) ? d.notifyUids : [] };
}
export async function saveImprovementSetup(data) { await setDoc(doc(db, 'config', 'improvementSetup'), { ...data, updatedAt: serverTimestamp() }, { merge: true }); }

export async function listImprovements() {
  const s = await getDocs(collection(db, 'improvements'));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdMs || 0) - (a.createdMs || 0));
}
export async function createImprovement(data, code) {
  const ref = doc(collection(db, 'improvements')), cref = doc(db, 'impCounters', code);
  let serial = 0;
  await runTransaction(db, async (tx) => {
    const c = await tx.get(cref);
    serial = (c.exists() ? Number(c.data().n) || 0 : 0) + 1;
    tx.set(cref, { n: serial });
    tx.set(ref, { ...data, code, serial, no: code + String(serial).padStart(3, '0'), createdAt: serverTimestamp(), createdMs: Date.now() });
  });
  return { id: ref.id, no: code + String(serial).padStart(3, '0') };
}
export async function updateImprovement(id, data) { await updateDoc(doc(db, 'improvements', id), { ...data, updatedAt: serverTimestamp() }); }

export const SUSTAIN_KEYS = ['m1', 'm2', 'm3'];
export const dayStr = (d = new Date()) => dayKeyOf(d);
export const parseDay = (s) => { const [y, m, d] = String(s || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
export function addMonths(s, n) {
  const d = parseDay(s); if (!d) return null;
  const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last));
  return dayKeyOf(d);
}
export const daysBetween = (a, b) => { const x = parseDay(a), y = parseDay(b); return x && y ? Math.round((y - x) / 86400000) : null; };
export const sustainDue = (i, k) => addMonths(i.completedDay, SUSTAIN_KEYS.indexOf(k) + 1);
// Checks that are due today or earlier and not yet filled in
export function sustainPending(i, today = dayStr()) {
  if (i.status !== 'completed' || !i.completedDay) return [];
  return SUSTAIN_KEYS.filter((k) => !i.sustain?.[k]?.result && sustainDue(i, k) <= today);
}
// What this user has to do with the idea. admin is not listed as a role unless they are one of the approvers.
export function impRole(i, uid, today = dayStr(), now = Date.now()) {
  const ap = (i.approverUids || []).includes(uid);
  if (i.status === 'pending' && ap) return { role: 'approve' };
  if (i.status === 'approved' && i.respUid === uid) return { role: 'complete' };
  if (i.status === 'completed') {
    const due = sustainPending(i, today).filter((k) => (i.sustain?.[k]?.assignUid ? i.sustain[k].assignUid === uid : ap));
    if (due.length) return { role: 'sustain', keys: due };
  }
  if (i.status === 'rejected' && i.byUid === uid && now - (i.approvedMs || 0) < 7 * 86400000) return { role: 'rejected' };
  return { role: null };
}
// Lead time: days from the idea date to the completion date
export const impLeadDays = (i) => (i.completedDay ? daysBetween(i.createdDay, i.completedDay) : null);

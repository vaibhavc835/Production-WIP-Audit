/* =====================================================================
   js/database-admin.js
   Admin Control > Database. See what is stored, download everything, and delete trial data.
   Loaded by admin.html only when the tab is opened.
   ===================================================================== */
import { icon, esc, toast, openModal, friendlyError, readCollPlain, deleteCollection } from './wip-core.js';

// [collection, label, group, what it holds]
const COLLS = [
  ['inventoryChecks', 'Inventory checks', 'data', 'Every station check submitted'],
  ['inventoryLatest', 'Latest inventory status', 'data', 'Latest check per line (dashboard)'],
  ['issues', 'Issues', 'data', 'Issue reports with actions and approvals'],
  ['counters', 'Issue number counter', 'data', 'Next issue number (restarts at ISS-0001 when deleted)'],
  ['improvements', 'Improvement ideas', 'data', 'Ideas with approvals and sustainability checks'],
  ['impCounters', 'Idea number counters', 'data', 'Next idea number per line code'],
  ['auditResponses', 'Audit responses', 'data', 'Submitted audits and checksheets'],
  ['auditForms', 'Audit forms', 'setup', 'Audit forms and checksheets you built'],
  ['issueResp', 'Issue responsibility', 'setup', 'Responsible users per department and category'],
  ['issueLead', 'Issue lead times', 'setup', 'Target and escalation times'],
  ['issueStations', 'Issue stations (old list)', 'setup', 'Older station list, no longer used when Master Data exists'],
  ['inventory', 'Inventory stations', 'setup', 'Inventory points (rebuilt from Master Data)'],
  ['config', 'Settings and Master Data', 'setup', 'Master Data, Issue setup, Improvement setup, Admin message'],
  ['users', 'Users', 'keep', 'User profiles. These are never deleted here (you would be locked out).']
];
const DOWNLOAD = COLLS.map((c) => c[0]);                    // temporary passwords are never included in a download
const CSS = `.dbx .card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:14px}
.dbx h3{margin:0 0 4px;font-size:16px}.dbx .hint{margin:0 0 10px}.dbx table{width:100%;border-collapse:collapse;font-size:14px}
.dbx th{text-align:left;padding:8px;border-bottom:1px solid var(--line);background:#f8fafc}.dbx td{padding:8px;border-bottom:1px solid #eef1f5;vertical-align:middle}
.dbx td.n{text-align:right;font-variant-numeric:tabular-nums}.dbx .grp{font-size:12px;font-weight:700;color:#475569;background:#f1f5f9}
.dbx .danger{border-color:#fecaca;background:#fff7f7}.dbx input[type=checkbox]{width:auto}`;
const clean = (v) => String(v ?? '').trim();

export async function renderDatabase(panel, ctx) {
  if (!document.getElementById('dbxCss')) { const s = document.createElement('style'); s.id = 'dbxCss'; s.textContent = CSS; document.head.appendChild(s); }
  let backedUp = false;
  const counts = {};
  async function count() {
    await Promise.all(COLLS.map(async ([n]) => { try { counts[n] = (await readCollPlain(n)).length; } catch (e) { counts[n] = -1; } }));
  }
  panel.innerHTML = '<div class="empty">Counting records…</div>';
  await count();
  const draw = () => {
    const total = COLLS.reduce((a, [n]) => a + Math.max(0, counts[n] || 0), 0);
    const row = ([n, label, g, what]) => `<tr><td>${g === 'keep' ? '' : `<input type="checkbox" data-c="${n}" aria-label="Delete ${esc(label)}">`}</td><td><b>${esc(label)}</b><div class="hint" style="margin:0">${esc(what)}</div></td><td class="n">${counts[n] < 0 ? 'No access' : counts[n]}</td></tr>`;
    const grp = (g, t) => `<tr><td colspan="3" class="grp">${t}</td></tr>` + COLLS.filter((c) => c[2] === g).map(row).join('');
    panel.innerHTML = `<div class="dbx" style="padding:16px">
      <div class="card"><h3>1. Download everything</h3><p class="hint">Saves every record in the database up to now (${total} records). Use the Excel file to read it and the JSON file as a full backup. Temporary passwords are not included.</p>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-primary" id="dbX">${icon('upload')}<span>Download Excel</span></button><button type="button" class="btn btn-ghost" id="dbJ"><span>Download JSON backup</span></button></div><div class="hint" id="dbMsg" style="margin-top:8px"></div></div>
      <div class="card danger"><h3>2. Delete data</h3><p class="hint">Tick what to delete. <b>Deleting cannot be undone.</b> Download first. Users are kept. To clear the trial, use "Select all trial data" and delete.</p>
        <div class="tbl-wrap"><table><thead><tr><th></th><th>Collection</th><th class="n">Records</th></tr></thead><tbody>${grp('data', 'Trial data (inventory, issues, improvement, audit)')}${grp('setup', 'Setup and masters (delete only if you want to start fresh)')}${grp('keep', 'Always kept')}</tbody></table></div>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px"><button type="button" class="btn btn-ghost" id="dbSel">Select all trial data</button><button type="button" class="btn btn-ghost" id="dbNone">Clear ticks</button><span style="flex:1"></span><button type="button" class="btn btn-danger" id="dbDel">Delete ticked data</button></div><div class="hint" id="dbDelMsg" style="margin-top:8px"></div></div></div>`;
    const $ = (id) => panel.querySelector('#' + id);
    $('dbSel').onclick = () => panel.querySelectorAll('input[data-c]').forEach((b) => { b.checked = COLLS.find((c) => c[0] === b.dataset.c)[2] === 'data'; });
    $('dbNone').onclick = () => panel.querySelectorAll('input[data-c]').forEach((b) => { b.checked = false; });
    $('dbX').onclick = (ev) => download(ev.currentTarget, 'xlsx'); $('dbJ').onclick = (ev) => download(ev.currentTarget, 'json');
    $('dbDel').onclick = () => confirmDelete();
  };
  const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };
  const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const loadX = () => new Promise((res, rej) => {
    if (window.XLSX) return res(window.XLSX);
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error('Could not load the Excel library. Check your internet connection.')); document.head.appendChild(s);
  });
  async function download(btn, kind) {
    const msg = panel.querySelector('#dbMsg'); btn.disabled = true; msg.textContent = 'Reading the database…';
    try {
      const data = {};
      for (const n of DOWNLOAD) data[n] = (await readCollPlain(n)).map((r) => (n === 'users' ? (({ password, ...x }) => x)(r) : r));
      const name = `WIP_Database_${stamp()}`;
      if (kind === 'json') save(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), exportedBy: ctx.name, data }, null, 1)], { type: 'application/json' }), name + '.json');
      else {
        const X = await loadX(), wb = X.utils.book_new();
        const flat = (v) => { if (v == null) return ''; if (typeof v === 'object') return JSON.stringify(v).slice(0, 32000); return typeof v === 'string' ? v.slice(0, 32000) : v; };
        for (const n of DOWNLOAD) {
          const rows = data[n]; if (!rows.length) continue;
          const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
          const ws = X.utils.aoa_to_sheet([keys, ...rows.map((r) => keys.map((k) => flat(r[k])))]);
          ws['!cols'] = keys.map(() => ({ wch: 18 }));
          X.utils.book_append_sheet(wb, ws, n.slice(0, 31));
        }
        if (!wb.SheetNames.length) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['The database is empty']]), 'Empty');
        const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
        save(new Blob([out], { type: 'application/octet-stream' }), name + '.xlsx');
      }
      backedUp = true; msg.textContent = `Downloaded ${Object.values(data).reduce((a, r) => a + r.length, 0)} records.`;
    } catch (e) { msg.textContent = friendlyError(e); }
    btn.disabled = false;
  }
  function confirmDelete() {
    const ticked = [...panel.querySelectorAll('input[data-c]:checked')].map((b) => b.dataset.c);
    const msg = panel.querySelector('#dbDelMsg');
    if (!ticked.length) { msg.textContent = 'Tick at least one collection.'; return; }
    msg.textContent = '';
    const n = ticked.reduce((a, c) => a + Math.max(0, counts[c] || 0), 0);
    const m = openModal({
      title: 'Delete data permanently', html: `<p>You are about to delete <b>${n}</b> records from: <b>${ticked.map((c) => esc(COLLS.find((x) => x[0] === c)[1])).join(', ')}</b>.</p>
        <p class="hint">This cannot be undone.${ticked.includes('config') ? ' <b>Settings and Master Data will be removed too.</b>' : ''}</p>
        <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="d_bk" style="width:auto" ${backedUp ? 'checked' : ''}> I have downloaded a backup</label>
        <label class="l" for="d_ty" style="margin-top:10px">Type DELETE to confirm</label><input id="d_ty" autocomplete="off"><div class="err" id="d_err" style="color:#b91c1c;margin-top:6px"></div>`,
      actions: [{ label: 'Cancel', onClick: (x) => x.close() }, { label: 'Delete now', kind: 'danger', onClick: async (x, btn) => {
        const err = x.body.querySelector('#d_err');
        if (!x.body.querySelector('#d_bk').checked) { err.textContent = 'Download a backup first, then tick the box.'; return; }
        if (clean(x.body.querySelector('#d_ty').value) !== 'DELETE') { err.textContent = 'Type DELETE in capital letters.'; return; }
        btn.disabled = true;
        try {
          for (const c of ticked) { err.textContent = `Deleting ${c}…`; await deleteCollection(c); }
          x.close(); toast('Data deleted.'); renderDatabase(panel, ctx);
        } catch (e) { err.textContent = friendlyError(e); btn.disabled = false; }
      } }]
    });
  }
  draw();
}

/* =====================================================================
   js/issue-setup.js
   Admin Control > Issue Setup. Loaded by admin.html only when the tab is opened.
   Masters: organisation chart, lists, stations, responsibility, lead time, form fields, PSM rule, past data.
   ===================================================================== */
import {
  icon, esc, toast, openModal, confirmBox, friendlyError, slug,
  listUsers, listStations, ORG_LEVELS, levelLabel, lvOf, FIELD_DEFS, DEFAULT_LEAD,
  getIssueSetup, saveIssueSetup, listColl, saveColl, deleteColl, writeColl, deleteColls,
  listIssues, buildRoute, pickLead, tsFromDate, dayKeyOf, weekMonthOf, orgChain
} from './wip-core.js';

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const nk = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const lc = (v) => clean(v).toLowerCase();
const pad2 = (n) => String(n).padStart(2, '0');

let xlsxP;
const loadXLSX = () => xlsxP || (xlsxP = new Promise((res, rej) => {
  if (window.XLSX) return res(window.XLSX);
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onload = () => res(window.XLSX);
  s.onerror = () => { xlsxP = null; rej(new Error('Could not load the Excel reader. Check your internet connection.')); };
  document.head.appendChild(s);
}));
const pickFile = () => new Promise((resolve) => {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xls,.xlsm';
  inp.onchange = () => resolve(inp.files[0] || null); inp.click();
});

const CSS = `
.isx .sub{display:flex;gap:8px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--line)}
.isx .sub button{padding:7px 14px;border-radius:999px;border:1px solid var(--line);background:#fff;font-weight:600;font-size:13.5px;color:var(--ink2)}
.isx .sub button:hover{background:#f1f5f9}
.isx .sub button.on{background:var(--navy);border-color:var(--navy);color:#fff}
.isx .pad{padding:16px}
.isx .help{color:var(--muted);font-size:13.5px;max-width:78ch;margin-bottom:12px}
.isx .tree,.isx .tree ul{list-style:none;margin:0;padding-left:22px;border-left:2px solid var(--line)}
.isx .tree{border-left:0;padding-left:0}
.isx .tree li{margin:6px 0}
.isx .node{display:inline-flex;gap:8px;align-items:center;padding:6px 12px;border:1px solid var(--line);border-radius:10px;background:#fff}
.isx .node small{color:var(--muted)}
.isx .lv{font-size:11.5px;font-weight:700;padding:1px 8px;border-radius:999px;background:#e0f2fe;color:#075985}
.isx .lv.l0{background:#e0f2fe;color:#075985}.isx .lv.l5{background:#fee2e2;color:#991b1b}.isx .lv.l4{background:#fef3c7;color:#92400e}.isx .lv.l3{background:#ede9fe;color:#5b21b6}.isx .lv.l2{background:#dcfce7;color:#166534}
.isx textarea.list{min-height:150px;font-size:14px}
.isx .lists{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.isx .chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.isx .chip2{display:inline-flex;align-items:center;gap:6px;padding:4px 6px 4px 10px;border-radius:999px;background:#f1f5f9;border:1px solid var(--line);font-size:13px}
.isx .chip2.pri{background:#dcfce7;border-color:#86efac}
.isx .chip2 button{padding:0 4px;color:var(--muted);font-size:13px}
.isx .path{font-size:12.5px;color:var(--muted)}
.isx .warn{color:#b45309}
.isx .numgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
@media (max-width:700px){.isx .lists{grid-template-columns:1fr}.isx .numgrid{grid-template-columns:1fr 1fr}}
`;

export async function renderIssueSetup(panel, ctx) {
  if (!document.getElementById('isx-style')) { const st = document.createElement('style'); st.id = 'isx-style'; st.textContent = CSS; document.head.appendChild(st); }

  const D = { users: [], setup: null, stations: [], resp: [], lead: [] };
  const reload = async (...keys) => {
    const all = !keys.length, want = (k) => all || keys.includes(k);
    const jobs = [];
    if (want('users')) jobs.push(listUsers().then((u) => { D.users = u.map((x) => ({ ...x, level: lvOf(x.level) })).sort((a, b) => String(a.name).localeCompare(String(b.name))); }));
    if (want('setup')) jobs.push(getIssueSetup().then((s) => { D.setup = s; }));
    if (want('stations')) jobs.push(listColl('issueStations').then((r) => { D.stations = r; }));
    if (want('resp')) jobs.push(listColl('issueResp').then((r) => { D.resp = r; }));
    if (want('lead')) jobs.push(listColl('issueLead').then((r) => { D.lead = r; }));
    await Promise.all(jobs);
  };
  try { await reload(); } catch (e) { panel.innerHTML = `<div class="empty"><b>Could not load data.</b><p>${esc(friendlyError(e))}</p></div>`; return; }

  const TABS = [['org', 'Organization'], ['lists', 'Lists'], ['stations', 'Stations'], ['resp', 'Responsibility'], ['lead', 'Lead time'], ['fields', 'Form fields'], ['psm', 'PSM, cost, approval'], ['import', 'Past data']];
  let tab = sessionStorage.getItem('isxTab') || 'org';
  panel.innerHTML = `<div class="isx"><div class="sub" id="isSub">${TABS.map(([k, l]) => `<button type="button" data-k="${k}">${l}</button>`).join('')}</div><div id="isBody"></div></div>`;
  const body = panel.querySelector('#isBody');
  const show = (k) => {
    tab = k; try { sessionStorage.setItem('isxTab', k); } catch { /* ignore */ }
    panel.querySelectorAll('#isSub button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    ({ org: drawOrg, lists: drawLists, stations: drawStations, resp: drawResp, lead: drawLead, fields: drawFields, psm: drawPsm, import: drawImport })[k]();
  };
  panel.querySelectorAll('#isSub button').forEach((b) => { b.onclick = () => show(b.dataset.k); });
  const userName = (uid) => D.users.find((u) => u.uid === uid)?.name || '';
  const lvBadge = (n) => `<span class="lv l${n}">${esc(levelLabel(n))}</span>`;
  const fail = (e) => toast(friendlyError(e));

  /* ---------------- 1. Organization ---------------- */
  function drawOrg() {
    const active = D.users.filter((u) => u.active !== false), ids = new Set(active.map((u) => u.uid));
    const kids = new Map(); active.forEach((u) => { const p = ids.has(u.reportsTo) ? u.reportsTo : ''; (kids.get(p) || kids.set(p, []).get(p)).push(u); });
    const sortU = (a, b) => b.level - a.level || String(a.name).localeCompare(String(b.name));
    const node = (u) => `<li><span class="node"><b>${esc(u.name)}</b><small>${esc(u.employeeId || '')}</small>${lvBadge(u.level)}</span>${(kids.get(u.uid) || []).length ? `<ul>${kids.get(u.uid).sort(sortU).map(node).join('')}</ul>` : ''}</li>`;
    const top = (kids.get('') || []).filter((u) => u.level >= 2).sort(sortU);
    const loose = (kids.get('') || []).filter((u) => u.level < 2).sort(sortU);
    body.innerHTML = `<div class="pad"><p class="help">The organization chart is built from <b>Level</b> and <b>Reports to</b> on each user (Admin Control, User Database). Escalation follows this chart: a responsible user's Level 2 is their manager, Level 3 the manager's superior, and so on. Approval of a containment goes to the initiator's manager.</p>
      ${top.length ? `<ul class="tree">${top.map(node).join('')}</ul>` : '<div class="empty">No managers yet. Edit users in User Database and set their level and who they report to.</div>'}
      ${loose.length ? `<h3 style="margin:22px 0 8px;font-size:15px">Level 0 and Level 1 users not placed under anyone <span class="path">(${loose.length})</span></h3><div class="chips">${loose.map((u) => `<span class="chip2">${esc(u.name)}</span>`).join('')}</div><p class="hint">Edit each user and set Reports to, otherwise issues for them cannot escalate.</p>` : ''}</div>`;
  }

  /* ---------------- 2. Lists ---------------- */
  function drawLists() {
    const fm = D.setup.fromMaster;
    const L = [['areas', 'Dept. / Area (where the issue is found)'], ['natures', 'Nature of issue'], ['categories', 'Issue category'], ['respDepts', 'Responsible departments']].filter(([k]) => !(fm && (k === 'areas' || k === 'respDepts')));
    body.innerHTML = `<div class="pad"><p class="help">One item per line. These lists feed the dropdowns of the issue form and the masters. Removing an item here does not change old issues.${fm ? ' <b>Dept. / Area and Responsible departments now come from Master Data</b> (Admin Control &gt; Master Data).' : ''}</p>
      <div class="lists">${L.map(([k, t]) => `<div><label class="l" for="ls_${k}">${t}</label><textarea class="list" id="ls_${k}">${esc(D.setup[k].join('\n'))}</textarea></div>`).join('')}</div>
      <div class="row" style="margin-top:14px;justify-content:flex-end"><button type="button" class="btn btn-primary" id="lsSave">Save lists</button></div></div>`;
    body.querySelector('#lsSave').onclick = async (ev) => {
      const b = ev.currentTarget, patch = {};
      for (const [k] of L) { patch[k] = [...new Set(body.querySelector('#ls_' + k).value.split('\n').map(clean).filter(Boolean))]; if (!patch[k].length) { toast('Each list needs at least one item.'); return; } }
      b.disabled = true;
      try { await saveIssueSetup(patch); Object.assign(D.setup, patch); toast('Lists saved.'); } catch (e) { fail(e); }
      b.disabled = false;
    };
  }

  /* ---------------- 3. Stations (issue form) ---------------- */
  function drawStations() {
    if (D.setup.fromMaster) { body.innerHTML = `<div class="pad"><div class="empty"><b>The stations come from Master Data.</b><p>Departments, lines and stations are now kept in one place for every page. Add or change them in Admin Control &gt; Master Data.</p></div></div>`; return; }
    const areas = [...new Set(D.stations.map((s) => s.area))].sort();
    body.innerHTML = `<div class="toolbar">
        <div class="search">${icon('search')}<input id="sq" type="search" placeholder="Search station or line" aria-label="Search"></div>
        <select id="sa" aria-label="Area"><option value="">All areas</option>${areas.map((a) => `<option>${esc(a)}</option>`).join('')}</select>
        <span style="flex:1"></span>
        <button type="button" class="btn btn-ghost" id="sCopy">Copy from Station Database</button>
        <button type="button" class="btn btn-ghost" id="sImp">${icon('upload')}<span>Import Excel</span></button>
        <button type="button" class="btn btn-primary" id="sAdd">${icon('plus')}<span>Add station</span></button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Dept. / Area</th><th>Line</th><th>Station name</th><th></th></tr></thead><tbody id="sb"></tbody></table></div><div class="note" id="sn"></div>`;
    const draw = () => {
      const q = lc(body.querySelector('#sq').value), a = body.querySelector('#sa').value;
      const list = D.stations.filter((s) => (!a || s.area === a) && (!q || lc(`${s.station} ${s.line}`).includes(q)))
        .sort((x, y) => x.area.localeCompare(y.area) || x.line.localeCompare(y.line) || x.station.localeCompare(y.station));
      body.querySelector('#sb').innerHTML = list.slice(0, 400).map((s) => `<tr><td data-label="Area">${esc(s.area)}</td><td data-label="Line">${esc(s.line)}</td><td data-label="Station"><b>${esc(s.station)}</b></td>
        <td class="acts-td"><div class="acts"><button type="button" class="btn btn-ghost btn-sm" data-e="${esc(s.id)}">${icon('edit')}<span>Edit</span></button>
        <button type="button" class="btn btn-danger btn-sm" data-d="${esc(s.id)}" aria-label="Delete">${icon('trash')}</button></div></td></tr>`).join('')
        || `<tr><td colspan="4"><div class="empty">${D.stations.length ? 'No stations match.' : 'No stations yet. Add one, import Excel, or copy from the Station Database.'}</div></td></tr>`;
      body.querySelector('#sn').textContent = `Showing ${Math.min(list.length, 400)} of ${D.stations.length} stations`;
      body.querySelectorAll('[data-e]').forEach((b) => { b.onclick = () => stationDlg(D.stations.find((s) => s.id === b.dataset.e)); });
      body.querySelectorAll('[data-d]').forEach((b) => { b.onclick = async () => {
        const s = D.stations.find((z) => z.id === b.dataset.d);
        if (!(await confirmBox({ title: 'Delete station', message: `Delete “${s.station}” from ${s.line}? Old issues keep their station name.`, okLabel: 'Delete', danger: true }))) return;
        try { await deleteColl('issueStations', s.id); D.stations = D.stations.filter((z) => z.id !== s.id); drawStations(); toast('Station deleted.'); } catch (e) { fail(e); }
      }; });
    };
    body.querySelector('#sq').oninput = draw; body.querySelector('#sa').onchange = draw;
    body.querySelector('#sAdd').onclick = () => stationDlg(null);
    body.querySelector('#sImp').onclick = importStations;
    body.querySelector('#sCopy').onclick = copyStations;
    draw();
  }

  const ensureAreas = async (list) => {
    const missing = [...new Set(list)].filter((a) => a && !D.setup.areas.some((x) => lc(x) === lc(a)));
    if (!missing.length) return;
    const areas = [...D.setup.areas, ...missing]; await saveIssueSetup({ areas }); D.setup.areas = areas;
  };
  const stId = (s) => slug([s.area, s.line, s.station].join('|'));

  function stationDlg(s) {
    const m = openModal({
      title: s ? 'Edit station' : 'Add station',
      html: `<form class="fg" autocomplete="off">
        <div class="full"><label class="l" for="e_a">Dept. / Area</label><select id="e_a">${D.setup.areas.map((a) => `<option ${a === s?.area ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></div>
        <div><label class="l" for="e_l">Line</label><input id="e_l" list="dl_ln" value="${esc(s?.line || '')}"></div>
        <div><label class="l" for="e_s">Station name</label><input id="e_s" value="${esc(s?.station || '')}"></div></form>
        <datalist id="dl_ln">${[...new Set(D.stations.map((x) => x.line))].map((l) => `<option value="${esc(l)}">`).join('')}</datalist><div class="err" id="e_err"></div>`,
      actions: [{ label: 'Cancel', onClick: (x) => x.close() }, { label: s ? 'Save changes' : 'Add station', kind: 'primary', onClick: save }]
    });
    const $ = (id) => m.el.querySelector('#' + id);
    async function save(x, btn) {
      const d = { area: $('e_a').value, line: clean($('e_l').value), station: clean($('e_s').value) };
      if (!d.area || !d.line || !d.station) { $('e_err').textContent = 'Area, line and station name are required.'; return; }
      const id = s ? s.id : stId(d);
      if (!s && D.stations.some((z) => z.id === id)) { $('e_err').textContent = 'This station already exists on that line.'; return; }
      btn.disabled = true; x.locked = true;
      try {
        await saveColl('issueStations', id, d);
        if (s) Object.assign(s, d); else D.stations.push({ id, ...d });
        x.locked = false; x.close(); drawStations(); toast(s ? 'Changes saved.' : 'Station added.');
      } catch (e) { $('e_err').textContent = friendlyError(e); btn.disabled = false; x.locked = false; }
    }
  }

  async function importStations() {
    const file = await pickFile(); if (!file) return;
    try {
      const X = await loadXLSX(), wb = X.read(await file.arrayBuffer(), { type: 'array' });
      const rows = []; let sheet = '';
      for (const name of wb.SheetNames) {
        const raw = X.utils.sheet_to_json(wb.Sheets[name], { defval: '' }).map((r) => { const o = {}; Object.keys(r).forEach((k) => { o[nk(k)] = r[k]; }); return o; });
        if (raw.length && ('line' in raw[0]) && ('stationname' in raw[0] || 'station' in raw[0]) && ('area' in raw[0] || 'department' in raw[0] || 'deptarea' in raw[0])) { sheet = name; raw.forEach((r) => rows.push(r)); break; }
      }
      if (!sheet) throw new Error('Could not find the columns. Use: Department (or Area), Line, Station Name.');
      const items = [], seen = new Set();
      rows.forEach((r) => {
        const d = { area: clean(r.area || r.department || r.deptarea), line: clean(r.line), station: clean(r.stationname || r.station) };
        if (!d.area || !d.line || !d.station) return;
        const a = D.setup.areas.find((x) => lc(x) === lc(d.area)); if (a) d.area = a;
        const id = stId(d); if (seen.has(id)) return; seen.add(id); items.push({ id, ...d });
      });
      if (!items.length) { toast('No valid rows found.'); return; }
      const fresh = items.filter((i) => !D.stations.some((z) => z.id === i.id)).length;
      const ok = await confirmBox({ title: 'Import stations', message: `${items.length} stations found in “${sheet}”: ${fresh} new, ${items.length - fresh} already in the list. Import now?`, okLabel: 'Import' });
      if (!ok) return;
      await writeColl('issueStations', items); await ensureAreas(items.map((i) => i.area)); await reload('stations'); drawStations(); toast(`${items.length} stations imported.`);
    } catch (e) { toast(e.message || friendlyError(e)); }
  }

  async function copyStations() {
    try {
      const inv = await listStations();
      const items = inv.map((s) => ({ area: clean(s.department), line: clean(s.line), station: clean(s.stationName) })).filter((s) => s.area && s.line && s.station).map((s) => ({ id: stId(s), ...s }));
      const fresh = items.filter((i) => !D.stations.some((z) => z.id === i.id));
      if (!fresh.length) { toast('Everything from the Station Database is already in this list.'); return; }
      if (!(await confirmBox({ title: 'Copy from Station Database', message: `${fresh.length} stations will be added (${items.length - fresh.length} already here). You can edit or delete them afterwards.`, okLabel: 'Copy' }))) return;
      await writeColl('issueStations', fresh); await ensureAreas(fresh.map((i) => i.area)); await reload('stations'); drawStations(); toast(`${fresh.length} stations added.`);
    } catch (e) { fail(e); }
  }

  /* ---------------- 4. Responsibility ---------------- */
  function drawResp() {
    body.innerHTML = `<div class="toolbar"><select id="rd" aria-label="Department"><option value="">All departments</option>${D.setup.respDepts.map((d) => `<option>${esc(d)}</option>`).join('')}</select><span style="flex:1"></span>
      <button type="button" class="btn btn-primary" id="rAdd">${icon('plus')}<span>Add responsibility</span></button></div>
      <p class="help" style="padding:12px 16px 0">For each responsible department and issue category, choose the Level 1 users who act on the issue. The first user is the primary. Levels 2 to 5 come from the organization chart.</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Responsible department</th><th>Category</th><th>Responsible users (Level 1)</th><th>Initiator picks user</th><th>Escalation path</th><th></th></tr></thead><tbody id="rb"></tbody></table></div><div class="note" id="rn"></div>`;
    const draw = () => {
      const d = body.querySelector('#rd').value;
      const list = D.resp.filter((r) => !d || r.department === d).sort((a, b) => a.department.localeCompare(b.department) || String(a.category).localeCompare(String(b.category)));
      body.querySelector('#rb').innerHTML = list.map((r) => {
        const first = r.userUids?.[0], chain = first ? orgChain(D.users, first) : [];
        const path = first ? (chain.length ? chain.map((c) => `${esc(c.name)}`).join(' → ') : '<span class="warn">No superior set for the first user</span>') : '<span class="warn">No user</span>';
        return `<tr><td data-label="Department"><b>${esc(r.department)}</b></td><td data-label="Category">${r.category && r.category !== '*' ? esc(r.category) : 'All categories'}</td>
          <td data-label="Users">${(r.userUids || []).map((u, i) => `${i ? ', ' : ''}${esc(userName(u) || '(removed)')}${i ? '' : ' ★'}`).join('') || '-'}</td><td data-label="Initiator picks user">${r.pick ? 'Yes' : 'No, primary user'}</td><td data-label="Escalation" class="path">${path}</td>
          <td class="acts-td"><div class="acts"><button type="button" class="btn btn-ghost btn-sm" data-e="${esc(r.id)}">${icon('edit')}<span>Edit</span></button>
          <button type="button" class="btn btn-danger btn-sm" data-d="${esc(r.id)}" aria-label="Delete">${icon('trash')}</button></div></td></tr>`;
      }).join('') || '<tr><td colspan="6"><div class="empty">No responsibility set yet. Add one for each department.</div></td></tr>';
      body.querySelector('#rn').textContent = `${list.length} of ${D.resp.length} rows. A specific category overrides "All categories" for the same department.`;
      body.querySelectorAll('[data-e]').forEach((b) => { b.onclick = () => respDlg(D.resp.find((r) => r.id === b.dataset.e)); });
      body.querySelectorAll('[data-d]').forEach((b) => { b.onclick = async () => {
        if (!(await confirmBox({ title: 'Delete responsibility', message: 'Delete this row? New issues for it will not find a responsible user.', okLabel: 'Delete', danger: true }))) return;
        try { await deleteColl('issueResp', b.dataset.d); D.resp = D.resp.filter((r) => r.id !== b.dataset.d); drawResp(); } catch (e) { fail(e); }
      }; });
    };
    body.querySelector('#rd').onchange = draw; body.querySelector('#rAdd').onclick = () => respDlg(null); draw();
  }

  function respDlg(r) {
    let sel = [...(r?.userUids || [])];
    const m = openModal({
      title: r ? 'Edit responsibility' : 'Add responsibility', wide: true,
      html: `<form class="fg" autocomplete="off">
        <div><label class="l" for="r_d">Responsible department</label><select id="r_d" ${r ? 'disabled' : ''}>${D.setup.respDepts.map((d) => `<option ${d === r?.department ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></div>
        <div><label class="l" for="r_c">Issue category</label><select id="r_c" ${r ? 'disabled' : ''}><option value="*">All categories</option>${D.setup.categories.map((c) => `<option ${c === r?.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="full"><label class="l">Responsible users (Level 1). ★ is the primary user.</label><div class="chips" id="r_chips"></div>
        <select id="r_add"></select></div>
        <div class="full"><label style="display:flex;gap:8px;align-items:flex-start;font-weight:500"><input type="checkbox" id="r_pick" style="width:auto;margin-top:3px" ${r?.pick ? 'checked' : ''}><span>Let the person raising the issue choose which of these users is responsible. Otherwise the primary user (★) is used. Everyone listed can still add the containment action.</span></label></div></form><div class="err" id="r_err"></div>`,
      actions: [{ label: 'Cancel', onClick: (x) => x.close() }, { label: 'Save', kind: 'primary', onClick: save }]
    });
    const $ = (id) => m.el.querySelector('#' + id);
    const paint = () => {
      $('r_chips').innerHTML = sel.map((u, i) => `<span class="chip2 ${i ? '' : 'pri'}">${esc(userName(u) || '(removed)')}${i ? `<button type="button" data-p="${esc(u)}" title="Make primary">★</button>` : ' ★'}<button type="button" data-x="${esc(u)}" aria-label="Remove">✕</button></span>`).join('') || '<span class="hint">No user chosen yet.</span>';
      $('r_add').innerHTML = '<option value="">Add a user…</option>' + D.users.filter((u) => u.active !== false && u.level >= 1 && !sel.includes(u.uid)).map((u) => `<option value="${esc(u.uid)}">${esc(u.name)} (${esc(u.employeeId || '')}, ${esc(levelLabel(u.level))})</option>`).join('');
      $('r_chips').querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { sel = [b.dataset.p, ...sel.filter((x) => x !== b.dataset.p)]; paint(); }; });
      $('r_chips').querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => { sel = sel.filter((x) => x !== b.dataset.x); paint(); }; });
    };
    $('r_add').onchange = () => { if ($('r_add').value) { sel.push($('r_add').value); paint(); } };
    paint();
    async function save(x, btn) {
      const department = $('r_d').value, category = $('r_c').value;
      if (!sel.length) { $('r_err').textContent = 'Choose at least one responsible user.'; return; }
      const id = r ? r.id : slug(`${department}|${category}`);
      if (!r && D.resp.some((z) => z.id === id)) { $('r_err').textContent = 'This department and category already has a row. Edit that row instead.'; return; }
      btn.disabled = true; x.locked = true;
      try {
        const data = { department, category, userUids: sel, pick: $('r_pick').checked };
        await saveColl('issueResp', id, data);
        if (r) Object.assign(r, data); else D.resp.push({ id, ...data });
        x.locked = false; x.close(); drawResp(); toast('Saved.');
      } catch (e) { $('r_err').textContent = friendlyError(e); btn.disabled = false; x.locked = false; }
    }
  }

  /* ---------------- 5. Lead time ---------------- */
  function drawLead() {
    body.innerHTML = `<div class="toolbar"><select id="ld" aria-label="Department"><option value="">All departments</option>${D.setup.respDepts.map((d) => `<option>${esc(d)}</option>`).join('')}</select><span style="flex:1"></span>
      <button type="button" class="btn btn-primary" id="lAdd">${icon('plus')}<span>Add lead time</span></button></div>
      <p class="help" style="padding:12px 16px 0">Times count in minutes from the moment the issue is reported. The <b>target</b> is the time Level 1 has to add a containment action. The issue shows for Level 2 from the start, and for Level 3, 4 and 5 once their time passes. A specific row beats "All" in this order: department and category, department only, category only, all.
      Used when nothing matches: target ${fmtM(DEFAULT_LEAD.target)}, Level 3 after ${fmtM(DEFAULT_LEAD.t3)}, Level 4 after ${fmtM(DEFAULT_LEAD.t4)}, Level 5 after ${fmtM(DEFAULT_LEAD.t5)}.</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Responsible department</th><th>Category</th><th class="num">Target (Level 1)</th><th class="num">Level 3 after</th><th class="num">Level 4 after</th><th class="num">Level 5 after</th><th></th></tr></thead><tbody id="lb"></tbody></table></div>`;
    const draw = () => {
      const d = body.querySelector('#ld').value;
      const list = D.lead.filter((r) => !d || r.department === d).sort((a, b) => String(a.department).localeCompare(b.department) || String(a.category).localeCompare(String(b.category)));
      body.querySelector('#lb').innerHTML = list.map((r) => `<tr><td data-label="Department"><b>${!r.department || r.department === '*' ? 'All departments' : esc(r.department)}</b></td><td data-label="Category">${!r.category || r.category === '*' ? 'All categories' : esc(r.category)}</td>
        <td class="num" data-label="Target">${fmtM(r.target)}</td><td class="num" data-label="Level 3">${fmtM(r.t3)}</td><td class="num" data-label="Level 4">${fmtM(r.t4)}</td><td class="num" data-label="Level 5">${fmtM(r.t5)}</td>
        <td class="acts-td"><div class="acts"><button type="button" class="btn btn-ghost btn-sm" data-e="${esc(r.id)}">${icon('edit')}<span>Edit</span></button>
        <button type="button" class="btn btn-danger btn-sm" data-d="${esc(r.id)}" aria-label="Delete">${icon('trash')}</button></div></td></tr>`).join('')
        || '<tr><td colspan="7"><div class="empty">No lead times set. The default times above are used.</div></td></tr>';
      body.querySelectorAll('[data-e]').forEach((b) => { b.onclick = () => leadDlg(D.lead.find((r) => r.id === b.dataset.e)); });
      body.querySelectorAll('[data-d]').forEach((b) => { b.onclick = async () => {
        if (!(await confirmBox({ title: 'Delete lead time', message: 'Delete this row? The next matching row or the default times will apply.', okLabel: 'Delete', danger: true }))) return;
        try { await deleteColl('issueLead', b.dataset.d); D.lead = D.lead.filter((r) => r.id !== b.dataset.d); drawLead(); } catch (e) { fail(e); }
      }; });
    };
    body.querySelector('#ld').onchange = draw; body.querySelector('#lAdd').onclick = () => leadDlg(null); draw();
  }
  function fmtM(m) { m = Math.round(Number(m) || 0); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h} h ${r} m` : `${h} h`) : `${r} m`; }

  function leadDlg(r) {
    const v = r || { ...DEFAULT_LEAD };
    const m = openModal({
      title: r ? 'Edit lead time' : 'Add lead time', wide: true,
      html: `<form class="fg" autocomplete="off">
        <div><label class="l" for="t_d">Responsible department</label><select id="t_d" ${r ? 'disabled' : ''}><option value="*">All departments</option>${D.setup.respDepts.map((d) => `<option ${d === r?.department ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></div>
        <div><label class="l" for="t_c">Issue category</label><select id="t_c" ${r ? 'disabled' : ''}><option value="*">All categories</option>${D.setup.categories.map((c) => `<option ${c === r?.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div></form>
        <div class="numgrid" style="margin-top:14px">${[['target', 'Target (Level 1), minutes'], ['t3', 'Level 3 after, minutes'], ['t4', 'Level 4 after, minutes'], ['t5', 'Level 5 after, minutes']].map(([k, l]) => `<div><label class="l" for="t_${k}">${l}</label><input id="t_${k}" type="number" min="0" step="5" value="${esc(v[k])}"></div>`).join('')}</div>
        <div class="hint" id="t_pv" style="margin-top:8px"></div><div class="err" id="t_err"></div>`,
      actions: [{ label: 'Cancel', onClick: (x) => x.close() }, { label: 'Save', kind: 'primary', onClick: save }]
    });
    const $ = (id) => m.el.querySelector('#' + id);
    const pv = () => { $('t_pv').textContent = `Target ${fmtM($('t_target').value)}. Level 3 after ${fmtM($('t_t3').value)}, Level 4 after ${fmtM($('t_t4').value)}, Level 5 after ${fmtM($('t_t5').value)}.`; };
    m.el.addEventListener('input', pv); pv();
    async function save(x, btn) {
      const d = { department: $('t_d').value, category: $('t_c').value, target: Number($('t_target').value), t3: Number($('t_t3').value), t4: Number($('t_t4').value), t5: Number($('t_t5').value) };
      if (![d.target, d.t3, d.t4, d.t5].every((n) => Number.isFinite(n) && n > 0)) { $('t_err').textContent = 'Enter all four times in minutes, above zero.'; return; }
      if (!(d.t3 >= d.target && d.t4 >= d.t3 && d.t5 >= d.t4)) { $('t_err').textContent = 'Times must not go down: target, then Level 3, then Level 4, then Level 5.'; return; }
      const id = r ? r.id : slug(`${d.department}|${d.category}`) || 'all';
      if (!r && D.lead.some((z) => z.id === id)) { $('t_err').textContent = 'This department and category already has a row. Edit that row instead.'; return; }
      btn.disabled = true; x.locked = true;
      try {
        await saveColl('issueLead', id, d);
        if (r) Object.assign(r, d); else D.lead.push({ id, ...d });
        x.locked = false; x.close(); drawLead(); toast('Saved.');
      } catch (e) { $('t_err').textContent = friendlyError(e); btn.disabled = false; x.locked = false; }
    }
  }

  /* ---------------- 6. Form fields ---------------- */
  function drawFields() {
    const F = D.setup.fields;
    const STG = [['initiator', 'Initiator (raises the issue)'], ['responsible', 'Responsible user (containment)'], ['approver', 'Approver (initiator\'s manager)'], ['off', 'Not used']];
    body.innerHTML = `<div class="pad"><p class="help">Choose who fills each field and whether it is required. Fields marked fixed are needed for the issue to reach the right people and cannot be moved.</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Field</th><th>Asked from</th><th>Required</th></tr></thead><tbody>
      ${FIELD_DEFS.map((f) => `<tr><td data-label="Field"><b>${esc(f.label)}</b>${f.locked ? ' <span class="path">(fixed)</span>' : ''}</td>
        <td data-label="Asked from">${f.stage === 'auto' ? 'Automatic: report time to containment time' : ''}<select data-s="${f.key}" ${f.locked ? 'disabled' : ''} ${f.stage === 'auto' ? 'hidden' : ''}>${STG.filter(([k]) => k !== 'off' || !f.locked).map(([k, l]) => `<option value="${k}" ${F[f.key].stage === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td data-label="Required"><label><input type="checkbox" data-r="${f.key}" ${F[f.key].required ? 'checked' : ''} ${(f.locked && f.key !== 'approvalNote') || f.stage === 'auto' ? 'disabled' : ''} style="width:auto"> Required</label></td></tr>`).join('')}
      </tbody></table></div>
      <div class="row" style="margin-top:14px;justify-content:flex-end"><button type="button" class="btn btn-primary" id="fSave">Save form fields</button></div></div>`;
    body.querySelector('#fSave').onclick = async (ev) => {
      const b = ev.currentTarget, fields = {};
      FIELD_DEFS.forEach((f) => { fields[f.key] = { stage: body.querySelector(`[data-s="${f.key}"]`).value, required: body.querySelector(`[data-r="${f.key}"]`).checked }; });
      b.disabled = true;
      try { await saveIssueSetup({ fields }); D.setup = await getIssueSetup(); toast('Form fields saved.'); } catch (e) { fail(e); }
      b.disabled = false;
    };
  }

  /* ---------------- 7. PSM and cost ---------------- */
  function drawPsm() {
    const p = D.setup.psm;
    body.innerHTML = `<div class="pad"><p class="help">When an issue is closed, the system looks at the same station and the same issue category over the window below. If it is repeated often enough, or the lost hours are high enough, the issue is flagged <b>Refer to PSM</b> for a PDCA resolution. Set a value to 0 to switch that rule off.</p>
      <div class="numgrid"><div><label class="l" for="p_n">Refer after this many repeats</label><input id="p_n" type="number" min="0" step="1" value="${esc(p.minRepeats)}"></div>
      <div><label class="l" for="p_l">Or after this many loss hours</label><input id="p_l" type="number" min="0" step="0.5" value="${esc(p.minLossHours)}"></div>
      <div><label class="l" for="p_w">Look back, days</label><input id="p_w" type="number" min="1" step="1" value="${esc(p.windowDays)}"></div>
      <div><label class="l" for="p_r">Cost per man-hour lost</label><input id="p_r" type="number" min="0" step="1" value="${esc(D.setup.rate)}"></div></div>
      <h3 style="margin:22px 0 6px;font-size:15px">Approval escalation</h3>
      <p class="help">When a containment action is added, the initiator approves and closes the issue. The initiator's manager may also sign off. Downtime is counted automatically from the issue report time to the containment time. If it is above the hours below, the initiator's HOD (Level 3) or GM (Level 4) also gets the issue to sign off. Their sign-off is optional.</p>
      <div class="numgrid"><div><label class="l" for="p_hod">HOD may approve above (hours)</label><input id="p_hod" type="number" min="0" step="0.5" value="${esc(D.setup.approval.hodHours)}"></div>
      <div><label class="l" for="p_gm">GM may approve above (hours)</label><input id="p_gm" type="number" min="0" step="0.5" value="${esc(D.setup.approval.gmHours)}"></div></div>
      <div class="row" style="margin-top:14px;justify-content:flex-end"><button type="button" class="btn btn-primary" id="pSave">Save</button></div></div>`;
    body.querySelector('#pSave').onclick = async (ev) => {
      const b = ev.currentTarget, v = (id) => Number(body.querySelector('#' + id).value);
      const psm = { minRepeats: v('p_n'), minLossHours: v('p_l'), windowDays: v('p_w') || 90 };
      if ([psm.minRepeats, psm.minLossHours, v('p_r')].some((n) => !Number.isFinite(n) || n < 0)) { toast('Enter numbers, zero or more.'); return; }
      const approval = { hodHours: v('p_hod'), gmHours: v('p_gm') };
      if (!(approval.hodHours > 0 && approval.gmHours >= approval.hodHours)) { toast('Approval hours: HOD must be above 0, and GM must not be lower than HOD.'); return; }
      b.disabled = true;
      try { await saveIssueSetup({ psm, rate: v('p_r'), approval }); D.setup.psm = psm; D.setup.rate = v('p_r'); D.setup.approval = approval; toast('Saved.'); } catch (e) { fail(e); }
      b.disabled = false;
    };
  }

  /* ---------------- 8. Past data (tracker Excel) ---------------- */
  function serialToDate(v) {
    if (v instanceof Date && !isNaN(v)) return v;
    if (typeof v === 'number' && v > 20000 && v < 80000) { const t = new Date(Math.round((v - 25569) * 86400000)); return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds()); }
    const s = clean(v); if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
    const d = new Date(s); return isNaN(d) ? null : d;
  }
  const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null; };
  const ALIAS = { maintainance: 'Maintenance', maintenence: 'Maintenance' };

  async function drawImport() {
    let imported = 0;
    try { imported = (await listIssues()).filter((i) => i.imported).length; } catch { /* ignore */ }
    body.innerHTML = `<div class="pad"><p class="help">Import past issues from your VTB tracker Excel (sheet “VTB”, headings in row 4). Closed, Open and “Handover to PSM” rows are kept as they are. Issues already imported are not duplicated. Users are matched by name or employee ID.</p>
      <div class="row" style="flex-wrap:wrap"><button type="button" class="btn btn-primary" id="iGo">${icon('upload')}<span>Import tracker Excel</span></button>
      <button type="button" class="btn btn-danger" id="iDel" ${imported ? '' : 'disabled'}>${icon('trash')}<span>Delete all imported issues (${imported})</span></button></div><div id="iOut"></div></div>`;
    body.querySelector('#iGo').onclick = importIssues;
    body.querySelector('#iDel').onclick = async () => {
      if (!(await confirmBox({ title: 'Delete imported issues', message: `${imported} imported issues will be permanently deleted. Issues raised by users on the Issue Report page are not touched.`, okLabel: 'Delete', danger: true }))) return;
      try { const ids = (await listIssues()).filter((i) => i.imported).map((i) => i.id); await deleteColls('issues', ids); toast(`${ids.length} imported issues deleted.`); drawImport(); } catch (e) { fail(e); }
    };
  }

  async function importIssues() {
    const file = await pickFile(); if (!file) return;
    let model;
    try { model = await parseTracker(file); } catch (e) { toast(e.message || friendlyError(e)); return; }
    const { items, skipped, summary } = model;
    const m = openModal({
      title: 'Import past issues', wide: true,
      html: `<p>Found <b>${items.length}</b> issues (${esc(summary.range)}). <b>${summary.closed}</b> closed, <b>${summary.open}</b> open, <b>${summary.psm}</b> handed over to PSM.
        ${summary.dups ? `<b>${summary.dups}</b> are already imported and will be skipped.` : ''}</p>
        ${skipped.length ? `<p class="hint" style="color:#b91c1c">${skipped.length} rows skipped: ${skipped.slice(0, 4).map(esc).join('; ')}</p>` : ''}
        ${summary.noUser.length ? `<p class="hint">Names not found in User Database (kept as text): ${summary.noUser.slice(0, 8).map(esc).join(', ')}${summary.noUser.length > 8 ? '…' : ''}</p>` : ''}
        ${summary.newLists ? `<label style="display:block;margin-top:10px"><input type="checkbox" id="i_add" checked style="width:auto"> Add new names found in the file (${esc(summary.newLists)}) to the lists</label>` : ''}
        <div class="prog" id="ip" hidden><i></i></div><div class="hint" id="it"></div><div class="err" id="ie"></div>`,
      actions: [{ label: 'Cancel', id: 'cancel', onClick: (x) => x.close() }, { label: `Import ${items.length - summary.dups} issues`, kind: 'primary', id: 'go', onClick: run }]
    });
    if (items.length - summary.dups <= 0) m.buttons.go.disabled = true;
    async function run(x, btn) {
      x.locked = true; btn.disabled = true; x.buttons.cancel.disabled = true;
      const bar = x.el.querySelector('#ip'), txt = x.el.querySelector('#it'); bar.hidden = false;
      try {
        if (x.el.querySelector('#i_add')?.checked) {
          const patch = {};
          [['areas', 'area'], ['categories', 'category'], ['respDepts', 'respDept'], ['natures', 'nature']].forEach(([lk, fk]) => {
            const extra = [...new Set(items.map((i) => i[fk]).filter(Boolean))].filter((v) => !D.setup[lk].some((z) => lc(z) === lc(v)));
            if (extra.length) patch[lk] = [...D.setup[lk], ...extra];
          });
          if (Object.keys(patch).length) { await saveIssueSetup(patch); Object.assign(D.setup, patch); }
        }
        const todo = items.filter((i) => !i._dup);
        await writeColl('issues', todo, { onProgress: (a, b) => { bar.firstElementChild.style.width = Math.round((a / b) * 100) + '%'; txt.textContent = `Saved ${a} of ${b}`; } });
        txt.textContent = `Done: ${todo.length} issues imported.`;
      } catch (e) { x.el.querySelector('#ie').textContent = friendlyError(e); }
      x.locked = false; x.buttons.cancel.disabled = false; x.buttons.cancel.textContent = 'Close'; drawImport();
    }
  }

  async function parseTracker(file) {
    const X = await loadXLSX(), wb = X.read(await file.arrayBuffer(), { type: 'array' });
    let grid = null, hi = -1;
    for (const name of wb.SheetNames) {
      const g = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
      const i = g.slice(0, 15).findIndex((r) => r.some((c) => nk(c) === 'issuereportdatetime'));
      if (i >= 0) { grid = g; hi = i; break; }
    }
    if (!grid) throw new Error('Could not find the tracker headings (for example “Issue Report Date & Time”).');
    const col = {}; grid[hi].forEach((h, i) => { const k = nk(h); if (k && !(k in col)) col[k] = i; });
    const at = (r, ...ks) => { for (const k of ks) if (k in col) return r[col[k]]; return ''; };
    const [users, resps, leads] = [D.users, D.resp, D.lead];
    const byName = new Map(), byId = new Map();
    users.forEach((u) => { byName.set(lc(u.name), u); byId.set(lc(u.employeeId), u); });
    const findU = (v) => byId.get(lc(v)) || byName.get(lc(v)) || null;
    const canon = (list, v) => { const t = clean(v); return list.find((z) => lc(z) === lc(t)) || ALIAS[lc(t)] || t; };
    const firstSeen = new Map(); const norm = (kind, v) => { const t = clean(v); if (!t) return ''; const k = kind + '|' + lc(t); if (!firstSeen.has(k)) firstSeen.set(k, t); return firstSeen.get(k); };
    const existing = new Set((await listIssues().catch(() => [])).filter((i) => i.imported).map((i) => i.id));
    const batch = 'imp-' + Date.now().toString(36), items = [], skipped = [], used = new Set(), noUser = new Set();
    const stats = { closed: 0, open: 0, psm: 0, dups: 0 }; let minD = null, maxD = null;
    for (let r = hi + 1; r < grid.length; r++) {
      const row = grid[r], when = serialToDate(at(row, 'issuereportdatetime'));
      const description = clean(at(row, 'problemdescription')), station = clean(at(row, 'stationname'));
      if (!when && !description && !station) continue;
      if (!when) { skipped.push(`Row ${r + 1}: report date missing`); continue; }
      if (!description && !station) { skipped.push(`Row ${r + 1}: no description or station`); continue; }
      const area = canon(D.setup.areas, at(row, 'deptarea', 'area')), category = canon(D.setup.categories, at(row, 'issuecategory'));
      const respDept = canon(D.setup.respDepts, at(row, 'responsibility')), nature = canon(D.setup.natures, at(row, 'natureofissue'));
      const line = norm('line', at(row, 'line'));
      const repBy = clean(at(row, 'issuereportedby')), respBy = clean(at(row, 'responsibleuser'));
      const iu = findU(repBy), ru = findU(respBy);
      if (repBy && !iu) noUser.add(repBy); if (respBy && !ru) noUser.add(respBy);
      const route = buildRoute({ users, resps, leads, respDept, category, initiatorUid: iu?.uid || '' });
      const contAt = serialToDate(at(row, 'containmentactiondatetime'));
      const stRaw = lc(at(row, 'containmentstatus')), psm = stRaw.includes('psm');
      const status = stRaw === 'open' ? 'open' : 'closed';
      const delayCell = num(at(row, 'delaymin')), delayMin = delayCell ?? (contAt ? Math.max(0, Math.round((contAt - when) / 60000)) : null);
      const lead = pickLead(leads, respDept, category);
      const mp = num(at(row, 'totalmp')) || 0, mc = num(at(row, 'noofmc')) || 0, dt = num(at(row, 'downtimehours')) || 0;
      const hours = num(at(row, 'hourstotal')) ?? Math.round(mp * (mc > 0 ? mc : 1) * dt * 100) / 100;
      const lvTxt = String(at(row, 'issueescalationlevel')).match(/[1-5]/);
      const rid = 'imp-' + slug(`${when.getTime()}|${station}|${description.slice(0, 40)}`).slice(0, 110);
      let id = rid, n = 2; while (used.has(id)) id = `${rid}-${n++}`; used.add(id);
      const dup = existing.has(id);
      const rec = {
        id, imported: true, importBatch: batch, importSn: num(at(row, 'sn')) || r - hi,
        area, line, nature, station, model: clean(at(row, 'modelmsnpsn')), partNumber: clean(at(row, 'partnumber')), description, category, respDept,
        initiatorUid: iu?.uid || '', reportedByName: iu?.name || repBy, initiatorEmployeeId: iu?.employeeId || '',
        responsibleUids: ru ? [ru.uid] : route.responsibleUids, primaryUid: ru?.uid || route.primaryUid, responsibleName: ru?.name || respBy,
        tiers: route.tiers, lead: { target: lead.target, t3: lead.t3, t4: lead.t4, t5: lead.t5 }, approverUid: route.approverUid, optTiers: route.optTiers,
        status, reportedAt: tsFromDate(when), reportedMs: when.getTime(), dateKey: dayKeyOf(when), weekMonth: weekMonthOf(when),
        repeat: /^rep/i.test(clean(at(row, 'repeatation'))) ? 'Repeated' : 'New',
        containment: clean(at(row, 'containmentaction')), ...(contAt ? { containmentAt: tsFromDate(contAt) } : {}),
        ...(delayMin != null ? { delayMin } : {}), leadResult: delayMin != null && delayMin >= 450 ? 'Not Achieved' : 'Achieved',
        escalationLevel: lvTxt ? Number(lvTxt[0]) : 1, mp, mc, downtimeH: dt, hoursTotal: hours, mhCost: num(at(row, 'totalmhlosscost')) ?? Math.round(hours * D.setup.rate),
        psmRefer: psm, psmReason: psm ? 'Handed over to PSM (past data)' : '', ...(status === 'closed' ? { approvalNote: 'Past data' } : {})
      };
      rec._dup = dup; if (dup) stats.dups++;
      if (status === 'open') stats.open++; else stats.closed++; if (psm) stats.psm++;
      if (!minD || when < minD) minD = when; if (!maxD || when > maxD) maxD = when;
      items.push(rec);
    }
    if (!items.length) throw new Error('No issues found in the file.');
    const newBits = []; [['areas', 'area'], ['categories', 'category'], ['respDepts', 'respDept']].forEach(([lk, fk]) => {
      const extra = [...new Set(items.map((i) => i[fk]).filter(Boolean))].filter((v) => !D.setup[lk].some((z) => lc(z) === lc(v))); newBits.push(...extra);
    });
    const fmt = (d) => `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getFullYear()}`;
    return { items, skipped, summary: { ...stats, noUser: [...noUser], range: `${fmt(minD)} to ${fmt(maxD)}`, newLists: newBits.slice(0, 8).join(', ') + (newBits.length > 8 ? '…' : '') } };
  }

  show(TABS.some(([k]) => k === tab) ? tab : 'org');
}

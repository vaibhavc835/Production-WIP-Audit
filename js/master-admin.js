/* =====================================================================
   js/master-admin.js
   Admin Control > Master Data. The one list of departments, lines and stations that every page uses.
   Stations: where issues, improvements and audits happen. Inventory points: what is counted on the Inventory page.
   Loaded by admin.html only when the tab is opened.
   ===================================================================== */
import { icon, esc, toast, openModal, confirmBox, friendlyError, slug, getMaster, saveMaster } from './wip-core.js';
import { loadExcelJS } from './audit-import.js';

// Spelling mistakes found in the first master list. They are corrected while importing.
const FIX = [[/Prodiction/gi, 'Production'], [/Prodcut/gi, 'Product'], [/Inspecton/gi, 'Inspection'], [/Finanace/gi, 'Finance'], [/Balalnce/gi, 'Balance'], [/\bEngin Sub/gi, 'Engine Sub'], [/Sealent/gi, 'Sealant']];
const fixes = new Set();
const txt = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') { if (v.richText) return v.richText.map((x) => x.text).join(''); if ('result' in v) return txt(v.result); if (v.text) return String(v.text); if (v instanceof Date) return ''; }
  return String(v);
};
const cl = (v) => { let s = txt(v).replace(/\s+/g, ' ').trim(); FIX.forEach(([a, b]) => { const t = s.replace(a, b); if (t !== s) fixes.add(`${s} → ${t}`); s = t; }); return s; };
const yes = (v) => /^y/i.test(txt(v).trim());
const num = (v) => { const t = txt(v).trim(); return t === '' || isNaN(Number(t)) ? null : Number(t); };

export async function parseMasterFile(file) {
  const E = await loadExcelJS(), wb = new E.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
  fixes.clear();
  const rowsOf = (ws) => { const out = []; ws.eachRow({ includeEmpty: false }, (row, n) => { const a = []; for (let c = 1; c <= 20; c++) a[c] = row.getCell(c).value; out[n] = a; }); return out; };
  const stationsWs = wb.worksheets.find((w) => /^stations?$/i.test(w.name)), invWs = wb.worksheets.find((w) => /inventory/i.test(w.name));
  let stations = [], inv = [];
  if (stationsWs && invWs) {                                   // the file written by Export
    rowsOf(stationsWs).forEach((r, n) => {
      if (n < 2 || !r) return;
      const dept = cl(r[2]), line = cl(r[3]); if (!dept || !line) return;
      stations.push({ dept, line, lineCode: cl(r[4]).replace(/\s+/g, ''), station: cl(r[5]), nWork: num(r[6]) || 1, issue: yes(r[7]), imp: yes(r[8]), audit: yes(r[9]) });
    });
    rowsOf(invWs).forEach((r, n) => {
      if (n < 2 || !r) return;
      const dept = cl(r[1]), line = cl(r[2]), name = cl(r[4]); if (!dept || !line || !name) return;
      inv.push({ dept, line, group: cl(r[3]), name, min: num(r[5]) ?? 0, max: num(r[6]) ?? 0 });
    });
  } else {                                                      // the original master list (one sheet, inventory columns next to the stations)
    const ws = wb.worksheets.find((w) => { const r = rowsOf(w); return r.some((a) => a && /^department$/i.test(cl(a[2])) && /^line$/i.test(cl(a[3]))); });
    if (!ws) throw new Error('Could not find the columns. The first sheet needs Department, Line, Line Code, Station … as in the Master Station List.');
    const rows = rowsOf(ws); let h = rows.findIndex((a) => a && /^department$/i.test(cl(a[2])));
    let dept = '', line = '', code = '';
    for (let n = h + 1; n < rows.length; n++) {
      const a = rows[n]; if (!a) continue;
      const d = cl(a[2]), l = cl(a[3]), st = cl(a[5]), grp = cl(a[8]), part = cl(a[9]), mn = num(a[10]), mx = num(a[11]);
      if (d) { dept = d; line = l; code = cl(a[4]).replace(/\s+/g, ''); }
      else if (l) { line = l; code = cl(a[4]).replace(/\s+/g, '') || code; }
      if (!dept || !line) continue;
      if (d || l || st) stations.push({ dept, line, lineCode: code, station: st, nWork: num(a[6]) || 1, issue: yes(a[13]), imp: yes(a[14]), audit: yes(a[15]) });
      if (part) inv.push({ dept, line, group: grp, name: part, min: mn ?? 0, max: mx ?? 0 });
      else if (yes(a[7]) && st) inv.push({ dept, line, group: '', name: st, min: mn ?? 0, max: mx ?? 0 });
      else if (grp && (mn != null || mx != null)) inv.push({ dept, line, group: '', name: grp, min: mn ?? 0, max: mx ?? 0 });
    }
  }
  const seen = new Set(); const sOut = [];
  stations.forEach((s) => { let id = slug([s.dept, s.line, s.station || '_line'].join('|')), k = id, i = 2; while (seen.has(k)) k = id + '-' + i++; seen.add(k); sOut.push({ id: k, ...s }); });
  const seenI = new Set(); const iOut = [];
  inv.forEach((s) => { let id = slug(['i', s.dept, s.line, s.group, s.name].join('|')), k = id, i = 2; while (seenI.has(k)) k = id + '-' + i++; seenI.add(k); iOut.push({ id: k, ...s }); });
  if (!sOut.length) throw new Error('No stations were found in this file.');
  return { stations: sOut, inv: iOut, fixes: [...fixes] };
}

export async function exportMaster(m) {
  const E = await loadExcelJS(), wb = new E.Workbook();
  const head = (ws, cols) => { ws.columns = cols.map(([h, w]) => ({ header: h, width: w })); const r = ws.getRow(1); r.font = { bold: true }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; ws.views = [{ state: 'frozen', ySplit: 1 }]; };
  const a = wb.addWorksheet('Stations'); head(a, [['Sr. No.', 8], ['Department', 24], ['Line', 24], ['Line Code', 10], ['Station', 36], ['No. Of Work Station', 12], ['Issue report', 12], ['Improvement', 12], ['Audit', 10]]);
  m.stations.forEach((s, i) => a.addRow([i + 1, s.dept, s.line, s.lineCode, s.station, s.nWork || 1, s.issue ? 'Yes' : 'No', s.imp ? 'Yes' : 'No', s.audit ? 'Yes' : 'No']));
  const b = wb.addWorksheet('Inventory Points'); head(b, [['Department', 24], ['Line', 24], ['Group', 26], ['Inventory point', 40], ['Min', 8], ['Max', 8]]);
  m.inv.forEach((p) => b.addRow([p.dept, p.line, p.group, p.name, p.min, p.max]));
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const l = document.createElement('a'); l.href = url; l.download = 'Master_Data.xlsx'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const CSS = `.mst .tabs2{display:flex;gap:6px;margin-bottom:10px}.mst .tabs2 button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 14px;font-weight:600;cursor:pointer}.mst .tabs2 button.on{background:var(--brand,#0f766e);color:#fff;border-color:transparent}
.mst .flag{display:inline-block;min-width:34px;text-align:center;border-radius:999px;padding:1px 8px;font-size:12px;font-weight:600}.mst .flag.y{background:#dcfce7;color:#166534}.mst .flag.n{background:#f1f5f9;color:#64748b}`;

export async function renderMaster(panel) {
  if (!document.getElementById('mstCss')) { const st = document.createElement('style'); st.id = 'mstCss'; st.textContent = CSS; document.head.appendChild(st); }
  let M = await getMaster(true), view = 'stations';
  const fail = (e) => toast(friendlyError(e));
  const filePick = () => new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.xlsx'; i.onchange = () => res(i.files[0] || null); i.click(); });
  const draw = () => {
    panel.innerHTML = `<div class="mst"><p class="help" style="margin:0 0 12px">One list for every page. <b>Stations</b> feed the Issue report, Improvement and Audit pages and the user assignment. <b>Inventory points</b> feed the Inventory page. Only the administrator edits it. Changing a name here does not rename old records.</p>
      <div class="toolbar"><div class="tabs2" role="tablist"><button type="button" data-v="stations" class="${view === 'stations' ? 'on' : ''}">Stations (${M.stations.length})</button><button type="button" data-v="inv" class="${view === 'inv' ? 'on' : ''}">Inventory points (${M.inv.length})</button></div>
        <div class="search">${icon('search')}<input id="mq" type="search" placeholder="Search" aria-label="Search"></div>
        <select id="md" aria-label="Department"><option value="">All departments</option></select>
        <span style="flex:1"></span>
        <button type="button" class="btn btn-ghost" id="mExp"><span>Export Excel</span></button>
        <button type="button" class="btn btn-ghost" id="mImp">${icon('upload')}<span>Import Excel</span></button>
        <button type="button" class="btn btn-primary" id="mAdd">${icon('plus')}<span>${view === 'stations' ? 'Add station' : 'Add inventory point'}</span></button></div>
      <div class="tbl-wrap"><table class="tbl"><thead id="mh"></thead><tbody id="mb"></tbody></table></div><div class="note" id="mn"></div></div>`;
    const $ = (id) => panel.querySelector('#' + id);
    const src = () => (view === 'stations' ? M.stations : M.inv);
    $('md').innerHTML += [...new Set(src().map((x) => x.dept))].map((d) => `<option>${esc(d)}</option>`).join('');
    panel.querySelectorAll('.tabs2 button').forEach((b) => { b.onclick = () => { view = b.dataset.v; draw(); }; });
    const rows = () => {
      const q = $('mq').value.toLowerCase(), d = $('md').value;
      return src().filter((x) => (!d || x.dept === d) && (!q || Object.values(x).join(' ').toLowerCase().includes(q)));
    };
    const flag = (v) => `<span class="flag ${v ? 'y' : 'n'}">${v ? 'Yes' : 'No'}</span>`;
    const paint = () => {
      const list = rows();
      $('mh').innerHTML = view === 'stations'
        ? '<tr><th>Department</th><th>Line</th><th>Code</th><th>Station</th><th class="num">Work stations</th><th>Issue</th><th>Improvement</th><th>Audit</th><th></th></tr>'
        : '<tr><th>Department</th><th>Line</th><th>Group</th><th>Inventory point</th><th class="num">Min</th><th class="num">Max</th><th></th></tr>';
      const acts = (id) => `<td class="acts-td"><div class="acts"><button type="button" class="btn btn-ghost btn-sm" data-e="${esc(id)}">${icon('edit')}<span>Edit</span></button><button type="button" class="btn btn-danger btn-sm" data-d="${esc(id)}" aria-label="Delete">${icon('trash')}</button></div></td>`;
      $('mb').innerHTML = list.slice(0, 400).map((x) => view === 'stations'
        ? `<tr><td data-label="Department">${esc(x.dept)}</td><td data-label="Line">${esc(x.line)}</td><td data-label="Code">${esc(x.lineCode)}</td><td data-label="Station">${x.station ? `<b>${esc(x.station)}</b>` : '<span class="hint">(the line itself)</span>'}</td><td class="num" data-label="Work stations">${esc(x.nWork || 1)}</td><td data-label="Issue">${flag(x.issue)}</td><td data-label="Improvement">${flag(x.imp)}</td><td data-label="Audit">${flag(x.audit)}</td>${acts(x.id)}</tr>`
        : `<tr><td data-label="Department">${esc(x.dept)}</td><td data-label="Line">${esc(x.line)}</td><td data-label="Group">${esc(x.group)}</td><td data-label="Inventory point"><b>${esc(x.name)}</b></td><td class="num" data-label="Min">${esc(x.min)}</td><td class="num" data-label="Max">${esc(x.max)}</td>${acts(x.id)}</tr>`).join('')
        || `<tr><td colspan="9"><div class="empty">${src().length ? 'Nothing matches.' : 'Nothing here yet. Use Import Excel and choose your Master Station List.'}</div></td></tr>`;
      $('mn').textContent = `Showing ${Math.min(list.length, 400)} of ${src().length}`;
      $('mb').querySelectorAll('[data-e]').forEach((b) => { b.onclick = () => edit(src().find((z) => z.id === b.dataset.e)); });
      $('mb').querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => remove(src().find((z) => z.id === b.dataset.d)); });
    };
    $('mq').oninput = paint; $('md').onchange = paint;
    $('mAdd').onclick = () => edit(null);
    $('mExp').onclick = async () => { try { await exportMaster(M); } catch (e) { fail(e); } };
    $('mImp').onclick = importDialog;
    paint();
  };
  const persist = async (m, syncInv) => { await saveMaster({ stations: m.stations, inv: m.inv }, { syncInv }); M = await getMaster(); window.dispatchEvent(new Event('wip-master')); };

  async function remove(x) {
    const label = view === 'stations' ? `${x.station || x.line} (${x.line})` : `${x.name} (${x.line})`;
    if (!(await confirmBox({ title: 'Delete', message: `Delete “${label}”? Old records keep their names.`, okLabel: 'Delete', danger: true }))) return;
    try {
      const next = view === 'stations' ? { stations: M.stations.filter((z) => z.id !== x.id), inv: M.inv } : { stations: M.stations, inv: M.inv.filter((z) => z.id !== x.id) };
      await persist(next, view === 'inv'); draw(); toast('Deleted.');
    } catch (e) { fail(e); }
  }

  function edit(x) {
    const isSt = view === 'stations', depts = [...new Set(M.stations.map((s) => s.dept))], lines = [...new Set(M.stations.map((s) => s.line))];
    const m = openModal({
      title: (x ? 'Edit ' : 'Add ') + (isSt ? 'station' : 'inventory point'),
      html: `<form class="fg" autocomplete="off">
        <div><label class="l" for="m_d">Department</label><input id="m_d" list="dl_md" value="${esc(x?.dept || '')}"></div>
        <div><label class="l" for="m_l">Line</label><input id="m_l" list="dl_ml" value="${esc(x?.line || '')}"></div>
        ${isSt ? `<div><label class="l" for="m_c">Line code</label><input id="m_c" maxlength="6" value="${esc(x?.lineCode || '')}"><div class="hint">Idea numbers start with this code. Several lines may share a code.</div></div>
        <div><label class="l" for="m_s">Station</label><input id="m_s" value="${esc(x?.station || '')}"><div class="hint">Leave empty when the line has no stations.</div></div>
        <div><label class="l" for="m_w">No. of work stations</label><input id="m_w" type="number" min="1" value="${esc(x?.nWork || 1)}"></div>
        <div class="full"><label class="l">Used in</label><label style="display:inline-flex;gap:6px;margin-right:16px"><input type="checkbox" id="m_i" ${x ? (x.issue ? 'checked' : '') : 'checked'} style="width:auto"> Issue report</label><label style="display:inline-flex;gap:6px;margin-right:16px"><input type="checkbox" id="m_m" ${x ? (x.imp ? 'checked' : '') : 'checked'} style="width:auto"> Improvement</label><label style="display:inline-flex;gap:6px"><input type="checkbox" id="m_a" ${x ? (x.audit ? 'checked' : '') : 'checked'} style="width:auto"> Audit</label></div>`
        : `<div><label class="l" for="m_g">Group</label><input id="m_g" value="${esc(x?.group || '')}"><div class="hint">Optional. For example Cutting &amp; Machining.</div></div>
        <div><label class="l" for="m_n">Inventory point</label><input id="m_n" value="${esc(x?.name || '')}"></div>
        <div><label class="l" for="m_min">Min</label><input id="m_min" type="number" min="0" value="${esc(x?.min ?? '')}"></div>
        <div><label class="l" for="m_max">Max</label><input id="m_max" type="number" min="0" value="${esc(x?.max ?? '')}"></div>`}
      </form><datalist id="dl_md">${depts.map((d) => `<option value="${esc(d)}">`).join('')}</datalist><datalist id="dl_ml">${lines.map((d) => `<option value="${esc(d)}">`).join('')}</datalist><div class="err" id="m_err"></div>`,
      actions: [{ label: 'Cancel', onClick: (a) => a.close() }, { label: x ? 'Save changes' : 'Add', kind: 'primary', onClick: save }]
    });
    const $ = (id) => m.el.querySelector('#' + id);
    async function save(a, btn) {
      const dept = cl($('m_d').value), line = cl($('m_l').value);
      if (!dept || !line) { $('m_err').textContent = 'Department and line are required.'; return; }
      let rec;
      if (isSt) rec = { dept, line, lineCode: cl($('m_c').value).replace(/\s+/g, ''), station: cl($('m_s').value), nWork: Math.max(1, Number($('m_w').value) || 1), issue: $('m_i').checked, imp: $('m_m').checked, audit: $('m_a').checked };
      else {
        const name = cl($('m_n').value), mn = Number($('m_min').value), mx = Number($('m_max').value);
        if (!name) { $('m_err').textContent = 'Enter the inventory point name.'; return; }
        if (!(mn >= 0) || !(mx >= mn) || $('m_min').value === '' || $('m_max').value === '') { $('m_err').textContent = 'Enter Min and Max. Max cannot be below Min.'; return; }
        rec = { dept, line, group: cl($('m_g').value), name, min: mn, max: mx };
      }
      if (isSt && rec.imp && !rec.lineCode && !M.stations.some((s) => s.dept === dept && s.line === line && s.lineCode && s.id !== x?.id)) { $('m_err').textContent = 'A line used for improvements needs a line code.'; return; }
      btn.disabled = true; a.locked = true;
      try {
        const list = isSt ? M.stations.slice() : M.inv.slice();
        if (x) { const i = list.findIndex((z) => z.id === x.id); list[i] = { id: x.id, ...rec }; }
        else list.push({ id: slug([isSt ? 's' : 'i', dept, line, rec.group || '', rec.station || rec.name, Date.now()].join('|')), ...rec });
        await persist(isSt ? { stations: list, inv: M.inv } : { stations: M.stations, inv: list }, !isSt);
        a.locked = false; a.close(); draw(); toast('Saved.');
      } catch (e) { $('m_err').textContent = friendlyError(e); btn.disabled = false; a.locked = false; }
    }
  }

  async function importDialog() {
    const file = await filePick(); if (!file) return;
    let p;
    try { p = await parseMasterFile(file); } catch (e) { toast(e.message || friendlyError(e)); return; }
    const depts = new Set(p.stations.map((s) => s.dept)).size, lines = new Set(p.stations.map((s) => s.dept + '|' + s.line)).size;
    const flagN = (k) => p.stations.filter((s) => s[k]).length, invDepts = [...new Set(p.inv.map((x) => x.dept))];
    openModal({
      title: 'Import master list', wide: true,
      html: `<p>Found <b>${p.stations.length}</b> station rows in <b>${depts}</b> departments and <b>${lines}</b> lines, and <b>${p.inv.length}</b> inventory points (${esc(invDepts.join(', '))}).</p>
        <p>Used in: Issue report <b>${flagN('issue')}</b>, Improvement <b>${flagN('imp')}</b>, Audit <b>${flagN('audit')}</b> rows.</p>
        ${p.fixes.length ? `<p class="hint"><b>${p.fixes.length}</b> spelling mistakes were corrected: ${esc(p.fixes.slice(0, 8).join('; '))}${p.fixes.length > 8 ? ' …' : ''}</p>` : ''}
        <p class="hint">This replaces the whole Master Data and rebuilds the Inventory page list. Past inventory checks, issues and ideas keep the names they were saved with. Users keep their assignment, but check it afterwards if a name changed.</p><div class="err" id="mi_err"></div>`,
      actions: [{ label: 'Cancel', onClick: (x) => x.close() }, { label: 'Replace master data', kind: 'primary', onClick: async (x, btn) => {
        btn.disabled = true; x.locked = true; btn.textContent = 'Saving…';
        try { await persist({ stations: p.stations, inv: p.inv }, true); x.locked = false; x.close(); draw(); toast('Master data saved.'); }
        catch (e) { x.el.querySelector('#mi_err').textContent = friendlyError(e); btn.disabled = false; x.locked = false; btn.textContent = 'Replace master data'; }
      } }]
    });
  }
  draw();
}

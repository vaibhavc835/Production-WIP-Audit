/* =====================================================================
   js/audit-admin.js
   Admin Control > Audit Forms. Loaded by admin.html only when the tab is opened.
   The admin builds audit forms (title, audit points with criteria). They appear on the Audit page.
   ===================================================================== */
import { icon, esc, toast, openModal, confirmBox, friendlyError, listAuditForms, saveAuditForm, deleteAuditForm, listAuditResponses } from './wip-core.js';
import { editSheet } from './audit-sheet-admin.js';

const clean = (v) => String(v ?? '').replace(/[ \t]+/g, ' ').trim();
const CSS = `
.afx .pad{padding:16px}
.afx .pt{display:grid;grid-template-columns:34px 1fr 1fr auto;gap:10px;align-items:start;padding:12px;border:1px solid var(--line);border-radius:10px;background:#fff;margin-bottom:10px}
.afx .pt .n{font-weight:700;color:var(--muted);padding-top:9px;text-align:center}
.afx .pt textarea{min-height:64px}
.afx .pt .mv{display:flex;flex-direction:column;gap:4px}
.afx .pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;background:#f1f5f9;color:#334155}
.afx .pill.green{background:#dcfce7;color:#166534}
@media (max-width:700px){.afx .pt{grid-template-columns:1fr}.afx .pt .n{text-align:left;padding:0}.afx .pt .mv{flex-direction:row}}
`;

let xlsxP;
const loadXLSX = () => xlsxP || (xlsxP = new Promise((res, rej) => {
  if (window.XLSX) return res(window.XLSX);
  const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onload = () => res(window.XLSX); s.onerror = () => { xlsxP = null; rej(new Error('Could not load the Excel writer. Check your internet connection.')); };
  document.head.appendChild(s);
}));

export async function renderAuditAdmin(panel, ctx) {
  if (!document.getElementById('afx-style')) { const st = document.createElement('style'); st.id = 'afx-style'; st.textContent = CSS; document.head.appendChild(st); }
  let forms = [];
  const reload = async () => { forms = await listAuditForms(); };
  try { await reload(); } catch (e) { panel.innerHTML = `<div class="empty"><b>Could not load audit forms.</b><p>${esc(friendlyError(e))}</p></div>`; return; }
  const fail = (e) => toast(friendlyError(e));

  /* ---------- list ---------- */
  function drawList() {
    panel.innerHTML = `<div class="afx"><div class="toolbar"><span class="hint">Forms you create here appear on the Audit page for all users.</span><span style="flex:1"></span>
      <button type="button" class="btn btn-ghost" id="fImp">Import from Excel</button><button type="button" class="btn btn-ghost" id="fNew">${icon('plus')}<span>New simple checklist</span></button>
      <button type="button" class="btn btn-primary" id="fSheet">${icon('plus')}<span>New checksheet</span></button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Form</th><th>Type</th><th class="num">Points / rows</th><th>Status</th><th></th></tr></thead><tbody>
      ${forms.map((f) => `<tr><td data-label="Form"><b>${esc(f.title)}</b><br><small style="color:var(--muted)">${esc(f.description || '')}</small></td><td data-label="Type">${f.kind === 'sheet' ? 'Checksheet' : 'Simple checklist'}</td><td class="num" data-label="Points">${f.kind === 'sheet' ? (f.rowMode === 'free' ? 'Auditor adds rows' : (f.rows || []).filter((x) => !x.g).length) : (f.points || []).length}</td>
        <td data-label="Status"><span class="pill ${f.active === false ? '' : 'green'}">${f.active === false ? 'Hidden' : 'Shown on Audit page'}</span></td>
        <td class="acts-td"><div class="acts"><button type="button" class="btn btn-ghost btn-sm" data-e="${esc(f.id)}">${icon('edit')}<span>Edit</span></button>
          <button type="button" class="btn btn-ghost btn-sm" data-t="${esc(f.id)}">${f.active === false ? 'Show' : 'Hide'}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-c="${esc(f.id)}">Duplicate</button>
          <button type="button" class="btn btn-ghost btn-sm" data-x="${esc(f.id)}">Responses Excel</button>
          <button type="button" class="btn btn-danger btn-sm" data-d="${esc(f.id)}" aria-label="Delete">${icon('trash')}</button></div></td></tr>`).join('')
        || '<tr><td colspan="5"><div class="empty">No audit form yet. Select New checksheet, or import your Excel check sheets.</div></td></tr>'}
      </tbody></table></div></div>`;
    const find = (id) => forms.find((f) => f.id === id);
    const sheetEd = (f) => editSheet(panel, f, { onClose: async (saved) => { if (saved) await reload(); drawList(); } });
    panel.querySelector('#fNew').onclick = () => edit(null);
    panel.querySelector('#fSheet').onclick = () => sheetEd(null);
    panel.querySelector('#fImp').onclick = () => importDialog();
    panel.querySelectorAll('[data-e]').forEach((b) => { b.onclick = () => { const f = find(b.dataset.e); if (f.kind === 'sheet') sheetEd(f); else edit(f); }; });
    panel.querySelectorAll('[data-t]').forEach((b) => { b.onclick = async () => { const f = find(b.dataset.t); try { await saveAuditForm(f.id, { active: f.active === false }); f.active = f.active === false; drawList(); } catch (e) { fail(e); } }; });
    panel.querySelectorAll('[data-c]').forEach((b) => { b.onclick = async () => { const f = find(b.dataset.c); try { const { id: _i, createdAt: _c, updatedAt: _u, createdBy: _b, ...rest } = f; await saveAuditForm(null, { ...rest, title: f.title + ' (copy)', active: false }); await reload(); drawList(); toast('Copied. The copy is hidden until you show it.'); } catch (e) { fail(e); } }; });
    panel.querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => exportResponses(find(b.dataset.x), b); });
    panel.querySelectorAll('[data-d]').forEach((b) => { b.onclick = async () => {
      const f = find(b.dataset.d);
      if (!(await confirmBox({ title: 'Delete audit form', message: `Delete “${f.title}”? Responses already submitted are kept in the database, but the form is removed from the Audit page.`, okLabel: 'Delete', danger: true }))) return;
      try { await deleteAuditForm(f.id); forms = forms.filter((z) => z.id !== f.id); drawList(); toast('Form deleted.'); } catch (e) { fail(e); }
    }; });
  }

  async function exportResponses(f, btn) {
    btn.disabled = true;
    try {
      const rows = await listAuditResponses({ formId: f.id });
      if (!rows.length) { toast('This form has no responses yet.'); return; }
      const X = await loadXLSX();
      const dt = (r) => { const d = r.createdAt?.toDate?.(); return d ? [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`] : ['', '']; };
      if (f.kind === 'sheet') { await exportSheetResponses(f, rows, X, dt); return; }
      const R = { ok: 'Meets criteria', nok: 'Does not meet', na: 'Not applicable' };
      const sum = [['Date', 'Time', 'Audit form', 'Department', 'Line', 'Audited by', 'Employee ID', 'Audit points', 'Meets', 'Does not meet', 'Not applicable', 'Score %']];
      const det = [['Date', 'Time', 'Audit form', 'Department', 'Line', 'Audited by', 'Employee ID', 'No.', 'Audit point', 'Criteria', 'Observation', 'Remark']];
      rows.slice().reverse().forEach((r) => {
        const [d, t] = dt(r);
        sum.push([d, t, r.formTitle, r.department, r.line, r.auditorName, r.auditorEmployeeId || '', r.counts?.total ?? 0, r.counts?.ok ?? 0, r.counts?.nok ?? 0, r.counts?.na ?? 0, r.score ?? '']);
        (r.answers || []).forEach((a, i) => det.push([d, t, r.formTitle, r.department, r.line, r.auditorName, r.auditorEmployeeId || '', i + 1, a.point, a.criteria, R[a.result] || a.result, a.remark || '']));
      });
      const w1 = X.utils.aoa_to_sheet(sum), w2 = X.utils.aoa_to_sheet(det);
      w1['!cols'] = [11, 7, 26, 16, 16, 20, 12, 8, 8, 10, 10, 9].map((w) => ({ wch: w })); w2['!cols'] = [11, 7, 26, 16, 16, 20, 12, 5, 40, 40, 16, 40].map((w) => ({ wch: w }));
      const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, w1, 'Responses'); X.utils.book_append_sheet(wb, w2, 'Audit points');
      X.writeFile(wb, `Audit_${String(f.title).replace(/[^A-Za-z0-9]+/g, '-')}.xlsx`);
    } catch (e) { toast(e.message || friendlyError(e)); }
    btn.disabled = false;
  }

  async function exportSheetResponses(f, rows, X, dt) {
    const cols = []; const seen = new Set();
    rows.slice().reverse().forEach((r) => (r.cols || []).forEach((c) => { if (!seen.has(c.id)) { seen.add(c.id); cols.push(c); } }));
    const hf = []; const hs = new Set(); rows.forEach((r) => (r.headerValues || []).forEach((h) => { if (!hs.has(h.id)) { hs.add(h.id); hf.push(h); } }));
    const sum = [['Date', 'Time', 'Audit date', 'Audit form', 'Department', 'Line', ...hf.map((h) => h.label), 'Audited by', 'Employee ID', 'Auditor area', 'Minutes taken', 'OK', 'NOT OK', 'Score %']];
    const det = [['Date', 'Time', 'Audit date', 'Audit form', 'Department', 'Line', ...hf.map((h) => h.label), 'Audited by', 'Employee ID', 'Auditor area', 'Minutes taken', 'Group', ...cols.map((c) => c.label)]];
    rows.slice().reverse().forEach((r) => {
      const [d, t] = dt(r), hv = hf.map((h) => (r.headerValues || []).find((x) => x.id === h.id)?.value || '');
      sum.push([d, t, r.auditDate || '', r.formTitle, r.department, r.line, ...hv, r.auditorName, r.auditorEmployeeId || '', r.auditorArea || '', r.durationMin ?? '', r.counts?.ok ?? '', r.counts?.nok ?? '', r.score ?? '']);
      let grp = '';
      (r.rows || []).forEach((x) => {
        if (x.g) { grp = x.label; return; }
        det.push([d, t, r.auditDate || '', r.formTitle, r.department, r.line, ...hv, r.auditorName, r.auditorEmployeeId || '', r.auditorArea || '', r.durationMin ?? '', grp, ...cols.map((c) => (c.kind === 'entry' ? x.e?.[c.id] : x.f?.[c.id]) ?? '')]);
      });
    });
    const w1 = X.utils.aoa_to_sheet(sum), w2 = X.utils.aoa_to_sheet(det);
    w1['!cols'] = sum[0].map((h) => ({ wch: Math.max(10, Math.min(30, String(h).length + 4)) })); w2['!cols'] = det[0].map((h) => ({ wch: Math.max(10, Math.min(36, String(h).length + 4)) }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, w1, 'Responses'); X.utils.book_append_sheet(wb, w2, 'Details');
    X.writeFile(wb, `Audit_${String(f.title).replace(/[^A-Za-z0-9]+/g, '-')}.xlsx`);
  }

  /* ---------- import Excel check sheets ---------- */
  function importDialog() {
    const m = openModal({
      title: 'Import check sheets from Excel', wide: true,
      html: `<p class="hint">Choose your Excel file. Each worksheet becomes one form: <b>yellow cells are filled in by the auditor</b>, all other cells stay fixed text. Images are not used. You can edit every form afterwards.</p>
        <input type="file" id="imf" accept=".xlsx"><div id="imr" style="margin-top:12px"></div><div class="err" id="ime" style="color:#b91c1c"></div>`,
      actions: [{ label: 'Close', onClick: (x) => x.close() }, { label: 'Import selected forms', kind: 'primary', id: 'imgo', onClick: (x, b) => doImport(x, b) }]
    });
    let parsed = [];
    const box = m.el.querySelector('#imr'), err = m.el.querySelector('#ime');
    m.el.querySelector('#imf').onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      err.textContent = ''; box.innerHTML = '<div class="empty">Reading the file…</div>'; parsed = [];
      try {
        const { parseChecksheetWorkbook } = await import('./audit-import.js');
        parsed = await parseChecksheetWorkbook(await file.arrayBuffer());
        const titles = new Set(forms.map((f) => String(f.title).toLowerCase())), seen = new Set();
        parsed.forEach((p) => { if (p.error) return; const k = p.title.toLowerCase(); p.dup = titles.has(k) || seen.has(k); seen.add(k); p.pick = !p.dup; });
        if (!parsed.length) { box.innerHTML = '<div class="empty">No check sheet found. A sheet needs yellow cells under a heading row.</div>'; return; }
        box.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Worksheet</th><th>Form title</th><th class="num">Rows</th><th>Yellow columns</th></tr></thead><tbody>${parsed.map((p, i) => p.error
          ? `<tr><td></td><td colspan="4" style="color:#b91c1c">${esc(p.error)}</td></tr>`
          : `<tr><td><input type="checkbox" data-i="${i}" ${p.pick ? 'checked' : ''} aria-label="Import ${esc(p.sheetName)}" style="width:auto"></td><td data-label="Worksheet">${esc(p.sheetName)}${p.dup ? '<br><small style="color:#92400e">Same title already exists</small>' : ''}</td>
          <td data-label="Title"><input data-t="${i}" style="min-width:260px" value="${esc(p.title)}" maxlength="140"></td><td class="num" data-label="Rows">${p.rowMode === 'free' ? 'auditor adds' : p.rows.filter((r) => !r.g).length}</td>
          <td data-label="Yellow columns">${esc(p.columns.filter((c) => c.kind === 'entry').map((c) => c.label).join(', '))}</td></tr>`).join('')}</tbody></table></div>`;
        box.querySelectorAll('[data-i]').forEach((c) => { c.onchange = () => { parsed[+c.dataset.i].pick = c.checked; }; });
        box.querySelectorAll('[data-t]').forEach((c) => { c.oninput = () => { parsed[+c.dataset.t].title = c.value; }; });
      } catch (ex) { box.innerHTML = ''; err.textContent = ex.message || friendlyError(ex); }
    };
    async function doImport(x, btn) {
      const sel = parsed.filter((p) => !p.error && p.pick && clean(p.title));
      if (!sel.length) { err.textContent = 'Select at least one worksheet.'; return; }
      btn.disabled = true;
      try {
        for (const p of sel) { const { pick, dup, sheetName, ...doc } = p; await saveAuditForm(null, { ...doc, title: clean(p.title), active: true }); }
        await reload(); x.close(); drawList(); toast(`${sel.length} form${sel.length === 1 ? '' : 's'} imported.`);
      } catch (ex) { err.textContent = friendlyError(ex); btn.disabled = false; }
    }
  }

  /* ---------- editor ---------- */
  function edit(f) {
    let points = (f?.points || []).map((p) => ({ ...p }));
    if (!points.length) points = [{ point: '', criteria: '' }];
    panel.innerHTML = `<div class="afx pad"><div class="bar" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px"><h3 style="margin:0">${f ? 'Edit audit form' : 'New audit form'}</h3><button type="button" class="btn btn-ghost" id="eBack">← Back to forms</button></div>
      <div class="fg"><div class="full"><label class="l" for="e_title">Form title *</label><input id="e_title" maxlength="120" value="${esc(f?.title || '')}" placeholder="For example: Line safety audit"></div>
      <div class="full"><label class="l" for="e_desc">Description (shown at the top of the form)</label><textarea id="e_desc" rows="2" maxlength="400">${esc(f?.description || '')}</textarea></div></div>
      <p class="hint" style="margin:10px 0">Every form starts with Department and Line (with an “Other” option to type another area). Then the auditor answers each audit point below: meets criteria, does not meet, or not applicable. A remark is required when the point does not meet the criteria.</p>
      <div id="pts"></div>
      <div class="row" style="margin:6px 0 14px;flex-wrap:wrap"><button type="button" class="btn btn-ghost" id="eAdd">${icon('plus')}<span>Add audit point</span></button><button type="button" class="btn btn-ghost" id="eMany">Add many at once</button></div>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="e_act" style="width:auto" ${f?.active === false ? '' : 'checked'}> Show this form on the Audit page</label>
      <div class="err" id="e_err"></div>
      <div class="row" style="margin-top:14px;justify-content:flex-end"><button type="button" class="btn btn-ghost" id="eCancel">Cancel</button><button type="button" class="btn btn-primary" id="eSave">Save form</button></div></div>`;
    const $ = (id) => panel.querySelector('#' + id);
    const sync = () => panel.querySelectorAll('#pts .pt').forEach((row, i) => { points[i].point = row.querySelector('.pp').value; points[i].criteria = row.querySelector('.pc').value; });
    const draw = () => {
      $('pts').innerHTML = points.map((p, i) => `<div class="pt" data-i="${i}"><div class="n">${i + 1}</div>
        <div><label class="l">Audit point</label><textarea class="pp" maxlength="300" placeholder="What is checked">${esc(p.point)}</textarea></div>
        <div><label class="l">Criteria</label><textarea class="pc" maxlength="400" placeholder="What is acceptable">${esc(p.criteria)}</textarea></div>
        <div class="mv"><button type="button" class="btn btn-ghost btn-sm" data-up="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn btn-ghost btn-sm" data-dn="${i}" aria-label="Move down" ${i === points.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="btn btn-danger btn-sm" data-rm="${i}" aria-label="Remove point">${icon('trash')}</button></div></div>`).join('');
      panel.querySelectorAll('[data-up]').forEach((b) => { b.onclick = () => { sync(); const i = +b.dataset.up; [points[i - 1], points[i]] = [points[i], points[i - 1]]; draw(); }; });
      panel.querySelectorAll('[data-dn]').forEach((b) => { b.onclick = () => { sync(); const i = +b.dataset.dn; [points[i + 1], points[i]] = [points[i], points[i + 1]]; draw(); }; });
      panel.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { sync(); points.splice(+b.dataset.rm, 1); if (!points.length) points.push({ point: '', criteria: '' }); draw(); }; });
    };
    draw();
    $('eBack').onclick = $('eCancel').onclick = drawList;
    $('eAdd').onclick = () => { sync(); points.push({ point: '', criteria: '' }); draw(); panel.querySelector('#pts .pt:last-child .pp')?.focus(); };
    $('eMany').onclick = () => {
      const m = openModal({
        title: 'Add many audit points', wide: true,
        html: '<p class="hint">One audit point per line. Write the point, then a vertical bar |, then its criteria. Example:<br><code>Fire extinguisher accessible | Not blocked, inspection tag valid</code></p><textarea id="mm" rows="10" style="width:100%"></textarea><div class="err" id="mm_err"></div>',
        actions: [{ label: 'Cancel', onClick: (x) => x.close() }, { label: 'Add points', kind: 'primary', onClick: (x) => {
          const lines = m.el.querySelector('#mm').value.split('\n').map((l) => l.trim()).filter(Boolean);
          if (!lines.length) { m.el.querySelector('#mm_err').textContent = 'Enter at least one line.'; return; }
          sync(); points = points.filter((p) => clean(p.point) || clean(p.criteria));
          lines.forEach((l) => { const i = l.indexOf('|'); points.push(i < 0 ? { point: clean(l), criteria: '' } : { point: clean(l.slice(0, i)), criteria: clean(l.slice(i + 1)) }); });
          x.close(); draw();
        } }]
      });
    };
    $('eSave').onclick = async (ev) => {
      sync(); const err = $('e_err'); err.textContent = '';
      const title = clean($('e_title').value);
      if (!title) { err.textContent = 'Enter the form title.'; return; }
      const clean2 = points.map((p) => ({ point: clean(p.point), criteria: clean(p.criteria) })).filter((p) => p.point || p.criteria);
      if (!clean2.length) { err.textContent = 'Add at least one audit point.'; return; }
      const miss = clean2.findIndex((p) => !p.point || !p.criteria);
      if (miss >= 0) { err.textContent = `Audit point ${miss + 1} needs both the audit point and its criteria.`; return; }
      const old = f?.points || [];
      const pts = clean2.map((p, i) => ({ id: old.find((o) => o.point === p.point)?.id || `p${Date.now().toString(36)}${i}`, ...p }));
      ev.currentTarget.disabled = true;
      try {
        const data = { title, description: clean($('e_desc').value), points: pts, active: $('e_act').checked };
        await saveAuditForm(f?.id || null, data); await reload(); drawList(); toast('Form saved.');
      } catch (e) { err.textContent = friendlyError(e); ev.currentTarget.disabled = false; }
    };
  }

  drawList();
}

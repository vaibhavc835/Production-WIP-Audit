/* =====================================================================
   js/audit-admin.js
   Admin Control > Audit Forms. Loaded by admin.html only when the tab is opened.
   The admin builds audit forms (title, audit points with criteria). They appear on the Audit page.
   ===================================================================== */
import { icon, esc, toast, openModal, confirmBox, friendlyError, listAuditForms, saveAuditForm, deleteAuditForm, listAuditResponses } from './wip-core.js';

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
      <button type="button" class="btn btn-primary" id="fNew">${icon('plus')}<span>New audit form</span></button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Form</th><th class="num">Audit points</th><th>Status</th><th></th></tr></thead><tbody>
      ${forms.map((f) => `<tr><td data-label="Form"><b>${esc(f.title)}</b><br><small style="color:var(--muted)">${esc(f.description || '')}</small></td><td class="num" data-label="Points">${(f.points || []).length}</td>
        <td data-label="Status"><span class="pill ${f.active === false ? '' : 'green'}">${f.active === false ? 'Hidden' : 'Shown on Audit page'}</span></td>
        <td class="acts-td"><div class="acts"><button type="button" class="btn btn-ghost btn-sm" data-e="${esc(f.id)}">${icon('edit')}<span>Edit</span></button>
          <button type="button" class="btn btn-ghost btn-sm" data-t="${esc(f.id)}">${f.active === false ? 'Show' : 'Hide'}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-c="${esc(f.id)}">Duplicate</button>
          <button type="button" class="btn btn-ghost btn-sm" data-x="${esc(f.id)}">Responses Excel</button>
          <button type="button" class="btn btn-danger btn-sm" data-d="${esc(f.id)}" aria-label="Delete">${icon('trash')}</button></div></td></tr>`).join('')
        || '<tr><td colspan="4"><div class="empty">No audit form yet. Select New audit form to create the first one.</div></td></tr>'}
      </tbody></table></div></div>`;
    const find = (id) => forms.find((f) => f.id === id);
    panel.querySelector('#fNew').onclick = () => edit(null);
    panel.querySelectorAll('[data-e]').forEach((b) => { b.onclick = () => edit(find(b.dataset.e)); });
    panel.querySelectorAll('[data-t]').forEach((b) => { b.onclick = async () => { const f = find(b.dataset.t); try { await saveAuditForm(f.id, { active: f.active === false }); f.active = f.active === false; drawList(); } catch (e) { fail(e); } }; });
    panel.querySelectorAll('[data-c]').forEach((b) => { b.onclick = async () => { const f = find(b.dataset.c); try { await saveAuditForm(null, { title: f.title + ' (copy)', description: f.description || '', points: f.points || [], active: false }); await reload(); drawList(); toast('Copied. The copy is hidden until you show it.'); } catch (e) { fail(e); } }; });
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
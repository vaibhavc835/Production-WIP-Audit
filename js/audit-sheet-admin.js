/* =====================================================================
   js/audit-sheet-admin.js
   Admin builder for checksheet-style audit forms (table format with fixed and yellow entry cells).
   Opened from audit-admin.js.
   ===================================================================== */
import { icon, esc, toast, openModal, friendlyError, saveAuditForm, getMaster, auditPlacesFromMaster } from './wip-core.js';
import { COL_TYPES, HDR_TYPES, AUTO_FIELDS, autoOf, isList, normType, clean, renderSheet } from './audit-sheet.js';

const CSS = `
.sbx .sec{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:14px}
.sbx .sec h4{margin:0 0 4px;font-size:15px}.sbx .sec .hint{margin:0 0 10px}
.sbx .cr{display:grid;grid-template-columns:1.6fr 1.1fr 1.1fr 1.3fr auto auto auto;gap:8px;align-items:center;margin-bottom:8px;padding:8px;border:1px solid var(--line);border-radius:10px;background:#fafbfc}
.sbx .cr.en{background:#fffbe0;border-color:#f3e08a}
.sbx .cr label.ck{display:flex;gap:6px;align-items:center;font-size:13px;white-space:nowrap}
.sbx .cr label.ck input{width:auto;margin:0}
.sbx .fr{display:grid;grid-template-columns:1.4fr 1fr 1.4fr auto auto;gap:8px;align-items:center;margin-bottom:8px}
.sbx .rw{overflow:auto;border:1px solid var(--line);border-radius:10px;max-height:60vh}
.sbx table.rt{border-collapse:collapse;width:100%;font-size:13.5px}
.sbx .rt th{position:sticky;top:0;background:#e8edf3;text-align:left;padding:6px 8px;border-bottom:1px solid #b8c2cf;z-index:1}
.sbx .rt td{padding:3px 4px;border-bottom:1px solid #eef1f5;vertical-align:middle}
.sbx .rt td.n{width:34px;text-align:center;color:var(--muted);font-weight:600}
.sbx .rt input{width:100%;min-width:90px;box-sizing:border-box;margin:0;padding:5px 7px;font-size:13.5px}
.sbx .rt tr.g td{background:#dbe5f1}.sbx .rt tr.g input{font-weight:700;background:#eef3f9}
.sbx .rt td.a{white-space:nowrap;width:1%}
.sbx .rt td.a button{padding:2px 7px}
.sbx .seg{display:flex;gap:8px;flex-wrap:wrap}
.sbx .seg label{display:flex;gap:6px;align-items:center;border:1px solid var(--line);border-radius:999px;padding:7px 14px;cursor:pointer;font-weight:600;font-size:14px;background:#fff}
.sbx .seg label input{width:auto;margin:0}
@media (max-width:900px){.sbx .cr,.sbx .fr{grid-template-columns:1fr 1fr}}
`;
// Colour themes (the fill-in page in audit-sheet.js has the matching styles)
const THEMES = [['blue', 'Blue', '#1e3a5f'], ['green', 'Green', '#166534'], ['teal', 'Teal', '#0f766e'], ['purple', 'Purple', '#5b21b6'], ['amber', 'Amber', '#b45309'], ['red', 'Red', '#991b1b'], ['slate', 'Slate', '#334155']];
const uidGen = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function editSheet(panel, f, { onClose }) {
  if (!document.getElementById('sbx-style')) { const s = document.createElement('style'); s.id = 'sbx-style'; s.textContent = CSS; document.head.appendChild(s); }
  const S = {
    title: f?.title || '', formNo: f?.formNo || '', description: f?.description || '', active: f?.active !== false, askPlace: f ? f.askPlace !== false : true, theme: f?.theme || 'blue', defaultDept: f?.defaultDept || '', defaultLine: f?.defaultLine || '', auto: autoOf(f),
    fields: (f?.headerFields || []).map((x) => ({ ...x })),
    cols: (f?.columns || []).map((x) => ({ ...x })),
    rowMode: f?.rowMode === 'free' ? 'free' : 'fixed', startRows: f?.startRows || 5,
    rows: (f?.rows || []).map((r) => ({ ...r, f: { ...(r.f || {}) }, e: { ...(r.e || {}) } }))
  };
  if (!S.cols.length) S.cols = [
    { id: uidGen('c'), label: 'Sr. No.', kind: 'fixed', type: 'text' }, { id: uidGen('c'), label: 'Check point', kind: 'fixed', type: 'text' },
    { id: uidGen('c'), label: 'OK / NOT OK', kind: 'entry', type: 'okng', required: true }, { id: uidGen('c'), label: 'Remark', kind: 'entry', type: 'text', reqOnNok: true }];
  if (!S.rows.length && S.rowMode === 'fixed') S.rows = [{ id: uidGen('r'), f: {}, e: {} }];

  panel.innerHTML = `<div class="sbx afx" style="padding:16px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px"><h3 style="margin:0">${f ? 'Edit checksheet' : 'New checksheet'}</h3><button type="button" class="btn btn-ghost btn-sm" id="sBack">← Back to forms</button></div>
    <div class="sec"><h4>Form details</h4><div class="fg">
      <div class="full"><label class="l" for="s_title">Form title *</label><input id="s_title" maxlength="140" value="${esc(S.title)}" placeholder="For example: Trolley inspection checksheet"></div>
      <div><label class="l" for="s_no">Form number and revision</label><input id="s_no" maxlength="120" value="${esc(S.formNo)}" placeholder="HCEI/FAB/F/056 Rev. 00"></div>
      <div><label class="l" for="s_desc">Description (shown at the top)</label><input id="s_desc" maxlength="400" value="${esc(S.description)}"></div></div>
      <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:10px"><label class="ck" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="s_place" style="width:auto" ${S.askPlace ? 'checked' : ''}> Ask Department and Line at the top</label>
      <label class="ck" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="s_act" style="width:auto" ${S.active ? 'checked' : ''}> Show this form on the Audit page</label></div>
      <div style="margin-top:12px"><b style="font-size:14px">Default department and line</b><p class="hint" style="margin:2px 0 6px">From Master Data. The auditor sees these already selected. If "Ask Department and Line" is off, they are recorded automatically.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><select id="s_dd" aria-label="Default department" style="max-width:260px"><option value="">No default department</option></select><select id="s_dl" aria-label="Default line" style="max-width:260px"><option value="">No default line</option></select></div></div>
      <div style="margin-top:12px"><b style="font-size:14px">Colour theme</b><p class="hint" style="margin:2px 0 6px">Background and header colours of the form your auditors fill in.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap" id="thm">${THEMES.map(([k, l, c]) => `<label style="display:flex;gap:6px;align-items:center;cursor:pointer;padding:4px 10px;border:2px solid ${S.theme === k ? c : '#e2e8f0'};border-radius:999px;font-size:13px"><input type="radio" name="thm" value="${k}" style="width:auto" ${S.theme === k ? 'checked' : ''}><i style="width:14px;height:14px;border-radius:50%;background:${c};display:inline-block"></i>${l}</label>`).join('')}</div></div>
      <div style="margin-top:12px"><b style="font-size:14px">Recorded automatically</b><p class="hint" style="margin:2px 0 6px">The auditor's name, employee ID and the audit date are always captured from the login and the device clock. Choose what else to capture:</p>
      <div style="display:flex;gap:6px 18px;flex-wrap:wrap">${AUTO_FIELDS.map(([k, l]) => `<label class="ck" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-auto="${k}" style="width:auto" ${S.auto[k] ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div></div></div>
    <div class="sec"><h4>Extra fields at the top</h4><p class="hint">For example Shift, Trolley no., Crane no. The auditor fills them in once for the whole sheet.</p><div id="fl"></div><button type="button" class="btn btn-ghost btn-sm" id="fAdd">${icon('plus')}<span>Add field</span></button></div>
    <div class="sec"><h4>Table columns</h4><p class="hint">Fixed columns hold text you write (check point, criteria, requirement). Yellow columns are filled in by the auditor (OK / NOT OK, remark, reading, date).</p><div id="cl"></div><button type="button" class="btn btn-ghost btn-sm" id="cAdd">${icon('plus')}<span>Add column</span></button></div>
    <div class="sec"><h4>Rows</h4><div class="seg" id="rm"><label><input type="radio" name="rmode" value="fixed"> I write the rows (fixed check points)</label><label><input type="radio" name="rmode" value="free"> The auditor adds the rows</label></div>
      <div id="rbox" style="margin-top:12px"></div></div>
    <div class="err" id="s_err" style="color:#b91c1c;margin-bottom:8px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn btn-ghost" id="sPrev">Preview</button><button type="button" class="btn btn-ghost" id="sCancel">Cancel</button><button type="button" class="btn btn-primary" id="sSave">Save checksheet</button></div></div>`;
  const $ = (id) => panel.querySelector('#' + id);
  $('s_title').oninput = (e) => { S.title = e.target.value; }; $('s_no').oninput = (e) => { S.formNo = e.target.value; }; $('s_desc').oninput = (e) => { S.description = e.target.value; };
  $('s_place').onchange = (e) => { S.askPlace = e.target.checked; }; $('s_act').onchange = (e) => { S.active = e.target.checked; };
  panel.querySelectorAll('[data-auto]').forEach((el) => { el.onchange = () => { S.auto[el.dataset.auto] = el.checked; }; });
  panel.querySelectorAll('#thm input').forEach((el) => { el.onchange = () => { S.theme = el.value; panel.querySelectorAll('#thm label').forEach((l) => { const on = l.querySelector('input').checked; l.style.borderColor = on ? THEMES.find((t) => t[0] === S.theme)[2] : '#e2e8f0'; }); }; });
  let PL = new Map();
  const fillLines = () => { const d = $('s_dd').value; $('s_dl').innerHTML = `<option value="">${d ? 'No default line' : 'Choose a department first'}</option>${[...(PL.get(d) || [])].sort().map((l) => `<option${S.defaultLine === l ? ' selected' : ''}>${esc(l)}</option>`).join('')}`; $('s_dl').disabled = !d; };
  getMaster().then((m) => {
    PL = auditPlacesFromMaster(m);
    if (S.defaultDept && !PL.has(S.defaultDept)) PL.set(S.defaultDept, new Set(S.defaultLine ? [S.defaultLine] : []));
    $('s_dd').innerHTML = `<option value="">No default department</option>${[...PL.keys()].sort().map((d) => `<option${S.defaultDept === d ? ' selected' : ''}>${esc(d)}</option>`).join('')}`; fillLines();
  }).catch(() => { $('s_dd').disabled = true; $('s_dl').disabled = true; });
  $('s_dd').onchange = () => { S.defaultDept = $('s_dd').value; S.defaultLine = ''; fillLines(); };
  $('s_dl').onchange = () => { S.defaultLine = $('s_dl').value; };
  $('sBack').onclick = $('sCancel').onclick = onClose;
  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };

  /* ----- header fields ----- */
  const drawFields = () => {
    $('fl').innerHTML = S.fields.map((x, i) => `<div class="fr"><input data-i="${i}" data-k="label" value="${esc(x.label || '')}" placeholder="Field name" aria-label="Field name">
      <select data-i="${i}" data-k="type" aria-label="Field type">${HDR_TYPES.map(([v, l]) => `<option value="${v}"${normType(x.type) === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <input data-i="${i}" data-k="options" value="${esc((x.options || []).join(', '))}" placeholder="Choices, separated by commas" aria-label="Choices" ${isList(x.type) ? '' : 'hidden'}>
      <label class="ck" style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" data-i="${i}" data-k="required" ${x.required ? 'checked' : ''} style="width:auto"> Required</label>
      <button type="button" class="btn btn-danger btn-sm" data-rm="${i}" aria-label="Remove field">${icon('trash')}</button></div>`).join('') || '<p class="hint">No extra field.</p>';
    $('fl').querySelectorAll('[data-k]').forEach((el) => {
      el.onchange = el.oninput = () => {
        const x = S.fields[+el.dataset.i], k = el.dataset.k;
        if (k === 'required') x.required = el.checked; else if (k === 'options') x.options = el.value.split(',').map(clean).filter(Boolean); else x[k] = el.value;
        if (k === 'type') drawFields();
      };
    });
    $('fl').querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { S.fields.splice(+b.dataset.rm, 1); drawFields(); }; });
  };
  $('fAdd').onclick = () => { S.fields.push({ id: uidGen('h'), label: '', type: 'text' }); drawFields(); $('fl').querySelector('.fr:last-child input')?.focus(); };

  /* ----- columns ----- */
  const drawCols = () => {
    $('cl').innerHTML = S.cols.map((c, i) => `<div class="cr ${c.kind === 'entry' ? 'en' : ''}"><input data-i="${i}" data-k="label" value="${esc(c.label || '')}" placeholder="Column heading" aria-label="Column heading">
      <select data-i="${i}" data-k="kind" aria-label="Who fills this column"><option value="fixed"${c.kind !== 'entry' ? ' selected' : ''}>Fixed text</option><option value="entry"${c.kind === 'entry' ? ' selected' : ''}>Auditor fills (yellow)</option></select>
      ${c.kind === 'entry' ? `<select data-i="${i}" data-k="type" aria-label="Type of entry">${COL_TYPES.map(([v, l]) => `<option value="${v}"${normType(c.type) === v ? ' selected' : ''}>${l}</option>`).join('')}</select>` : '<span class="hint" style="margin:0">Written by you</span>'}
      <input data-i="${i}" data-k="options" value="${esc((c.options || []).join(', '))}" placeholder="Choices, separated by commas" aria-label="Choices" ${c.kind === 'entry' && isList(c.type) ? '' : 'hidden'}>
      ${c.kind === 'entry' ? `<label class="ck"><input type="checkbox" data-i="${i}" data-k="required" ${c.required ? 'checked' : ''}> Required</label>` : `<label class="ck"><input type="checkbox" data-i="${i}" data-k="merge" ${c.merge ? 'checked' : ''}> Merge repeated</label>`}
      <span style="display:flex;gap:4px"><button type="button" class="btn btn-ghost btn-sm" data-up="${i}" aria-label="Move left" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn btn-ghost btn-sm" data-dn="${i}" aria-label="Move right" ${i === S.cols.length - 1 ? 'disabled' : ''}>↓</button></span>
      <button type="button" class="btn btn-danger btn-sm" data-rm="${i}" aria-label="Remove column">${icon('trash')}</button>
      ${c.kind === 'entry' && c.type === 'text' ? `<label class="ck" style="grid-column:1/-1"><input type="checkbox" data-i="${i}" data-k="reqOnNok" ${c.reqOnNok ? 'checked' : ''}> Required when a NOT OK is chosen in the same row</label>` : ''}
      ${c.kind === 'entry' && c.type === 'okng' ? `<label class="ck" style="grid-column:1/-1"><input type="checkbox" data-i="${i}" data-k="na" ${c.na ? 'checked' : ''}> Also allow NA (not applicable)</label>` : ''}</div>`).join('');
    $('cl').querySelectorAll('[data-k]').forEach((el) => {
      el.onchange = el.oninput = () => {
        const c = S.cols[+el.dataset.i], k = el.dataset.k;
        if (el.type === 'checkbox') c[k] = el.checked; else if (k === 'options') c.options = el.value.split(',').map(clean).filter(Boolean); else c[k] = el.value;
        if (k === 'kind') { if (c.kind === 'entry' && !c.type) c.type = 'text'; drawCols(); drawRows(); }
        else if (k === 'type') { if (c.type === 'okng') c.required = true; drawCols(); }
      };
    });
    $('cl').querySelectorAll('[data-up]').forEach((b) => { b.onclick = () => { move(S.cols, +b.dataset.up, -1); drawCols(); drawRows(); }; });
    $('cl').querySelectorAll('[data-dn]').forEach((b) => { b.onclick = () => { move(S.cols, +b.dataset.dn, 1); drawCols(); drawRows(); }; });
    $('cl').querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { S.cols.splice(+b.dataset.rm, 1); drawCols(); drawRows(); }; });
  };
  $('cAdd').onclick = () => { S.cols.push({ id: uidGen('c'), label: '', kind: 'fixed', type: 'text' }); drawCols(); drawRows(); $('cl').querySelector('.cr:last-child input')?.focus(); };

  /* ----- rows ----- */
  const fixedCols = () => S.cols.filter((c) => c.kind !== 'entry');
  const drawRows = () => {
    panel.querySelectorAll('input[name="rmode"]').forEach((r) => { r.checked = r.value === S.rowMode; });
    const box = $('rbox');
    if (S.rowMode === 'free') {
      box.innerHTML = `<p class="hint">The auditor starts with this many empty rows and can add more. Only the yellow columns are used.</p><label class="l" for="s_start">Rows at the start</label><input type="number" id="s_start" min="1" max="50" value="${S.startRows}" style="max-width:120px">`;
      $('s_start').oninput = (e) => { S.startRows = Math.max(1, Math.min(50, +e.target.value || 1)); }; return;
    }
    const fc = fixedCols();
    if (!fc.length) { box.innerHTML = '<p class="hint">Add at least one fixed column to write rows.</p>'; return; }
    box.innerHTML = `<p class="hint">Write one row per check point. Use a heading row to group rows (for example a line name).</p>
      <div class="rw"><table class="rt"><thead><tr><th></th>${fc.map((c) => `<th>${esc(c.label || '(no heading)')}</th>`).join('')}<th></th></tr></thead><tbody>
      ${S.rows.map((r, i) => r.g ? `<tr class="g"><td class="n">${i + 1}</td><td colspan="${fc.length}"><input data-r="${i}" data-g="1" value="${esc(r.label || '')}" placeholder="Group heading" aria-label="Group heading"></td>${act(i)}</tr>`
        : `<tr><td class="n">${i + 1}</td>${fc.map((c) => `<td><input data-r="${i}" data-c="${esc(c.id)}" value="${esc(r.f?.[c.id] ?? '')}" aria-label="${esc(c.label)}"></td>`).join('')}${act(i)}</tr>`).join('')}
      </tbody></table></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" class="btn btn-ghost btn-sm" id="rAdd">${icon('plus')}<span>Add row</span></button><button type="button" class="btn btn-ghost btn-sm" id="rGrp">Add heading row</button><button type="button" class="btn btn-ghost btn-sm" id="rPaste">Paste rows from Excel</button></div>`;
    box.querySelectorAll('input[data-r]').forEach((el) => { el.oninput = () => { const r = S.rows[+el.dataset.r]; if (el.dataset.g) r.label = el.value; else r.f[el.dataset.c] = el.value; }; });
    box.querySelectorAll('[data-up]').forEach((b) => { b.onclick = () => { move(S.rows, +b.dataset.up, -1); drawRows(); }; });
    box.querySelectorAll('[data-dn]').forEach((b) => { b.onclick = () => { move(S.rows, +b.dataset.dn, 1); drawRows(); }; });
    box.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { S.rows.splice(+b.dataset.rm, 1); drawRows(); }; });
    box.querySelectorAll('[data-ins]').forEach((b) => { b.onclick = () => { S.rows.splice(+b.dataset.ins + 1, 0, { id: uidGen('r'), f: {}, e: {} }); drawRows(); }; });
    $('rAdd').onclick = () => { S.rows.push({ id: uidGen('r'), f: {}, e: {} }); drawRows(); box.querySelector('tbody tr:last-child input')?.focus(); };
    $('rGrp').onclick = () => { S.rows.push({ id: uidGen('r'), g: 1, label: '' }); drawRows(); box.querySelector('tbody tr:last-child input')?.focus(); };
    $('rPaste').onclick = paste;
  };
  const act = (i) => `<td class="a"><button type="button" class="btn btn-ghost btn-sm" data-up="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn btn-ghost btn-sm" data-dn="${i}" aria-label="Move down" ${i === S.rows.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="btn btn-ghost btn-sm" data-ins="${i}" aria-label="Insert row below">+</button><button type="button" class="btn btn-danger btn-sm" data-rm="${i}" aria-label="Remove row">×</button></td>`;
  function paste() {
    const fc = fixedCols();
    const m = openModal({
      title: 'Paste rows from Excel', wide: true,
      html: `<p class="hint">Copy the rows in Excel and paste them here. The columns must follow this order: <b>${fc.map((c) => esc(c.label)).join(' | ')}</b>. A line that starts with <b>#</b> becomes a heading row.</p><textarea id="pp" rows="10" style="width:100%"></textarea><div class="err" id="pp_err" style="color:#b91c1c"></div>`,
      actions: [{ label: 'Cancel', onClick: (x) => x.close() }, { label: 'Add rows', kind: 'primary', onClick: (x) => {
        const lines = m.el.querySelector('#pp').value.split(/\r?\n/).filter((l) => l.trim());
        if (!lines.length) { m.el.querySelector('#pp_err').textContent = 'Paste at least one line.'; return; }
        S.rows = S.rows.filter((r) => r.g || fc.some((c) => clean(r.f?.[c.id])));
        lines.forEach((l) => {
          if (l.trim().startsWith('#')) { S.rows.push({ id: uidGen('r'), g: 1, label: clean(l.replace(/^\s*#/, '')) }); return; }
          const parts = l.split('\t'), r = { id: uidGen('r'), f: {}, e: {} };
          fc.forEach((c, i) => { r.f[c.id] = clean(parts[i]); }); S.rows.push(r);
        });
        x.close(); drawRows();
      } }]
    });
  }
  panel.querySelectorAll('input[name="rmode"]').forEach((r) => { r.onchange = () => { S.rowMode = r.value; if (S.rowMode === 'fixed' && !S.rows.length) S.rows = [{ id: uidGen('r'), f: {}, e: {} }]; drawRows(); }; });
  drawFields(); drawCols(); drawRows();

  /* ----- build the saved document ----- */
  function build() {
    const err = (m) => { throw new Error(m); };
    const title = clean(S.title); if (!title) err('Enter the form title.');
    if (!S.cols.length) err('Add at least one column.');
    const cols = S.cols.map((c, i) => {
      const label = clean(c.label); if (!label) err(`Column ${i + 1} needs a heading.`);
      const o = { id: c.id, label, kind: c.kind === 'entry' ? 'entry' : 'fixed' };
      if (o.kind === 'entry') {
        o.type = normType(c.type); if (c.required) o.required = true;
        if (isList(o.type)) { o.options = (c.options || []).map(clean).filter(Boolean); if (!o.options.length) err(`Column “${label}”: enter the choices, separated by commas.`); }
        if (o.type === 'okng' && c.na) o.na = true; if (o.type === 'text' && c.reqOnNok) o.reqOnNok = true; if (c.unit) o.unit = c.unit;
      } else { o.type = 'text'; if (c.merge) o.merge = true; }
      return o;
    });
    if (!cols.some((c) => c.kind === 'entry')) err('Add at least one column filled by the auditor (yellow).');
    const headerFields = S.fields.map((x, i) => {
      const label = clean(x.label); if (!label) err(`Extra field ${i + 1} needs a name.`);
      const o = { id: x.id, label, type: HDR_TYPES.some(([v]) => v === normType(x.type)) ? normType(x.type) : 'text' };
      if (isList(o.type)) { o.options = (x.options || []).map(clean).filter(Boolean); if (!o.options.length) err(`Field “${label}”: enter the choices.`); }
      if (x.required) o.required = true; if (x.default) o.default = x.default; return o;
    });
    const fcs = cols.filter((c) => c.kind === 'fixed');
    let rows = [];
    if (S.rowMode === 'fixed') {
      rows = S.rows.map((r) => r.g ? { id: r.id, g: 1, label: clean(r.label) } : { id: r.id, f: Object.fromEntries(fcs.map((c) => [c.id, clean(r.f?.[c.id])])), e: Object.fromEntries(Object.entries(r.e || {}).filter(([k, v]) => v && cols.some((c) => c.id === k))) })
        .filter((r) => r.g ? r.label : Object.values(r.f).some(Boolean));
      if (!rows.some((r) => !r.g)) err('Write at least one row.');
    }
    return { kind: 'sheet', title, formNo: clean(S.formNo), description: clean(S.description), askPlace: !!S.askPlace, defaultDept: S.defaultDept || '', defaultLine: S.defaultLine || '', theme: S.theme || 'blue', auto: { ...S.auto }, headerFields, columns: cols, rowMode: S.rowMode, startRows: S.startRows, rows, points: [], active: !!S.active };
  }
  $('sPrev').onclick = () => {
    try { const d = build(); const m = openModal({ title: 'Preview', wide: true, html: '<div id="pv"></div>', actions: [{ label: 'Close', kind: 'primary', onClick: (x) => x.close() }] }); renderSheet(m.el.querySelector('#pv'), d, { preview: true, places: PL, ctx: { name: 'you' } }); }
    catch (e) { $('s_err').textContent = e.message; }
  };
  $('sSave').onclick = async (ev) => {
    $('s_err').textContent = '';
    let d; try { d = build(); } catch (e) { $('s_err').textContent = e.message; return; }
    ev.currentTarget.disabled = true;
    try { await saveAuditForm(f?.id || null, d); toast('Checksheet saved.'); onClose(true); }
    catch (e) { $('s_err').textContent = friendlyError(e); ev.currentTarget.disabled = false; }
  };
}

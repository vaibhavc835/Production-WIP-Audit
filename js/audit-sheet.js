/* =====================================================================
   js/audit-sheet.js
   Checksheet-style audit forms (table format like the Excel check sheets).
   Grey cells = fixed text written by the admin. Yellow cells = entered by the auditor.
   Used by audit.html (fill and view) and by the admin form builder (preview).

   Form layout (saved in auditForms with kind: 'sheet'):
     title, formNo, description, askPlace (department and line), headerFields[{id,label,type,options,required,default}],
     columns[{id,label,kind:'fixed'|'entry',type:'text'|'okng'|'number'|'date'|'choice',options,required,reqOnNok,merge,unit}],
     rowMode: 'fixed' | 'free', startRows, rows[{id, g?:1, label?, f:{colId:text}, e:{colId:defaultValue}}]
   ===================================================================== */
import { esc } from './wip-core.js';

export const clean = (v) => String(v ?? '').replace(/[ \t]+/g, ' ').trim();
export const COL_TYPES = [['text', 'Text'], ['okng', 'OK / NOT OK'], ['number', 'Number'], ['date', 'Date'], ['time', 'Time'], ['dropdown', 'Drop-down list'], ['radio', 'Multiple choice (pick one)'], ['checkbox', 'Checkboxes (tick any)']];
export const HDR_TYPES = COL_TYPES.filter(([v]) => v !== 'okng');
// 'choice' is the older name of the drop-down list
export const isList = (t) => t === 'choice' || t === 'dropdown' || t === 'radio' || t === 'checkbox';
export const normType = (t) => (t === 'choice' ? 'dropdown' : (t || 'text'));
// What the app records by itself: always the auditor's name, employee ID and the date; the rest can be switched on or off per form
export const AUTO_FIELDS = [['time', 'Time of submission', true], ['duration', 'Time taken to fill the form', false], ['area', "Auditor's assigned area (department, line, station)", false]];
export const autoOf = (f) => ({ time: true, duration: false, area: false, ...(f?.auto || {}) });
const OK = 'OK', NOK = 'NOT OK', NA = 'NA';

const CSS = `
.shx .gc{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.shx .gc.head{border-top:8px solid var(--navy)}
.shx .gc.head h1{margin:0 0 4px;font-size:22px}
.shx .hg{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin-top:12px}
.shx .hg .l i{color:#dc2626;font-style:normal}
.shx .tw{overflow:auto;border:1px solid var(--line);border-radius:10px;background:#fff;margin-top:12px;max-height:75vh}
.shx table.sh{border-collapse:separate;border-spacing:0;width:100%;font-size:14px}
.shx .sh th{position:sticky;top:0;z-index:1;background:#e8edf3;text-align:left;padding:8px 10px;border-bottom:1px solid #b8c2cf;border-right:1px solid #d5dbe3;font-size:13px;white-space:normal}
.shx .sh td{padding:6px 8px;border-bottom:1px solid #e2e8f0;border-right:1px solid #eef1f5;vertical-align:middle}
.shx .sh td.fx{background:#fff;min-width:60px}
.shx .sh td.fx.dup{border-top-color:transparent;color:transparent;user-select:none}
.shx .sh td.en{background:#fff9c4;min-width:110px}
.shx .sh td.en.bad,.shx .sh tr.bad td.fx{outline:2px solid #dc2626;outline-offset:-2px}
.shx .sh tr.grp td{background:#dbe5f1;font-weight:700;padding:8px 10px}
.shx .sh td input[type=text],.shx .sh td input[type=number],.shx .sh td input[type=date],.shx .sh td input[type=time],.shx .sh td select,.shx .sh td textarea{width:100%;min-width:90px;box-sizing:border-box;margin:0;padding:6px 8px;font-size:14px;background:#fffef0}
.shx .sh td textarea{min-height:34px;resize:vertical}
.shx .og{display:flex;gap:6px;flex-wrap:wrap}
.shx .og.cg span::before{content:'\\2610\\00a0'}.shx .og.cg input:checked+span::before{content:'\\2611\\00a0'}.shx .og.rg input:checked+span,.shx .og.cg input:checked+span{background:#dbeafe;border-color:#2563eb;color:#1e3a8a}
.shx .autobar{display:flex;gap:6px 16px;flex-wrap:wrap;margin:12px 0 0;padding:8px 12px;border-radius:10px;background:#f1f5f9;font-size:13px;color:#334155}.shx .autobar b{color:#0f172a}
.shx .og label{position:relative;cursor:pointer}
.shx .og input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer}
.shx .og span{display:inline-block;padding:5px 11px;border:1px solid #cbd5e1;border-radius:999px;font-weight:600;font-size:13px;background:#fff;color:#334155;white-space:nowrap}
.shx .og input:focus-visible+span{outline:2px solid #2563eb;outline-offset:2px}
.shx .og input:checked+span.ok{background:#dcfce7;border-color:#16a34a;color:#166534}
.shx .og input:checked+span.nok{background:#fee2e2;border-color:#dc2626;color:#991b1b}
.shx .og input:checked+span.na{background:#e2e8f0;border-color:#64748b;color:#334155}
.shx .rm{border:0;background:transparent;color:#b91c1c;font-size:18px;cursor:pointer;padding:2px 6px}
.shx .bar{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:12px}
.shx .err2{color:#b91c1c;font-size:13px;margin-top:6px}
.shx .legend{display:flex;gap:14px;align-items:center;font-size:13px;color:var(--muted);margin-top:8px;flex-wrap:wrap}
.shx .legend i{display:inline-block;width:14px;height:14px;border:1px solid #cbd5e1;border-radius:3px;vertical-align:-2px;margin-right:5px}
.shx .pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;background:#f1f5f9;color:#334155;white-space:nowrap}
.shx .pill.red{background:#fee2e2;color:#991b1b}.shx .pill.green{background:#dcfce7;color:#166534}.shx .pill.grey{background:#e2e8f0}
@media (max-width:720px){
  .shx .tw{border:0;background:transparent;max-height:none;overflow:visible}
  .shx .sh,.shx .sh tbody,.shx .sh tr,.shx .sh td{display:block;width:100%;box-sizing:border-box}
  .shx .sh thead{display:none}
  .shx .sh tr{background:#fff;border:1px solid var(--line);border-radius:10px;margin-bottom:10px;overflow:hidden}
  .shx .sh td{border:0;border-bottom:1px solid #eef1f5;padding:8px 12px}
  .shx .sh td::before{content:attr(data-label);display:block;font-size:12px;font-weight:600;color:var(--muted);margin-bottom:2px}
  .shx .sh td.fx.dup{color:inherit;user-select:auto}
  .shx .sh td.fx:empty,.shx .sh td.rmc::before{display:none}
  .shx .sh tr.grp{background:#dbe5f1;border-color:#b8c2cf}.shx .sh tr.grp td::before{display:none}
}
`;
const injectCss = () => { if (!document.getElementById('shx-style')) { const s = document.createElement('style'); s.id = 'shx-style'; s.textContent = CSS; document.head.appendChild(s); } };

export const colsOf = (f) => f.columns || [];
const isNumOpts = (c) => normType(c.type) === 'dropdown' && (c.options || []).length > 0 && c.options.every((o) => o !== '' && !isNaN(Number(o)));
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/* ---------- counts and score (OK/NOT OK cells and numeric ratings) ---------- */
export function summarize(cols, rows) {
  const c = { total: 0, ok: 0, nok: 0, na: 0 };
  let rs = 0, rm = 0;
  (rows || []).forEach((r) => {
    if (r.g) return;
    cols.filter((x) => x.kind === 'entry').forEach((col) => {
      const v = r.e?.[col.id]; if (v == null || v === '') return;
      if (col.type === 'okng') { c.total++; if (v === OK) c.ok++; else if (v === NOK) c.nok++; else c.na++; }
      else if (isNumOpts(col)) { rs += Number(v); rm += Math.max(...col.options.map(Number)); }
    });
  });
  let score = null;
  if (c.ok + c.nok) score = Math.round((c.ok / (c.ok + c.nok)) * 1000) / 10;
  else if (rm) score = Math.round((rs / rm) * 1000) / 10;
  return { counts: c, score, ratingSum: rs, ratingMax: rm };
}

/* ---------- read-only table (response details, preview of saved data) ---------- */
export function sheetTableHtml(cols, rows, { filled = true } = {}) {
  injectCss();
  const prev = {};
  const body = (rows || []).map((r) => {
    if (r.g) { Object.keys(prev).forEach((k) => delete prev[k]); return `<tr class="grp"><td colspan="${cols.length}">${esc(r.label || '')}</td></tr>`; }
    const tds = cols.map((c) => {
      if (c.kind === 'entry') {
        const v = r.e?.[c.id] ?? '';
        const cls = c.type === 'okng' ? (v === OK ? 'ok' : v === NOK ? 'nok' : '') : '';
        const sty = cls === 'ok' ? ' style="color:#166534;font-weight:700"' : cls === 'nok' ? ' style="color:#991b1b;font-weight:700"' : '';
        return `<td class="en" data-label="${esc(c.label)}"${sty}>${esc(v)}</td>`;
      }
      const v = r.f?.[c.id] ?? '', dup = c.merge && v !== '' && prev[c.id] === v; prev[c.id] = v;
      return `<td class="fx${dup ? ' dup' : ''}" data-label="${esc(c.label)}">${esc(v)}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');
  return `<div class="shx"><div class="tw"><table class="sh"><thead><tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></div>`;
}

/* ---------- fill a sheet ----------
   host: element. form: auditForms doc. places: Map(department -> Set(lines)). opts.ctx: {name, employeeId}
   Returns { collect(), reset() }. collect() returns { error: {message, el} } or { data }. */
// One input for any answer type. attr is put on the input that holds the value (data-e="…").
const optsOf = (c) => (c.options || []).filter((o) => o !== '');
function widget(c, def, nm, lb, attr) {
  const t = normType(c.type), cur = String(def ?? '');
  if (t === 'okng') {
    const opts = [[OK, 'ok'], [NOK, 'nok'], ...(c.na ? [[NA, 'na']] : [])];
    return `<div class="og" role="radiogroup"${lb}>${opts.map(([v, k]) => `<label><input type="radio" name="${nm}" value="${v}"${cur === v ? ' checked' : ''}><span class="${k}">${v}</span></label>`).join('')}</div>`;
  }
  if (t === 'radio') return `<div class="og rg" role="radiogroup"${lb}>${optsOf(c).map((v) => `<label><input type="radio" name="${nm}" value="${esc(v)}"${cur === v ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>`;
  if (t === 'checkbox') {
    const on = new Set(cur.split(', ').filter(Boolean)), list = optsOf(c).length ? optsOf(c) : ['Yes'];
    return `<div class="og cg" role="group"${lb}>${list.map((v) => `<label><input type="checkbox" name="${nm}" value="${esc(v)}"${on.has(v) ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>`;
  }
  if (t === 'dropdown') return `<select ${attr}${lb}><option value=""></option>${optsOf(c).map((o) => `<option${cur === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  if (t === 'number') return `<input type="number" step="any" inputmode="decimal" ${attr} value="${esc(cur)}"${lb}${c.unit ? ` placeholder="${esc(c.unit)}"` : ''}>`;
  if (t === 'date') return `<input type="date" ${attr} value="${esc(cur)}"${lb}>`;
  if (t === 'time') return `<input type="time" ${attr} value="${esc(cur)}"${lb}>`;
  return `<textarea rows="1" maxlength="400" ${attr}${lb}>${esc(cur)}</textarea>`;
}
// Read the answer out of the element that wraps a widget
function readWidget(root, type) {
  const t = normType(type);
  if (!root) return '';
  if (t === 'okng' || t === 'radio') return root.querySelector('input:checked')?.value || '';
  if (t === 'checkbox') return [...root.querySelectorAll('input:checked')].map((i) => i.value).join(', ');
  return clean(root.querySelector('[data-e]')?.value);
}
export function renderSheet(host, form, { places = new Map(), ctx = {}, preview = false, onSubmit } = {}) {
  injectCss();
  const cols = colsOf(form), free = form.rowMode === 'free', O = '__other__';
  const fields = form.headerFields || [];
  const deptList = [...places.keys()].sort();
  const auto = autoOf(form), startedMs = Date.now();
  // header fields: single-line text is a plain input, the other types use the same widgets as the table
  const hdrWidget = (f) => (normType(f.type) === 'text' ? `<input type="text" maxlength="120" data-e="v" value="${esc(f.default || '')}" aria-label="${esc(f.label)}">` : widget(f, f.default || '', 'h_' + f.id, ` aria-label="${esc(f.label)}"`, 'data-e="v"'));
  let uid = 0;
  const cell = (c, r, ri) => {
    if (c.kind !== 'entry') {
      return `<td class="fx" data-label="${esc(c.label)}" data-c="${esc(c.id)}">${esc(r?.f?.[c.id] ?? '')}</td>`;
    }
    const def = r?.e?.[c.id] ?? '', nm = `o${ri}_${c.id}`, lb = ` aria-label="${esc(c.label)}"`;
    const w = widget(c, def, nm, lb, `data-e="${esc(c.id)}"`);
    return `<td class="en" data-label="${esc(c.label)}${c.required ? ' *' : ''}" data-c="${esc(c.id)}">${w}</td>`;
  };
  const rowHtml = (r, i) => `<tr data-i="${i}" data-id="${esc(r?.id || '')}">${cols.map((c) => cell(c, r, ++uid && i)).join('')}${free ? '<td class="rmc"><button type="button" class="rm" aria-label="Remove row">×</button></td>' : ''}</tr>`;
  const bodyHtml = () => {
    if (free) return Array.from({ length: Math.max(1, form.startRows || 5) }, (_, i) => rowHtml({}, i)).join('');
    const prev = {}; let n = 0;
    return (form.rows || []).map((r) => {
      if (r.g) { Object.keys(prev).forEach((k) => delete prev[k]); return `<tr class="grp"><td colspan="${cols.length}">${esc(r.label || '')}</td></tr>`; }
      const h = rowHtml(r, n++).replace(/<td class="fx"([^>]*)data-c="([^"]+)">/g, (m, a, id) => {
        const col = cols.find((x) => x.id === id), v = r.f?.[id] ?? '', dup = col?.merge && v !== '' && prev[id] === v; prev[id] = v;
        return `<td class="fx${dup ? ' dup' : ''}"${a}data-c="${id}">`;
      });
      return h;
    }).join('');
  };
  host.innerHTML = `<div class="shx"><div class="gc head"><h1>${esc(form.title)}</h1>
      ${form.formNo ? `<div style="color:var(--muted);font-size:13px">${esc(form.formNo)}</div>` : ''}
      ${form.description ? `<div style="white-space:pre-wrap;color:var(--ink2);margin-top:6px">${esc(form.description)}</div>` : ''}
      <p class="hint" style="margin:10px 0 0"><span style="color:#dc2626">*</span> Required</p>
      <div class="hg">
        ${form.askPlace !== false ? `<div><label class="l" for="s_dept">Department <i>*</i></label><select id="s_dept"><option value="">Choose</option>${deptList.map((d) => `<option>${esc(d)}</option>`).join('')}<option value="${O}">Other (type below)</option></select>
          <input id="s_dept_o" placeholder="Type the department" maxlength="80" style="margin-top:6px" hidden></div>
          <div><label class="l" for="s_line">Line <i>*</i></label><select id="s_line"><option value="">Choose the department first</option></select>
          <input id="s_line_o" placeholder="Type the line or area" maxlength="80" style="margin-top:6px" hidden></div>` : ''}
        ${fields.map((f) => `<div><label class="l">${esc(f.label)}${f.required ? ' <i>*</i>' : ''}</label><div data-h="${esc(f.id)}">${hdrWidget(f)}</div></div>`).join('')}
      </div>
      <div class="autobar" aria-label="Recorded automatically"><span>Recorded automatically:</span><span>Auditor <b>${esc(ctx.name || 'you')}${ctx.employeeId ? ' (' + esc(ctx.employeeId) + ')' : ''}</b></span><span>Date <b>${esc(new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }))}</b></span>${auto.time ? '<span>Time <b id="s_atime"></b></span>' : ''}${auto.duration ? '<span>Time taken</span>' : ''}${auto.area && ctx.area ? `<span>Area <b>${esc(ctx.area)}</b></span>` : ''}</div></div>
    <div class="legend"><span><i style="background:#fff9c4"></i>Yellow: you fill in</span><span><i style="background:#fff"></i>White: fixed</span></div>
    <div class="tw"><table class="sh"><thead><tr>${cols.map((c) => `<th>${esc(c.label)}${c.kind === 'entry' && c.required ? ' *' : ''}</th>`).join('')}${free ? '<th></th>' : ''}</tr></thead><tbody id="s_body">${bodyHtml()}</tbody></table></div>
    ${free ? '<div style="margin-top:10px"><button type="button" class="btn btn-ghost" id="s_add">Add row</button></div>' : ''}
    <div class="err2" id="s_err" hidden></div>
    <div class="bar"><span class="hint" id="s_prog"></span><span><button type="button" class="btn btn-ghost" id="s_clr">Clear form</button> <button type="button" class="btn btn-primary" id="s_sub"${preview ? ' disabled' : ''}>${preview ? 'Preview only' : 'Submit'}</button></span></div></div>`;
  const $ = (id) => host.querySelector('#' + id), body = $('s_body');
  if (form.askPlace !== false) {
    $('s_dept').onchange = () => {
      const d = $('s_dept').value, ln = $('s_line'), lo = $('s_line_o'); $('s_dept_o').hidden = d !== O;
      if (d === O) { ln.innerHTML = `<option value="${O}">Other (type below)</option>`; ln.value = O; ln.disabled = true; lo.hidden = false; return; }
      ln.disabled = false;
      const lines = d ? [...(places.get(d) || [])].sort() : [];
      ln.innerHTML = `<option value="">${d ? 'Choose' : 'Choose the department first'}</option>${lines.map((l) => `<option>${esc(l)}</option>`).join('')}${d ? `<option value="${O}">Other (type below)</option>` : ''}`; lo.hidden = true;
    };
    $('s_line').onchange = () => { $('s_line_o').hidden = $('s_line').value !== O; };
  }
  const clock = () => { const el = $('s_atime'); if (el) el.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); };
  clock(); const tk = setInterval(() => { if (!host.isConnected) clearInterval(tk); else clock(); }, 20000);
  const entryCols = cols.filter((c) => c.kind === 'entry');
  const readRow = (tr) => {
    const e = {};
    entryCols.forEach((c) => {
      const v = readWidget(tr.querySelector(`td[data-c="${c.id}"]`), c.type);
      if (v !== '') e[c.id] = v;
    });
    return e;
  };
  const rowsDom = () => [...body.querySelectorAll('tr[data-i]')];
  const prog = () => {
    const total = rowsDom().length, filled = rowsDom().filter((tr) => Object.keys(readRow(tr)).length).length;
    $('s_prog').textContent = `${filled} of ${total} rows filled`;
  };
  host.addEventListener('input', prog); host.addEventListener('change', prog); prog();
  if (free) {
    let n = body.querySelectorAll('tr').length;
    const bindRm = () => body.querySelectorAll('.rm').forEach((b) => { b.onclick = () => { if (body.querySelectorAll('tr').length > 1) { b.closest('tr').remove(); prog(); } }; });
    $('s_add').onclick = () => { body.insertAdjacentHTML('beforeend', rowHtml({}, n++)); bindRm(); prog(); body.lastElementChild.querySelector('input,select,textarea')?.focus(); };
    bindRm();
  }
  $('s_clr').onclick = () => { if (preview || confirm('Clear everything you entered?')) renderSheet(host, form, { places, ctx, preview, onSubmit }); };

  const collect = () => {
    host.querySelectorAll('.bad').forEach((x) => x.classList.remove('bad')); $('s_err').hidden = true;
    const fail = (message, el) => { el?.classList?.add('bad'); return { error: { message, el } }; };
    const now = new Date(), auditDate = todayKey();   // date and time come from the device clock, the auditor does not choose them
    let department = '', line = '', deptOther = false, lineOther = false;
    if (form.askPlace !== false) {
      deptOther = $('s_dept').value === O; lineOther = $('s_line').value === O;
      department = deptOther ? clean($('s_dept_o').value) : $('s_dept').value; line = lineOther ? clean($('s_line_o').value) : $('s_line').value;
      if (!department) return fail(deptOther ? 'Type the department.' : 'Choose the department.', $('s_dept'));
      if (!line) return fail(lineOther ? 'Type the line or area.' : 'Choose the line.', $('s_line'));
    }
    const headerValues = [];
    for (const f of fields) {
      const el = host.querySelector(`[data-h="${f.id}"]`), v = readWidget(el, f.type);
      if (f.required && !v) return fail(`Fill in “${f.label}”.`, el);
      headerValues.push({ id: f.id, label: f.label, value: v });
    }
    const out = []; let any = false, firstBad = null;
    // walk the body in order so group rows are kept
    [...body.querySelectorAll('tr')].forEach((tr) => {
      if (tr.classList.contains('grp')) { out.push({ g: 1, label: tr.textContent.trim() }); return; }
      const i = +tr.dataset.i, src = free ? null : (form.rows || []).filter((r) => !r.g)[i];
      const e = readRow(tr), touched = Object.keys(e).length > 0;
      const f = {}; if (src) cols.filter((c) => c.kind !== 'entry').forEach((c) => { f[c.id] = src.f?.[c.id] ?? ''; });
      if (free && !touched) return;                          // blank extra row
      if (touched) any = true;
      const nok = entryCols.some((c) => c.type === 'okng' && e[c.id] === NOK);
      entryCols.forEach((c) => {
        const td = tr.querySelector(`td[data-c="${c.id}"]`);
        const need = (c.required && (!free || touched)) || (c.reqOnNok && nok);
        if (need && !e[c.id]) { td.classList.add('bad'); firstBad = firstBad || { td, msg: c.reqOnNok && nok && !c.required ? `“${c.label}” is required when a point is NOT OK.` : `Fill in “${c.label}”.` }; }
      });
      out.push({ ...(src ? { id: src.id } : {}), f, e });
    });
    if (firstBad) return { error: { message: firstBad.msg, el: firstBad.td } };
    if (!any) return fail('Fill in at least one yellow cell before submitting.', body.querySelector('td.en'));
    const snap = cols.map((c) => ({ id: c.id, label: c.label, kind: c.kind, type: normType(c.type), merge: !!c.merge, options: c.options || [], ...(c.na ? { na: true } : {}) }));
    const { counts, score, ratingSum, ratingMax } = summarize(snap, out);
    const stamp = { auditedAtMs: now.getTime(), ...(auto.time ? { auditTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` } : {}), ...(auto.duration ? { durationMin: Math.max(1, Math.round((now.getTime() - startedMs) / 60000)) } : {}) };
    return { data: { ...stamp, department, deptOther, line, lineOther, auditDate, headerValues, cols: snap, rows: out, counts, score, ratingSum, ratingMax, kind: 'sheet' } };
  };
  $('s_sub').onclick = async (ev) => {
    if (preview || !onSubmit) return;
    const res = collect();
    if (res.error) { const e = $('s_err'); e.textContent = res.error.message; e.hidden = false; res.error.el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); return; }
    const btn = ev.currentTarget; btn.disabled = true;
    try { await onSubmit(res.data); } catch (e) { const el = $('s_err'); el.textContent = e.message || 'Could not save.'; el.hidden = false; btn.disabled = false; }
  };
  return { collect, host };
}

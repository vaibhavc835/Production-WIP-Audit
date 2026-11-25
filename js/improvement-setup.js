/* =====================================================================
   js/improvement-setup.js
   Admin Control > Improvement Setup. Loaded by admin.html only when the tab is opened.
   Departments, lines and idea-number codes, stations, pick-lists, and the users who get every idea.
   ===================================================================== */
import { esc, toast, friendlyError, getImprovementSetup, saveImprovementSetup, listUsers } from './wip-core.js';

const clean = (v) => String(v ?? '').replace(/[ \t]+/g, ' ').trim();
const CSS = `
.ims .card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:14px}
.ims h3{margin:0 0 4px;font-size:16px}.ims .hint{margin:0 0 10px}
.ims .rw{display:grid;grid-template-columns:1.2fr 1.2fr 90px auto;gap:8px;margin-bottom:6px;align-items:center}
.ims .rw.st{grid-template-columns:1.2fr 1.2fr 1.6fr auto}
.ims .lists{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.ims .ulist{max-height:220px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:6px 10px}
.ims .ulist label{display:flex;gap:8px;align-items:center;padding:4px 0;font-size:14px}
@media (max-width:700px){.ims .rw,.ims .rw.st{grid-template-columns:1fr 1fr}}
`;
export async function renderImprovementSetup(panel, ctx) {
  if (!document.getElementById('imsCss')) { const s = document.createElement('style'); s.id = 'imsCss'; s.textContent = CSS; document.head.appendChild(s); }
  const [setup, users] = await Promise.all([getImprovementSetup(), listUsers()]);
  const S = { lines: setup.lines.map((x) => ({ ...x })), stations: setup.stations.map((x) => ({ ...x })), notify: new Set(setup.notifyUids || []) };
  const fm = !!setup.fromMaster;
  const fromMasterNote = '<div class="card"><h3>Departments, lines, idea-number codes and stations</h3><p class="hint">These now come from <b>Master Data</b> (Admin Control &gt; Master Data): the line code is the start of the idea number, and the stations are the ones marked for Improvement. Change them there.</p></div>';
  panel.innerHTML = `<div class="ims">
    ${fm ? fromMasterNote : ''}<div class="card" ${fm ? 'hidden' : ''}><h3>Departments, lines and idea-number codes</h3><p class="hint">The code is the start of the idea number (code FB gives FB001, FB002 and so on). Two lines can share a code, then they count together.</p>
      <div id="ln"></div><button type="button" class="btn btn-ghost btn-sm" id="addL">Add line</button></div>
    <div class="card" ${fm ? 'hidden' : ''}><h3>Stations</h3><p class="hint">Users pick a station from this list for the chosen line. They can also choose Other and type a new one. To add many at once, paste one per row as <b>Department | Line | Station</b>.</p>
      <div id="sn"></div><button type="button" class="btn btn-ghost btn-sm" id="addS">Add station</button>
      <div style="margin-top:10px"><textarea id="paste" rows="3" placeholder="Fabrication | Cutting Shop | 600T Bending"></textarea><button type="button" class="btn btn-ghost btn-sm" id="doPaste" style="margin-top:6px">Add pasted stations</button></div></div>
    <div class="card"><h3>Pick-lists</h3><p class="hint">One item per row.</p><div class="lists">
      <div><label class="l" for="ls_src">Source of improvement</label><textarea id="ls_src" rows="6">${esc(setup.sources.join('\n'))}</textarea></div>
      <div><label class="l" for="ls_cat">Improvement category</label><textarea id="ls_cat" rows="6">${esc(setup.categories.join('\n'))}</textarea></div>
      <div><label class="l" for="ls_sup">Support required</label><textarea id="ls_sup" rows="6">${esc(setup.supports.join('\n'))}</textarea></div></div></div>
    <div class="card"><h3>Users who receive every idea</h3><p class="hint">Two or three users who get all ideas together with the person's Level 2 manager. They can approve ideas and do the sustainability checks. If a person has no Level 2 manager, only these users (and the admin) see the idea.</p>
      <div class="ulist" id="ul">${users.filter((u) => u.active !== false).sort((a, b) => String(a.name).localeCompare(String(b.name))).map((u) => `<label><input type="checkbox" value="${esc(u.uid)}"${S.notify.has(u.uid) ? ' checked' : ''}> ${esc(u.name)}${u.employeeId ? ' (' + esc(u.employeeId) + ')' : ''}</label>`).join('')}</div></div>
    <button type="button" class="btn btn-primary" id="sv">Save improvement setup</button></div>`;
  const $ = (id) => panel.querySelector('#' + id);
  const depts = () => [...new Set(S.lines.map((l) => l.dept).filter(Boolean))];
  const drawL = () => {
    $('ln').innerHTML = S.lines.map((l, n) => `<div class="rw"><input data-f="dept" data-n="${n}" value="${esc(l.dept)}" placeholder="Department" aria-label="Department"><input data-f="line" data-n="${n}" value="${esc(l.line)}" placeholder="Line" aria-label="Line"><input data-f="code" data-n="${n}" value="${esc(l.code)}" placeholder="Code" maxlength="4" aria-label="Code"><button type="button" class="btn btn-ghost btn-sm" data-d="${n}">Remove</button></div>`).join('');
    $('ln').querySelectorAll('input').forEach((i) => { i.oninput = () => { S.lines[+i.dataset.n][i.dataset.f] = i.value; }; });
    $('ln').querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => { S.lines.splice(+b.dataset.d, 1); drawL(); drawS(); }; });
  };
  const drawS = () => {
    $('sn').innerHTML = S.stations.map((s, n) => `<div class="rw st"><input data-f="dept" data-n="${n}" list="dl_d" value="${esc(s.dept)}" placeholder="Department" aria-label="Department"><input data-f="line" data-n="${n}" value="${esc(s.line)}" placeholder="Line" aria-label="Line"><input data-f="name" data-n="${n}" value="${esc(s.name)}" placeholder="Station" aria-label="Station"><button type="button" class="btn btn-ghost btn-sm" data-d="${n}">Remove</button></div>`).join('') + `<datalist id="dl_d">${depts().map((d) => `<option value="${esc(d)}">`).join('')}</datalist>`;
    $('sn').querySelectorAll('input').forEach((i) => { i.oninput = () => { S.stations[+i.dataset.n][i.dataset.f] = i.value; }; });
    $('sn').querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => { S.stations.splice(+b.dataset.d, 1); drawS(); }; });
  };
  drawL(); drawS();
  $('addL').onclick = () => { S.lines.push({ dept: '', line: '', code: '' }); drawL(); };
  $('addS').onclick = () => { S.stations.push({ dept: '', line: '', name: '' }); drawS(); };
  $('doPaste').onclick = () => {
    let n = 0;
    $('paste').value.split(/\r?\n/).forEach((r) => { const [d, l, s] = r.split(/[|\t]/).map(clean); if (d && l && s) { S.stations.push({ dept: d, line: l, name: s }); n++; } });
    $('paste').value = ''; drawS(); toast(n ? n + ' stations added. Remember to save.' : 'Nothing added. Use: Department | Line | Station');
  };
  const list = (id) => [...new Set($(id).value.split(/\r?\n/).map(clean).filter(Boolean))];
  $('sv').onclick = async (ev) => {
    const lines = S.lines.map((l) => ({ dept: clean(l.dept), line: clean(l.line), code: clean(l.code).replace(/\s+/g, '') })).filter((l) => l.dept || l.line || l.code);
    if (!fm && lines.some((l) => !l.dept || !l.line || !l.code)) { toast('Every line needs a department, a line name and a code.'); return; }
    if (!fm && new Set(lines.map((l) => l.dept + '|' + l.line)).size !== lines.length) { toast('The same department and line is listed twice.'); return; }
    const stations = S.stations.map((s) => ({ dept: clean(s.dept), line: clean(s.line), name: clean(s.name) })).filter((s) => s.dept && s.line && s.name);
    const notifyUids = [...panel.querySelectorAll('#ul input:checked')].map((i) => i.value);
    ev.currentTarget.disabled = true;
    try {
      await saveImprovementSetup({ ...(fm ? {} : { lines, stations }), sources: list('ls_src'), categories: list('ls_cat'), supports: list('ls_sup'), notifyUids });
      toast('Improvement setup saved.');
    } catch (e) { toast(friendlyError(e)); }
    $('sv').disabled = false;
  };
}

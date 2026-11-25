/* =====================================================================
   js/audit-import.js
   Turns Excel check sheets into audit forms.
   Rules: cells filled yellow are entered by the auditor, every other cell is fixed text.
   Images are ignored. Each worksheet becomes one form; the admin can edit it afterwards.
   ===================================================================== */
const EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
let ejP;
export const loadExcelJS = () => ejP || (ejP = new Promise((res, rej) => {
  if (window.ExcelJS) return res(window.ExcelJS);
  const s = document.createElement('script'); s.src = EXCELJS;
  s.onload = () => res(window.ExcelJS); s.onerror = () => { ejP = null; rej(new Error('Could not load the Excel reader. Check your internet connection.')); };
  document.head.appendChild(s);
}));

const clean = (v) => String(v ?? '').replace(/[ \s]+/g, ' ').trim();
const colName = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const decode = (a) => { const m = /^([A-Z]+)(\d+)$/.exec(a); let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return [+m[2], c]; };
const uid = (p, n) => `${p}${n}`;

function text(v) {
  if (v == null) return '';
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  if (typeof v === 'object') {
    if (v.richText) return clean(v.richText.map((x) => x.text).join(''));
    if (v.text != null) return clean(typeof v.text === 'object' ? text(v.text) : v.text);
    if (v.result != null) return text(v.result);
    if (v.formula) return '';
    return '';
  }
  return clean(v);
}
const isYellow = (c) => {
  const f = c?.fill; if (!f || f.type !== 'pattern' || f.pattern !== 'solid') return false;
  const a = String(f.fgColor?.argb || '').toUpperCase();
  return a === 'FFFFFF00' || a === 'FFFFFF01' || a === '00FFFF00';
};

const OKSET = new Set(['ok', 'not ok', 'notok', 'nok', 'ng', 'na', 'n/a', 'no', 'yes']);
const OKNG_HEAD = /ok\s*\/?\s*(not\s*ok|nok|ng)|symbol plate|bracket|\bpin\b|^level$|condition|latch|hook/i;

export async function parseChecksheetWorkbook(buffer) {
  const E = await loadExcelJS(), wb = new E.Workbook(); await wb.xlsx.load(buffer);
  const out = [];
  wb.worksheets.forEach((ws) => { try { const f = parseSheet(ws); if (f) out.push(f); } catch (e) { out.push({ error: `${ws.name}: ${e.message}`, sheetName: ws.name }); } });
  return out;
}

function parseSheet(ws) {
  const R = Math.min(ws.rowCount || 0, 400), C = Math.min(ws.columnCount || 0, 26);
  if (R < 2 || C < 2) return null;
  // merged ranges
  const merges = (ws.model?.merges || []).map((m) => { const [a, b] = m.split(':'), [r1, c1] = decode(a), [r2, c2] = decode(b || a); return { r1, c1, r2, c2 }; });
  const mergeAt = (r, c) => merges.find((m) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2);
  const cellInfo = (r, c) => {
    const m = mergeAt(r, c), mr = m ? m.r1 : r, mc = m ? m.c1 : c, cell = ws.getCell(mr, mc);
    return { t: text(cell.value), y: isYellow(cell), m, master: !m || (m.r1 === r && m.c1 === c), mr, mc };
  };
  const G = []; for (let r = 1; r <= R; r++) { G[r] = []; for (let c = 1; c <= C; c++) G[r][c] = cellInfo(r, c); }
  const t = (r, c) => (G[r]?.[c]?.master ? G[r][c].t : '');             // text at the master cell only
  const rowTexts = (r) => { let n = 0; for (let c = 1; c <= C; c++) if (t(r, c)) n++; return n; };
  const hasYellow = (r) => G[r].some((x, c) => c && x.y && x.master);

  // body block: the longest run of rows that contain yellow cells (gaps of one row with text are bridged)
  let best = null, cur = null;
  for (let r = 1; r <= R; r++) {
    if (hasYellow(r)) { if (!cur) cur = { a: r, b: r, n: 1 }; else { cur.b = r; cur.n++; } }
    else if (cur && r + 1 <= R && rowTexts(r) > 0 && hasYellow(r + 1)) { cur.b = r; }
    else if (cur) { if (!best || cur.n > best.n) best = cur; cur = null; }
  }
  if (cur && (!best || cur.n > best.n)) best = cur;
  if (!best || best.n < 2) return null;
  let b1 = best.a; const b2 = best.b;
  // a yellow run can start with field rows (label : value) or with a yellow heading row: skip them
  const colonish0 = (r) => { if (rowTexts(r) > 4 || /^\d+$/.test(t(r, 1).trim())) return false; for (let c = 1; c <= C; c++) { const x = t(r, c); if (x && (x.includes(':') || /[-]\s*$/.test(x))) return true; } return false; };
  const headerish = (r) => { let n = 0; for (let c = 1; c <= C; c++) if (!/^(ok|not\s*ok)$/i.test(t(r, c).trim()) && /^(sr\.?\s*no\.?|s\.?\s*no|check\s*point|remark|observation|description|ok|not\s*ok|point)/i.test(t(r, c))) n++; return n >= 2; };
  while (b1 < b2 && (headerish(b1) || colonish0(b1))) b1++;

  // header block: rows right above the body that look like column headings
  const colonish = (r) => { for (let c = 1; c <= C; c++) { const x = t(r, c); if (x && (x.includes(':') || /[-]\s*$/.test(x))) return true; } return false; };
  const insideVMerge = (r) => merges.some((m) => m.r1 < r && m.r2 > r - 0 && r >= m.r1 && r <= m.r2 && m.r1 !== m.r2 && rowTexts(m.r1) >= 3);
  let h1 = b1;
  for (let r = b1 - 1; r >= 1; r--) {
    if (colonish(r)) break;
    if (rowTexts(r) >= 3 || (rowTexts(r) === 0 && insideVMerge(r))) h1 = r; else break;
  }
  if (h1 === b1) return null;
  const h2 = b1 - 1;

  // title, form number and extra fields from the rows above the header
  let title = '', formNo = '', titleAt = '';
  const headerFields = [], seen = new Set();
  const isForm = (x) => /^(for\.?\s*no|form\s*no|doc\.?\s*no)/i.test(x) || /HCEI\//i.test(x) || (/rev\.?\s*(no)?\.?\s*[:\-]?\s*\d/i.test(x) && x.length > 6);
  for (let r = 1; r < h1 && !title; r++) for (let c = 1; c <= C; c++) {
    const x = t(r, c);
    const x0 = x.replace(/\s*date\s*[:\-]*\s*$/i, '');
    if (x && x0.length >= 8 && !x0.includes(':') && !/[-]\s*$/.test(x0) && !isForm(x)) { title = x.replace(/[※*]+/g, '').replace(/\s*date\s*[:\-]*\s*$/i, '').trim(); titleAt = r + ',' + c; break; }
  }
  for (let r = 1; r < h1; r++) for (let c = 1; c <= C; c++) {
    const x = t(r, c); if (!x || titleAt === r + ',' + c) continue;
    if (isForm(x)) { formNo = formNo || x.replace(/^for\.?\s*no\.?\s*[:\-]*\s*/i, '').trim(); continue; }
    let label = '', def = '';
    const m = /^(.{2,40}?)\s*(?::-?|\s-)\s*(.*)$/.exec(x) || /^(.{2,40}?)\s*[:\-]+\s*$/.exec(x);
    if (m && x.length <= 60) { label = clean(m[1]).replace(/[:\-\s]+$/, ''); def = clean(m[2] || ''); }
    else if (x.length <= 20 && /^(dept|department|shift|line|area|trolley|crane|machine|location|zone)/i.test(x)) label = x.replace(/[:\-\s]+$/, '');
    if (!label || /^(auditor|audit(ed)? by|checked by|audit date|date|area incharge|colour code|rev)/i.test(label) || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    const f = { id: uid('h', headerFields.length + 1), label: label.replace(/\s*\/\s*/g, ' / '), type: /date/i.test(label) ? 'date' : 'text' };
    if (/^line$/i.test(label) && def) f.default = def;
    headerFields.push(f);
  }
  if (!title) title = clean(ws.name);

  // columns
  const cols = [];
  for (let c = 1; c <= C; c++) {
    const parts = [];
    for (let r = h1; r <= h2; r++) { const x = G[r][c]; const v = x.t; if (v && parts[parts.length - 1] !== v) parts.push(v); }
    if (!parts.length) continue;
    cols.push({ c, parts, label: parts.join(' – ') });
  }
  // a heading merged over two columns (for example Remark over E:F) is one column
  for (let i = cols.length - 1; i > 0; i--) {
    const a = cols[i - 1], b = cols[i], m = G[h2][b.c].m;
    if (m && m.c1 === a.c && m.c2 >= b.c && a.label === b.label) cols.splice(i, 1);
  }
  if (cols.length < 2) return null;
  // rows
  const rows = [];
  for (let r = b1; r <= b2; r++) {
    const ents = G[r].map((x, c) => (c && x.y ? c : 0)).filter(Boolean);
    const wide = merges.find((m) => m.r1 === r && m.c2 - m.c1 >= 2 && t(r, m.c1));
    if (wide || (!ents.length && rowTexts(r) > 0)) {
      const lab = wide ? t(r, wide.c1) : cols.map((k) => t(r, k.c)).filter(Boolean).join(' ');
      if (lab) { rows.push({ r, g: 1, label: lab }); continue; }
    }
    rows.push({ r });
  }
  const normal = rows.filter((x) => !x.g);
  const colEntry = (k) => normal.some((x) => G[x.r][k.c].y);
  const vals = (k) => normal.map((x) => ({ r: x.r, t: G[x.r][k.c].t, y: G[x.r][k.c].y }));
  cols.forEach((k) => { k.entry = colEntry(k); });

  // merge a group of consecutive entry columns that share a parent heading and have numeric sub-headings (rating 1..n)
  for (let i = 0; i < cols.length - 2; i++) {
    const g = [cols[i]]; let j = i + 1;
    while (j < cols.length && cols[j].entry && cols[i].entry && cols[j].c === cols[j - 1].c + 1 && cols[j].parts.length > 1 && /^\d+$/.test(cols[j].parts[cols[j].parts.length - 1]) && cols[j].parts[0] === cols[i].parts[0]) g.push(cols[j++]);
    if (g.length >= 3 && g.every((x) => /^\d+$/.test(x.parts[x.parts.length - 1]))) {
      const first = g[0]; first.rating = g.map((x) => Number(x.parts[x.parts.length - 1])); first.rcols = g.map((x) => x.c); first.label = first.parts[0];
      cols.splice(i + 1, g.length - 1);
    }
  }
  // OK and NOT OK as two columns -> one OK / NOT OK column
  for (let i = 0; i < cols.length - 1; i++) {
    if (cols[i].entry && cols[i + 1].entry && /^ok$/i.test(cols[i].label) && /^(not\s*ok|nok|ng)$/i.test(cols[i + 1].label)) { cols[i].label = 'OK / NOT OK'; cols[i].pair = cols[i + 1].c; cols.splice(i + 1, 1); }
  }

  const srRe = /^(sr\.?\s*no\.?|s\.?\s*no\.?|sr|no\.?|sl\.?\s*no\.?)$/i;
  const outCols = [], keep = [];
  cols.forEach((k) => {
    const fixedVals = vals(k).map((v) => v.t).filter(Boolean);
    if (!k.entry && !fixedVals.length) return;                           // empty fixed column
    const o = { id: uid('c', outCols.length + 1), label: k.label.replace(/\s*\n\s*/g, ' '), kind: k.entry ? 'entry' : 'fixed', type: 'text', _c: k.c };
    if (k.entry) {
      const sample = vals(k).filter((v) => v.y && v.t).map((v) => v.t.toLowerCase());
      const head = k.label;
      if (k.rating) { o.type = 'choice'; o.options = k.rating.map(String); o.required = true; }
      else if (k.pair) { o.type = 'okng'; o.required = true; }
      else if (/date/i.test(head)) { o.type = 'date'; }
      else if (sample.length && sample.every((s) => OKSET.has(s)) && sample.some((s) => /ok|ng/.test(s))) { o.type = 'okng'; o.required = true; if (sample.some((s) => s === 'na' || s === 'n/a')) o.na = true; }
      else if (!sample.length && OKNG_HEAD.test(head) && !/remark|observation/i.test(head)) { o.type = 'okng'; o.required = true; }
      else o.type = 'text';
    } else if (srRe.test(k.label)) o.srCol = true;
    outCols.push(o); keep.push(k);
  });
  if (!outCols.some((c) => c.kind === 'entry')) return null;
  const hasOk = outCols.some((c) => c.type === 'okng');
  outCols.forEach((o) => { if (o.kind === 'entry' && o.type === 'text' && hasOk && /remark|observation|action|rework/i.test(o.label)) o.reqOnNok = true; });

  // free rows (auditor adds rows) when nothing is fixed apart from the serial number
  const fixedNonSr = outCols.filter((c) => c.kind === 'fixed' && !c.srCol);
  let rowMode = 'fixed', startRows = 5;
  if (!fixedNonSr.length) { rowMode = 'free'; startRows = Math.min(Math.max(normal.length, 3), 10); }

  const resRows = [];
  rows.forEach((x, idx) => {
    if (x.g) { resRows.push({ id: uid('r', resRows.length + 1), g: 1, label: x.label }); return; }
    if (rowMode === 'free') return;
    const f = {}, e = {};
    outCols.forEach((o, i) => {
      const cell = G[x.r][keep[i].c];
      if (o.kind === 'fixed') f[o.id] = cell.t;
      else if (o.type === 'date' && cell.t) { const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(cell.t); if (m) e[o.id] = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; else if (/^\d{4}-\d{2}-\d{2}$/.test(cell.t)) e[o.id] = cell.t; }
    });
    if (!fixedNonSr.some((o) => f[o.id])) return;                        // numbering only: not a check point
    resRows.push({ id: uid('r', resRows.length + 1), f, e });
  });
  // drop group headings that have no rows after them
  const rowsClean = resRows.filter((r, i) => !r.g || (resRows[i + 1] && !resRows[i + 1].g));
  if (rowMode === 'fixed' && !rowsClean.some((r) => !r.g)) return null;

  // vertical merges in a fixed column -> "merge repeated" and copy the value into the covered rows
  outCols.forEach((o, i) => {
    if (o.kind !== 'fixed') return;
    const c = keep[i].c;
    if (merges.some((m) => m.c1 <= c && m.c2 >= c && m.r1 >= b1 && m.r2 <= b2 && m.r2 > m.r1 && m.c1 === m.c2)) o.merge = true;
  });
  // free mode has no Sr. no. column
  const finalCols = outCols.filter((o) => !(rowMode === 'free' && o.srCol)).map(({ _c, srCol, ...o }) => o);
  // header fields that duplicate the department / line question
  const placeInFields = headerFields.some((f) => /^(line|department|dept\.?|area|inspection line)\b/i.test(f.label) && !/trolley/i.test(f.label));
  return {
    kind: 'sheet', title, formNo, description: '', askPlace: !placeInFields, headerFields, columns: finalCols, rowMode, startRows, rows: rowMode === 'free' ? [] : rowsClean, points: [], active: true,
    sheetName: ws.name
  };
}

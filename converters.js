/*! Data Swiss-Army Converter — core converters (MIT). Zero dependencies.
 * Works in the browser (window.DSA) and Node (module.exports). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DSA = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- helpers ----------
  function normalizeRows(data) {
    if (data == null) return [];
    if (!Array.isArray(data)) data = [data];
    return data.map((r) => (r !== null && typeof r === 'object' && !Array.isArray(r) ? r : { value: r }));
  }
  function collectHeaders(rows) {
    const seen = new Set();
    const headers = [];
    for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); headers.push(k); }
    return headers;
  }
  function cellToString(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  function inferValue(s) {
    if (s === '') return '';
    const t = s.trim();
    if (t === 'null' || t === 'NULL') return null;
    if (t === 'true' || t === 'TRUE') return true;
    if (t === 'false' || t === 'FALSE') return false;
    if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(t) && t.length < 16) return Number(t);
    return s;
  }

  // ---------- CSV ----------
  function detectDelimiter(text) {
    const first = text.split(/\r?\n/, 1)[0] || '';
    const cands = [',', '\t', ';', '|'];
    let best = ',', bestN = 0;
    for (const d of cands) { const n = first.split(d).length - 1; if (n > bestN) { best = d; bestN = n; } }
    return best;
  }
  function parseCSV(text, opts = {}) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const delim = opts.delimiter || detectDelimiter(text);
    const infer = opts.inferTypes !== false;
    const rows = [];
    let row = [], field = '', i = 0, inQ = false, quoted = false;
    while (i < text.length) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
        field += c; i++; continue;
      }
      if (c === '"' && field === '') { inQ = true; quoted = true; i++; continue; }
      if (c === delim) { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (inQ) throw new Error('CSV: unterminated quoted field');
    if (field !== '' || row.length || quoted) { row.push(field); rows.push(row); }
    const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0] === ''));
    if (!nonEmpty.length) return [];
    const headers = nonEmpty[0].map((h, idx) => h.trim() || `col${idx + 1}`);
    return nonEmpty.slice(1).map((r) => {
      const o = {};
      headers.forEach((h, idx) => { const v = r[idx] === undefined ? '' : r[idx]; o[h] = infer ? inferValue(v) : v; });
      return o;
    });
  }
  function toCSV(data, opts = {}) {
    const delim = opts.delimiter || ',';
    const rows = normalizeRows(data);
    const headers = collectHeaders(rows);
    const esc = (s) => (/["\r\n]/.test(s) || s.includes(delim) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
    const out = [headers.map(esc).join(delim)];
    for (const r of rows) out.push(headers.map((h) => esc(cellToString(r[h]))).join(delim));
    return out.join('\n');
  }

  // ---------- Markdown table ----------
  function toMarkdown(data) {
    const rows = normalizeRows(data);
    const headers = collectHeaders(rows);
    if (!headers.length) return '';
    const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
    const lines = [
      '| ' + headers.map(esc).join(' | ') + ' |',
      '| ' + headers.map(() => '---').join(' | ') + ' |',
    ];
    for (const r of rows) lines.push('| ' + headers.map((h) => esc(cellToString(r[h]))).join(' | ') + ' |');
    return lines.join('\n');
  }
  function splitMdRow(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    const cells = [];
    let cur = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\' && i + 1 < s.length) { cur += s[i + 1]; i++; continue; }
      if (c === '|') { cells.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    cells.push(cur.trim());
    return cells.map((c) => c.replace(/<br\s*\/?>/gi, '\n'));
  }
  const MD_SEP = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;
  function parseMarkdown(text, opts = {}) {
    const infer = opts.inferTypes !== false;
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.includes('|'));
    if (lines.length < 2) throw new Error('Markdown: need a header row and a --- separator row');
    const sepIdx = lines.findIndex((l) => MD_SEP.test(l));
    if (sepIdx < 1) throw new Error('Markdown: separator row (| --- |) not found');
    const headers = splitMdRow(lines[sepIdx - 1]);
    return lines.slice(sepIdx + 1).map((l) => {
      const cells = splitMdRow(l);
      const o = {};
      headers.forEach((h, i) => { const v = cells[i] === undefined ? '' : cells[i]; o[h] = infer ? inferValue(v) : v; });
      return o;
    });
  }

  // ---------- SQL ----------
  function quoteIdent(name, dialect) {
    const n = String(name);
    if (dialect === 'mysql') return '`' + n.replace(/`/g, '``') + '`';
    if (dialect === 'mssql') return '[' + n.replace(/]/g, ']]') + ']';
    return '"' + n.replace(/"/g, '""') + '"';
  }
  function sqlLiteral(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'object') v = JSON.stringify(v);
    return "'" + String(v).replace(/'/g, "''") + "'";
  }
  function toSQL(data, opts = {}) {
    const table = opts.table || 'my_table';
    const dialect = opts.dialect || 'postgres';
    const batch = opts.batch !== false;
    const rows = normalizeRows(data);
    const headers = collectHeaders(rows);
    if (!rows.length) return '';
    const cols = headers.map((h) => quoteIdent(h, dialect)).join(', ');
    const tbl = quoteIdent(table, dialect);
    const vals = rows.map((r) => '(' + headers.map((h) => sqlLiteral(r[h] === undefined ? null : r[h])).join(', ') + ')');
    if (batch) return `INSERT INTO ${tbl} (${cols}) VALUES\n  ${vals.join(',\n  ')};`;
    return vals.map((v) => `INSERT INTO ${tbl} (${cols}) VALUES ${v};`).join('\n');
  }
  function parseSQL(text) {
    const rows = [];
    const re = /INSERT\s+INTO\s+(?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w.]+)\s*\(([^)]*)\)\s*VALUES\s*/gi;
    const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
    let m, i = 0;
    while ((m = re.exec(text))) {
      const cols = m[1].split(',').map((c) => c.trim().replace(/^[`"[]|[`"\]]$/g, ''));
      i = re.lastIndex;
      for (;;) {
        ws();
        if (text[i] !== '(') break;
        i++;
        const vals = [];
        for (;;) {
          ws();
          let v;
          if (text[i] === "'") {
            let s = '';
            i++;
            for (;;) {
              if (i >= text.length) throw new Error('SQL: unterminated string');
              if (text[i] === "'") { if (text[i + 1] === "'") { s += "'"; i += 2; continue; } i++; break; }
              if (text[i] === '\\' && text[i + 1] === "'") { s += "'"; i += 2; continue; }
              s += text[i++];
            }
            v = s;
          } else {
            let s = '';
            while (i < text.length && text[i] !== ',' && text[i] !== ')') s += text[i++];
            s = s.trim();
            if (/^null$/i.test(s)) v = null;
            else if (/^true$/i.test(s)) v = true;
            else if (/^false$/i.test(s)) v = false;
            else if (s !== '' && !isNaN(Number(s))) v = Number(s);
            else v = s;
          }
          vals.push(v);
          ws();
          if (text[i] === ',') { i++; continue; }
          if (text[i] === ')') { i++; break; }
          throw new Error('SQL: unexpected character at position ' + i);
        }
        const o = {};
        cols.forEach((c, idx) => { o[c] = vals[idx] === undefined ? null : vals[idx]; });
        rows.push(o);
        ws();
        if (text[i] === ',') { i++; continue; }
        break;
      }
      re.lastIndex = i;
    }
    if (!rows.length) throw new Error('SQL: no INSERT INTO ... VALUES statements found');
    return rows;
  }

  // ---------- JSON ----------
  function parseJSON(text) {
    return normalizeRows(JSON.parse(text));
  }
  function toJSON(data, opts = {}) {
    return JSON.stringify(normalizeRows(data), null, opts.indent === undefined ? 2 : opts.indent);
  }

  const parsers = { json: parseJSON, csv: parseCSV, markdown: parseMarkdown, sql: parseSQL };
  const writers = { json: toJSON, csv: toCSV, markdown: toMarkdown, sql: toSQL };

  function detectFormat(text) {
    const t = text.trim();
    if (!t) return null;
    if (t[0] === '[' || t[0] === '{') return 'json';
    if (/^INSERT\s+INTO/i.test(t)) return 'sql';
    const ls = t.split(/\r?\n/);
    if (ls.length > 1 && ls[0].trim().startsWith('|') && MD_SEP.test(ls[1].trim())) return 'markdown';
    return 'csv';
  }
  function convert(text, from, to, opts = {}) {
    if (from === 'auto') from = detectFormat(text);
    if (!parsers[from]) throw new Error('Unknown input format: ' + from);
    if (!writers[to]) throw new Error('Unknown output format: ' + to);
    return writers[to](parsers[from](text, opts), opts);
  }

  return { parseCSV, toCSV, parseMarkdown, toMarkdown, parseSQL, toSQL, parseJSON, toJSON, detectFormat, convert, version: '1.0.0' };
});

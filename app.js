/* Data Swiss-Army — UI glue. Depends only on converters.js (window.DSA). */
(function () {
  'use strict';
  // Set this to the Gumroad product URL once the listing is live.
  const STORE_URL = '';

  const $ = (id) => document.getElementById(id);
  const els = {
    from: $('from'), to: $('to'), table: $('table'), dialect: $('dialect'), batch: $('batch'), delim: $('delim'),
    input: $('input'), output: $('output'), error: $('error'), stats: $('stats'), detected: $('detected'),
    preview: $('preview'), copy: $('copy'), download: $('download'), sample: $('sample'), clear: $('clear'),
    file: $('file'), swap: $('swap'),
  };
  const EXT = { json: 'json', csv: 'csv', markdown: 'md', sql: 'sql' };
  const MIME = { json: 'application/json', csv: 'text/csv', markdown: 'text/markdown', sql: 'application/sql' };
  const SAMPLE = 'id,name,email,plan,mrr,active\n1,Ada Lovelace,ada@example.com,Pro,49,true\n2,"O\'Brien, Pat",pat@example.com,Starter,9,true\n3,Grace Hopper,grace@example.com,Team,199,false';

  if (STORE_URL) { $('pro-cta').href = STORE_URL; $('pro-link').href = STORE_URL; }

  function storeGet(k, d) { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } }
  function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } }

  function opts() {
    return {
      table: els.table.value.trim() || 'my_table',
      dialect: els.dialect.value,
      batch: els.batch.checked,
      delimiter: els.to.value === 'csv' ? els.delim.value : undefined,
    };
  }

  function toggleOptions() {
    document.querySelectorAll('.sql-opt').forEach((n) => { n.hidden = els.to.value !== 'sql'; });
    document.querySelectorAll('.csv-opt').forEach((n) => { n.hidden = els.to.value !== 'csv'; });
  }

  function renderPreview(rows) {
    els.preview.textContent = '';
    if (!rows || !rows.length) return;
    const headers = [];
    const seen = new Set();
    rows.forEach((r) => Object.keys(r).forEach((k) => { if (!seen.has(k)) { seen.add(k); headers.push(k); } }));
    const t = document.createElement('table');
    const thead = t.createTHead().insertRow();
    headers.forEach((h) => { const th = document.createElement('th'); th.textContent = h; thead.appendChild(th); });
    const tb = t.createTBody();
    rows.slice(0, 50).forEach((r) => {
      const tr = tb.insertRow();
      headers.forEach((h) => {
        const v = r[h];
        tr.insertCell().textContent = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      });
    });
    els.preview.appendChild(t);
  }

  let timer;
  function run() {
    const text = els.input.value;
    storeSet('dsa:from', els.from.value);
    storeSet('dsa:to', els.to.value);
    toggleOptions();
    els.error.hidden = true;
    if (!text.trim()) { els.output.value = ''; els.stats.textContent = ''; els.detected.textContent = ''; renderPreview([]); return; }
    try {
      const from = els.from.value === 'auto' ? DSA.detectFormat(text) : els.from.value;
      els.detected.textContent = els.from.value === 'auto' ? '(detected: ' + from + ')' : '';
      const parse = { json: DSA.parseJSON, csv: DSA.parseCSV, markdown: DSA.parseMarkdown, sql: DSA.parseSQL }[from];
      const rows = parse(text, {});
      const write = { json: DSA.toJSON, csv: DSA.toCSV, markdown: DSA.toMarkdown, sql: DSA.toSQL }[els.to.value];
      els.output.value = write(rows, opts());
      els.stats.textContent = rows.length + ' row' + (rows.length === 1 ? '' : 's');
      renderPreview(rows);
    } catch (e) {
      els.output.value = '';
      els.stats.textContent = '';
      renderPreview([]);
      els.error.textContent = e.message;
      els.error.hidden = false;
    }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 120); };

  ['from', 'to', 'table', 'dialect', 'batch', 'delim'].forEach((k) => els[k].addEventListener('change', run));
  els.table.addEventListener('input', schedule);
  els.input.addEventListener('input', schedule);

  els.copy.addEventListener('click', async () => {
    if (!els.output.value) return;
    try { await navigator.clipboard.writeText(els.output.value); }
    catch (_) { els.output.select(); document.execCommand('copy'); }
    flash(els.copy, 'Copied ✓');
  });
  els.download.addEventListener('click', () => {
    if (!els.output.value) return;
    const blob = new Blob([els.output.value], { type: MIME[els.to.value] + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'converted.' + EXT[els.to.value];
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  els.sample.addEventListener('click', () => { els.input.value = SAMPLE; els.from.value = 'auto'; run(); });
  els.clear.addEventListener('click', () => { els.input.value = ''; run(); els.input.focus(); });
  els.swap.addEventListener('click', () => {
    if (!els.output.value) return;
    const newFrom = els.to.value;
    els.input.value = els.output.value;
    els.to.value = els.from.value === 'auto' ? (DSA.detectFormat(els.input.value) === 'json' ? 'csv' : 'json') : els.from.value;
    els.from.value = newFrom;
    if (els.to.value === els.from.value) els.to.value = newFrom === 'json' ? 'csv' : 'json';
    run();
  });

  function loadFile(f) {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { els.input.value = String(r.result); els.from.value = 'auto'; run(); };
    r.readAsText(f);
  }
  els.file.addEventListener('change', (e) => loadFile(e.target.files[0]));
  els.input.addEventListener('dragover', (e) => { e.preventDefault(); els.input.classList.add('drag'); });
  els.input.addEventListener('dragleave', () => els.input.classList.remove('drag'));
  els.input.addEventListener('drop', (e) => { e.preventDefault(); els.input.classList.remove('drag'); loadFile(e.dataTransfer.files[0]); });

  function flash(btn, txt) { const o = btn.textContent; btn.textContent = txt; setTimeout(() => { btn.textContent = o; }, 1200); }

  // Restore last choices; support ?from=csv&to=sql deep links for SEO landing pages.
  const q = new URLSearchParams(location.search);
  els.from.value = q.get('from') || storeGet('dsa:from', 'auto');
  els.to.value = q.get('to') || storeGet('dsa:to', 'json');
  if (!els.from.value) els.from.value = 'auto';
  if (!els.to.value) els.to.value = 'json';
  els.input.value = SAMPLE;
  run();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();

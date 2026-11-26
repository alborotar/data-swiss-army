'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../converters.js');

const rows = [
  { id: 1, name: 'Ada, "Countess"', active: true, note: null },
  { id: 2, name: "O'Brien", active: false, note: 'line1\nline2' },
  { id: 3, name: 'Pipe | Char', active: true, note: 'x' },
];

test('JSON <-> CSV round-trip (quotes, commas, newlines, types)', () => {
  const csv = D.convert(JSON.stringify(rows), 'json', 'csv');
  assert.match(csv, /^id,name,active,note\n/);
  assert.ok(csv.includes('"Ada, ""Countess"""'));
  const back = JSON.parse(D.convert(csv, 'csv', 'json'));
  assert.equal(back[0].name, 'Ada, "Countess"');
  assert.equal(back[1].note, 'line1\nline2');
  assert.equal(back[0].id, 1);
  assert.equal(back[1].active, false);
});

test('CSV delimiter auto-detect (semicolon, tab) + BOM', () => {
  assert.deepEqual(D.parseCSV('﻿a;b\n1;x\n'), [{ a: 1, b: 'x' }]);
  assert.deepEqual(D.parseCSV('a\tb\n2\ty'), [{ a: 2, b: 'y' }]);
});

test('JSON <-> Markdown table round-trip (escaped pipes, <br>)', () => {
  const md = D.convert(JSON.stringify(rows), 'json', 'markdown');
  assert.ok(md.startsWith('| id | name | active | note |\n| --- | --- | --- | --- |'));
  assert.ok(md.includes('Pipe \\| Char'));
  const back = D.parseMarkdown(md);
  assert.equal(back[2].name, 'Pipe | Char');
  assert.equal(back[1].note, 'line1\nline2');
  assert.equal(back.length, 3);
});

test('JSON <-> SQL INSERT round-trip (batch + single, dialects)', () => {
  const sql = D.toSQL(rows, { table: 'users' });
  assert.ok(sql.startsWith('INSERT INTO "users" ("id", "name", "active", "note") VALUES'));
  assert.ok(sql.includes("'O''Brien'"));
  assert.ok(sql.includes('NULL'));
  assert.deepEqual(D.parseSQL(sql), rows);
  const single = D.toSQL(rows, { table: 't', dialect: 'mysql', batch: false });
  assert.equal(single.split('\n').filter((l) => l.startsWith('INSERT')).length, 3);
  assert.ok(single.includes('`t`'));
  assert.deepEqual(D.parseSQL(single), rows);
  assert.ok(D.toSQL([{ a: 1 }], { dialect: 'mssql', table: 'x' }).includes('[x]'));
});

test('CSV -> SQL -> Markdown chained conversion', () => {
  const sql = D.convert('sku,price\nA-1,9.5\nB-2,19', 'csv', 'sql', { table: 'products' });
  const md = D.convert(sql, 'sql', 'markdown');
  assert.equal(md, '| sku | price |\n| --- | --- |\n| A-1 | 9.5 |\n| B-2 | 19 |');
});

test('auto-detect input format', () => {
  assert.equal(D.detectFormat('[{"a":1}]'), 'json');
  assert.equal(D.detectFormat('INSERT INTO t (a) VALUES (1);'), 'sql');
  assert.equal(D.detectFormat('| a |\n| --- |\n| 1 |'), 'markdown');
  assert.equal(D.detectFormat('a,b\n1,2'), 'csv');
  assert.equal(D.convert('| a |\n| --- |\n| 1 |', 'auto', 'json', { indent: 0 }), '[{"a":1}]');
});

test('heterogeneous objects + nested values', () => {
  assert.equal(D.toCSV([{ a: 1 }, { b: { x: 1 } }]), 'a,b\n1,\n,"{""x"":1}"');
});

test('errors are explicit', () => {
  assert.throws(() => D.parseCSV('a,b\n"oops'), /unterminated/);
  assert.throws(() => D.parseMarkdown('just text'), /Markdown/);
  assert.throws(() => D.parseSQL('SELECT 1'), /no INSERT/);
});

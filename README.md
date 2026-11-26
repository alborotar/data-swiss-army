# Data Swiss-Army Converter

**CSV ⇄ JSON ⇄ SQL INSERT ⇄ Markdown table — instantly, privately, in your browser.**

▶ **Live tool:** https://alborotar.github.io/data-swiss-army/

- 100% client-side: your data never leaves the tab (works offline as an installable PWA)
- Zero dependencies: one `converters.js` (~8 KB) usable in the browser *and* Node
- RFC 4180 CSV (quoted commas, newlines, `""` escapes, BOM, comma/tab/semicolon/pipe auto-detect)
- SQL INSERT output for PostgreSQL/SQLite, MySQL and SQL Server — batch or one row per statement, safe `''` quoting
- GitHub-flavored Markdown tables with escaped `|` and multi-line cells
- Round-trips: SQL INSERT dumps and Markdown tables parse back into JSON/CSV
- Auto-detects the input format, live table preview, copy, download, drag-and-drop files
- Deep links: `?from=csv&to=sql`, `?from=json&to=markdown`, …

## Use as a library

```js
const DSA = require('./converters.js'); // or <script src="converters.js"> → window.DSA

DSA.convert('id,name\n1,Ada', 'csv', 'json');
DSA.convert(jsonText, 'json', 'sql', { table: 'users', dialect: 'mysql', batch: false });
DSA.convert(markdownTable, 'auto', 'csv');

DSA.parseCSV(text)  DSA.toCSV(rows, { delimiter: ';' })
DSA.parseMarkdown(text)  DSA.toMarkdown(rows)
DSA.parseSQL(text)  DSA.toSQL(rows, { table, dialect: 'postgres'|'mysql'|'mssql', batch })
DSA.parseJSON(text)  DSA.toJSON(rows, { indent: 2 })
DSA.detectFormat(text) // 'json' | 'csv' | 'markdown' | 'sql'
```

## Run locally

Open `index.html` directly, or serve the folder:

```sh
npx serve .     # or: python -m http.server
npm test        # node --test — 8 tests covering all 4 converters
```

## Support the project

The web tool is free forever. If it saves you time, the **$9 Pro pack** (packaged offline build, library docs, lifetime updates) supports development — see the "Get Pro" link on the live site.

## License

MIT — see [LICENSE](LICENSE).

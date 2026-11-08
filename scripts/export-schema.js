'use strict';
/**
 * Schema + table-count export (2.0 M0 backup discipline).
 *
 * Dumps the full database schema (tables, indexes, triggers) and a row
 * count per table into backups/schema-<timestamp>.json. It deliberately
 * exports NO row data: schemas and counts are safe to keep in the repo's
 * ops notes, user data is not.
 *
 * Usage:
 *   node scripts/export-schema.js            (local DB or TURSO_* env)
 *   node scripts/export-schema.js --out path (custom output file)
 *
 * Restore story (see DEVELOPMENT.md):
 *   - Local file DB: copy the .db file before any risky change.
 *   - Turso production: rely on Turso point-in-time restore, and run
 *     this export before every production migration so the expected
 *     schema is on record and can be diffed afterwards.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

require('dotenv').config();

const outIdx = process.argv.indexOf('--out');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outPath = outIdx > -1 && process.argv[outIdx + 1]
  ? process.argv[outIdx + 1]
  : path.join(__dirname, '..', 'backups', `schema-${stamp}.json`);

const client = process.env.TURSO_DATABASE_URL
  ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN || undefined })
  : createClient({ url: 'file:' + (process.env.DB_PATH || path.join(__dirname, '..', 'data', 'piecework.db')) });

(async () => {
  const schemaRes = await client.execute(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name"
  );
  const tables = schemaRes.rows.filter((r) => r.type === 'table').map((r) => r.name);
  const counts = {};
  for (const t of tables) {
    const c = await client.execute(`SELECT COUNT(*) AS c FROM "${t}"`);
    counts[t] = Number(c.rows[0].c);
  }
  const payload = {
    exported_at: new Date().toISOString(),
    source: process.env.TURSO_DATABASE_URL ? 'turso' : 'local-file',
    table_counts: counts,
    schema: schemaRes.rows.map((r) => ({ type: r.type, name: r.name, sql: r.sql })),
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Schema export written: ${outPath}`);
  console.log(`Tables: ${tables.length} (${tables.join(', ')})`);
})().catch((e) => { console.error('Export failed:', e.message); process.exit(1); });

'use strict';
/**
 * DANGER: deletes ALL data (users, jobs, applications, reviews).
 * Usage: npm run wipe
 * - Local file DB: deletes the SQLite files (schema is recreated on next start/seed).
 * - Turso cloud DB: deletes all rows from every table instead.
 */
const readline = require('readline');
const path = require('path');
const fs = require('fs');

const usingTurso = !!process.env.TURSO_DATABASE_URL;
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'piecework.db');
const target = usingTurso
  ? `the Turso database (${process.env.TURSO_DATABASE_URL})`
  : dbPath;

if (process.argv.includes('--yes')) {
  main();
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`This will DELETE ALL DATA in ${target}. Type "wipe" to confirm: `, (answer) => {
    rl.close();
    if (answer.trim().toLowerCase() === 'wipe') main();
    else console.log('Aborted — nothing was deleted.');
  });
}

async function main() {
  try {
    await wipe();
  } catch (e) {
    console.error('Wipe failed:', e && e.message ? e.message : e);
    process.exit(1);
  }
}

async function wipe() {
  if (usingTurso) {
    const { client, init } = require('../db');
    await init();
    // Delete child tables first (cascades would handle it, but be explicit).
    for (const table of ['reviews', 'applications', 'jobs', 'users']) {
      await client.execute(`DELETE FROM ${table}`);
    }
    console.log('All data wiped from the Turso database. Run "npm run seed" to reseed demo data.');
    return;
  }
  for (const suffix of ['', '-wal', '-shm']) {
    const f = dbPath + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  console.log('All data wiped. Run "npm run seed" to reseed demo data.');
}

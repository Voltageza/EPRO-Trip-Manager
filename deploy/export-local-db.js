#!/usr/bin/env node
/**
 * Produce ONE consistent file from the local trips database, ready to copy to
 * the server.
 *
 * This matters: a large share of the data lives in trips.db-wal, not trips.db.
 * Copying trips.db on its own would ship a stale database. This checkpoints the
 * WAL and writes a compacted snapshot.
 *
 * Stop the local server first, then from the repo root:
 *     node deploy/export-local-db.js
 *
 * Output: deploy/trips-seed.db
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const src = process.argv[2] || path.join(__dirname, '..', 'trips.db');
const out = process.argv[3] || path.join(__dirname, 'trips-seed.db');

if (!fs.existsSync(src)) {
  console.error(`No database at ${src}`);
  process.exit(1);
}
if (fs.existsSync(out)) fs.unlinkSync(out);

const db = new Database(src);
db.pragma('wal_checkpoint(TRUNCATE)');
db.prepare('VACUUM INTO ?').run(out);

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all();
console.log('\nRows exported:');
for (const { name } of tables) {
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get();
  if (n > 0) console.log(`  ${String(n).padStart(6)}  ${name}`);
}
db.close();

console.log(`\nWrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
console.log('\nCopy it to the container:');
console.log('  scp deploy/trips-seed.db root@<proxmox>:/tmp/trips-seed.db');
console.log('\nThen on the container:');
console.log('  systemctl stop epro-trips');
console.log('  install -o eprotrips -g eprotrips -m 644 /tmp/trips-seed.db /var/lib/epro-trips/trips.db');
console.log('  rm -f /var/lib/epro-trips/trips.db-wal /var/lib/epro-trips/trips.db-shm');
console.log('  systemctl start epro-trips');

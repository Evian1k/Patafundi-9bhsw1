#!/usr/bin/env node
/**
 * Database integrity audit.
 * Verifies every column referenced in backend/src code actually exists in the DB
 * after all migrations have been applied.
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = '/home/z/my-project/Patafundi-9bhsw1';
const SRC_DIR = path.join(BASE, 'backend/src');

// Collect every "insert into <table> (col1, col2, ...)" and
// "update <table> set col1 = ..." from the backend source.
function extractColumnsFromSql(sql) {
  const refs = [];
  // Match: insert into <table> (col1, col2, ...) / update <table> set col1=, col2=
  const insertRe = /insert\s+into\s+([a-z_]+)\s*\(([^)]+)\)/gi;
  const updateRe = /update\s+([a-z_]+)\s+set\s+([a-z_,\s=]+?)(?:\s+where|\s+returning|$)/gi;
  let m;
  while ((m = insertRe.exec(sql))) {
    const table = m[1];
    const cols = m[2].split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
    refs.push({ table, cols, op: 'insert' });
  }
  while ((m = updateRe.exec(sql))) {
    const table = m[1];
    const cols = m[2].split(',').map(s => s.trim().split('=')[0].trim()).filter(Boolean);
    refs.push({ table, cols, op: 'update' });
  }
  return refs;
}

// Walk all .js files under backend/src and extract SQL.
function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else if (ent.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = walk(SRC_DIR);
const allRefs = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const refs = extractColumnsFromSql(src);
  for (const r of refs) allRefs.push({ ...r, file: path.relative(BASE, f) });
}

// Group by table to deduplicate.
const byTable = new Map();
for (const r of allRefs) {
  if (!byTable.has(r.table)) byTable.set(r.table, new Set());
  for (const c of r.cols) byTable.get(r.table).add(c);
}

console.log(`Found ${allRefs.length} insert/update statements across ${files.length} files.`);
console.log(`Tables referenced: ${byTable.size}\n`);

// Now query the DB for actual columns.
const { getEmbeddedDb } = await import(path.join(BASE, 'backend/src/pglite-instance.js'));
const db = await getEmbeddedDb();

let missing = 0;
let ok = 0;
for (const [table, cols] of byTable) {
  let r;
  try {
    r = await db.query(`select column_name from information_schema.columns where table_name = $1`, [table]);
  } catch (e) {
    console.log(`  MISSING TABLE: ${table} — ${e.message}`);
    missing += cols.size;
    continue;
  }
  if (!r.rows.length) {
    console.log(`  MISSING TABLE: ${table} (not in information_schema)`);
    missing += cols.size;
    continue;
  }
  const actual = new Set(r.rows.map(row => row.column_name));
  for (const col of cols) {
    // Skip reserved keywords / function-call aliases
    if (['excluded', 'now', 'coalesce', 'case', 'when', 'then', 'else', 'end'].includes(col)) continue;
    if (col.includes('(') || col.includes('::')) continue;
    if (actual.has(col)) { ok += 1; }
    else {
      // Check if it's a column alias in a select (not actually a column)
      // We only flag insert/update column references, which must be real columns.
      console.log(`  MISSING COLUMN: ${table}.${col}`);
      missing += 1;
    }
  }
}

console.log(`\n=== DB Integrity Summary ===`);
console.log(`Columns OK:     ${ok}`);
console.log(`Columns MISSING: ${missing}`);

// Also verify FK constraints are present.
console.log(`\n— Foreign key constraints —`);
const fks = await db.query(`
  select tc.table_name, kcu.column_name, ccu.table_name as foreign_table
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
  join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
  where tc.constraint_type = 'FOREIGN KEY'
  order by tc.table_name
`);
console.log(`Total FKs: ${fks.rows.length}`);
for (const row of fks.rows.slice(0, 5)) {
  console.log(`  ${row.table_name}.${row.column_name} -> ${row.foreign_table}`);
}
console.log(`  ... (${fks.rows.length - 5} more)`);

// Verify indexes
console.log(`\n— Indexes —`);
const idx = await db.query(`
  select tablename, indexname from pg_indexes where schemaname = 'public'
  order by tablename, indexname
`);
console.log(`Total indexes: ${idx.rows.length}`);

// Verify triggers
console.log(`\n— Triggers —`);
const trg = await db.query(`
  select event_object_table, trigger_name from information_schema.triggers
  order by event_object_table
`);
for (const row of trg.rows) {
  console.log(`  ${row.event_object_table}.${row.trigger_name}`);
}
if (!trg.rows.length) console.log('  (none)');

process.exit(missing === 0 ? 0 : 1);

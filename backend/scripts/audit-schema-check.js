import { query } from '../src/db.js';

const tables = ['users', 'payments', 'revenue_ledger', 'accounting_ledger', 'violations'];

for (const table of tables) {
  const result = await query(
    `select table_name from information_schema.tables where table_schema = 'public' and table_name = '${table}'`,
  );
  console.log(`${table}: ${result.rows[0]?.table_name || 'missing'}`);
}

const columns = await query(
  `select column_name from information_schema.columns
   where table_schema = 'public' and table_name = 'users'
   order by ordinal_position`,
);
console.log(`users columns: ${columns.rows.map((row) => row.column_name).join(', ')}`);

process.exit(0);

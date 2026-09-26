async function tableExists(db, tableName) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) return false;

  try {
    const result = await db.query(
      "select tablename from pg_catalog.pg_tables where schemaname = 'public' and tablename = $1 limit 1",
      [tableName],
    );
    return Boolean(result.rows?.[0]);
  } catch (error) {
    const fallback = await db.query(
      "select table_name from information_schema.tables where table_schema = 'public' and table_name = $1 limit 1",
      [tableName],
    );
    return Boolean(fallback.rows?.[0]);
  }
}

export { tableExists };

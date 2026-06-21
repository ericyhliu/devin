// Quick connectivity + schema check. Run: npx tsx scripts/db-check.ts
import { pool, initSchema } from "../src/db.js";

async function main() {
  const { rows } = await pool.query("select version()");
  console.log("[db-check] connected:", rows[0].version.split(",")[0]);

  await initSchema();

  const tables = await pool.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' order by table_name`,
  );
  console.log("[db-check] tables:", tables.rows.map((r) => r.table_name).join(", "));

  const counts = await pool.query("select count(*)::int as n from tasks");
  console.log("[db-check] tasks rows:", counts.rows[0].n);

  await pool.end();
}

main().catch((err) => {
  console.error("[db-check] FAILED:", err.message);
  process.exit(1);
});

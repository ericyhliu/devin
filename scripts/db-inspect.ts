// Dump current rows. Run: npx tsx scripts/db-inspect.ts
import { pool } from "../src/db.js";

async function main() {
  const tasks = await pool.query(
    `select id, repo, issue_number, status, issue_title, created_at from tasks order by id`,
  );
  console.log("TASKS:");
  console.table(tasks.rows);

  const deliveries = await pool.query(
    `select delivery_id, event, received_at from webhook_deliveries order by received_at`,
  );
  console.log("WEBHOOK_DELIVERIES:");
  console.table(deliveries.rows);

  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

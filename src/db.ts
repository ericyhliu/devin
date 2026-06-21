import { readFileSync } from "node:fs";
import pg from "pg";
import { config } from "./config.js";

// Render Postgres requires SSL. A local Postgres (localhost) usually doesn't,
// so we only disable SSL for local hosts.
const isLocal = /@(localhost|127\.0\.0\.1)/.test(config.databaseUrl);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

/** Thin query helper so callers don't import the pool directly everywhere. */
export function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}

/**
 * Run the schema on boot. CREATE TABLE IF NOT EXISTS makes this idempotent, so
 * it's safe to run every startup — no migration tooling needed at this scale.
 *
 * schema.sql sits next to this file (src/ in dev, dist/ in prod — the build
 * step copies it), so we resolve it relative to this module.
 */
export async function initSchema(): Promise<void> {
  const sql = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  await pool.query(sql);
  console.log("[db] schema ready");
}

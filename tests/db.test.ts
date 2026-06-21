import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://devin_test:test123@localhost:5432/devin_test";

let pool: pg.Pool;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  // Apply schema
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const schemaPath = resolve(__dirname, "../src/schema.sql");
  const sql = readFileSync(schemaPath, "utf8");
  await pool.query(sql);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  // Clean tables between tests for isolation
  await pool.query("DELETE FROM tasks");
  await pool.query("DELETE FROM webhook_deliveries");
});

describe("schema initialization", () => {
  it("creates the tasks table with expected columns", async () => {
    const result = await pool.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'tasks'
       ORDER BY ordinal_position`,
    );
    const columns = result.rows.map((r) => r.column_name);
    expect(columns).toContain("id");
    expect(columns).toContain("repo");
    expect(columns).toContain("issue_number");
    expect(columns).toContain("issue_title");
    expect(columns).toContain("issue_url");
    expect(columns).toContain("devin_session_id");
    expect(columns).toContain("status");
    expect(columns).toContain("status_detail");
    expect(columns).toContain("pr_url");
    expect(columns).toContain("error");
    expect(columns).toContain("created_at");
    expect(columns).toContain("dispatched_at");
    expect(columns).toContain("pr_opened_at");
    expect(columns).toContain("updated_at");
  });

  it("creates the webhook_deliveries table with expected columns", async () => {
    const result = await pool.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = 'webhook_deliveries'
       ORDER BY ordinal_position`,
    );
    const columns = result.rows.map((r) => r.column_name);
    expect(columns).toContain("delivery_id");
    expect(columns).toContain("event");
    expect(columns).toContain("received_at");
  });

  it("tasks table has a unique constraint on (repo, issue_number)", async () => {
    await pool.query(
      `INSERT INTO tasks (repo, issue_number, issue_title, issue_url)
       VALUES ('owner/repo', 1, 'Test', 'https://github.com/owner/repo/issues/1')`,
    );
    // Duplicate insert should violate unique constraint
    await expect(
      pool.query(
        `INSERT INTO tasks (repo, issue_number, issue_title, issue_url)
         VALUES ('owner/repo', 1, 'Duplicate', 'https://github.com/owner/repo/issues/1')`,
      ),
    ).rejects.toThrow(/unique/i);
  });

  it("schema is idempotent (running twice does not error)", async () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const schemaPath = resolve(__dirname, "../src/schema.sql");
    const sql = readFileSync(schemaPath, "utf8");
    // Running schema again should not throw
    await expect(pool.query(sql)).resolves.not.toThrow();
  });
});

describe("webhook_deliveries", () => {
  it("inserts a new delivery and returns it", async () => {
    const res = await pool.query(
      `INSERT INTO webhook_deliveries (delivery_id, event)
       VALUES ($1, $2)
       ON CONFLICT (delivery_id) DO NOTHING
       RETURNING delivery_id`,
      ["delivery-1", "issues"],
    );
    expect(res.rowCount).toBe(1);
    expect(res.rows[0].delivery_id).toBe("delivery-1");
  });

  it("rejects duplicate delivery_id (idempotency)", async () => {
    await pool.query(
      `INSERT INTO webhook_deliveries (delivery_id, event) VALUES ($1, $2)`,
      ["delivery-dup", "issues"],
    );
    // ON CONFLICT DO NOTHING means no row returned for duplicates
    const res = await pool.query(
      `INSERT INTO webhook_deliveries (delivery_id, event)
       VALUES ($1, $2)
       ON CONFLICT (delivery_id) DO NOTHING
       RETURNING delivery_id`,
      ["delivery-dup", "push"],
    );
    expect(res.rowCount).toBe(0);
  });

  it("stores null event gracefully", async () => {
    const res = await pool.query(
      `INSERT INTO webhook_deliveries (delivery_id, event)
       VALUES ($1, $2)
       RETURNING delivery_id, event`,
      ["delivery-null-event", null],
    );
    expect(res.rows[0].event).toBeNull();
  });
});

describe("tasks", () => {
  it("inserts a new task with default status 'queued'", async () => {
    const res = await pool.query(
      `INSERT INTO tasks (repo, issue_number, issue_title, issue_url)
       VALUES ($1, $2, $3, $4)
       RETURNING id, status, created_at, updated_at`,
      ["owner/repo", 42, "Fix bug", "https://github.com/owner/repo/issues/42"],
    );
    expect(res.rowCount).toBe(1);
    expect(res.rows[0].status).toBe("queued");
    expect(res.rows[0].created_at).toBeDefined();
    expect(res.rows[0].updated_at).toBeDefined();
  });

  it("ON CONFLICT DO NOTHING is idempotent for same repo+issue_number", async () => {
    await pool.query(
      `INSERT INTO tasks (repo, issue_number, issue_title, issue_url)
       VALUES ($1, $2, $3, $4)`,
      ["owner/repo", 10, "First", "https://github.com/owner/repo/issues/10"],
    );
    const res = await pool.query(
      `INSERT INTO tasks (repo, issue_number, issue_title, issue_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (repo, issue_number) DO NOTHING
       RETURNING id`,
      ["owner/repo", 10, "Second", "https://github.com/owner/repo/issues/10"],
    );
    expect(res.rowCount).toBe(0);
  });

  it("allows same issue_number in different repos", async () => {
    await pool.query(
      `INSERT INTO tasks (repo, issue_number, issue_title, issue_url)
       VALUES ($1, $2, $3, $4)`,
      ["owner/repo-a", 1, "A", "https://github.com/owner/repo-a/issues/1"],
    );
    const res = await pool.query(
      `INSERT INTO tasks (repo, issue_number, issue_title, issue_url)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ["owner/repo-b", 1, "B", "https://github.com/owner/repo-b/issues/1"],
    );
    expect(res.rowCount).toBe(1);
  });

  it("nullable fields default to null", async () => {
    const res = await pool.query(
      `INSERT INTO tasks (repo, issue_number, issue_title, issue_url)
       VALUES ($1, $2, $3, $4)
       RETURNING devin_session_id, status_detail, pr_url, error, dispatched_at, pr_opened_at`,
      ["owner/repo", 99, "Nullable", "https://github.com/owner/repo/issues/99"],
    );
    const row = res.rows[0];
    expect(row.devin_session_id).toBeNull();
    expect(row.status_detail).toBeNull();
    expect(row.pr_url).toBeNull();
    expect(row.error).toBeNull();
    expect(row.dispatched_at).toBeNull();
    expect(row.pr_opened_at).toBeNull();
  });

  it("can update task status and track dispatch", async () => {
    const ins = await pool.query(
      `INSERT INTO tasks (repo, issue_number, issue_title, issue_url)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ["owner/repo", 7, "Update me", "https://github.com/owner/repo/issues/7"],
    );
    const id = ins.rows[0].id;

    await pool.query(
      `UPDATE tasks
       SET status = 'running', devin_session_id = $1, dispatched_at = now(), updated_at = now()
       WHERE id = $2`,
      ["session-abc123", id],
    );

    const updated = await pool.query(`SELECT * FROM tasks WHERE id = $1`, [id]);
    expect(updated.rows[0].status).toBe("running");
    expect(updated.rows[0].devin_session_id).toBe("session-abc123");
    expect(updated.rows[0].dispatched_at).not.toBeNull();
  });
});

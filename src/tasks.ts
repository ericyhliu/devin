import { query } from "./db.js";

export interface Task {
  id: number;
  repo: string;
  issue_number: number;
  issue_title: string;
  issue_url: string;
  devin_session_id: string | null;
  status: string;
  status_detail: string | null;
  pr_url: string | null;
  error: string | null;
  created_at: string;
  dispatched_at: string | null;
  pr_opened_at: string | null;
  updated_at: string;
}

/**
 * Record a webhook delivery for idempotency. Returns true if this is the FIRST
 * time we've seen this delivery id, false if it's a redelivery (already seen).
 */
export async function recordDelivery(
  deliveryId: string,
  event: string | undefined,
): Promise<boolean> {
  const res = await query(
    `INSERT INTO webhook_deliveries (delivery_id, event)
     VALUES ($1, $2)
     ON CONFLICT (delivery_id) DO NOTHING
     RETURNING delivery_id`,
    [deliveryId, event ?? null],
  );
  return (res.rowCount ?? 0) > 0;
}

export interface EnqueueInput {
  repo: string;
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
}

/**
 * Enqueue an issue for remediation. The UNIQUE(repo, issue_number) constraint
 * plus ON CONFLICT DO NOTHING guarantees exactly one task (and later one Devin
 * session) per issue, regardless of how many webhooks arrive or in what order.
 *
 * Returns true if a new task row was created, false if one already existed.
 */
export async function enqueueTask(input: EnqueueInput): Promise<boolean> {
  const res = await query(
    `INSERT INTO tasks (repo, issue_number, issue_title, issue_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (repo, issue_number) DO NOTHING
     RETURNING id`,
    [input.repo, input.issueNumber, input.issueTitle, input.issueUrl],
  );
  return (res.rowCount ?? 0) > 0;
}

/** How many sessions are currently in flight (for concurrency control). */
export async function countRunning(): Promise<number> {
  const res = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM tasks WHERE status = 'running'`,
  );
  return res.rows[0].n;
}

/** Oldest queued tasks, up to `limit`, for the worker to dispatch. */
export async function nextQueued(limit: number): Promise<Task[]> {
  const res = await query<Task>(
    `SELECT * FROM tasks WHERE status = 'queued' ORDER BY created_at ASC LIMIT $1`,
    [limit],
  );
  return res.rows;
}

/** Mark a task as dispatched to Devin. */
export async function markRunning(id: number, sessionId: string): Promise<void> {
  await query(
    `UPDATE tasks
     SET status = 'running', devin_session_id = $2, dispatched_at = now(), updated_at = now()
     WHERE id = $1`,
    [id, sessionId],
  );
}

/** Mark a task as failed (e.g. the Devin create call errored). */
export async function markFailed(id: number, error: string): Promise<void> {
  await query(
    `UPDATE tasks SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
    [id, error],
  );
}

/**
 * Record that a PR has opened for an issue (the completion signal). Matches by
 * repo + issue number. pr_opened_at is set only once (first PR wins). Returns
 * true if a matching task was updated.
 */
export async function markPrOpen(
  repo: string,
  issueNumber: number,
  prUrl: string,
): Promise<boolean> {
  const res = await query(
    `UPDATE tasks
     SET status = 'pr_open',
         pr_url = $3,
         pr_opened_at = COALESCE(pr_opened_at, now()),
         updated_at = now()
     WHERE repo = $1 AND issue_number = $2 AND status <> 'pr_open'
     RETURNING id`,
    [repo, issueNumber, prUrl],
  );
  return (res.rowCount ?? 0) > 0;
}

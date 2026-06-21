import { query } from "./db.js";
import type { Task } from "./tasks.js";

export interface Metrics {
  total: number;
  active: number; // queued + running
  resolved: number; // pr_open + done
  failed: number; // Devin session failed
  rejected: number; // PR closed unmerged
  successRate: number | null; // resolved / (resolved + failed + rejected)
  avgCycleSeconds: number | null; // avg(pr_opened_at - created_at)
  throughput24h: number; // tasks created in last 24h
  totalAcus: number; // sum of acus_consumed
}

/** Aggregate metrics for the dashboard cards. */
export async function getMetrics(): Promise<Metrics> {
  const res = await query<{
    total: number;
    active: number;
    resolved: number;
    failed: number;
    rejected: number;
    throughput24h: number;
    avg_cycle_seconds: number | null;
    total_acus: number | null;
  }>(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE status IN ('queued','running'))::int AS active,
       count(*) FILTER (WHERE status IN ('pr_open','done'))::int AS resolved,
       count(*) FILTER (WHERE status = 'failed')::int AS failed,
       count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
       count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS throughput24h,
       avg(extract(epoch FROM (pr_opened_at - created_at)))
         FILTER (WHERE pr_opened_at IS NOT NULL) AS avg_cycle_seconds,
       coalesce(sum(acus_consumed), 0) AS total_acus
     FROM tasks`,
  );
  const r = res.rows[0];
  const denom = r.resolved + r.failed + r.rejected;
  return {
    total: r.total,
    active: r.active,
    resolved: r.resolved,
    failed: r.failed,
    rejected: r.rejected,
    successRate: denom > 0 ? r.resolved / denom : null,
    avgCycleSeconds: r.avg_cycle_seconds === null ? null : Number(r.avg_cycle_seconds),
    throughput24h: r.throughput24h,
    totalAcus: Number(r.total_acus ?? 0),
  };
}

/** All tasks, newest first (capped for the table view). */
export async function getTasks(limit = 100): Promise<Task[]> {
  const res = await query<Task>(
    `SELECT * FROM tasks ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return res.rows;
}

export async function getDashboardData() {
  const [metrics, tasks] = await Promise.all([getMetrics(), getTasks()]);
  return { metrics, tasks };
}

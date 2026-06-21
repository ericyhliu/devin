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

export interface DailyBucket {
  day: string;
  active: number;
  resolved: number;
  failed: number;
  rejected: number;
}
export interface HourlyBucket {
  hour: string;
  resolved: number;
  failed: number; // failed + rejected
}
export interface RangeStat {
  min: number;
  avg: number;
  max: number;
}
export interface ChartData {
  daily: DailyBucket[];
  hourly: HourlyBucket[];
  acu: RangeStat & { total: number };
  elapsed: RangeStat; // seconds
}

/** Per-day breakdown of tasks by their current status bucket (last 14 days). */
async function getDaily(): Promise<DailyBucket[]> {
  const res = await query<DailyBucket & Record<string, any>>(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
        count(*) FILTER (WHERE status IN ('queued','running'))::int AS active,
        count(*) FILTER (WHERE status IN ('pr_open','done'))::int  AS resolved,
        count(*) FILTER (WHERE status = 'failed')::int             AS failed,
        count(*) FILTER (WHERE status = 'rejected')::int           AS rejected
     FROM tasks
     WHERE created_at > now() - interval '14 days'
     GROUP BY 1 ORDER BY 1`,
  );
  return res.rows;
}

/** Hourly resolved vs failed/rejected counts (last 48h) — frontend computes %. */
async function getHourly(): Promise<HourlyBucket[]> {
  const res = await query<HourlyBucket & Record<string, any>>(
    `SELECT to_char(date_trunc('hour', created_at), 'YYYY-MM-DD"T"HH24:00') AS hour,
        count(*) FILTER (WHERE status IN ('pr_open','done'))::int      AS resolved,
        count(*) FILTER (WHERE status IN ('failed','rejected'))::int   AS failed
     FROM tasks
     WHERE created_at > now() - interval '48 hours'
       AND status IN ('pr_open','done','failed','rejected')
     GROUP BY 1 ORDER BY 1`,
  );
  return res.rows;
}

async function getAcuStat(): Promise<RangeStat & { total: number }> {
  const res = await query<{ total: string; min: string; avg: string; max: string }>(
    `SELECT coalesce(sum(acus_consumed),0) AS total,
            coalesce(min(acus_consumed),0) AS min,
            coalesce(avg(acus_consumed),0) AS avg,
            coalesce(max(acus_consumed),0) AS max
     FROM tasks WHERE devin_session_id IS NOT NULL`,
  );
  const r = res.rows[0];
  return { total: Number(r.total), min: Number(r.min), avg: Number(r.avg), max: Number(r.max) };
}

/** Elapsed time (seconds) for terminal tasks: created -> pr opened (or last update). */
async function getElapsedStat(): Promise<RangeStat> {
  const res = await query<{ min: string | null; avg: string | null; max: string | null }>(
    `SELECT min(secs) AS min, avg(secs) AS avg, max(secs) AS max FROM (
        SELECT extract(epoch FROM (coalesce(pr_opened_at, updated_at) - created_at)) AS secs
        FROM tasks WHERE status IN ('pr_open','done','failed','rejected')
     ) s`,
  );
  const r = res.rows[0];
  return { min: Number(r.min ?? 0), avg: Number(r.avg ?? 0), max: Number(r.max ?? 0) };
}

export async function getDashboardData() {
  const [metrics, tasks, daily, hourly, acu, elapsed] = await Promise.all([
    getMetrics(),
    getTasks(),
    getDaily(),
    getHourly(),
    getAcuStat(),
    getElapsedStat(),
  ]);
  const charts: ChartData = { daily, hourly, acu, elapsed };
  return { metrics, tasks, charts };
}

import { config } from "./config.js";
import { query } from "./db.js";
import { createSession, getSession } from "./devin.js";

// ---------------------------------------------------------------------------
// Discovery prompt + structured output schema (the load-bearing piece)
// ---------------------------------------------------------------------------

function discoveryPrompt(): string {
  return [
    `You are performing automated code-quality triage on the GitHub repository ${config.targetRepo}.`,
    ``,
    `Find exactly 3 SMALL, SAFE, single-file code-quality issues and FILE them as GitHub issues. Do NOT fix them.`,
    ``,
    `Each issue MUST be:`,
    `- scoped to a single file`,
    `- an unambiguous, low-risk fix — e.g. a Python 3.12 deprecation (datetime.utcnow(), datetime.utcfromtimestamp()), an unnecessary f-string prefix (flake8 F541), or old-style %-formatting that should be an f-string`,
    `- NOT a refactor, NOT a behavior change, NOT dependent on broad context`,
    ``,
    `Steps:`,
    `1. First check the repository's existing OPEN issues and avoid creating duplicates.`,
    `2. For each of the 3 issues, create a GitHub issue in ${config.targetRepo} with:`,
    `   - a clear, specific title that names the file`,
    `   - a body describing the exact change to make and why`,
    `   - the label "${config.devinLabel}"`,
    `3. Do NOT implement the fixes — only create the issues.`,
    ``,
    `When done, return structured output listing the issues you created.`,
  ].join("\n");
}

const DISCOVERY_SCHEMA = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          issue_number: { type: "integer" },
          title: { type: "string" },
          file: { type: "string" },
        },
        required: ["issue_number", "title"],
      },
    },
  },
  required: ["issues"],
};

// ---------------------------------------------------------------------------
// Schedule on/off (persisted so it survives restarts)
// ---------------------------------------------------------------------------

const SCHEDULE_KEY = "code_quality_schedule";

export async function getSchedule(): Promise<"active" | "paused"> {
  const res = await query<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = $1`,
    [SCHEDULE_KEY],
  );
  return res.rows[0]?.value === "active" ? "active" : "paused";
}

export async function setSchedule(state: "active" | "paused"): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [SCHEDULE_KEY, state],
  );
}

async function isDiscovering(): Promise<boolean> {
  const res = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM workflows WHERE status = 'discovering'`,
  );
  return res.rows[0].n > 0;
}

// ---------------------------------------------------------------------------
// Trigger a workflow run (start a discovery session)
// ---------------------------------------------------------------------------

export async function triggerWorkflowRun(
  trigger: "manual" | "scheduled",
): Promise<{ id: number; skipped?: boolean } | null> {
  // Avoid overlapping discovery runs.
  if (await isDiscovering()) {
    console.log(`[workflow] ${trigger} run skipped — a discovery is already in flight`);
    return { id: -1, skipped: true };
  }

  const ins = await query<{ id: number }>(
    `INSERT INTO workflows (type, status, trigger) VALUES ('code_quality', 'discovering', $1) RETURNING id`,
    [trigger],
  );
  const id = ins.rows[0].id;

  try {
    const session = await createSession({
      prompt: discoveryPrompt(),
      title: `Code-quality discovery (${config.targetRepo})`,
      tags: ["discovery", "code-quality"],
      idempotent: false,
      structuredOutputSchema: DISCOVERY_SCHEMA,
    });
    await query(
      `UPDATE workflows SET discovery_session_id = $2, status_detail = 'scanning', updated_at = now() WHERE id = $1`,
      [id, session.session_id],
    );
    console.log(`[workflow] run #${id} started → discovery session ${session.session_id}`);
    return { id };
  } catch (err: any) {
    await query(
      `UPDATE workflows SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
      [id, err.message],
    );
    console.error(`[workflow] run #${id} failed to start:`, err.message);
    return { id };
  }
}

// ---------------------------------------------------------------------------
// Sync in-flight discovery sessions → record filed issues, complete the run
// ---------------------------------------------------------------------------

function extractIssues(structured: unknown): { issue_number: number; title: string; file?: string }[] {
  let obj: any = structured;
  if (typeof structured === "string") {
    try { obj = JSON.parse(structured); } catch { return []; }
  }
  const arr = obj?.issues;
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((i: any) => Number.isInteger(i?.issue_number) && i?.title)
    .map((i: any) => ({ issue_number: i.issue_number, title: String(i.title), file: i.file }));
}

export async function runWorkflowSyncTick(): Promise<void> {
  const res = await query<{ id: number; discovery_session_id: string | null }>(
    `SELECT id, discovery_session_id FROM workflows WHERE status = 'discovering' AND discovery_session_id IS NOT NULL`,
  );

  for (const wf of res.rows) {
    try {
      const session = await getSession(wf.discovery_session_id!);
      const issues = extractIssues(session.structured_output);

      if (issues.length > 0) {
        for (const iss of issues) {
          await query(
            `INSERT INTO workflow_issues (workflow_id, repo, issue_number, title, file)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (workflow_id, issue_number) DO NOTHING`,
            [wf.id, config.targetRepo, iss.issue_number, iss.title, iss.file ?? null],
          );
        }
        await query(
          `UPDATE workflows SET status = 'completed', status_detail = 'done',
             issues_found = $2, completed_at = now(), updated_at = now() WHERE id = $1`,
          [wf.id, issues.length],
        );
        console.log(`[workflow] run #${wf.id} → completed (${issues.length} issues filed)`);
      } else if (["error", "suspended"].includes(session.status)) {
        await query(
          `UPDATE workflows SET status = 'failed', status_detail = $2,
             error = 'discovery session ended without structured output', updated_at = now() WHERE id = $1`,
          [wf.id, session.status],
        );
        console.log(`[workflow] run #${wf.id} → failed (session ${session.status})`);
      } else {
        // still scanning — refresh the detail line
        await query(
          `UPDATE workflows SET status_detail = $2, updated_at = now() WHERE id = $1`,
          [wf.id, session.status_detail ?? "scanning"],
        );
      }
    } catch (err: any) {
      console.error(`[workflow] run #${wf.id} sync error:`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Periodic scheduler — fires a run every interval IF the schedule is active.
// The schedule flag is persisted, so "active" survives restarts; the loop is a
// no-op while paused, so it costs nothing until the operator turns it on.
// ---------------------------------------------------------------------------

export function startWorkflowScheduler(): void {
  setInterval(async () => {
    try {
      if ((await getSchedule()) !== "active") return;
      await triggerWorkflowRun("scheduled");
    } catch (err: any) {
      console.error("[workflow] scheduler error:", err.message);
    }
  }, config.workflowIntervalMs);
  console.log(
    `[workflow] scheduler started (interval ${config.workflowIntervalMs}ms, runs only while schedule is active)`,
  );
}

// ---------------------------------------------------------------------------
// Data for the Workflows UI
// ---------------------------------------------------------------------------

export async function getWorkflowsData() {
  const [schedule, runs, issues] = await Promise.all([
    getSchedule(),
    query(
      `SELECT id, type, status, status_detail, discovery_session_id, issues_found,
              trigger, created_at, completed_at
       FROM workflows ORDER BY created_at DESC LIMIT 50`,
    ),
    query(
      `SELECT wi.workflow_id, wi.repo, wi.issue_number, wi.title, wi.file, wi.created_at,
              t.status AS task_status, t.pr_url, t.devin_session_id
       FROM workflow_issues wi
       LEFT JOIN tasks t ON t.repo = wi.repo AND t.issue_number = wi.issue_number
       ORDER BY wi.created_at DESC LIMIT 100`,
    ),
  ]);
  return { schedule, runs: runs.rows, issues: issues.rows };
}

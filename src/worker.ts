import { config } from "./config.js";
import { createSession } from "./devin.js";
import {
  countRunning,
  nextQueued,
  markRunning,
  markFailed,
  type Task,
} from "./tasks.js";

/**
 * Build the prompt that tells Devin what to do. The prompt is load-bearing:
 * it instructs Devin to fix the specific issue, open a PR, and tag `Closes #N`
 * so the later pull_request webhook can map the PR back to this task.
 */
function buildPrompt(task: Task): string {
  return [
    `You are an autonomous engineer fixing a GitHub issue in the repository ${task.repo}.`,
    ``,
    `Issue #${task.issue_number}: ${task.issue_title}`,
    `Issue URL: ${task.issue_url}`,
    ``,
    `Read the full issue (including its description and comments) at the URL above.`,
    `Implement a complete, correct fix on a new branch. Run any relevant tests.`,
    `Then open a pull request against the main branch. The PR description MUST`,
    `include the line "Closes #${task.issue_number}" so the issue auto-links.`,
    `Keep the change focused on this issue only.`,
  ].join("\n");
}

/** One worker tick: dispatch as many queued tasks as concurrency allows. */
export async function runWorkerTick(): Promise<void> {
  const running = await countRunning();
  const slots = config.maxConcurrentSessions - running;
  if (slots <= 0) return;

  const batch = await nextQueued(slots);
  if (batch.length === 0) return;

  for (const task of batch) {
    try {
      const session = await createSession({
        prompt: buildPrompt(task),
        title: `Fix ${task.repo}#${task.issue_number}: ${task.issue_title}`,
        tags: ["auto-remediation", `repo:${task.repo}`],
        idempotent: true,
      });
      await markRunning(task.id, session.session_id);
      console.log(
        `[worker] dispatched #${task.issue_number} → session ${session.session_id}`,
      );
    } catch (err: any) {
      // Mark failed so a poison task doesn't get retried forever every tick.
      await markFailed(task.id, err.message);
      console.error(`[worker] FAILED to dispatch #${task.issue_number}:`, err.message);
    }
  }
}

let ticking = false;

/** Start the worker loop. A guard prevents overlapping ticks. */
export function startWorker(): void {
  setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      await runWorkerTick();
    } catch (err: any) {
      console.error("[worker] tick error:", err.message);
    } finally {
      ticking = false;
    }
  }, config.workerIntervalMs);
  console.log(
    `[worker] started (interval ${config.workerIntervalMs}ms, max ${config.maxConcurrentSessions} concurrent)`,
  );
}

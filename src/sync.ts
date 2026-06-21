import { config } from "./config.js";
import { getSession, getLatestDevinMessage } from "./devin.js";
import { runningTasks, updateSessionSync, markFailed } from "./tasks.js";

const TERMINAL_FAILURE = new Set(["error", "suspended"]);

/**
 * One sync pass over in-flight tasks. For each running task we poll Devin to:
 *   1. refresh live progress (status_detail, acus_consumed, latest message)
 *   2. detect silent failures — terminal session (error/suspended) with NO PR.
 *
 * Note: this is observability + a safety net, NOT the completion path. Success
 * still arrives event-driven via the pull_request webhook. We only poll because
 * Devin has no outbound webhook for failures or compute usage.
 */
export async function runSyncTick(): Promise<void> {
  const tasks = await runningTasks();
  for (const task of tasks) {
    const sessionId = task.devin_session_id!;
    try {
      const [session, message] = await Promise.all([
        getSession(sessionId),
        getLatestDevinMessage(sessionId),
      ]);

      await updateSessionSync(task.id, {
        statusDetail: session.status_detail,
        acusConsumed: session.acus_consumed,
        lastMessage: message ? message.slice(0, 500) : null,
      });

      // Safety net: a terminal session that never produced a PR is a failure.
      // (If a PR existed, the webhook would have already moved it past 'running'.)
      const hasPr = (session.pull_requests ?? []).length > 0;
      if (TERMINAL_FAILURE.has(session.status) && !hasPr) {
        await markFailed(
          task.id,
          `Devin session ${session.status} (${session.status_detail ?? "no detail"}) with no PR`,
        );
        console.log(`[sync] #${task.issue_number} → failed (session ${session.status})`);
      }
    } catch (err: any) {
      console.error(`[sync] #${task.issue_number} poll error:`, err.message);
    }
  }
}

let ticking = false;

export function startSync(): void {
  setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      await runSyncTick();
    } catch (err: any) {
      console.error("[sync] tick error:", err.message);
    } finally {
      ticking = false;
    }
  }, config.syncIntervalMs);
  console.log(`[sync] started (interval ${config.syncIntervalMs}ms)`);
}

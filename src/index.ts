import express from "express";
import { config } from "./config.js";
import { verifySignature } from "./github.js";
import { initSchema } from "./db.js";
import { recordDelivery, enqueueTask } from "./tasks.js";
import { startWorker } from "./worker.js";

const app = express();

// Simple health check so we can confirm the service is up (and for Render).
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "devin-orchestrator", ts: new Date().toISOString() });
});

/** Handle an `issues` event: enqueue a task if the issue carries the devin label. */
async function handleIssues(payload: any): Promise<void> {
  const action = payload.action;
  const issue = payload.issue;
  const labels: string[] = (issue?.labels ?? []).map((l: any) => l.name);
  console.log(
    `[webhook] issues.${action} #${issue?.number} "${issue?.title}" labels=[${labels.join(", ")}]`,
  );

  // Enqueue when a devin-labeled issue is opened/labeled/reopened. The label may
  // arrive via "labeled" or already be present on "opened" — both are covered,
  // and enqueueTask is idempotent so over-triggering is harmless.
  const hasDevinLabel = labels.includes(config.devinLabel);
  const isTrigger = ["opened", "labeled", "reopened"].includes(action);
  if (!hasDevinLabel || !isTrigger) return;

  const inserted = await enqueueTask({
    repo: payload.repository.full_name,
    issueNumber: issue.number,
    issueTitle: issue.title,
    issueUrl: issue.html_url,
  });

  if (inserted) {
    console.log(`[webhook]   ↳ enqueued task for #${issue.number} (status=queued)`);
  } else {
    console.log(`[webhook]   ↳ #${issue.number} already enqueued — skipping`);
  }
}

/**
 * GitHub webhook receiver.
 *
 * express.raw() gives us the UNTOUCHED body as a Buffer — the signature must be
 * verified against the exact bytes GitHub sent, before any JSON parsing. After
 * verifying we dedupe the delivery, then record state. We never call Devin here
 * (that's the worker's job); the handler only accepts + records, and acks fast.
 */
app.post("/api/webhook", express.raw({ type: "*/*" }), async (req, res) => {
  const rawBody = req.body as Buffer;
  const signature = req.header("x-hub-signature-256");

  // 1. Verify the payload really came from GitHub.
  if (!verifySignature(rawBody, signature, config.githubWebhookSecret)) {
    console.warn("[webhook] signature verification FAILED — rejecting");
    return res.status(401).json({ error: "invalid signature" });
  }

  const event = req.header("x-github-event");
  const delivery = req.header("x-github-delivery");

  let payload: any = {};
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    console.warn("[webhook] body was not valid JSON");
  }

  try {
    // 2. Dedupe redelivered webhooks (GitHub retries).
    if (delivery) {
      const isNew = await recordDelivery(delivery, event);
      if (!isNew) {
        console.log(`[webhook] duplicate delivery ${delivery} — ignoring`);
        return res.status(200).json({ received: true, duplicate: true });
      }
    }

    // 3. Route by event type.
    if (event === "ping") {
      console.log(`[webhook] ✅ ping received (zen: "${payload.zen}") — GitHub is wired up`);
    } else if (event === "issues") {
      await handleIssues(payload);
    } else {
      console.log(`[webhook] event="${event}" delivery=${delivery} (no handler yet)`);
    }

    // 4. Ack fast with 200.
    return res.status(200).json({ received: true });
  } catch (err: any) {
    // Return 500 so GitHub retries — better to reprocess (idempotent) than drop.
    console.error(`[webhook] error handling ${event}:`, err.message);
    return res.status(500).json({ error: "internal error" });
  }
});

async function main() {
  await initSchema();
  startWorker();
  app.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port}`);
    console.log(`[server] webhook endpoint: POST /api/webhook`);
  });
}

main().catch((err) => {
  console.error("[server] failed to start:", err);
  process.exit(1);
});

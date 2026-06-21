import express from "express";
import { config } from "./config.js";
import { verifySignature } from "./github.js";

const app = express();

// Simple health check so we can confirm the service is up (and for Render).
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "devin-remediation", ts: new Date().toISOString() });
});

/**
 * GitHub webhook receiver.
 *
 * We use express.raw() so we get the UNTOUCHED request body as a Buffer — the
 * signature must be verified against the exact bytes GitHub sent, before any
 * JSON parsing. After verifying, we parse and log. No business logic yet:
 * this slice only proves GitHub can reach us and we trust the payload.
 */
app.post(
  "/api/webhook",
  express.raw({ type: "*/*" }),
  (req, res) => {
    const rawBody = req.body as Buffer;
    const signature = req.header("x-hub-signature-256");

    // 1. Verify the payload really came from GitHub.
    if (!verifySignature(rawBody, signature, config.githubWebhookSecret)) {
      console.warn("[webhook] signature verification FAILED — rejecting");
      return res.status(401).json({ error: "invalid signature" });
    }

    const event = req.header("x-github-event"); // e.g. "issues", "ping"
    const delivery = req.header("x-github-delivery"); // unique delivery id

    let payload: any = {};
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      console.warn("[webhook] body was not valid JSON");
    }

    // 2. Log what we got so we can watch it in the terminal.
    if (event === "ping") {
      console.log(`[webhook] ✅ ping received (zen: "${payload.zen}") — GitHub is wired up`);
    } else if (event === "issues") {
      const action = payload.action;
      const num = payload.issue?.number;
      const title = payload.issue?.title;
      const labels = (payload.issue?.labels ?? []).map((l: any) => l.name);
      console.log(
        `[webhook] issues.${action} #${num} "${title}" labels=[${labels.join(", ")}]`,
      );
      if (action === "labeled") {
        console.log(`[webhook]   ↳ label added: "${payload.label?.name}"`);
      }
    } else {
      console.log(`[webhook] event="${event}" delivery=${delivery} (no handler yet)`);
    }

    // 3. Always ack fast with 200 so GitHub is happy.
    return res.status(200).json({ received: true });
  },
);

app.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
  console.log(`[server] webhook endpoint: POST /api/webhook`);
});

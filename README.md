# Devin Orchestrator

An event-driven automation that uses the [Devin API](https://docs.devin.ai/api-reference/overview)
to **autonomously discover, file, and remediate code-quality issues** in a GitHub
repository — with a live monitoring dashboard.

A human labels an issue (or clicks one button); everything after that — spinning up
Devin, writing the fix, opening the PR, tracking it to merge — happens on its own.

> **The thesis:** a script can fix a *known* bug, but it can't decide *what's worth
> fixing*. Discovery → triage → remediation is judgment work, and that's exactly what
> an autonomous agent unlocks. The engineer's job moves up the stack: from writing
> code → to **designing the workflows and reviewing the PRs.**

Target repo for the demo: [`ericyhliu/superset`](https://github.com/ericyhliu/superset), a fork of [`apache/superset`](https://github.com/apache/superset).

---

## What it does

There are two ways work enters the system, both ending in the same remediation pipeline:

1. **Manual** — a human labels a GitHub issue `devin`. A webhook fires; the orchestrator
   spins up a Devin session to fix it and open a PR.
2. **Autonomous (Workflows)** — one click ("Run Code Quality Workflow") starts a Devin
   *discovery* session that scans the repo, **files** 3 small code-quality issues itself
   (labeled `devin`), which then flow into the exact same remediation pipeline. This can
   also run on an hourly schedule.

Every task is tracked through a state machine and surfaced on a dashboard:

```
queued ──▶ running ──▶ pr_open ──▶ done
                  │
                  ├──▶ failed     (Devin session errored, no PR)
                  └──▶ rejected   (PR closed without merging)
```

---

## Architecture

```
GitHub fork (apache/superset)
  issue labeled `devin` ──┐                ┌── Devin opens PR ("Closes #N")
                          │ webhook        │ webhook
                          ▼                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ RENDER · long-running Docker container (Express)                      │
│                                                                      │
│  (A) Webhook handler   POST /api/webhook   — verifies + records,      │
│      returns 200 fast (no Devin call here)                           │
│        • issues.labeled      → INSERT task (queued)                   │
│        • pull_request.opened → task → pr_open                        │
│        • pull_request merged → task → done   (closed unmerged → rejected)
│                                                                      │
│  (B) Worker loop       drains queued tasks → POST Devin /sessions     │
│                        → task → running (concurrency-capped)          │
│                                                                      │
│  (C) Sync loop         polls in-flight Devin sessions for live        │
│                        progress + ACUs; safety-net for silent failures│
│                        + advances discovery workflows                 │
│                                                                      │
│  (D) Workflow scheduler  hourly (toggleable) discovery runs           │
│                                                                      │
│  (E) Dashboard         GET /  (Tasks)  ·  GET /workflows              │
│                                                                      │
│        Postgres (Render): tasks · webhook_deliveries · workflows ·    │
│                           workflow_issues · app_settings              │
└──────────────────────────────────────────────────────────────────────┘
        │ POST /sessions  · GET /session/{id} · GET /messages
        ▼
   ┌────────────────────────────────────────────────────────┐
   │ DEVIN API — discovery session files issues;             │
   │ remediation sessions write fixes + open PRs             │
   └────────────────────────────────────────────────────────┘
```

### Key design decisions

- **Event-driven, not polling.** GitHub webhooks drive both the trigger
  (`issues.labeled`) and completion (`pull_request` events). Devin has no outbound
  webhook, so completion is learned by routing Devin's *own* GitHub actions (opening
  the PR) back as a second webhook. GitHub is the event bus.
- **Handler / worker split.** The webhook handler only verifies, dedupes, and records,
  then returns `200` immediately — GitHub expects a fast ack. The slow Devin API call
  happens in a separate **worker loop** that drains `queued` rows. The `tasks` table
  *is* the durable queue, so we get retries + concurrency control without Redis/SQS.
- **Idempotency.** `UNIQUE(repo, issue_number)` + `INSERT … ON CONFLICT DO NOTHING`
  guarantees exactly one Devin session per issue, regardless of how many webhooks
  arrive or in what order (GitHub delivery order is not guaranteed). Deliveries are
  also deduped on `X-GitHub-Delivery`.
- **Events tell you about success; reconciliation catches silence.** The sync loop is
  the safety-net: if a Devin session errors with no PR (so no GitHub event fires), it
  marks the task `failed`. It also captures live progress + ACU usage.
- **Discovery reuses the pipeline.** The workflow's discovery session *files real GitHub
  issues* (via Devin's GitHub App access) and returns them via Devin's
  `structured_output` — so remediation is the existing, already-proven path. No new
  credentials, fully event-driven.

---

## Observability

The dashboard (`/`) answers *"how would an engineering leader know this is working?"*:

- **Task Status** — stacked bar of active / resolved / failed / rejected per day
- **Success & Failure Rate** — hourly line chart
- **Throughput & Resource Usage** — total ACUs + min/avg/max boxplots for ACU
  consumption and elapsed time
- **Live task table** — each task's status, ticking elapsed timer, ACUs, expandable
  latest-Devin-message row, and buttons to the GitHub PR / Devin session

> Note on ACUs: Devin meters compute in **ACUs** (Agent Compute Units; ~15 min of work
> each), not tokens — there are no token counts in the API. Depending on plan/reporting,
> `acus_consumed` may read `0`; the plumbing is in place regardless.

The **Workflows** page (`/workflows`) shows the Run button, the hourly-schedule toggle,
a Devin button into the live discovery session, and a table of generated issues joined
to their remediation status.

---

## Tech stack

- **Node / TypeScript** + **Express** (one long-running container)
- **Postgres** (Render) — source of truth + durable job queue
- **Chart.js** (CDN) for charts; server-rendered HTML, no frontend framework
- **Docker**; deployed on **Render** via `render.yaml` (blueprint-as-code)

---

## Project layout

```
src/
  index.ts          # boot: Express + worker + sync + scheduler; routes
  config.ts         # env config
  db.ts             # pg pool + schema-on-boot
  schema.sql        # tables (idempotent; migrates on boot)
  github.ts         # webhook signature verify + PR "Closes #N" parsing
  devin.ts          # Devin API client (create/get session, messages, structured output)
  tasks.ts          # task data-access + state transitions
  worker.ts         # drains queued tasks → Devin remediation sessions
  sync.ts           # polls in-flight sessions (progress, ACUs, failure safety-net)
  workflows.ts      # discovery prompt + run, schedule, workflow sync
  dashboard.ts      # metrics + chart aggregates
  dashboard-page.ts # Tasks page (HTML/CSS/JS)
  workflows-page.ts # Workflows page (HTML/CSS/JS)
  layout.ts         # shared styles + sidebar
scripts/
  db-check.ts       # connectivity + schema check
  db-inspect.ts     # dump tables
  test-parse.ts     # unit test for PR-body parsing
```

---

## Running it

### Prerequisites
- Node 20+ (or Docker)
- A Postgres database (Render Postgres, or local)
- A Devin **service user** API key (`cog_…`) and **org id** (v3 API)
- The target repo connected to your Devin org's GitHub App (so Devin can push + file issues)

### 1. Configure
```bash
cp .env.example .env
# fill in DATABASE_URL, DEVIN_API_KEY, DEVIN_ORG_ID, GITHUB_WEBHOOK_SECRET, TARGET_REPO
```

### 2. Run (local)
```bash
npm install
npm run dev          # http://localhost:3000  (Tasks)  ·  /workflows
```
Or with Docker:
```bash
docker compose up --build
```

### 3. Expose for GitHub webhooks (local only)
GitHub must reach your server. Use a tunnel:
```bash
cloudflared tunnel --url http://localhost:3000
```
Then add a webhook on the target repo → **Settings → Webhooks**:
- Payload URL: `https://<your-url>/api/webhook`
- Content type: `application/json`
- Secret: your `GITHUB_WEBHOOK_SECRET`
- Events: **Issues** and **Pull requests**

### 4. Deploy (Render)
`render.yaml` is a blueprint: it provisions the web service **and** a Postgres database,
auto-wiring `DATABASE_URL`. In the Render dashboard, create a **Blueprint** from this
repo, then set the secret env vars (`DEVIN_API_KEY`, `DEVIN_ORG_ID`,
`GITHUB_WEBHOOK_SECRET`). Point the GitHub webhook at
`https://<service>.onrender.com/api/webhook`.

---

## Simulating the workflow

**Manual remediation:** create an issue in the target repo, add the `devin` label, and
watch the Tasks dashboard: `queued → running → pr_open`. Merge the PR → `done`.

**Autonomous workflow:** open `/workflows`, click **Run Code Quality Workflow**. Devin
scans the repo, files ~3 issues, and remediation begins automatically. Flip the
**Auto-run hourly** toggle to let it run on a schedule.

Helper scripts:
```bash
npx tsx scripts/db-inspect.ts   # dump tasks + deliveries
npx tsx scripts/db-check.ts     # verify DB connectivity + schema
npx tsx scripts/test-parse.ts   # unit test PR-body parsing
```

---

## Next steps (production)

- Auto-merge remediation PRs once CI is green (human-in-the-loop for risky changes)
- Drive discovery from scan results (Snyk / Trivy / Dependabot) instead of a prompt
- Route the PR-review-comment loop back to Devin via the session `messages` endpoint
- Scale across many repos; per-repo workflows and policies
- Richer analytics (per-author attribution, ACU cost dashboards)

-- Schema for the Devin orchestrator. Idempotent: safe to run on every boot.

-- One row per issue we are remediating. This table is the single source of
-- truth for both the state machine and the dashboard/metrics.
CREATE TABLE IF NOT EXISTS tasks (
  id               SERIAL PRIMARY KEY,
  repo             TEXT        NOT NULL,           -- "ericyhliu/superset"
  issue_number     INTEGER     NOT NULL,
  issue_title      TEXT        NOT NULL,
  issue_url        TEXT        NOT NULL,

  devin_session_id TEXT,                           -- null until a session is created
  status           TEXT        NOT NULL DEFAULT 'queued',
  status_detail    TEXT,                           -- raw status string from Devin
  pr_url           TEXT,                           -- null until the PR opens
  error            TEXT,                           -- failure reason, if any

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),  -- issue received
  dispatched_at    TIMESTAMPTZ,                    -- Devin session created
  pr_opened_at     TIMESTAMPTZ,                    -- PR webhook arrived
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One task (and therefore one Devin session) per issue. The webhook handler
  -- relies on this for idempotency via INSERT ... ON CONFLICT DO NOTHING.
  UNIQUE (repo, issue_number)
);

-- Dumb idempotency log: dedupes redelivered GitHub webhooks across all event
-- types. The handler inserts the X-GitHub-Delivery id first; a conflict means
-- "already processed, ignore".
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  delivery_id  TEXT PRIMARY KEY,
  event        TEXT,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

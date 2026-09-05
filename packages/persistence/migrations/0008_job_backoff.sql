-- 0008_job_backoff.sql
-- Two reliability gaps found in a production-readiness audit of the job runner.
--
-- 1. NO BACKOFF. A failed job went straight back to PENDING and was re-claimed on the
--    next poll, so a poison job burned its whole attempt budget in a few seconds and a
--    transient outage got no time to recover. `available_at` gates re-claiming.
--
-- 2. STUCK JOBS WERE INVISIBLE. `reclaimAbandoned` only reset jobs below the attempt
--    ceiling, so a job whose worker died on its final attempt stayed CLAIMED forever:
--    not running, not failed, not visible to anyone. Those are now abandoned explicitly
--    with a failure code, which is the difference between a job that failed and a job
--    that disappeared.
--
-- Additive and non-destructive: existing rows default to available immediately, which is
-- exactly their current behaviour.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP INDEX IF EXISTS jobs_claimable_idx;
CREATE INDEX IF NOT EXISTS jobs_claimable_idx ON jobs (status, available_at, created_at);

-- Operational visibility: which jobs are stuck, retrying or abandoned, at a glance.
CREATE INDEX IF NOT EXISTS jobs_stuck_idx ON jobs (status, heartbeat_at)
  WHERE status = 'CLAIMED';

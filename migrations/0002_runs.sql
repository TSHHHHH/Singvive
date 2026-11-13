-- Server-issued run registrations. A score is only accepted against a run the
-- Worker handed out, once, and only after a plausible amount of real time.
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  seed TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  submitted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_runs_ip ON runs (ip_hash, started_at);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs (started_at);

-- Additive and nullable so the previous Worker keeps inserting while this rolls out.
ALTER TABLE scores ADD COLUMN kills INTEGER;
ALTER TABLE scores ADD COLUMN run_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_run ON scores (run_id) WHERE run_id IS NOT NULL;

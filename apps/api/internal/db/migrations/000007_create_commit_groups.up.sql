CREATE TYPE group_type AS ENUM ('feature', 'fix', 'breaking', 'chore', 'security', 'other');

CREATE TABLE commit_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id     UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  label       VARCHAR(255) NOT NULL,
  commit_ids  UUID[] NOT NULL,
  group_type  group_type NOT NULL DEFAULT 'other',
  summary     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_commit_groups_scan_id ON commit_groups(scan_id);
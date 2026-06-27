CREATE TYPE scan_status AS ENUM (
  'pending',
  'running',
  'filtering',
  'enriching',
  'reading_context',
  'chunking',
  'summarizing',
  'awaiting_approval',
  'approved',
  'delivering',
  'delivered',
  'failed',
  'cancelled'
);

CREATE TYPE scan_trigger AS ENUM ('scheduled', 'manual', 'webhook', 'cli');

CREATE TABLE scans (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id              UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  repository_id        UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  status               scan_status NOT NULL DEFAULT 'pending',
  triggered_by         scan_trigger NOT NULL,
  triggered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  scan_from            TIMESTAMPTZ NOT NULL,
  scan_to              TIMESTAMPTZ NOT NULL,
  commit_count         INTEGER NOT NULL DEFAULT 0,
  filtered_count       INTEGER NOT NULL DEFAULT 0,
  error                TEXT,
  config_snapshot      JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scans_team_id ON scans(team_id);
CREATE INDEX idx_scans_repository_id ON scans(repository_id);
CREATE INDEX idx_scans_status ON scans(status);
CREATE INDEX idx_scans_created_at ON scans(created_at DESC);
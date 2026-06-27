CREATE TABLE commits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id          UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  repository_id    UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  sha              VARCHAR(40) NOT NULL,
  message          TEXT NOT NULL,
  author_name      VARCHAR(255) NOT NULL,
  author_email     VARCHAR(255) NOT NULL,
  committed_at     TIMESTAMPTZ NOT NULL,
  pr_number        INTEGER,
  pr_title         TEXT,
  pr_description   TEXT,
  linked_issues    JSONB NOT NULL DEFAULT '[]',
  changed_files    JSONB NOT NULL DEFAULT '[]',
  diff             TEXT,
  codebase_context JSONB,
  is_noise         BOOLEAN NOT NULL DEFAULT false,
  is_bot           BOOLEAN NOT NULL DEFAULT false,
  is_breaking      BOOLEAN NOT NULL DEFAULT false,
  domain           VARCHAR(255),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(scan_id, sha)
);

CREATE INDEX idx_commits_scan_id ON commits(scan_id);
CREATE INDEX idx_commits_is_noise ON commits(is_noise);
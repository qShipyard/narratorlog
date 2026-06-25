CREATE TYPE git_provider AS ENUM ('github', 'gitlab', 'bitbucket', 'git_cli');

CREATE TABLE repositories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  provider        git_provider NOT NULL,
  provider_id     VARCHAR(255) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  full_name       VARCHAR(255) NOT NULL,
  url             TEXT NOT NULL,
  default_branch  VARCHAR(255) NOT NULL DEFAULT 'main',
  access_token    TEXT NOT NULL,
  webhook_secret  TEXT,
  config          JSONB NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_scanned_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(team_id, provider, provider_id)
);

CREATE INDEX idx_repositories_team_id ON repositories(team_id);
CREATE INDEX idx_repositories_is_active ON repositories(is_active);
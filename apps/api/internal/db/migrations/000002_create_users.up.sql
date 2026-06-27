CREATE TYPE user_role AS ENUM ('admin', 'reviewer', 'viewer');

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email       VARCHAR(255) NOT NULL UNIQUE,
  name        VARCHAR(255) NOT NULL,
  avatar_url  TEXT,
  role        user_role NOT NULL DEFAULT 'viewer',
  provider    VARCHAR(50) NOT NULL,
  provider_id VARCHAR(255) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(provider, provider_id)
);

CREATE INDEX idx_users_team_id ON users(team_id);
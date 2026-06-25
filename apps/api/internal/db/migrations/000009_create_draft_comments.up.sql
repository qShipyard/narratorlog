CREATE TABLE draft_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id   UUID NOT NULL REFERENCES audience_drafts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_draft_comments_draft_id ON draft_comments(draft_id);
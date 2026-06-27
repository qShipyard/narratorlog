CREATE TYPE draft_status AS ENUM ('draft', 'approved', 'rejected', 'delivered');

CREATE TABLE audience_drafts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id        UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  audience_id    VARCHAR(100) NOT NULL,
  tone           VARCHAR(100) NOT NULL,
  content        TEXT NOT NULL,
  edited_content TEXT,
  status         draft_status NOT NULL DEFAULT 'draft',
  approved_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(scan_id, audience_id)
);

CREATE INDEX idx_audience_drafts_scan_id ON audience_drafts(scan_id);
CREATE INDEX idx_audience_drafts_status ON audience_drafts(status);
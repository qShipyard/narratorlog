CREATE TYPE delivery_status AS ENUM ('pending', 'success', 'failed');

CREATE TABLE deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id      UUID NOT NULL REFERENCES audience_drafts(id) ON DELETE CASCADE,
  output_plugin VARCHAR(100) NOT NULL,
  status        delivery_status NOT NULL DEFAULT 'pending',
  response      JSONB,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  delivered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deliveries_draft_id ON deliveries(draft_id);
CREATE INDEX idx_deliveries_status ON deliveries(status);
-- name: CreateAudienceDraft :one
INSERT INTO audience_drafts (scan_id, audience_id, tone, content)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListDraftsByScan :many
SELECT * FROM audience_drafts
WHERE scan_id = $1
ORDER BY created_at ASC;

-- name: GetDraftByID :one
SELECT * FROM audience_drafts WHERE id = $1;

-- name: UpdateDraftContent :one
UPDATE audience_drafts
SET edited_content = $1, updated_at = now()
WHERE id = $2
RETURNING *;

-- name: ApproveDraft :one
UPDATE audience_drafts
SET
  status      = 'approved',
  approved_by = $1,
  approved_at = now(),
  updated_at  = now()
WHERE id = $2
RETURNING *;

-- name: RejectDraft :one
UPDATE audience_drafts
SET status = 'rejected', updated_at = now()
WHERE id = $1
RETURNING *;

-- name: MarkDraftDelivered :exec
UPDATE audience_drafts
SET status = 'delivered', updated_at = now()
WHERE id = $1;

-- name: CountPendingDraftsByScan :one
SELECT COUNT(*) FROM audience_drafts
WHERE scan_id = $1 AND status = 'draft';

-- name: AllDraftsApproved :one
SELECT COUNT(*) FILTER (WHERE status != 'approved') = 0 AS all_approved
FROM audience_drafts
WHERE scan_id = $1;
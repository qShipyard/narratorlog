-- name: CreateScan :one
INSERT INTO scans (
  team_id, repository_id, status, triggered_by,
  triggered_by_user_id, scan_from, scan_to, config_snapshot
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetScanByID :one
SELECT * FROM scans WHERE id = $1;

-- name: ListScansByTeam :many
SELECT * FROM scans
WHERE team_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: ListScansByRepository :many
SELECT * FROM scans
WHERE repository_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: UpdateScanStatus :exec
UPDATE scans
SET status = $1, error = NULL, updated_at = now()
WHERE id = $2;

-- name: UpdateScanStatusWithError :exec
UPDATE scans
SET status = $1, error = $2, updated_at = now()
WHERE id = $3;

-- name: UpdateScanCounts :exec
UPDATE scans
SET commit_count = $1, filtered_count = $2, updated_at = now()
WHERE id = $3;

-- name: CountPendingApprovalsByTeam :one
SELECT COUNT(*) FROM scans
WHERE team_id = $1 AND status = 'awaiting_approval';
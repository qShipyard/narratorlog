-- name: CreateCommitGroup :one
INSERT INTO commit_groups (scan_id, label, commit_ids, group_type)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListCommitGroupsByScan :many
SELECT * FROM commit_groups
WHERE scan_id = $1
ORDER BY created_at ASC;

-- name: UpdateCommitGroupSummary :exec
UPDATE commit_groups
SET summary = $1
WHERE id = $2;
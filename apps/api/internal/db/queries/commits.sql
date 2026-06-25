-- name: CreateCommit :one
INSERT INTO commits (
  scan_id, repository_id, sha, message, author_name, author_email,
  committed_at, pr_number, pr_title, pr_description, linked_issues,
  changed_files, diff, is_noise, is_bot, is_breaking, domain
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
RETURNING *;

-- name: ListCommitsByScan :many
SELECT * FROM commits
WHERE scan_id = $1 AND is_noise = false
ORDER BY committed_at ASC;

-- name: ListAllCommitsByScan :many
SELECT * FROM commits
WHERE scan_id = $1
ORDER BY committed_at ASC;

-- name: UpdateCommitEnrichment :exec
UPDATE commits
SET
  pr_title       = $1,
  pr_description = $2,
  linked_issues  = $3,
  is_breaking    = $4,
  domain         = $5
WHERE id = $6;

-- name: UpdateCommitContext :exec
UPDATE commits
SET codebase_context = $1
WHERE id = $2;

-- name: GetCommitSHAsByScan :many
SELECT sha FROM commits WHERE scan_id = $1;

-- name: GetKnownSHAsByRepository :many
SELECT DISTINCT sha FROM commits
WHERE repository_id = $1;
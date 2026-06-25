-- name: CreateDraftComment :one
INSERT INTO draft_comments (draft_id, user_id, content)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListCommentsByDraft :many
SELECT
  dc.*,
  u.name  AS user_name,
  u.avatar_url AS user_avatar
FROM draft_comments dc
JOIN users u ON u.id = dc.user_id
WHERE dc.draft_id = $1
ORDER BY dc.created_at ASC;

-- name: DeleteDraftComment :exec
DELETE FROM draft_comments
WHERE id = $1 AND user_id = $2;
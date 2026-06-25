-- name: CreateAuditLog :exec
INSERT INTO audit_log (team_id, user_id, action, entity_type, entity_id, metadata)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: ListAuditLogByTeam :many
SELECT * FROM audit_log
WHERE team_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: ListAuditLogByEntity :many
SELECT * FROM audit_log
WHERE entity_type = $1 AND entity_id = $2
ORDER BY created_at DESC;
-- name: CreateRepository :one
INSERT INTO repositories (
  team_id, provider, provider_id, name, full_name,
  url, default_branch, access_token, webhook_secret, config
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: GetRepositoryByID :one
SELECT * FROM repositories
WHERE id = $1;

-- name: ListRepositoriesByTeam :many
SELECT * FROM repositories
WHERE team_id = $1 AND is_active = true
ORDER BY created_at ASC;

-- name: UpdateRepositoryConfig :one
UPDATE repositories
SET config = $1, updated_at = now()
WHERE id = $2
RETURNING *;

-- name: UpdateRepositoryLastScanned :exec
UPDATE repositories
SET last_scanned_at = now(), updated_at = now()
WHERE id = $1;

-- name: DeactivateRepository :exec
UPDATE repositories
SET is_active = false, updated_at = now()
WHERE id = $1;

-- name: GetRepositoryByProviderID :one
SELECT * FROM repositories
WHERE team_id = $1 AND provider = $2 AND provider_id = $3;
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

-- name: ListDueRepos :many
-- Active repos whose cadence says they're due for another scan, based on when
-- they last ran. Drives the automated due-scanner tick.
SELECT * FROM repositories
WHERE is_active = true
  AND config->>'cadence' IN ('daily', 'weekly', 'monthly')
  AND (
    last_scanned_at IS NULL
    OR (config->>'cadence' = 'daily'   AND last_scanned_at < now() - interval '1 day')
    OR (config->>'cadence' = 'weekly'  AND last_scanned_at < now() - interval '7 days')
    OR (config->>'cadence' = 'monthly' AND last_scanned_at < now() - interval '1 month')
  );
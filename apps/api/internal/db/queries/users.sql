-- name: CreateUser :one
INSERT INTO users (team_id, email, name, avatar_url, role, provider, provider_id)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users
WHERE id = $1;

-- name: GetUserByEmail :one
SELECT * FROM users
WHERE email = $1;

-- name: GetUserByProvider :one
SELECT * FROM users
WHERE provider = $1 AND provider_id = $2;

-- name: ListUsersByTeam :many
SELECT * FROM users
WHERE team_id = $1
ORDER BY created_at ASC;

-- name: UpdateUserRole :one
UPDATE users
SET role = $1, updated_at = now()
WHERE id = $2
RETURNING *;

-- name: UpsertUser :one
INSERT INTO users (team_id, email, name, avatar_url, role, provider, provider_id)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (provider, provider_id) DO UPDATE
SET
  name       = EXCLUDED.name,
  avatar_url = EXCLUDED.avatar_url,
  updated_at = now()
RETURNING *;

-- name: DeleteUser :exec
DELETE FROM users WHERE id = $1;
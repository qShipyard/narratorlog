-- name: CreateTeam :one
INSERT INTO teams (name, slug)
VALUES ($1, $2)
RETURNING *;

-- name: GetTeamBySlug :one
SELECT * FROM teams
WHERE slug = $1;

-- name: GetTeamByID :one
SELECT * FROM teams
WHERE id = $1;

-- name: UpdateTeam :one
UPDATE teams
SET name = $1, updated_at = now()
WHERE id = $2
RETURNING *;
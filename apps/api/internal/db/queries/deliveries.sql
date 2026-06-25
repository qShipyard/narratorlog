-- name: CreateDelivery :one
INSERT INTO deliveries (draft_id, output_plugin)
VALUES ($1, $2)
RETURNING *;

-- name: ListDeliveriesByDraft :many
SELECT * FROM deliveries
WHERE draft_id = $1
ORDER BY created_at ASC;

-- name: UpdateDeliverySuccess :exec
UPDATE deliveries
SET
  status       = 'success',
  response     = $1,
  delivered_at = now(),
  attempt_count = attempt_count + 1,
  updated_at   = now()
WHERE id = $2;

-- name: UpdateDeliveryFailed :exec
UPDATE deliveries
SET
  status        = 'failed',
  response      = $1,
  attempt_count = attempt_count + 1,
  updated_at    = now()
WHERE id = $2;
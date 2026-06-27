package handlers

import (
	"context"

	"github.com/google/uuid"
	"github.com/narratorlog/narratorlog/internal/teamconfig"
)

// routingSnapshot returns the team's delivery routing as a config_snapshot blob
// ({"outputs":[...]}). On any failure it returns "{}" so the scan still runs;
// delivery treats an empty snapshot as "no outputs configured".
func (h *Handler) routingSnapshot(ctx context.Context, teamID uuid.UUID) []byte {
	raw, err := h.queries.GetTeamConfig(ctx, teamID)
	if err != nil {
		return []byte("{}")
	}
	cfg, err := teamconfig.Parse(raw)
	if err != nil {
		return []byte("{}")
	}
	snap, err := cfg.RoutingSnapshot()
	if err != nil {
		return []byte("{}")
	}
	return snap
}

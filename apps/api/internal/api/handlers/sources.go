package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/narratorlog/narratorlog/internal/teamconfig"
)

func (h *Handler) GetSources(c *gin.Context) {
	teamID, err := uuid.Parse(c.GetString("team_id"))
	if err != nil {
		errorResponse(c, http.StatusUnauthorized, "INVALID_SESSION", "Invalid session.")
		return
	}

	raw, err := h.queries.GetTeamConfig(c.Request.Context(), teamID)
	if err != nil {
		errorResponse(c, http.StatusNotFound, "NOT_FOUND", "Team not found.")
		return
	}

	cfg, err := teamconfig.Parse(raw)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to parse config.")
		return
	}

	c.JSON(http.StatusOK, cfg.View().Sources)
}

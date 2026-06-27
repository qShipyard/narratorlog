package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	db "github.com/narratorlog/narratorlog/internal/db"
	"github.com/narratorlog/narratorlog/internal/teamconfig"
)

func (h *Handler) GetTeamConfig(c *gin.Context) {
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

	c.JSON(http.StatusOK, cfg.View())
}

func (h *Handler) UpdateTeamConfig(c *gin.Context) {
	teamID, err := uuid.Parse(c.GetString("team_id"))
	if err != nil {
		errorResponse(c, http.StatusUnauthorized, "INVALID_SESSION", "Invalid session.")
		return
	}

	var req teamconfig.UpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
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

	if err := cfg.ApplyUpdate(req, h.encryptor); err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to apply config.")
		return
	}

	out, err := cfg.Marshal()
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to encode config.")
		return
	}

	if err := h.queries.UpdateTeamConfig(c.Request.Context(), db.UpdateTeamConfigParams{
		Config: out,
		ID:     teamID,
	}); err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to save config.")
		return
	}

	c.JSON(http.StatusOK, cfg.View())
}

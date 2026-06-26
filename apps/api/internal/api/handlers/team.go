package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	db "github.com/narratorlog/narratorlog/internal/db"
)

func (h *Handler) GetTeam(c *gin.Context) {
	teamID, err := uuid.Parse(c.GetString("team_id"))
	if err != nil {
		errorResponse(c, http.StatusUnauthorized, "INVALID_SESSION", "Invalid session.")
		return
	}

	team, err := h.queries.GetTeamByID(c.Request.Context(), teamID)
	if err != nil {
		errorResponse(c, http.StatusNotFound, "NOT_FOUND", "Team not found.")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":   team.ID,
		"name": team.Name,
		"slug": team.Slug,
	})
}

func (h *Handler) ListMembers(c *gin.Context) {
	teamID, err := uuid.Parse(c.GetString("team_id"))
	if err != nil {
		errorResponse(c, http.StatusUnauthorized, "INVALID_SESSION", "Invalid session.")
		return
	}

	members, err := h.queries.ListUsersByTeam(c.Request.Context(), teamID)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to fetch members.")
		return
	}

	data := make([]gin.H, len(members))
	for i, m := range members {
		data[i] = gin.H{
			"id":         m.ID,
			"name":       m.Name,
			"email":      m.Email,
			"role":       m.Role,
			"avatar_url": m.AvatarUrl,
			"created_at": m.CreatedAt,
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": data})
}

func (h *Handler) InviteMember(c *gin.Context) {
	// TODO: send invite email — feat/invitations
	c.JSON(http.StatusNotImplemented, gin.H{"error": gin.H{"code": "NOT_IMPLEMENTED"}})
}

func (h *Handler) UpdateMemberRole(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid member ID.")
		return
	}

	var req struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}

	user, err := h.queries.UpdateUserRole(c.Request.Context(), db.UpdateUserRoleParams{
		Role: db.UserRole(req.Role),
		ID:   id,
	})
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to update role.")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":   user.ID,
		"role": user.Role,
	})
}

func (h *Handler) RemoveMember(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid member ID.")
		return
	}

	// Prevent self-removal
	selfID, _ := uuid.Parse(c.GetString("user_id"))
	if id == selfID {
		errorResponse(c, http.StatusBadRequest, "CANNOT_REMOVE_SELF", "You cannot remove yourself.")
		return
	}

	if err := h.queries.DeleteUser(c.Request.Context(), id); err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to remove member.")
		return
	}

	c.Status(http.StatusNoContent)
}

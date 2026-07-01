package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/narratorlog/narratorlog/internal/auth"
	db "github.com/narratorlog/narratorlog/internal/db"
)

var validRoles = map[string]db.UserRole{
	"admin":    db.UserRoleAdmin,
	"reviewer": db.UserRoleReviewer,
	"viewer":   db.UserRoleViewer,
}

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
	teamID, err := uuid.Parse(c.GetString("team_id"))
	if err != nil {
		errorResponse(c, http.StatusUnauthorized, "INVALID_SESSION", "Invalid session.")
		return
	}

	var req struct {
		Name  string `json:"name" binding:"required,min=2"`
		Email string `json:"email" binding:"required,email"`
		Role  string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}

	role, ok := validRoles[req.Role]
	if !ok {
		errorResponse(c, http.StatusBadRequest, "INVALID_ROLE", "Role must be admin, reviewer, or viewer.")
		return
	}

	email := strings.ToLower(req.Email)

	existing, err := h.queries.GetUserByEmail(c.Request.Context(), email)
	if err == nil {
		if existing.TeamID != teamID {
			errorResponse(c, http.StatusConflict, "EMAIL_TAKEN", "That email is already in use.")
			return
		}
		errorResponse(c, http.StatusConflict, "ALREADY_MEMBER", "This person is already on your team.")
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to check existing user.")
		return
	}

	tempPassword, err := generateTempPassword()
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to generate password.")
		return
	}

	hash, err := auth.HashPassword(tempPassword)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to hash password.")
		return
	}

	user, err := h.queries.CreateUserWithPassword(c.Request.Context(), db.CreateUserWithPasswordParams{
		TeamID:     teamID,
		Email:      email,
		Name:       req.Name,
		Role:       role,
		Provider:   "local",
		ProviderID: email,
		Password:   pgtype.Text{String: hash, Valid: true},
	})
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to create member.")
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":                 user.ID,
		"name":               user.Name,
		"email":              user.Email,
		"role":               user.Role,
		"temporary_password": tempPassword,
	})
}

func (h *Handler) UpdateMemberRole(c *gin.Context) {
	teamID, err := uuid.Parse(c.GetString("team_id"))
	if err != nil {
		errorResponse(c, http.StatusUnauthorized, "INVALID_SESSION", "Invalid session.")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid member ID.")
		return
	}

	member, err := h.queries.GetUserByID(c.Request.Context(), id)
	if err != nil || member.TeamID != teamID {
		errorResponse(c, http.StatusNotFound, "NOT_FOUND", "Member not found.")
		return
	}

	var req struct {
		Role string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}

	role, ok := validRoles[req.Role]
	if !ok {
		errorResponse(c, http.StatusBadRequest, "INVALID_ROLE", "Role must be admin, reviewer, or viewer.")
		return
	}

	user, err := h.queries.UpdateUserRole(c.Request.Context(), db.UpdateUserRoleParams{
		Role: role,
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
	teamID, err := uuid.Parse(c.GetString("team_id"))
	if err != nil {
		errorResponse(c, http.StatusUnauthorized, "INVALID_SESSION", "Invalid session.")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid member ID.")
		return
	}

	member, err := h.queries.GetUserByID(c.Request.Context(), id)
	if err != nil || member.TeamID != teamID {
		errorResponse(c, http.StatusNotFound, "NOT_FOUND", "Member not found.")
		return
	}

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

func generateTempPassword() (string, error) {
	b := make([]byte, 9)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

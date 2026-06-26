package handlers

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/narratorlog/narratorlog/internal/auth"
	db "github.com/narratorlog/narratorlog/internal/db"
)

type SetupRequest struct {
	TeamName  string `json:"team_name" binding:"required,min=2"`
	AdminName string `json:"admin_name" binding:"required,min=2"`
	Email     string `json:"email"      binding:"required,email"`
	Password  string `json:"password"   binding:"required,min=8"`
}

func (h *Handler) IsSetupComplete(c *gin.Context) {
	complete, err := h.queries.IsSetupComplete(c.Request.Context())
	if err != nil {
		// No teams yet — setup not complete
		c.JSON(http.StatusOK, gin.H{"setup_complete": false})
		return
	}
	c.JSON(http.StatusOK, gin.H{"setup_complete": complete})
}

func (h *Handler) Setup(c *gin.Context) {
	// Only allowed once
	complete, err := h.queries.IsSetupComplete(c.Request.Context())
	if err == nil && complete {
		errorResponse(c, http.StatusConflict, "ALREADY_SETUP", "This instance is already configured.")
		return
	}

	var req SetupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to hash password.")
		return
	}

	slug := slugify(req.TeamName)

	team, err := h.queries.CreateTeamWithSetup(c.Request.Context(), db.CreateTeamWithSetupParams{
		Name:          req.TeamName,
		Slug:          slug,
		SetupComplete: true,
	})
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to create team.")
		return
	}

	user, err := h.queries.CreateUserWithPassword(c.Request.Context(), db.CreateUserWithPasswordParams{
		TeamID:     team.ID,
		Email:      strings.ToLower(req.Email),
		Name:       req.AdminName,
		Role:       db.UserRoleAdmin,
		Provider:   "local",
		ProviderID: strings.ToLower(req.Email),
		Password:   pgtype.Text{String: hash, Valid: true},
	})
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to create admin user.")
		return
	}

	token, _, expiresAt, err := h.sessions.CreateToken(user.ID.String(), team.ID.String(), string(user.Role))
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to create session.")
		return
	}

	setCookie(c, "nl_session", token, expiresAt)

	c.JSON(http.StatusCreated, gin.H{
		"team": gin.H{"id": team.ID, "name": team.Name, "slug": team.Slug},
		"user": gin.H{"id": user.ID, "name": user.Name, "email": user.Email, "role": user.Role},
	})
}

var nonAlphanumeric = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(s string) string {
	lower := strings.ToLower(s)
	slug := nonAlphanumeric.ReplaceAllString(lower, "-")
	return strings.Trim(slug, "-")
}

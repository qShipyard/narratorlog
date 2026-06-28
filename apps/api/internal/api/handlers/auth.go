package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/narratorlog/narratorlog/internal/auth"
)

type LoginRequest struct {
	Email    string `json:"email"    binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}

	user, err := h.queries.GetUserByEmailWithPassword(c.Request.Context(), strings.ToLower(req.Email))
	if err != nil {
		// Deliberate vague message — don't leak whether email exists
		errorResponse(c, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Invalid email or password.")
		return
	}

	if !user.Password.Valid || !auth.CheckPassword(req.Password, user.Password.String) {
		errorResponse(c, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Invalid email or password.")
		return
	}

	token, _, expiresAt, err := h.sessions.CreateToken(user.ID.String(), user.TeamID.String(), string(user.Role))
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to create session.")
		return
	}

	setCookie(c, "nl_session", token, expiresAt)

	c.JSON(http.StatusOK, gin.H{
		"id":         user.ID,
		"email":      user.Email,
		"name":       user.Name,
		"role":       user.Role,
		"avatar_url": user.AvatarUrl,
	})
}

func (h *Handler) Logout(c *gin.Context) {
	c.SetCookie("nl_session", "", -1, "/", "", true, true)
	c.JSON(http.StatusOK, gin.H{"message": "Logged out."})
}

func (h *Handler) GetMe(c *gin.Context) {
	userID := c.GetString("user_id")

	id, err := uuid.Parse(userID)
	if err != nil {
		errorResponse(c, http.StatusUnauthorized, "INVALID_SESSION", "Invalid session.")
		return
	}

	user, err := h.queries.GetUserByID(c.Request.Context(), id)
	if err != nil {
		errorResponse(c, http.StatusNotFound, "USER_NOT_FOUND", "User not found.")
		return
	}

	team, err := h.queries.GetTeamByID(c.Request.Context(), user.TeamID)
	if err != nil {
		errorResponse(c, http.StatusNotFound, "TEAM_NOT_FOUND", "Team not found.")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":         user.ID,
		"email":      user.Email,
		"name":       user.Name,
		"avatar_url": user.AvatarUrl.String,
		"role":       user.Role,
		"team": gin.H{
			"id":   team.ID,
			"name": team.Name,
			"slug": team.Slug,
		},
	})
}

func setCookie(c *gin.Context, name, value string, expires time.Time) {
	maxAge := int(time.Until(expires).Seconds())
	c.SetCookie(name, value, maxAge, "/", "", true, true)
}

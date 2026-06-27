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

func (h *Handler) GitHubOAuthRedirect(c *gin.Context) {
	if h.github == nil {
		errorResponse(c, http.StatusServiceUnavailable, "GITHUB_NOT_CONFIGURED", "GitHub OAuth is not configured.")
		return
	}

	state, err := h.stateStore.Generate()
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to generate state.")
		return
	}

	c.Redirect(http.StatusTemporaryRedirect, h.github.AuthURL(state))
}

func (h *Handler) GitHubOAuthCallback(c *gin.Context) {
	if h.github == nil {
		errorResponse(c, http.StatusServiceUnavailable, "GITHUB_NOT_CONFIGURED", "GitHub OAuth is not configured.")
		return
	}

	state := c.Query("state")
	code := c.Query("code")

	if !h.stateStore.Validate(c.Request.Context(), state) {
		errorResponse(c, http.StatusBadRequest, "INVALID_STATE", "Invalid or expired OAuth state.")
		return
	}

	accessToken, err := h.github.Exchange(c.Request.Context(), code)
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "OAUTH_FAILED", "Failed to exchange OAuth code.")
		return
	}

	// Encrypt the token before storing in session cookie
	encryptedToken, err := h.encryptor.Encrypt(accessToken)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to encrypt token.")
		return
	}

	// Store encrypted token in a short-lived cookie
	// Used by ListAvailableRepos to fetch repos from GitHub
	c.SetCookie("gh_token", encryptedToken, 600, "/", "", true, true)

	// Redirect back to repositories page
	c.Redirect(http.StatusTemporaryRedirect, "/repositories?connected=github")
}

func setCookie(c *gin.Context, name, value string, expires time.Time) {
	maxAge := int(time.Until(expires).Seconds())
	c.SetCookie(name, value, maxAge, "/", "", true, true)
}

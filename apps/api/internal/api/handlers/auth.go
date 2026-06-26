package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
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
	teamID := c.GetString("team_id")
	role := c.GetString("role")

	c.JSON(http.StatusOK, gin.H{
		"id":      userID,
		"team_id": teamID,
		"role":    role,
	})
}

// GitHubOAuthRedirect initiates OAuth for connecting a GitHub repository.
// This is NOT for logging into narratorlog — it connects a git platform.
func (h *Handler) GitHubOAuthRedirect(c *gin.Context) {
	if h.cfg.GitHub.ClientID == "" {
		errorResponse(c, http.StatusServiceUnavailable, "GITHUB_NOT_CONFIGURED", "GitHub OAuth is not configured.")
		return
	}

	url := "https://github.com/login/oauth/authorize" +
		"?client_id=" + h.cfg.GitHub.ClientID +
		"&scope=repo,read:user" +
		"&redirect_uri=" + h.cfg.AppURL + "/auth/github/callback"

	c.Redirect(http.StatusTemporaryRedirect, url)
}

func (h *Handler) GitHubOAuthCallback(c *gin.Context) {
	// TODO: exchange code for token, store encrypted access token on repository
	errorResponse(c, http.StatusNotImplemented, "NOT_IMPLEMENTED", "GitHub OAuth callback not yet implemented.")
}

func setCookie(c *gin.Context, name, value string, expires time.Time) {
	maxAge := int(time.Until(expires).Seconds())
	c.SetCookie(name, value, maxAge, "/", "", true, true)
}

package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func (h *Handler) GitHubOAuthRedirect(c *gin.Context) {
	if h.cfg.GitHub.ClientID == "" {
		errorResponse(c, http.StatusServiceUnavailable, "GITHUB_NOT_CONFIGURED", "GitHub OAuth is not configured.")
		return
	}

	url := "https://github.com/login/oauth/authorize" +
		"?client_id=" + h.cfg.GitHub.ClientID +
		"&scope=repo,read:user,user:email" +
		"&redirect_uri=" + h.cfg.AppURL + "/auth/github/callback"

	c.Redirect(http.StatusTemporaryRedirect, url)
}

func (h *Handler) GitHubOAuthCallback(c *gin.Context) {
	// TODO: exchange code for token, upsert user, create session
	// Stubbed until GitHub OAuth client is wired
	errorResponse(c, http.StatusNotImplemented, "NOT_IMPLEMENTED", "GitHub OAuth callback not yet implemented.")
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

func setCookie(c *gin.Context, name, value string, expires time.Time) {
	maxAge := int(time.Until(expires).Seconds())
	c.SetCookie(name, value, maxAge, "/", "", true, true)
}

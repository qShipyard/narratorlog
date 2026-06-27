package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/narratorlog/narratorlog/internal/auth"
)

const (
	CtxUserID = "user_id"
	CtxTeamID = "team_id"
	CtxRole   = "role"
)

func RequireAuth(sessions *auth.SessionManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := extractToken(c)
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{"code": "UNAUTHORIZED", "message": "Authentication required."},
			})
			return
		}

		claims, err := sessions.ValidateToken(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{"code": "INVALID_TOKEN", "message": "Invalid or expired session."},
			})
			return
		}

		c.Set(CtxUserID, claims.UserID)
		c.Set(CtxTeamID, claims.TeamID)
		c.Set(CtxRole, claims.Role)
		c.Next()
	}
}

func RequireRole(roles ...string) gin.HandlerFunc {
	allowed := make(map[string]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}

	return func(c *gin.Context) {
		role := c.GetString(CtxRole)
		if !allowed[role] {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": gin.H{"code": "FORBIDDEN", "message": "Insufficient permissions."},
			})
			return
		}
		c.Next()
	}
}

func extractToken(c *gin.Context) string {
	// Cookie first
	if cookie, err := c.Cookie("nl_session"); err == nil && cookie != "" {
		return cookie
	}

	// Bearer token fallback (for CLI)
	header := c.GetHeader("Authorization")
	if strings.HasPrefix(header, "Bearer ") {
		return strings.TrimPrefix(header, "Bearer ")
	}

	return ""
}

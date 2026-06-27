package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// CORS allows the configured web origin to make credentialed requests.
// In production the web app and API share an origin behind nginx, so this only
// matters for split-origin setups: local dev and the quickstart compose, where
// the web runs on :3000 and the API on :8080. Credentialed requests forbid a
// wildcard origin, so the exact allowed origin is echoed back.
func CORS(allowedOrigin string) gin.HandlerFunc {
	allowed := strings.TrimRight(allowedOrigin, "/")

	return func(c *gin.Context) {
		if origin := c.GetHeader("Origin"); origin != "" && origin == allowed {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
			c.Header("Access-Control-Max-Age", "600")
			c.Header("Vary", "Origin")
		}

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

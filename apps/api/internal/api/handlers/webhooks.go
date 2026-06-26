package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) GitHubWebhook(c *gin.Context) {
	// TODO: validate HMAC-SHA256 signature
	// TODO: parse event type, enqueue scan job
	c.JSON(http.StatusOK, gin.H{"received": true})
}

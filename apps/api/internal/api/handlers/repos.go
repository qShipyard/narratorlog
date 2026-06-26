package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) ListRepos(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": []any{}})
}

func (h *Handler) ConnectRepo(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": gin.H{"code": "NOT_IMPLEMENTED"}})
}

func (h *Handler) ListAvailableRepos(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": []any{}})
}

func (h *Handler) GetRepo(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": gin.H{"code": "NOT_IMPLEMENTED"}})
}

func (h *Handler) UpdateRepo(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": gin.H{"code": "NOT_IMPLEMENTED"}})
}

func (h *Handler) DisconnectRepo(c *gin.Context) {
	c.Status(http.StatusNoContent)
}

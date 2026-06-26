package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) UpdateDraft(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": gin.H{"code": "NOT_IMPLEMENTED"}})
}

func (h *Handler) ApproveDraft(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": gin.H{"code": "NOT_IMPLEMENTED"}})
}

func (h *Handler) RejectDraft(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": gin.H{"code": "NOT_IMPLEMENTED"}})
}

func (h *Handler) RegenerateDraft(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": gin.H{"code": "NOT_IMPLEMENTED"}})
}

func (h *Handler) ListComments(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": []any{}})
}

func (h *Handler) CreateComment(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": gin.H{"code": "NOT_IMPLEMENTED"}})
}

func (h *Handler) DeleteComment(c *gin.Context) {
	c.Status(http.StatusNoContent)
}

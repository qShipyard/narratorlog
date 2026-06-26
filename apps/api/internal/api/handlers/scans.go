package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) ListScans(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": []any{}})
}

func (h *Handler) TriggerScan(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": gin.H{"code": "NOT_IMPLEMENTED"}})
}

func (h *Handler) GetScan(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": gin.H{"code": "NOT_IMPLEMENTED"}})
}

func (h *Handler) ListScanCommits(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": []any{}})
}

func (h *Handler) ListScanGroups(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": []any{}})
}

func (h *Handler) ListScanDrafts(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": []any{}})
}

func (h *Handler) DeliverScan(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": gin.H{"code": "NOT_IMPLEMENTED"}})
}

func (h *Handler) CancelScan(c *gin.Context) {
	c.Status(http.StatusNoContent)
}

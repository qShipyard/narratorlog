package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) GetTeam(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": gin.H{"code": "NOT_IMPLEMENTED"}})
}

func (h *Handler) ListMembers(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": []any{}})
}

func (h *Handler) InviteMember(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": gin.H{"code": "NOT_IMPLEMENTED"}})
}

func (h *Handler) UpdateMemberRole(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": gin.H{"code": "NOT_IMPLEMENTED"}})
}

func (h *Handler) RemoveMember(c *gin.Context) {
	c.Status(http.StatusNoContent)
}

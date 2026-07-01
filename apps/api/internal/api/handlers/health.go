package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
)

func (h *Handler) Health(c *gin.Context) {
	ctx := c.Request.Context()
	checks := gin.H{}
	degraded := false

	if err := h.pool.Ping(ctx); err != nil {
		checks["database"] = gin.H{"ok": false}
		degraded = true
	} else {
		checks["database"] = gin.H{"ok": true}
	}

	inspector := asynq.NewInspector(h.redisOpt)
	defer inspector.Close()

	if _, err := inspector.GetQueueInfo("default"); err != nil {
		checks["redis"] = gin.H{"ok": false}
		degraded = true
	} else {
		checks["redis"] = gin.H{"ok": true}
	}

	servers, err := inspector.Servers()
	workerActive := err == nil && len(servers) > 0
	checks["worker"] = gin.H{
		"ok":     workerActive,
		"active": len(servers),
	}
	if !workerActive {
		degraded = true
	}

	status := "ok"
	if degraded {
		status = "degraded"
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  status,
		"version": "0.1.0",
		"checks":  checks,
	})
}

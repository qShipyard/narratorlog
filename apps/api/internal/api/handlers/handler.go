package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"github.com/narratorlog/narratorlog/internal/auth"
	"github.com/narratorlog/narratorlog/internal/config"
	db "github.com/narratorlog/narratorlog/internal/db"
)

type Handler struct {
	queries   *db.Queries
	sessions  *auth.SessionManager
	encryptor *auth.Encryptor
	cfg       *config.Config
	asynq     *asynq.Client
}

func NewHandler(
	queries *db.Queries,
	sessions *auth.SessionManager,
	encryptor *auth.Encryptor,
	cfg *config.Config,
	asynqClient *asynq.Client,
) *Handler {
	return &Handler{
		queries:   queries,
		sessions:  sessions,
		encryptor: encryptor,
		cfg:       cfg,
		asynq:     asynqClient,
	}
}

func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"version": "0.1.0",
	})
}

func errorResponse(c *gin.Context, status int, code, message string) {
	c.JSON(status, gin.H{
		"error": gin.H{
			"code":    code,
			"message": message,
		},
	})
}

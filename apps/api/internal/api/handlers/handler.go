package handlers

import (
	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
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
	pool      *pgxpool.Pool
	redisOpt  asynq.RedisConnOpt
}

func NewHandler(
	queries *db.Queries,
	sessions *auth.SessionManager,
	encryptor *auth.Encryptor,
	cfg *config.Config,
	asynqClient *asynq.Client,
	pool *pgxpool.Pool,
	redisOpt asynq.RedisConnOpt,
) *Handler {
	return &Handler{
		queries:   queries,
		sessions:  sessions,
		encryptor: encryptor,
		cfg:       cfg,
		asynq:     asynqClient,
		pool:      pool,
		redisOpt:  redisOpt,
	}
}

func errorResponse(c *gin.Context, status int, code, message string) {
	c.JSON(status, gin.H{
		"error": gin.H{
			"code":    code,
			"message": message,
		},
	})
}

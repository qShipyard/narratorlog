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
	queries    *db.Queries
	sessions   *auth.SessionManager
	encryptor  *auth.Encryptor
	cfg        *config.Config
	asynq      *asynq.Client
	github     *auth.GitHubOAuthClient
	stateStore *auth.InMemoryStateStore
}

func NewHandler(
	queries *db.Queries,
	sessions *auth.SessionManager,
	encryptor *auth.Encryptor,
	cfg *config.Config,
	asynqClient *asynq.Client,
) *Handler {
	var githubClient *auth.GitHubOAuthClient
	if cfg.GitHub.ClientID != "" {
		githubClient = auth.NewGitHubOAuthClient(
			cfg.GitHub.ClientID,
			cfg.GitHub.ClientSecret,
			cfg.AppURL+"/auth/github/callback",
		)
	}

	return &Handler{
		queries:    queries,
		sessions:   sessions,
		encryptor:  encryptor,
		cfg:        cfg,
		asynq:      asynqClient,
		github:     githubClient,
		stateStore: auth.NewInMemoryStateStore(),
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

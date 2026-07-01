package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/narratorlog/narratorlog/internal/db"
	"github.com/narratorlog/narratorlog/internal/sources"
	"github.com/narratorlog/narratorlog/internal/teamconfig"
)

func (h *Handler) ListRepos(c *gin.Context) {
	teamID, err := uuid.Parse(c.GetString("team_id"))
	if err != nil {
		errorResponse(c, http.StatusUnauthorized, "INVALID_SESSION", "Invalid session.")
		return
	}

	repos, err := h.queries.ListRepositoriesByTeam(c.Request.Context(), teamID)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to fetch repositories.")
		return
	}

	data := make([]gin.H, len(repos))
	for i, r := range repos {
		data[i] = repoToJSON(r)
	}

	c.JSON(http.StatusOK, gin.H{"data": data})
}

func (h *Handler) GetRepo(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid repository ID.")
		return
	}

	repo, err := h.queries.GetRepositoryByID(c.Request.Context(), id)
	if err != nil {
		errorResponse(c, http.StatusNotFound, "NOT_FOUND", "Repository not found.")
		return
	}

	c.JSON(http.StatusOK, repoToJSON(repo))
}

func (h *Handler) ConnectRepo(c *gin.Context) {
	teamID, err := uuid.Parse(c.GetString("team_id"))
	if err != nil {
		errorResponse(c, http.StatusUnauthorized, "INVALID_SESSION", "Invalid session.")
		return
	}

	var req struct {
		Provider      string `json:"provider"      binding:"required"`
		ProviderID    string `json:"provider_id"   binding:"required"`
		FullName      string `json:"full_name"     binding:"required"`
		URL           string `json:"url"           binding:"required"`
		DefaultBranch string `json:"default_branch"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}

	if req.DefaultBranch == "" {
		req.DefaultBranch = "main"
	}

	raw, err := h.queries.GetTeamConfig(c.Request.Context(), teamID)
	if err != nil {
		errorResponse(c, http.StatusNotFound, "NOT_FOUND", "Team not found.")
		return
	}

	cfg, err := teamconfig.Parse(raw)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to parse config.")
		return
	}

	token, baseURL, ok, err := cfg.DecryptedSource(req.Provider, h.encryptor)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to decrypt source token.")
		return
	}
	if !ok {
		errorResponse(c, http.StatusConflict, "SOURCE_NOT_CONNECTED", "No token configured for this provider. Go to Settings → Sources.")
		return
	}

	webhookSecret, err := generateWebhookSecret()
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to generate webhook secret.")
		return
	}

	name := extractRepoName(req.FullName)

	repo, err := h.queries.CreateRepository(c.Request.Context(), db.CreateRepositoryParams{
		TeamID:        teamID,
		Provider:      db.GitProvider(req.Provider),
		ProviderID:    req.ProviderID,
		Name:          name,
		FullName:      req.FullName,
		Url:           req.URL,
		DefaultBranch: req.DefaultBranch,
		AccessToken:   pgtype.Text{},
		WebhookSecret: pgtype.Text{String: webhookSecret, Valid: true},
		Config:        []byte("{}"),
	})
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to connect repository.")
		return
	}

	if client, ok := sources.For(req.Provider); ok {
		parts := splitFullName(req.FullName)
		if len(parts) == 2 {
			webhookURL := fmt.Sprintf("%s/webhooks/%s?repo=%s", h.cfg.AppURL, req.Provider, repo.ID)
			if err := client.RegisterWebhook(
				c.Request.Context(),
				token, baseURL,
				parts[0], parts[1],
				webhookURL,
				webhookSecret,
			); err != nil {
				c.Header("X-Webhook-Warning", "Webhook registration failed: "+err.Error())
			}
		}
	}

	c.JSON(http.StatusCreated, repoToJSON(repo))
}

func (h *Handler) UpdateRepo(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid repository ID.")
		return
	}

	var req struct {
		Config map[string]any `json:"config"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}

	configJSON, err := marshalJSON(req.Config)
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_CONFIG", "Invalid config.")
		return
	}

	repo, err := h.queries.UpdateRepositoryConfig(c.Request.Context(), db.UpdateRepositoryConfigParams{
		Config: configJSON,
		ID:     id,
	})
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to update repository.")
		return
	}

	c.JSON(http.StatusOK, repoToJSON(repo))
}

func (h *Handler) DisconnectRepo(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid repository ID.")
		return
	}

	if err := h.queries.DeactivateRepository(c.Request.Context(), id); err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to disconnect repository.")
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *Handler) ListAvailableRepos(c *gin.Context) {
	teamID, err := uuid.Parse(c.GetString("team_id"))
	if err != nil {
		errorResponse(c, http.StatusUnauthorized, "INVALID_SESSION", "Invalid session.")
		return
	}

	provider := c.DefaultQuery("provider", "github")

	raw, err := h.queries.GetTeamConfig(c.Request.Context(), teamID)
	if err != nil {
		errorResponse(c, http.StatusNotFound, "NOT_FOUND", "Team not found.")
		return
	}

	cfg, err := teamconfig.Parse(raw)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to parse config.")
		return
	}

	token, baseURL, ok, err := cfg.DecryptedSource(provider, h.encryptor)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to decrypt source token.")
		return
	}
	if !ok {
		errorResponse(c, http.StatusConflict, "SOURCE_NOT_CONNECTED", "No token configured for this provider. Go to Settings → Sources.")
		return
	}

	client, ok := sources.For(provider)
	if !ok {
		errorResponse(c, http.StatusBadRequest, "UNKNOWN_PROVIDER", "Unknown git provider.")
		return
	}

	repos, err := client.ListRepos(c.Request.Context(), token, baseURL)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SOURCE_ERROR", "Failed to fetch repositories from provider.")
		return
	}

	connected, _ := h.queries.ListRepositoriesByTeam(c.Request.Context(), teamID)
	connectedIDs := make(map[string]bool)
	for _, r := range connected {
		connectedIDs[r.ProviderID] = true
	}

	data := make([]gin.H, len(repos))
	for i, r := range repos {
		data[i] = gin.H{
			"provider_id":       r.ProviderID,
			"full_name":         r.FullName,
			"name":              r.Name,
			"url":               r.URL,
			"default_branch":    r.DefaultBranch,
			"private":           r.Private,
			"already_connected": connectedIDs[r.ProviderID],
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": data})
}

func repoToJSON(r db.Repository) gin.H {
	return gin.H{
		"id":              r.ID,
		"name":            r.Name,
		"full_name":       r.FullName,
		"url":             r.Url,
		"provider":        r.Provider,
		"default_branch":  r.DefaultBranch,
		"is_active":       r.IsActive,
		"last_scanned_at": r.LastScannedAt,
		"config":          r.Config,
	}
}

func marshalJSON(v any) ([]byte, error) {
	return json.Marshal(v)
}

func generateWebhookSecret() (string, error) {
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func extractRepoName(fullName string) string {
	for i := len(fullName) - 1; i >= 0; i-- {
		if fullName[i] == '/' {
			return fullName[i+1:]
		}
	}
	return fullName
}

func splitFullName(fullName string) []string {
	for i, c := range fullName {
		if c == '/' {
			return []string{fullName[:i], fullName[i+1:]}
		}
	}
	return []string{fullName}
}

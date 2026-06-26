package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/narratorlog/narratorlog/internal/db"
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
		Provider      string `json:"provider"       binding:"required"`
		ProviderID    string `json:"provider_id"    binding:"required"`
		FullName      string `json:"full_name"      binding:"required"`
		URL           string `json:"url"            binding:"required"`
		DefaultBranch string `json:"default_branch"`
		AccessToken   string `json:"access_token"   binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}

	if req.DefaultBranch == "" {
		req.DefaultBranch = "main"
	}

	encryptedToken, err := h.encryptor.Encrypt(req.AccessToken)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to encrypt token.")
		return
	}

	// Generate webhook secret
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
		AccessToken:   encryptedToken,
		WebhookSecret: pgtype.Text{String: webhookSecret, Valid: true},
		Config:        []byte("{}"),
	})
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to connect repository.")
		return
	}

	// Register webhook with GitHub (best-effort — don't fail if this errors)
	if h.github != nil && req.Provider == "github" {
		parts := splitFullName(req.FullName)
		if len(parts) == 2 {
			webhookURL := fmt.Sprintf("%s/webhooks/github?repo_id=%s", h.cfg.AppURL, req.ProviderID)
			if err := h.github.RegisterWebhook(
				c.Request.Context(),
				req.AccessToken,
				parts[0], parts[1],
				webhookURL,
				webhookSecret,
			); err != nil {
				// Log but don't fail — webhook registration failure isn't critical
				// Teams can still trigger scans manually
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
	if h.github == nil {
		errorResponse(c, http.StatusServiceUnavailable, "GITHUB_NOT_CONFIGURED", "GitHub OAuth is not configured.")
		return
	}

	// Get encrypted token from cookie
	encryptedToken, err := c.Cookie("gh_token")
	if err != nil {
		errorResponse(c, http.StatusUnauthorized, "NO_GITHUB_TOKEN", "GitHub not connected. Visit /auth/github first.")
		return
	}

	accessToken, err := h.encryptor.Decrypt(encryptedToken)
	if err != nil {
		errorResponse(c, http.StatusUnauthorized, "INVALID_TOKEN", "Invalid GitHub token.")
		return
	}

	repos, err := h.github.ListRepos(c.Request.Context(), accessToken)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "GITHUB_ERROR", "Failed to fetch repositories from GitHub.")
		return
	}

	// Get already connected repos to mark them
	teamID, _ := uuid.Parse(c.GetString("team_id"))
	connected, _ := h.queries.ListRepositoriesByTeam(c.Request.Context(), teamID)
	connectedIDs := make(map[string]bool)
	for _, r := range connected {
		connectedIDs[r.ProviderID] = true
	}

	data := make([]gin.H, len(repos))
	for i, r := range repos {
		data[i] = gin.H{
			"provider_id":       fmt.Sprintf("%d", r.ID),
			"full_name":         r.FullName,
			"name":              r.Name,
			"url":               r.HTMLURL,
			"default_branch":    r.DefaultBranch,
			"private":           r.Private,
			"already_connected": connectedIDs[fmt.Sprintf("%d", r.ID)],
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

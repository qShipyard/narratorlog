package handlers

import (
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

	// Encrypt the access token before storing
	encryptedToken, err := h.encryptor.Encrypt(req.AccessToken)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to encrypt token.")
		return
	}

	// Extract repo name from full_name
	name := req.FullName
	if i := len(req.FullName); i > 0 {
		for j := len(req.FullName) - 1; j >= 0; j-- {
			if req.FullName[j] == '/' {
				name = req.FullName[j+1:]
				break
			}
		}
	}

	repo, err := h.queries.CreateRepository(c.Request.Context(), db.CreateRepositoryParams{
		TeamID:        teamID,
		Provider:      db.GitProvider(req.Provider),
		ProviderID:    req.ProviderID,
		Name:          name,
		FullName:      req.FullName,
		Url:           req.URL,
		DefaultBranch: req.DefaultBranch,
		AccessToken:   encryptedToken,
		WebhookSecret: pgtype.Text{},
		Config:        []byte("{}"),
	})
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to connect repository.")
		return
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
	// Returns repos from the connected git platform not yet connected to narratorlog
	// Requires platform OAuth token — implemented in feat/github-oauth
	c.JSON(http.StatusOK, gin.H{"data": []any{}})
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

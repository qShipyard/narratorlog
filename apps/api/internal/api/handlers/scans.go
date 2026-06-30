package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/narratorlog/narratorlog/internal/db"
	"github.com/narratorlog/narratorlog/internal/teamconfig"
	"github.com/narratorlog/narratorlog/internal/worker/jobs"
)

func (h *Handler) ListScans(c *gin.Context) {
	teamID, err := uuid.Parse(c.GetString("team_id"))
	if err != nil {
		errorResponse(c, http.StatusUnauthorized, "INVALID_SESSION", "Invalid session.")
		return
	}

	var scans []db.Scan
	if repoParam := c.Query("repo_id"); repoParam != "" {
		repoID, err := uuid.Parse(repoParam)
		if err != nil {
			errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid repository ID.")
			return
		}
		scans, err = h.queries.ListScansByRepository(c.Request.Context(), db.ListScansByRepositoryParams{
			RepositoryID: repoID,
			Limit:        20,
			Offset:       0,
		})
		if err != nil {
			errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to fetch scans.")
			return
		}
	} else {
		scans, err = h.queries.ListScansByTeam(c.Request.Context(), db.ListScansByTeamParams{
			TeamID: teamID,
			Limit:  20,
			Offset: 0,
		})
		if err != nil {
			errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to fetch scans.")
			return
		}
	}

	getRepo := h.repoLookup(c)
	data := make([]gin.H, len(scans))
	for i, s := range scans {
		data[i] = scanToJSON(s, getRepo(s.RepositoryID))
	}

	c.JSON(http.StatusOK, gin.H{"data": data})
}

// repoLookup returns a memoized fetcher so a scan list resolves each repository
// once, regardless of whether it is still active.
func (h *Handler) repoLookup(c *gin.Context) func(uuid.UUID) *db.Repository {
	cache := make(map[uuid.UUID]*db.Repository)
	return func(id uuid.UUID) *db.Repository {
		if r, ok := cache[id]; ok {
			return r
		}
		r, err := h.queries.GetRepositoryByID(c.Request.Context(), id)
		if err != nil {
			cache[id] = nil
			return nil
		}
		cache[id] = &r
		return &r
	}
}

func (h *Handler) TriggerScan(c *gin.Context) {
	teamID, err := uuid.Parse(c.GetString("team_id"))
	if err != nil {
		errorResponse(c, http.StatusUnauthorized, "INVALID_SESSION", "Invalid session.")
		return
	}

	userID := c.GetString("user_id")

	var req struct {
		RepositoryID string `json:"repository_id" binding:"required"`
		Lookback     string `json:"lookback"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}

	if req.Lookback == "" {
		req.Lookback = "7d"
	}

	repoID, err := uuid.Parse(req.RepositoryID)
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid repository ID.")
		return
	}

	repo, err := h.queries.GetRepositoryByID(c.Request.Context(), repoID)
	if err != nil {
		errorResponse(c, http.StatusNotFound, "NOT_FOUND", "Repository not found.")
		return
	}
	if repo.TeamID != teamID {
		errorResponse(c, http.StatusForbidden, "FORBIDDEN", "You don't have permission to scan this repository.")
		return
	}

	rawCfg, err := h.queries.GetTeamConfig(c.Request.Context(), teamID)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to load team settings.")
		return
	}
	tc, err := teamconfig.Parse(rawCfg)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to parse team settings.")
		return
	}
	if _, _, ok, err := tc.DecryptedSource(string(repo.Provider), h.encryptor); err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to read git source settings.")
		return
	} else if !ok {
		errorResponse(c, http.StatusConflict, "SOURCE_NOT_CONNECTED", "Add a git access token in Settings → Git sources before running a scan.")
		return
	}
	if tc.AI.APIKeyEncrypted == "" {
		errorResponse(c, http.StatusConflict, "AI_NOT_CONFIGURED", "Add an AI API key in Settings → AI provider before running a scan.")
		return
	}

	userUUID, _ := uuid.Parse(userID)

	scan, err := h.queries.CreateScan(c.Request.Context(), db.CreateScanParams{
		TeamID:            teamID,
		RepositoryID:      repoID,
		Status:            db.ScanStatusPending,
		TriggeredBy:       db.ScanTriggerManual,
		TriggeredByUserID: pgtype.UUID{Bytes: userUUID, Valid: true},
		ScanFrom:          pgtype.Timestamptz{Time: lookbackToTime(req.Lookback), Valid: true},
		ScanTo:            pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
		ConfigSnapshot:    h.routingSnapshot(c.Request.Context(), teamID),
	})
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to create scan.")
		return
	}

	// Enqueue scan job
	payload, _ := jobs.Marshal(jobs.ScanPayload{
		ScanID:       scan.ID.String(),
		RepositoryID: repoID.String(),
		TeamID:       teamID.String(),
		TriggerType:  "manual",
		Lookback:     req.Lookback,
	})

	task := asynq.NewTask(jobs.JobScan, payload)
	if _, err := h.asynq.Enqueue(task); err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to queue scan.")
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"id":     scan.ID,
		"status": scan.Status,
	})
}

func (h *Handler) GetScan(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid scan ID.")
		return
	}

	scan, err := h.queries.GetScanByID(c.Request.Context(), id)
	if err != nil {
		errorResponse(c, http.StatusNotFound, "NOT_FOUND", "Scan not found.")
		return
	}

	var repo *db.Repository
	if r, err := h.queries.GetRepositoryByID(c.Request.Context(), scan.RepositoryID); err == nil {
		repo = &r
	}

	c.JSON(http.StatusOK, scanToJSON(scan, repo))
}

func (h *Handler) ListScanCommits(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid scan ID.")
		return
	}

	commits, err := h.queries.ListCommitsByScan(c.Request.Context(), id)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to fetch commits.")
		return
	}

	data := make([]gin.H, len(commits))
	for i, commit := range commits {
		data[i] = gin.H{
			"id":           commit.ID,
			"sha":          commit.Sha,
			"message":      commit.Message,
			"author_name":  commit.AuthorName,
			"committed_at": commit.CommittedAt,
			"pr_number":    commit.PrNumber,
			"pr_title":     commit.PrTitle,
			"is_breaking":  commit.IsBreaking,
			"domain":       commit.Domain,
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": data})
}

func (h *Handler) ListScanGroups(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid scan ID.")
		return
	}

	groups, err := h.queries.ListCommitGroupsByScan(c.Request.Context(), id)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to fetch groups.")
		return
	}

	data := make([]gin.H, len(groups))
	for i, g := range groups {
		data[i] = gin.H{
			"id":           g.ID,
			"label":        g.Label,
			"group_type":   g.GroupType,
			"commit_count": len(g.CommitIds),
			"summary":      g.Summary,
			"commits":      g.CommitIds,
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": data})
}

func (h *Handler) ListScanDrafts(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid scan ID.")
		return
	}

	drafts, err := h.queries.ListDraftsByScan(c.Request.Context(), id)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to fetch drafts.")
		return
	}

	data := make([]gin.H, len(drafts))
	for i, d := range drafts {
		data[i] = draftToJSON(d)
	}

	c.JSON(http.StatusOK, gin.H{"data": data})
}

func (h *Handler) DeliverScan(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid scan ID.")
		return
	}

	allApproved, err := h.queries.AllDraftsApproved(c.Request.Context(), id)
	if err != nil || !allApproved {
		errorResponse(c, http.StatusBadRequest, "NOT_ALL_APPROVED", "All drafts must be approved before delivery.")
		return
	}

	teamID, _ := uuid.Parse(c.GetString("team_id"))
	rawCfg, err := h.queries.GetTeamConfig(c.Request.Context(), teamID)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to load team settings.")
		return
	}
	tc, err := teamconfig.Parse(rawCfg)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to parse team settings.")
		return
	}
	if len(tc.Routing) == 0 {
		errorResponse(c, http.StatusUnprocessableEntity, "NO_ROUTING",
			"No delivery destinations configured. Go to Settings → Delivery and add a route for each audience you want to publish to.")
		return
	}

	if err := h.queries.UpdateScanStatus(c.Request.Context(), db.UpdateScanStatusParams{
		Status: db.ScanStatusDelivering,
		ID:     id,
	}); err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to start delivery.")
		return
	}

	payload, _ := jobs.Marshal(jobs.DeliveryPayload{
		ScanID: id.String(),
		TeamID: teamID.String(),
	})

	task := asynq.NewTask(jobs.JobDeliver, payload)
	if _, err := h.asynq.Enqueue(task); err != nil {
		_ = h.queries.UpdateScanStatus(c.Request.Context(), db.UpdateScanStatusParams{
			Status: db.ScanStatusAwaitingApproval,
			ID:     id,
		})
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to queue delivery.")
		return
	}

	c.JSON(http.StatusAccepted, gin.H{"message": "Delivery started.", "status": "delivering"})
}

func (h *Handler) CancelScan(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid scan ID.")
		return
	}

	if err := h.queries.UpdateScanStatus(c.Request.Context(), db.UpdateScanStatusParams{
		Status: db.ScanStatusCancelled,
		ID:     id,
	}); err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to cancel scan.")
		return
	}

	c.Status(http.StatusNoContent)
}

func scanToJSON(s db.Scan, repo *db.Repository) gin.H {
	h := gin.H{
		"id":             s.ID,
		"team_id":        s.TeamID,
		"repository_id":  s.RepositoryID,
		"status":         s.Status,
		"triggered_by":   s.TriggeredBy,
		"scan_from":      s.ScanFrom,
		"scan_to":        s.ScanTo,
		"commit_count":   s.CommitCount,
		"filtered_count": s.FilteredCount,
		"error":          s.Error,
		"created_at":     s.CreatedAt,
		"updated_at":     s.UpdatedAt,
	}
	if hint := scanErrorHint(s.Error); hint != nil && s.Status == db.ScanStatusFailed {
		h["error_hint"] = *hint
	}
	if repo != nil {
		h["repository"] = gin.H{
			"id":        repo.ID,
			"full_name": repo.FullName,
		}
	}
	return h
}

func lookbackToTime(lookback string) time.Time {
	durations := map[string]time.Duration{
		"1d":  24 * time.Hour,
		"7d":  7 * 24 * time.Hour,
		"14d": 14 * 24 * time.Hour,
		"30d": 30 * 24 * time.Hour,
	}
	d, ok := durations[lookback]
	if !ok {
		d = 7 * 24 * time.Hour
	}
	return time.Now().UTC().Add(-d)
}


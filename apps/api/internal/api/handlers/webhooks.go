package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/narratorlog/narratorlog/internal/db"
	"github.com/narratorlog/narratorlog/internal/worker/jobs"
)

func (h *Handler) GitHubWebhook(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_BODY", "Failed to read request body.")
		return
	}

	signature := c.GetHeader("X-Hub-Signature-256")
	providerID := c.Query("repo_id") // passed as query param when registering webhook

	if providerID == "" {
		errorResponse(c, http.StatusBadRequest, "MISSING_REPO_ID", "Missing repo_id query parameter.")
		return
	}

	// Fetch repo to get webhook secret and team
	teamID, _ := uuid.Parse(c.GetString("team_id"))
	repo, err := h.queries.GetRepositoryByProviderID(c.Request.Context(), db.GetRepositoryByProviderIDParams{
		TeamID:     teamID,
		Provider:   db.GitProviderGithub,
		ProviderID: providerID,
	})
	if err != nil {
		// Return 200 even on unknown repo — avoid leaking info
		c.JSON(http.StatusOK, gin.H{"received": true})
		return
	}

	// Validate HMAC signature
	if repo.WebhookSecret.Valid && repo.WebhookSecret.String != "" {
		if !validateGitHubSignature(body, signature, repo.WebhookSecret.String) {
			errorResponse(c, http.StatusUnauthorized, "INVALID_SIGNATURE", "Invalid webhook signature.")
			return
		}
	}

	event := c.GetHeader("X-GitHub-Event")

	switch event {
	case "push", "create":
		payload, _ := jobs.Marshal(jobs.ScanPayload{
			RepositoryID: repo.ID.String(),
			TeamID:       repo.TeamID.String(),
			TriggerType:  "webhook",
			Lookback:     "7d",
		})

		// Create scan record
		scan, err := h.queries.CreateScan(c.Request.Context(), db.CreateScanParams{
			TeamID:         repo.TeamID,
			RepositoryID:   repo.ID,
			Status:         db.ScanStatusPending,
			TriggeredBy:    db.ScanTriggerWebhook,
			ScanFrom:       pgtype.Timestamptz{Time: lookbackToTime("7d"), Valid: true},
			ScanTo:         pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
			ConfigSnapshot: []byte("{}"),
		})
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"received": true})
			return
		}

		// Update payload with scan ID
		payload, _ = jobs.Marshal(jobs.ScanPayload{
			ScanID:       scan.ID.String(),
			RepositoryID: repo.ID.String(),
			TeamID:       repo.TeamID.String(),
			TriggerType:  "webhook",
			Lookback:     "7d",
		})

		task := asynq.NewTask(jobs.JobScan, payload)
		h.asynq.Enqueue(task)
	}

	c.JSON(http.StatusOK, gin.H{"received": true})
}

func validateGitHubSignature(body []byte, signature, secret string) bool {
	if len(signature) < 7 || signature[:7] != "sha256=" {
		return false
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(signature), []byte(expected))
}

package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
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

	repoID, err := uuid.Parse(c.Query("repo"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"received": true})
		return
	}

	repo, err := h.queries.GetRepositoryByID(c.Request.Context(), repoID)
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
			ConfigSnapshot: h.routingSnapshot(c.Request.Context(), repo.TeamID),
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

func (h *Handler) GitLabWebhook(c *gin.Context) {
	repoID, err := uuid.Parse(c.Query("repo"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"received": true})
		return
	}

	repo, err := h.queries.GetRepositoryByID(c.Request.Context(), repoID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"received": true})
		return
	}

	if repo.WebhookSecret.Valid && repo.WebhookSecret.String != "" {
		token := c.GetHeader("X-Gitlab-Token")
		if !validateGitLabToken(token, repo.WebhookSecret.String) {
			errorResponse(c, http.StatusUnauthorized, "INVALID_SIGNATURE", "Invalid webhook token.")
			return
		}
	}

	event := c.GetHeader("X-Gitlab-Event")

	if event == "Push Hook" {
		payload, _ := jobs.Marshal(jobs.ScanPayload{
			RepositoryID: repo.ID.String(),
			TeamID:       repo.TeamID.String(),
			TriggerType:  "webhook",
			Lookback:     "7d",
		})

		scan, err := h.queries.CreateScan(c.Request.Context(), db.CreateScanParams{
			TeamID:         repo.TeamID,
			RepositoryID:   repo.ID,
			Status:         db.ScanStatusPending,
			TriggeredBy:    db.ScanTriggerWebhook,
			ScanFrom:       pgtype.Timestamptz{Time: lookbackToTime("7d"), Valid: true},
			ScanTo:         pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
			ConfigSnapshot: h.routingSnapshot(c.Request.Context(), repo.TeamID),
		})
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"received": true})
			return
		}

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

// BitbucketWebhook handles Bitbucket Cloud push events.
// Bitbucket Cloud does not support HMAC shared secrets on webhooks;
// security relies on the unguessable repo UUID in the ?repo=<uuid> query param.
func (h *Handler) BitbucketWebhook(c *gin.Context) {
	repoID, err := uuid.Parse(c.Query("repo"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"received": true})
		return
	}

	repo, err := h.queries.GetRepositoryByID(c.Request.Context(), repoID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"received": true})
		return
	}

	event := c.GetHeader("X-Event-Key")

	if event == "repo:push" {
		payload, _ := jobs.Marshal(jobs.ScanPayload{
			RepositoryID: repo.ID.String(),
			TeamID:       repo.TeamID.String(),
			TriggerType:  "webhook",
			Lookback:     "7d",
		})

		scan, err := h.queries.CreateScan(c.Request.Context(), db.CreateScanParams{
			TeamID:         repo.TeamID,
			RepositoryID:   repo.ID,
			Status:         db.ScanStatusPending,
			TriggeredBy:    db.ScanTriggerWebhook,
			ScanFrom:       pgtype.Timestamptz{Time: lookbackToTime("7d"), Valid: true},
			ScanTo:         pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
			ConfigSnapshot: h.routingSnapshot(c.Request.Context(), repo.TeamID),
		})
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"received": true})
			return
		}

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

func validateGitLabToken(token, secret string) bool {
	return subtle.ConstantTimeCompare([]byte(token), []byte(secret)) == 1
}

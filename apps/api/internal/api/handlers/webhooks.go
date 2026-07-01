package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
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

	switch c.GetHeader("X-GitHub-Event") {
	case "push", "create":
		h.enqueueWebhookScan(c.Request.Context(), repo)
	case "pull_request":
		// A personal scan only surfaces the user's own PRs, so triggering on any
		// merged PR is safe — the pipeline filters to the token owner's work.
		if webhookPRMerged(body) {
			h.enqueueWebhookScan(c.Request.Context(), repo)
		}
	}

	c.JSON(http.StatusOK, gin.H{"received": true})
}

// webhookPRMerged reports whether a GitHub pull_request event is a merge (closed
// with merged=true) rather than a plain close.
func webhookPRMerged(body []byte) bool {
	var e struct {
		Action      string `json:"action"`
		PullRequest struct {
			Merged bool `json:"merged"`
		} `json:"pull_request"`
	}
	if err := json.Unmarshal(body, &e); err != nil {
		return false
	}
	return e.Action == "closed" && e.PullRequest.Merged
}

// enqueueWebhookScan creates a pending scan for a repo and queues it. Shared by
// every webhook provider; failures are swallowed so we still return 200 and avoid
// signalling internals to the sender.
func (h *Handler) enqueueWebhookScan(ctx context.Context, repo db.Repository) {
	scan, err := h.queries.CreateScan(ctx, db.CreateScanParams{
		TeamID:         repo.TeamID,
		RepositoryID:   repo.ID,
		Status:         db.ScanStatusPending,
		TriggeredBy:    db.ScanTriggerWebhook,
		ScanFrom:       pgtype.Timestamptz{Time: lookbackToTime("7d"), Valid: true},
		ScanTo:         pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
		ConfigSnapshot: h.routingSnapshot(ctx, repo.TeamID),
	})
	if err != nil {
		return
	}
	payload, _ := jobs.Marshal(jobs.ScanPayload{
		ScanID:       scan.ID.String(),
		RepositoryID: repo.ID.String(),
		TeamID:       repo.TeamID.String(),
		TriggerType:  "webhook",
		Lookback:     "7d",
	})
	h.asynq.Enqueue(asynq.NewTask(jobs.JobScan, payload))
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

	switch c.GetHeader("X-Gitlab-Event") {
	case "Push Hook", "Merge Request Hook":
		h.enqueueWebhookScan(c.Request.Context(), repo)
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

	switch c.GetHeader("X-Event-Key") {
	case "repo:push", "pullrequest:fulfilled":
		h.enqueueWebhookScan(c.Request.Context(), repo)
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

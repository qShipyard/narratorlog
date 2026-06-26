package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/narratorlog/narratorlog/internal/db"
)

func (h *Handler) UpdateDraft(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid draft ID.")
		return
	}

	var req struct {
		EditedContent string `json:"edited_content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}

	draft, err := h.queries.UpdateDraftContent(c.Request.Context(), db.UpdateDraftContentParams{
		EditedContent: pgtype.Text{String: req.EditedContent, Valid: true},
		ID:            id,
	})
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to update draft.")
		return
	}

	c.JSON(http.StatusOK, draftToJSON(draft))
}

func (h *Handler) ApproveDraft(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid draft ID.")
		return
	}

	userID, err := uuid.Parse(c.GetString("user_id"))
	if err != nil {
		errorResponse(c, http.StatusUnauthorized, "INVALID_SESSION", "Invalid session.")
		return
	}

	draft, err := h.queries.ApproveDraft(c.Request.Context(), db.ApproveDraftParams{
		ApprovedBy: pgtype.UUID{Bytes: userID, Valid: true},
		ID:         id,
	})
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to approve draft.")
		return
	}

	allApproved, _ := h.queries.AllDraftsApproved(c.Request.Context(), draft.ScanID)

	c.JSON(http.StatusOK, gin.H{
		"draft":        draftToJSON(draft),
		"all_approved": allApproved,
	})
}

func (h *Handler) RejectDraft(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid draft ID.")
		return
	}

	draft, err := h.queries.RejectDraft(c.Request.Context(), id)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to reject draft.")
		return
	}

	c.JSON(http.StatusOK, draftToJSON(draft))
}

func (h *Handler) RegenerateDraft(c *gin.Context) {
	// TODO: re-run AI pass 2 for this audience — feat/ai-regeneration
	c.JSON(http.StatusAccepted, gin.H{"message": "Regeneration queued."})
}

func (h *Handler) ListComments(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid draft ID.")
		return
	}

	comments, err := h.queries.ListCommentsByDraft(c.Request.Context(), id)
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to fetch comments.")
		return
	}

	data := make([]gin.H, len(comments))
	for i, comment := range comments {
		data[i] = gin.H{
			"id":         comment.ID,
			"content":    comment.Content,
			"created_at": comment.CreatedAt,
			"user": gin.H{
				"id":         comment.UserID,
				"name":       comment.UserName,
				"avatar_url": comment.UserAvatar,
			},
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": data})
}

func (h *Handler) CreateComment(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid draft ID.")
		return
	}

	userID, err := uuid.Parse(c.GetString("user_id"))
	if err != nil {
		errorResponse(c, http.StatusUnauthorized, "INVALID_SESSION", "Invalid session.")
		return
	}

	var req struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}

	comment, err := h.queries.CreateDraftComment(c.Request.Context(), db.CreateDraftCommentParams{
		DraftID: id,
		UserID:  userID,
		Content: req.Content,
	})
	if err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to create comment.")
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":         comment.ID,
		"content":    comment.Content,
		"created_at": comment.CreatedAt,
	})
}

func (h *Handler) DeleteComment(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		errorResponse(c, http.StatusBadRequest, "INVALID_ID", "Invalid comment ID.")
		return
	}

	userID, err := uuid.Parse(c.GetString("user_id"))
	if err != nil {
		errorResponse(c, http.StatusUnauthorized, "INVALID_SESSION", "Invalid session.")
		return
	}

	if err := h.queries.DeleteDraftComment(c.Request.Context(), db.DeleteDraftCommentParams{
		ID:     id,
		UserID: userID,
	}); err != nil {
		errorResponse(c, http.StatusInternalServerError, "SERVER_ERROR", "Failed to delete comment.")
		return
	}

	c.Status(http.StatusNoContent)
}

func draftToJSON(d db.AudienceDraft) gin.H {
	return gin.H{
		"id":             d.ID,
		"scan_id":        d.ScanID,
		"audience_id":    d.AudienceID,
		"tone":           d.Tone,
		"content":        d.Content,
		"edited_content": d.EditedContent,
		"status":         d.Status,
		"approved_by":    d.ApprovedBy,
		"approved_at":    d.ApprovedAt,
		"created_at":     d.CreatedAt,
		"updated_at":     d.UpdatedAt,
	}
}

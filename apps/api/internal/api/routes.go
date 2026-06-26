package api

import (
	"github.com/gin-gonic/gin"
	"github.com/narratorlog/narratorlog/internal/api/handlers"
	"github.com/narratorlog/narratorlog/internal/api/middleware"
	"github.com/narratorlog/narratorlog/internal/auth"
)

func RegisterRoutes(r *gin.Engine, h *handlers.Handler, sessions *auth.SessionManager) {
	// Health
	r.GET("/health", h.Health)

	// Setup — first-time configuration
	r.GET("/setup/status", h.IsSetupComplete)
	r.POST("/setup", h.Setup)

	// OAuth
	r.GET("/auth/github", h.GitHubOAuthRedirect)
	r.GET("/auth/github/callback", h.GitHubOAuthCallback)
	r.POST("/auth/logout", h.Logout)

	// Webhooks — no auth, signature validated per handler
	webhooks := r.Group("/webhooks")
	{
		webhooks.POST("/github", h.GitHubWebhook)
	}

	// Authenticated API
	api := r.Group("/api/v1")
	api.Use(middleware.RequireAuth(sessions))
	{
		// Current user
		api.GET("/me", h.GetMe)

		// Repositories
		api.GET("/repos", h.ListRepos)
		api.POST("/repos", h.ConnectRepo)
		api.GET("/repos/available", h.ListAvailableRepos)
		api.GET("/repos/:id", h.GetRepo)
		api.PATCH("/repos/:id", h.UpdateRepo)
		api.DELETE("/repos/:id", h.DisconnectRepo)

		// Scans
		api.GET("/scans", h.ListScans)
		api.POST("/scans", h.TriggerScan)
		api.GET("/scans/:id", h.GetScan)
		api.GET("/scans/:id/commits", h.ListScanCommits)
		api.GET("/scans/:id/groups", h.ListScanGroups)
		api.GET("/scans/:id/drafts", h.ListScanDrafts)
		api.POST("/scans/:id/deliver", h.DeliverScan)
		api.DELETE("/scans/:id", h.CancelScan)

		// Drafts
		api.PATCH("/drafts/:id", h.UpdateDraft)
		api.POST("/drafts/:id/approve", middleware.RequireRole("admin", "reviewer"), h.ApproveDraft)
		api.POST("/drafts/:id/reject", middleware.RequireRole("admin", "reviewer"), h.RejectDraft)
		api.POST("/drafts/:id/regenerate", middleware.RequireRole("admin", "reviewer"), h.RegenerateDraft)

		// Comments
		api.GET("/drafts/:id/comments", h.ListComments)
		api.POST("/drafts/:id/comments", h.CreateComment)
		api.DELETE("/comments/:id", h.DeleteComment)

		// Team
		api.GET("/team", h.GetTeam)
		api.GET("/team/members", h.ListMembers)
		api.POST("/team/invite", middleware.RequireRole("admin"), h.InviteMember)
		api.PATCH("/team/members/:id", middleware.RequireRole("admin"), h.UpdateMemberRole)
		api.DELETE("/team/members/:id", middleware.RequireRole("admin"), h.RemoveMember)
	}
}

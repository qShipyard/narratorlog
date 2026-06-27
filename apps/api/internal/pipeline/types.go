package pipeline

import (
	"context"
	"time"
)

type AIDepth string

const (
	DepthMessagesOnly AIDepth = "messages-only"
	DepthStandard     AIDepth = "standard"
	DepthDeep         AIDepth = "deep"
)

type GroupType string

const (
	GroupTypeFeature  GroupType = "feature"
	GroupTypeFix      GroupType = "fix"
	GroupTypeBreaking GroupType = "breaking"
	GroupTypeChore    GroupType = "chore"
	GroupTypeSecurity GroupType = "security"
	GroupTypeOther    GroupType = "other"
)

type ScanStatus string

const (
	ScanStatusPending          ScanStatus = "pending"
	ScanStatusRunning          ScanStatus = "running"
	ScanStatusFiltering        ScanStatus = "filtering"
	ScanStatusEnriching        ScanStatus = "enriching"
	ScanStatusReadingContext   ScanStatus = "reading_context"
	ScanStatusChunking         ScanStatus = "chunking"
	ScanStatusSummarizing      ScanStatus = "summarizing"
	ScanStatusAwaitingApproval ScanStatus = "awaiting_approval"
	ScanStatusDelivering       ScanStatus = "delivering"
	ScanStatusDelivered        ScanStatus = "delivered"
	ScanStatusFailed           ScanStatus = "failed"
	ScanStatusCancelled        ScanStatus = "cancelled"
)

type ScanConfig struct {
	// Source
	Provider    string // github | gitlab | bitbucket | git_cli
	Repo        string
	Branch      string
	ScanFrom    time.Time
	ScanTo      time.Time
	AccessToken string

	// Filter
	SkipAuthors  []string
	SkipPatterns []string

	// AI
	AIDepth    AIDepth
	AIProvider string
	AIModel    string
	AIAPIKey   string
	AIBaseURL  string

	// Audiences
	Audiences []AudienceConfig

	// Privacy
	ScrubSecrets bool
	LocalOnly    bool
}

type AudienceConfig struct {
	ID          string // developers | product | marketing | public | custom
	Tone        string // technical | plain-english | benefit-focused | friendly
	Description string // optional — passed to AI for context
}

type RawCommit struct {
	SHA           string
	Message       string
	AuthorName    string
	AuthorEmail   string
	CommittedAt   time.Time
	PRNumber      *int
	PRTitle       *string
	PRDescription *string
	ChangedFiles  []string
	Diff          *string // nil if depth = messages-only
}

type LinkedIssue struct {
	Number int
	Title  string
	URL    string
}

type CodebaseContext struct {
	ChangedFunctions []string
	SurroundingCode  string
	Imports          []string
}

type Commit struct {
	ID          string
	ScanID      string
	SHA         string
	Message     string
	AuthorName  string
	AuthorEmail string
	CommittedAt time.Time

	// Enriched fields (stage 3)
	PRNumber      *int
	PRTitle       *string
	PRDescription *string
	LinkedIssues  []LinkedIssue
	ChangedFiles  []string
	Diff          *string
	Domain        *string // inferred from file paths
	IsBreaking    bool
	IsBotCommit   bool
	IsNoise       bool

	// Deep context (stage 4, depth=deep only)
	CodebaseContext *CodebaseContext
}

type CommitGroup struct {
	ID        string
	ScanID    string
	Label     string
	GroupType GroupType
	CommitIDs []string
	Summary   *string
}

type AudienceDraft struct {
	ID         string
	ScanID     string
	AudienceID string
	Tone       string
	Content    string // AI-generated
	TokensUsed int
}

type SourcePluginRequest struct {
	Provider    string `json:"provider"`
	Repo        string `json:"repo"`
	Branch      string `json:"branch"`
	ScanFrom    string `json:"scan_from"` // ISO 8601 UTC
	ScanTo      string `json:"scan_to"`
	AccessToken string `json:"access_token"`
	Depth       string `json:"depth"`
}

type SourcePluginResponse struct {
	Commits []SourcePluginCommit `json:"commits"`
	Error   *string              `json:"error,omitempty"`
}

type SourcePluginCommit struct {
	SHA           string   `json:"sha"`
	Message       string   `json:"message"`
	AuthorName    string   `json:"author_name"`
	AuthorEmail   string   `json:"author_email"`
	CommittedAt   string   `json:"committed_at"` // ISO 8601
	PRNumber      *int     `json:"pr_number,omitempty"`
	PRTitle       *string  `json:"pr_title,omitempty"`
	PRDescription *string  `json:"pr_description,omitempty"`
	ChangedFiles  []string `json:"changed_files"`
	Diff          *string  `json:"diff,omitempty"`
}

// SummarizePluginRequest is sent to an AI provider plugin for pass 1.
type SummarizePluginRequest struct {
	Action  string              `json:"action"` // always "summarize"
	Group   SummarizeGroupInput `json:"group"`
	Model   string              `json:"model"`
	APIKey  string              `json:"api_key,omitempty"`
	BaseURL string              `json:"base_url,omitempty"`
}

type SummarizeGroupInput struct {
	Label           string   `json:"label"`
	GroupType       string   `json:"group_type"`
	PRTitle         *string  `json:"pr_title,omitempty"`
	PRDescription   *string  `json:"pr_description,omitempty"`
	IssueTitles     []string `json:"issue_titles"`
	ChangedFiles    []string `json:"changed_files"`
	Diff            *string  `json:"diff,omitempty"`
	CodebaseContext *string  `json:"codebase_context,omitempty"`
}

// SummarizePluginResponse is returned by an AI provider plugin after pass 1.
type SummarizePluginResponse struct {
	Summary    string  `json:"summary"`
	TokensUsed int     `json:"tokens_used,omitempty"`
	Error      *string `json:"error,omitempty"`
}

// GeneratePluginRequest is sent to an AI provider plugin for pass 2.
type GeneratePluginRequest struct {
	Action     string        `json:"action"` // always "generate"
	Summaries  []string      `json:"summaries"`
	Audience   AudienceInput `json:"audience"`
	Repository string        `json:"repository"`
	ScanFrom   string        `json:"scan_from"`
	ScanTo     string        `json:"scan_to"`
	Model      string        `json:"model"`
	APIKey     string        `json:"api_key,omitempty"`
	BaseURL    string        `json:"base_url,omitempty"`
}

type AudienceInput struct {
	ID          string `json:"id"`
	Tone        string `json:"tone"`
	Description string `json:"description,omitempty"`
}

// GeneratePluginResponse is returned by an AI provider plugin after pass 2.
type GeneratePluginResponse struct {
	Content    string  `json:"content"`
	TokensUsed int     `json:"tokens_used,omitempty"`
	Error      *string `json:"error,omitempty"`
}

// AuditEntry is a single audit log record.
type AuditEntry struct {
	TeamID     string
	UserID     *string
	Action     string
	EntityType string
	EntityID   *string
	Metadata   map[string]any
}

// DeliverScanMeta is scan metadata passed to output plugins.
type DeliverScanMeta struct {
	ID         string `json:"id"`
	Repository string `json:"repository"`
	ScanFrom   string `json:"scan_from"`
	ScanTo     string `json:"scan_to"`
}

// DeliverPluginRequest is sent to an output plugin.
type DeliverPluginRequest struct {
	Action        string                 `json:"action"`
	AudienceID    string                 `json:"audience_id"`
	Tone          string                 `json:"tone"`
	Content       string                 `json:"content"`
	EditedContent *string                `json:"edited_content,omitempty"`
	Scan          DeliverScanMeta        `json:"scan"`
	Config        map[string]interface{} `json:"config"`
}

// DeliverPluginResponse is returned by an output plugin.
type DeliverPluginResponse struct {
	Success   bool    `json:"success"`
	Reference *string `json:"reference,omitempty"`
	Message   *string `json:"message,omitempty"`
	Error     *string `json:"error,omitempty"`
}

type Store interface {
	// Scan
	UpdateScanStatus(ctx context.Context, scanID string, status ScanStatus, errMsg *string) error
	UpdateScanCounts(ctx context.Context, scanID string, commitCount, filteredCount int) error

	// Commits
	SaveCommits(ctx context.Context, commits []Commit) error
	GetCommits(ctx context.Context, scanID string, includeNoise bool) ([]Commit, error)
	UpdateCommit(ctx context.Context, commit Commit) error
	GetKnownSHAs(ctx context.Context, repositoryID string) (map[string]bool, error)

	// Commit groups
	SaveCommitGroups(ctx context.Context, groups []CommitGroup) error
	GetCommitGroups(ctx context.Context, scanID string) ([]CommitGroup, error)
	UpdateCommitGroupSummary(ctx context.Context, groupID string, summary string) error

	// Audience drafts
	SaveAudienceDraft(ctx context.Context, draft AudienceDraft) error

	// Audit
	CreateAuditLog(ctx context.Context, entry AuditEntry) error
}

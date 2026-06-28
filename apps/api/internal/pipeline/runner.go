package pipeline

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// CommitSource fetches raw commits from a git platform. The real implementation
// shells out to a source plugin subprocess; tests inject a mock.
type CommitSource interface {
	Fetch(ctx context.Context, req SourcePluginRequest) (*SourcePluginResponse, error)
}

// Runner executes the 8-stage narratorlog pipeline.
// Stage 1: Scan       — fetch commits from source plugin
// Stage 2: Filter     — remove noise, deduplicate
// Stage 3: Enrich     — add PR/issue context, domain inference
// Stage 4: Context    — codebase reading via Rust reader (depth=deep only)
// Stage 5: Chunk      — group commits into logical units
// Stage 6: Summarize  — AI two-pass summarization per audience
// Stage 7: Approval   — notify team, await human review
// Stage 8: Deliver    — send approved drafts (separate job, post-approval)
type Runner struct {
	Store  Store
	Source CommitSource
	AI     AIProvider
	Config ScanConfig

	// RetryDelay between a failed AI call and its retry. Zero uses the default.
	RetryDelay time.Duration
}

// Run executes stages 1-7 for a scan. Stage 8 runs separately after approval.
// On any unrecoverable error the scan is marked failed before returning.
func (r *Runner) Run(ctx context.Context, scanID string) error {
	stages := []struct {
		name string
		fn   func(context.Context, string) error
	}{
		{"scan", r.stageScan},
		{"filter", r.stageFilter},
		{"enrich", r.stageEnrich},
		{"context", r.stageContext},
		{"chunk", r.stageChunk},
		{"summarize", r.stageSummarize},
		{"approval", r.stageApproval},
	}

	for _, stage := range stages {
		if err := stage.fn(ctx, scanID); err != nil {
			msg := err.Error()
			_ = r.Store.UpdateScanStatus(ctx, scanID, ScanStatusFailed, &msg)
			return err
		}
	}

	return nil
}

// stageScan fetches raw commits from the source plugin and persists them.
func (r *Runner) stageScan(ctx context.Context, scanID string) error {
	if err := r.Store.UpdateScanStatus(ctx, scanID, ScanStatusRunning, nil); err != nil {
		return err
	}

	resp, err := r.Source.Fetch(ctx, SourcePluginRequest{
		Provider:    r.Config.Provider,
		Repo:        r.Config.Repo,
		Branch:      r.Config.Branch,
		ScanFrom:    r.Config.ScanFrom.UTC().Format(time.RFC3339),
		ScanTo:      r.Config.ScanTo.UTC().Format(time.RFC3339),
		AccessToken: r.Config.AccessToken,
		Depth:       string(r.Config.AIDepth),
		BaseURL:     r.Config.SourceBaseURL,
	})
	if err != nil {
		return err
	}

	commits := make([]Commit, len(resp.Commits))
	for i, raw := range resp.Commits {
		commits[i] = toCommit(raw, scanID)
	}
	return r.Store.SaveCommits(ctx, commits)
}

// stageFilter marks noise without deleting — filtered commits stay in the DB
// flagged for auditability.
func (r *Runner) stageFilter(ctx context.Context, scanID string) error {
	if err := r.Store.UpdateScanStatus(ctx, scanID, ScanStatusFiltering, nil); err != nil {
		return err
	}

	commits, err := r.Store.GetCommits(ctx, scanID, true)
	if err != nil {
		return err
	}

	result := Filter(commits, FilterConfig{
		SkipAuthors:  r.Config.SkipAuthors,
		SkipPatterns: r.Config.SkipPatterns,
	})

	for _, c := range append(result.Kept, result.Filtered...) {
		if err := r.Store.UpdateCommit(ctx, c); err != nil {
			return err
		}
	}
	return nil
}

func (r *Runner) stageEnrich(ctx context.Context, scanID string) error {
	if err := r.Store.UpdateScanStatus(ctx, scanID, ScanStatusEnriching, nil); err != nil {
		return err
	}

	commits, err := r.Store.GetCommits(ctx, scanID, false)
	if err != nil {
		return err
	}

	for _, c := range Enrich(commits, EnrichConfig{}) {
		if err := r.Store.UpdateCommit(ctx, c); err != nil {
			return err
		}
	}
	return nil
}

// stageContext reads surrounding codebase context via the Rust reader.
// Only runs when depth = deep; stubbed on this branch (see feat/rust-reader).
func (r *Runner) stageContext(ctx context.Context, scanID string) error {
	if r.Config.AIDepth != DepthDeep {
		return nil
	}
	return r.Store.UpdateScanStatus(ctx, scanID, ScanStatusReadingContext, nil)
}

func (r *Runner) stageChunk(ctx context.Context, scanID string) error {
	if err := r.Store.UpdateScanStatus(ctx, scanID, ScanStatusChunking, nil); err != nil {
		return err
	}

	commits, err := r.Store.GetCommits(ctx, scanID, false)
	if err != nil {
		return err
	}

	groups := Chunk(commits, ChunkConfig{ScanID: scanID})
	return r.Store.SaveCommitGroups(ctx, groups)
}

func (r *Runner) stageSummarize(ctx context.Context, scanID string) error {
	if err := r.Store.UpdateScanStatus(ctx, scanID, ScanStatusSummarizing, nil); err != nil {
		return err
	}

	groups, err := r.Store.GetCommitGroups(ctx, scanID)
	if err != nil {
		return err
	}
	commits, err := r.Store.GetCommits(ctx, scanID, false)
	if err != nil {
		return err
	}

	result, err := Summarize(ctx, r.AI, SummarizeInput{
		Groups:     groups,
		Commits:    commits,
		Config:     r.Config,
		RetryDelay: r.RetryDelay,
	})
	if err != nil {
		return err
	}

	for _, g := range result.Groups {
		if g.Summary != nil {
			if err := r.Store.UpdateCommitGroupSummary(ctx, g.ID, *g.Summary); err != nil {
				return err
			}
		}
	}
	for _, d := range result.Drafts {
		if err := r.Store.SaveAudienceDraft(ctx, d); err != nil {
			return err
		}
	}
	return nil
}

// stageApproval pauses the pipeline for human review. Delivery (stage 8) is a
// separate job triggered once all drafts are approved.
func (r *Runner) stageApproval(ctx context.Context, scanID string) error {
	return r.Store.UpdateScanStatus(ctx, scanID, ScanStatusAwaitingApproval, nil)
}

// toCommit converts a source plugin commit into a pipeline Commit, assigning a
// fresh ID. An unparseable timestamp yields the zero time rather than failing.
func toCommit(raw SourcePluginCommit, scanID string) Commit {
	committedAt, _ := time.Parse(time.RFC3339, raw.CommittedAt)
	return Commit{
		ID:            uuid.NewString(),
		ScanID:        scanID,
		SHA:           raw.SHA,
		Message:       raw.Message,
		AuthorName:    raw.AuthorName,
		AuthorEmail:   raw.AuthorEmail,
		CommittedAt:   committedAt,
		PRNumber:      raw.PRNumber,
		PRTitle:       raw.PRTitle,
		PRDescription: raw.PRDescription,
		ChangedFiles:  raw.ChangedFiles,
		Diff:          raw.Diff,
	}
}

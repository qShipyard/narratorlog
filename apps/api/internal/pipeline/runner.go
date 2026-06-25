package pipeline

import "context"

// Runner executes the 8-stage narratorlog pipeline.
// Stage 1: Scan       — fetch commits from source plugin
// Stage 2: Filter     — remove noise, deduplicate
// Stage 3: Enrich     — add PR/issue context, domain inference
// Stage 4: Context    — codebase reading via Rust reader (depth=deep only)
// Stage 5: Chunk      — group commits into logical units
// Stage 6: Summarize  — AI two-pass summarization per audience
// Stage 7: Approval   — notify team, await human review
// Stage 8: Deliver    — send approved drafts via output plugins
type Runner struct {
	// TODO: source plugin, ai provider, output plugins, reader client, db, config
}

// Run executes the full pipeline for a given scan.
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
			return err
		}
	}

	return nil
}

func (r *Runner) stageScan(ctx context.Context, scanID string) error {
	// TODO: call source plugin, store raw commits
	return nil
}

func (r *Runner) stageFilter(ctx context.Context, scanID string) error {
	// TODO: noise detection, deduplication
	return nil
}

func (r *Runner) stageEnrich(ctx context.Context, scanID string) error {
	// TODO: PR/issue resolution, breaking change detection, domain inference
	return nil
}

func (r *Runner) stageContext(ctx context.Context, scanID string) error {
	// TODO: call Rust reader via Unix socket (depth=deep only)
	return nil
}

func (r *Runner) stageChunk(ctx context.Context, scanID string) error {
	// TODO: group commits by PR/domain into commit_groups
	return nil
}

func (r *Runner) stageSummarize(ctx context.Context, scanID string) error {
	// TODO: Pass 1 — chunk summaries (parallel)
	// TODO: Pass 2 — audience drafts (parallel)
	return nil
}

func (r *Runner) stageApproval(ctx context.Context, scanID string) error {
	// TODO: update scan status, send notifications
	return nil
}

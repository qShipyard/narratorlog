package pipeline

import (
	"context"
	"testing"
	"time"
)

func fixtureSource() *mockSource {
	prTitle := "Add OAuth login"
	prDesc := "Implements GitHub OAuth login flow. Closes #5"
	featDiff := "diff --git a/internal/auth/oauth.go ..."
	fixDiff := "diff --git a/internal/auth/session.go ..."
	return &mockSource{
		resp: &SourcePluginResponse{
			Commits: []SourcePluginCommit{
				{
					SHA:           "sha-feat",
					Message:       "feat: add oauth login",
					AuthorName:    "James Okafor",
					AuthorEmail:   "james@example.com",
					CommittedAt:   "2026-06-18T14:32:00Z",
					PRNumber:      intPtr(10),
					PRTitle:       &prTitle,
					PRDescription: &prDesc,
					ChangedFiles:  []string{"internal/auth/oauth.go"},
					Diff:          &featDiff,
				},
				{
					SHA:          "sha-bot",
					Message:      "chore: bump deps",
					AuthorName:   "dependabot[bot]",
					AuthorEmail:  "49699333+dependabot[bot]@users.noreply.github.com",
					CommittedAt:  "2026-06-18T10:00:00Z",
					ChangedFiles: []string{"go.mod", "go.sum"},
				},
				{
					SHA:          "sha-fix",
					Message:      "fix: session expiry edge case",
					AuthorName:   "Mara Lin",
					AuthorEmail:  "mara@example.com",
					CommittedAt:  "2026-06-19T09:15:00Z",
					ChangedFiles: []string{"internal/auth/session.go"},
					Diff:         &fixDiff,
				},
			},
		},
	}
}

func fixtureConfig() ScanConfig {
	return ScanConfig{
		Provider: "github",
		Repo:     "org/backend",
		Branch:   "main",
		ScanFrom: time.Date(2026, 6, 14, 0, 0, 0, 0, time.UTC),
		ScanTo:   time.Date(2026, 6, 21, 0, 0, 0, 0, time.UTC),
		AIModel:  "claude-sonnet-4-6",
		Audiences: []AudienceConfig{
			{ID: "developers", Tone: "technical"},
			{ID: "product", Tone: "plain-english"},
		},
	}
}

func newTestRunner(store Store, src CommitSource, ai AIProvider, cfg ScanConfig) *Runner {
	return &Runner{
		Store:      store,
		Source:     src,
		AI:         ai,
		Config:     cfg,
		RetryDelay: time.Millisecond,
	}
}

func TestRunner_FullPipeline_PersistsCommitsFilteredAndEnriched(t *testing.T) {
	store := newMemStore()
	r := newTestRunner(store, fixtureSource(), &mockAI{}, fixtureConfig())

	if err := r.Run(context.Background(), "scan-1"); err != nil {
		t.Fatalf("pipeline failed: %v", err)
	}

	all, _ := store.GetCommits(context.Background(), "scan-1", true)
	if len(all) != 3 {
		t.Fatalf("expected 3 commits persisted, got %d", len(all))
	}

	kept, _ := store.GetCommits(context.Background(), "scan-1", false)
	if len(kept) != 2 {
		t.Fatalf("expected 2 non-noise commits (bot filtered), got %d", len(kept))
	}
}

func TestRunner_FullPipeline_MarksBotCommitAsNoise(t *testing.T) {
	store := newMemStore()
	r := newTestRunner(store, fixtureSource(), &mockAI{}, fixtureConfig())
	if err := r.Run(context.Background(), "scan-1"); err != nil {
		t.Fatalf("pipeline failed: %v", err)
	}

	all, _ := store.GetCommits(context.Background(), "scan-1", true)
	var bot *Commit
	for i := range all {
		if all[i].SHA == "sha-bot" {
			bot = &all[i]
		}
	}
	if bot == nil {
		t.Fatal("bot commit not found")
	}
	if !bot.IsNoise || !bot.IsBotCommit {
		t.Errorf("expected bot commit flagged noise+bot, got noise=%v bot=%v", bot.IsNoise, bot.IsBotCommit)
	}
}

func TestRunner_FullPipeline_EnrichesDomainAndIssues(t *testing.T) {
	store := newMemStore()
	r := newTestRunner(store, fixtureSource(), &mockAI{}, fixtureConfig())
	if err := r.Run(context.Background(), "scan-1"); err != nil {
		t.Fatalf("pipeline failed: %v", err)
	}

	kept, _ := store.GetCommits(context.Background(), "scan-1", false)
	for _, c := range kept {
		if c.Domain == nil || *c.Domain != "auth" {
			t.Errorf("expected auth domain on commit %s, got %v", c.SHA, c.Domain)
		}
	}
}

func TestRunner_FullPipeline_CreatesGroupsWithSummaries(t *testing.T) {
	store := newMemStore()
	r := newTestRunner(store, fixtureSource(), &mockAI{}, fixtureConfig())
	if err := r.Run(context.Background(), "scan-1"); err != nil {
		t.Fatalf("pipeline failed: %v", err)
	}

	groups, _ := store.GetCommitGroups(context.Background(), "scan-1")
	if len(groups) != 2 {
		t.Fatalf("expected 2 groups (PR + auth domain), got %d", len(groups))
	}
	for _, g := range groups {
		if g.Summary == nil {
			t.Errorf("group %s missing summary", g.Label)
		}
	}
}

func TestRunner_FullPipeline_SavesOneDraftPerAudience(t *testing.T) {
	store := newMemStore()
	r := newTestRunner(store, fixtureSource(), &mockAI{}, fixtureConfig())
	if err := r.Run(context.Background(), "scan-1"); err != nil {
		t.Fatalf("pipeline failed: %v", err)
	}

	if len(store.drafts) != 2 {
		t.Fatalf("expected 2 audience drafts, got %d", len(store.drafts))
	}
}

func TestRunner_FullPipeline_EndsAwaitingApproval(t *testing.T) {
	store := newMemStore()
	r := newTestRunner(store, fixtureSource(), &mockAI{}, fixtureConfig())
	if err := r.Run(context.Background(), "scan-1"); err != nil {
		t.Fatalf("pipeline failed: %v", err)
	}

	if store.lastStatus() != ScanStatusAwaitingApproval {
		t.Errorf("expected final status awaiting_approval, got %q", store.lastStatus())
	}
}

func TestRunner_SourceFailureFailsScan(t *testing.T) {
	store := newMemStore()
	src := &mockSource{resp: &SourcePluginResponse{}, err: context.DeadlineExceeded}
	r := newTestRunner(store, src, &mockAI{}, fixtureConfig())

	if err := r.Run(context.Background(), "scan-1"); err == nil {
		t.Fatal("expected scan to fail when source plugin fails")
	}
	if store.lastStatus() != ScanStatusRunning {
		t.Errorf("expected running status (worker marks failed after retries), got %q", store.lastStatus())
	}
}

func TestKeepByBaseBranch(t *testing.T) {
	commits := []SourcePluginCommit{
		{SHA: "a", PRBaseBranch: strPtr("main")},
		{SHA: "b", PRBaseBranch: strPtr("develop")},
		{SHA: "c", PRBaseBranch: nil}, // no PR base → always kept
		{SHA: "d", PRBaseBranch: strPtr("release")},
	}

	all := keepByBaseBranch(commits, nil)
	if len(all) != 4 {
		t.Fatalf("empty filter should keep all, got %d", len(all))
	}

	filtered := keepByBaseBranch(commits, []string{"main", "release"})
	got := map[string]bool{}
	for _, c := range filtered {
		got[c.SHA] = true
	}
	if !got["a"] || !got["c"] || !got["d"] || got["b"] {
		t.Fatalf("unexpected kept set: %v", got)
	}
}

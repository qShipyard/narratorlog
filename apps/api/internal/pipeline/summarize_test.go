package pipeline

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"
)

// ─── Mock AI Provider ─────────────────────────────────────────────────────────

type mockAI struct {
	mu            sync.Mutex
	summarizeReqs []SummarizePluginRequest
	generateReqs  []GeneratePluginRequest
	summarizeFn   func(SummarizePluginRequest) (*SummarizePluginResponse, error)
	generateFn    func(GeneratePluginRequest) (*GeneratePluginResponse, error)
}

func (m *mockAI) Summarize(_ context.Context, req SummarizePluginRequest) (*SummarizePluginResponse, error) {
	m.mu.Lock()
	m.summarizeReqs = append(m.summarizeReqs, req)
	m.mu.Unlock()
	if m.summarizeFn != nil {
		return m.summarizeFn(req)
	}
	return &SummarizePluginResponse{Summary: "summary of " + req.Group.Label, TokensUsed: 10}, nil
}

func (m *mockAI) Generate(_ context.Context, req GeneratePluginRequest) (*GeneratePluginResponse, error) {
	m.mu.Lock()
	m.generateReqs = append(m.generateReqs, req)
	m.mu.Unlock()
	if m.generateFn != nil {
		return m.generateFn(req)
	}
	return &GeneratePluginResponse{Content: "changelog for " + req.Audience.ID, TokensUsed: 20}, nil
}

func (m *mockAI) summarizeCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.summarizeReqs)
}

func (m *mockAI) generateCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.generateReqs)
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

func baseSummarizeInput() SummarizeInput {
	prTitle := "Add OAuth login"
	prDesc := "Implements GitHub OAuth login flow."
	diff := "diff --git a/auth.go ..."
	commits := []Commit{
		{
			ID:            "c1",
			ScanID:        "scan-1",
			SHA:           "sha1",
			Message:       "feat: add oauth",
			PRNumber:      intPtr(10),
			PRTitle:       &prTitle,
			PRDescription: &prDesc,
			ChangedFiles:  []string{"internal/auth/oauth.go"},
			Diff:          &diff,
			LinkedIssues:  []LinkedIssue{{Number: 5, Title: "Support SSO", URL: "u"}},
		},
	}
	groups := []CommitGroup{
		{ID: "scan-1-pr-10", ScanID: "scan-1", Label: "Add OAuth login", GroupType: GroupTypeFeature, CommitIDs: []string{"c1"}},
	}
	return SummarizeInput{
		Groups:  groups,
		Commits: commits,
		Config: ScanConfig{
			Repo:      "org/backend",
			ScanFrom:  time.Date(2026, 6, 14, 0, 0, 0, 0, time.UTC),
			ScanTo:    time.Date(2026, 6, 21, 0, 0, 0, 0, time.UTC),
			AIModel:   "claude-sonnet-4-6",
			AIAPIKey:  "key",
			Audiences: []AudienceConfig{{ID: "developers", Tone: "technical"}},
		},
		RetryDelay: time.Millisecond,
	}
}

// ─── Pass 1 — Chunk Summarization ─────────────────────────────────────────────

func TestSummarize_CallsAIOncePerGroup(t *testing.T) {
	in := baseSummarizeInput()
	in.Groups = append(in.Groups, CommitGroup{
		ID: "scan-1-pr-11", ScanID: "scan-1", Label: "Fix race", GroupType: GroupTypeFix, CommitIDs: []string{"c2"},
	})
	in.Commits = append(in.Commits, Commit{ID: "c2", SHA: "sha2", Message: "fix: race", ChangedFiles: []string{"x.go"}})

	ai := &mockAI{}
	res, err := Summarize(context.Background(), ai, in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ai.summarizeCount() != 2 {
		t.Errorf("expected 2 summarize calls, got %d", ai.summarizeCount())
	}
	if len(res.Groups) != 2 {
		t.Fatalf("expected 2 groups back, got %d", len(res.Groups))
	}
}

func TestSummarize_StoresSummaryOnGroup(t *testing.T) {
	in := baseSummarizeInput()
	ai := &mockAI{}
	res, err := Summarize(context.Background(), ai, in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Groups[0].Summary == nil {
		t.Fatal("expected group summary to be set")
	}
	if *res.Groups[0].Summary != "summary of Add OAuth login" {
		t.Errorf("unexpected summary: %q", *res.Groups[0].Summary)
	}
}

func TestSummarize_BuildsGroupInputFromCommits(t *testing.T) {
	in := baseSummarizeInput()
	ai := &mockAI{}
	if _, err := Summarize(context.Background(), ai, in); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	req := ai.summarizeReqs[0]
	if req.Action != "summarize" {
		t.Errorf("expected action=summarize, got %q", req.Action)
	}
	if req.Model != "claude-sonnet-4-6" {
		t.Errorf("model not propagated: %q", req.Model)
	}
	g := req.Group
	if g.PRTitle == nil || *g.PRTitle != "Add OAuth login" {
		t.Errorf("PR title not built: %v", g.PRTitle)
	}
	if g.PRDescription == nil || *g.PRDescription != "Implements GitHub OAuth login flow." {
		t.Errorf("PR description not built: %v", g.PRDescription)
	}
	if len(g.IssueTitles) != 1 || g.IssueTitles[0] != "Support SSO" {
		t.Errorf("issue titles not built: %v", g.IssueTitles)
	}
	if len(g.ChangedFiles) != 1 || g.ChangedFiles[0] != "internal/auth/oauth.go" {
		t.Errorf("changed files not built: %v", g.ChangedFiles)
	}
	if g.Diff == nil || !strings.Contains(*g.Diff, "diff --git") {
		t.Errorf("diff not built: %v", g.Diff)
	}
}

func TestSummarize_UnionsChangedFilesAcrossGroupCommits(t *testing.T) {
	in := baseSummarizeInput()
	in.Groups[0].CommitIDs = []string{"c1", "c2"}
	in.Commits = append(in.Commits, Commit{ID: "c2", SHA: "sha2", Message: "more", ChangedFiles: []string{"internal/auth/handlers.go", "internal/auth/oauth.go"}})

	ai := &mockAI{}
	if _, err := Summarize(context.Background(), ai, in); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	files := ai.summarizeReqs[0].Group.ChangedFiles
	if len(files) != 2 {
		t.Fatalf("expected 2 deduped files, got %v", files)
	}
}

func TestSummarize_TruncatesDiffOverTokenCapButKeepsPRDescription(t *testing.T) {
	in := baseSummarizeInput()
	huge := strings.Repeat("x", maxPass1InputChars*2)
	in.Commits[0].Diff = &huge

	ai := &mockAI{}
	if _, err := Summarize(context.Background(), ai, in); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	g := ai.summarizeReqs[0].Group
	if g.Diff == nil {
		t.Fatal("expected diff present (truncated)")
	}
	if len(*g.Diff) > maxPass1InputChars {
		t.Errorf("diff not truncated: %d chars", len(*g.Diff))
	}
	if g.PRDescription == nil || *g.PRDescription == "" {
		t.Error("PR description must be preserved when truncating")
	}
}

func TestSummarize_GroupSummaryFailureDoesNotFailPipeline(t *testing.T) {
	in := baseSummarizeInput()
	in.Groups = append(in.Groups, CommitGroup{ID: "scan-1-pr-11", ScanID: "scan-1", Label: "Doomed", GroupType: GroupTypeFix, CommitIDs: []string{"c2"}})
	in.Commits = append(in.Commits, Commit{ID: "c2", SHA: "sha2", Message: "fix", ChangedFiles: []string{"x.go"}})

	ai := &mockAI{
		summarizeFn: func(req SummarizePluginRequest) (*SummarizePluginResponse, error) {
			if req.Group.Label == "Doomed" {
				return nil, errors.New("provider down")
			}
			return &SummarizePluginResponse{Summary: "ok"}, nil
		},
	}

	res, err := Summarize(context.Background(), ai, in)
	if err != nil {
		t.Fatalf("pipeline should not fail on single group error: %v", err)
	}
	if res.Groups[0].Summary == nil {
		t.Error("healthy group should still be summarized")
	}
	if res.Groups[1].Summary != nil {
		t.Error("failed group should have no summary")
	}
}

func TestSummarize_RetriesGroupSummaryOnceBeforeGivingUp(t *testing.T) {
	in := baseSummarizeInput()
	var calls int
	var mu sync.Mutex
	ai := &mockAI{
		summarizeFn: func(req SummarizePluginRequest) (*SummarizePluginResponse, error) {
			mu.Lock()
			calls++
			n := calls
			mu.Unlock()
			if n == 1 {
				return nil, errors.New("transient")
			}
			return &SummarizePluginResponse{Summary: "recovered"}, nil
		},
	}

	res, err := Summarize(context.Background(), ai, in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Groups[0].Summary == nil || *res.Groups[0].Summary != "recovered" {
		t.Errorf("expected retry to succeed, got %v", res.Groups[0].Summary)
	}
}

// ─── Pass 2 — Audience Generation ─────────────────────────────────────────────

func TestSummarize_GeneratesOneDraftPerAudience(t *testing.T) {
	in := baseSummarizeInput()
	in.Config.Audiences = []AudienceConfig{
		{ID: "developers", Tone: "technical"},
		{ID: "marketing", Tone: "benefit-focused"},
	}

	ai := &mockAI{}
	res, err := Summarize(context.Background(), ai, in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ai.generateCount() != 2 {
		t.Errorf("expected 2 generate calls, got %d", ai.generateCount())
	}
	if len(res.Drafts) != 2 {
		t.Fatalf("expected 2 drafts, got %d", len(res.Drafts))
	}
}

func TestSummarize_DraftCarriesAudienceAndContent(t *testing.T) {
	in := baseSummarizeInput()
	ai := &mockAI{}
	res, err := Summarize(context.Background(), ai, in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	d := res.Drafts[0]
	if d.AudienceID != "developers" {
		t.Errorf("expected developers, got %q", d.AudienceID)
	}
	if d.Tone != "technical" {
		t.Errorf("expected tone technical, got %q", d.Tone)
	}
	if d.Content != "changelog for developers" {
		t.Errorf("unexpected content: %q", d.Content)
	}
	if d.ScanID != "scan-1" {
		t.Errorf("expected scan id propagated, got %q", d.ScanID)
	}
}

func TestSummarize_Pass2InputUsesPass1Summaries(t *testing.T) {
	in := baseSummarizeInput()
	ai := &mockAI{
		summarizeFn: func(req SummarizePluginRequest) (*SummarizePluginResponse, error) {
			return &SummarizePluginResponse{Summary: "SUMMARY-TOKEN"}, nil
		},
	}
	if _, err := Summarize(context.Background(), ai, in); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	req := ai.generateReqs[0]
	if len(req.Summaries) != 1 || req.Summaries[0] != "SUMMARY-TOKEN" {
		t.Errorf("pass 2 did not receive pass 1 summaries: %v", req.Summaries)
	}
	if req.Repository != "org/backend" {
		t.Errorf("repository not propagated: %q", req.Repository)
	}
	if req.ScanFrom != "2026-06-14T00:00:00Z" {
		t.Errorf("scan_from not propagated: %q", req.ScanFrom)
	}
}

func TestSummarize_ExcludesFailedGroupSummariesFromPass2(t *testing.T) {
	in := baseSummarizeInput()
	in.Groups = append(in.Groups, CommitGroup{ID: "scan-1-pr-11", ScanID: "scan-1", Label: "Doomed", GroupType: GroupTypeFix, CommitIDs: []string{"c2"}})
	in.Commits = append(in.Commits, Commit{ID: "c2", SHA: "sha2", Message: "fix", ChangedFiles: []string{"x.go"}})

	ai := &mockAI{
		summarizeFn: func(req SummarizePluginRequest) (*SummarizePluginResponse, error) {
			if req.Group.Label == "Doomed" {
				return nil, errors.New("down")
			}
			return &SummarizePluginResponse{Summary: "good-summary"}, nil
		},
	}
	if _, err := Summarize(context.Background(), ai, in); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	req := ai.generateReqs[0]
	if len(req.Summaries) != 1 || req.Summaries[0] != "good-summary" {
		t.Errorf("pass 2 should only include successful summaries: %v", req.Summaries)
	}
}

func TestSummarize_AudienceFailureMarkedNotFatal(t *testing.T) {
	in := baseSummarizeInput()
	in.Config.Audiences = []AudienceConfig{
		{ID: "developers", Tone: "technical"},
		{ID: "marketing", Tone: "benefit-focused"},
	}
	ai := &mockAI{
		generateFn: func(req GeneratePluginRequest) (*GeneratePluginResponse, error) {
			if req.Audience.ID == "marketing" {
				return nil, errors.New("provider down")
			}
			return &GeneratePluginResponse{Content: "ok"}, nil
		},
	}
	res, err := Summarize(context.Background(), ai, in)
	if err != nil {
		t.Fatalf("audience failure must not fail the scan: %v", err)
	}
	if len(res.Drafts) != 1 {
		t.Errorf("expected 1 successful draft, got %d", len(res.Drafts))
	}
	if len(res.FailedAudiences) != 1 || res.FailedAudiences[0] != "marketing" {
		t.Errorf("expected marketing in failed audiences, got %v", res.FailedAudiences)
	}
}

func TestSummarize_RetriesAudienceGenerationOnce(t *testing.T) {
	in := baseSummarizeInput()
	var calls int
	var mu sync.Mutex
	ai := &mockAI{
		generateFn: func(req GeneratePluginRequest) (*GeneratePluginResponse, error) {
			mu.Lock()
			calls++
			n := calls
			mu.Unlock()
			if n == 1 {
				return nil, errors.New("transient")
			}
			return &GeneratePluginResponse{Content: "recovered"}, nil
		},
	}
	res, err := Summarize(context.Background(), ai, in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.Drafts) != 1 || res.Drafts[0].Content != "recovered" {
		t.Errorf("expected retry to recover draft, got %v", res.Drafts)
	}
}

func TestSummarize_NoGroupsProducesNoDraftsWithoutError(t *testing.T) {
	in := baseSummarizeInput()
	in.Groups = nil
	in.Commits = nil

	ai := &mockAI{}
	res, err := Summarize(context.Background(), ai, in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ai.summarizeCount() != 0 {
		t.Errorf("expected no summarize calls, got %d", ai.summarizeCount())
	}
	// With no summaries there is nothing to write about — skip pass 2.
	if len(res.Drafts) != 0 {
		t.Errorf("expected no drafts, got %d", len(res.Drafts))
	}
}

package pipeline

import (
	"fmt"
	"testing"
	"time"
)

// stubResolver satisfies IssueResolver for tests.
type stubResolver struct {
	issues map[int]*LinkedIssue
}

func (s *stubResolver) ResolveIssue(number int) (*LinkedIssue, error) {
	if issue, ok := s.issues[number]; ok {
		return issue, nil
	}
	return nil, fmt.Errorf("issue #%d not found", number)
}

func makeEnrichCommit(sha, message string) Commit {
	return Commit{
		ID:          sha,
		ScanID:      "scan-1",
		SHA:         sha,
		Message:     message,
		AuthorName:  "Dev",
		AuthorEmail: "dev@qShipyard.com",
		CommittedAt: time.Now(),
	}
}

// ─── Breaking Change Detection ────────────────────────────────────────────────

func TestEnrich_DetectsBreakingConventionalCommit(t *testing.T) {
	cases := []struct {
		message string
	}{
		{"feat!: remove legacy auth endpoint"},
		{"fix!: change response shape for /api/users"},
		{"feat(auth)!: drop support for API key auth"},
	}

	for _, tc := range cases {
		c := makeEnrichCommit("b01", tc.message)
		result := enrichOne(c, EnrichConfig{})
		if !result.IsBreaking {
			t.Errorf("expected IsBreaking=true for message: %q", tc.message)
		}
	}
}

func TestEnrich_DetectsBreakingFooter(t *testing.T) {
	message := `feat: migrate to new token format

BREAKING CHANGE: tokens issued before v2 are no longer valid`

	c := makeEnrichCommit("b02", message)
	result := enrichOne(c, EnrichConfig{})

	if !result.IsBreaking {
		t.Error("expected IsBreaking=true for BREAKING CHANGE footer")
	}
}

func TestEnrich_DetectsBreakingInPRTitle(t *testing.T) {
	title := "feat(api)!: remove deprecated v1 endpoints"
	c := makeEnrichCommit("b03", "chore: remove v1")
	c.PRTitle = &title

	result := enrichOne(c, EnrichConfig{})

	if !result.IsBreaking {
		t.Error("expected IsBreaking=true from PR title")
	}
}

func TestEnrich_DoesNotFalsePositiveBreaking(t *testing.T) {
	cases := []string{
		"feat: add new login flow",
		"fix: handle nil pointer",
		"chore: update deps",
		"feat(auth): add OAuth support",
	}

	for _, msg := range cases {
		c := makeEnrichCommit("b04", msg)
		result := enrichOne(c, EnrichConfig{})
		if result.IsBreaking {
			t.Errorf("unexpected IsBreaking=true for: %q", msg)
		}
	}
}

// ─── Domain Inference ─────────────────────────────────────────────────────────

func TestEnrich_InfersDomainFromFiles(t *testing.T) {
	cases := []struct {
		files    []string
		expected string
	}{
		{[]string{"internal/auth/oauth.go", "internal/auth/middleware.go"}, "auth"},
		{[]string{"internal/payment/processor.go"}, "payments"},
		{[]string{"apps/web/app/dashboard/page.tsx"}, "frontend"},
		{[]string{"deploy/docker-compose.yml"}, "infrastructure"},
		{[]string{".github/workflows/ci.yml"}, "ci"},
		{[]string{"packages/reader/src/main.rs"}, "reader"},
	}

	for _, tc := range cases {
		c := makeEnrichCommit("d01", "feat: something")
		c.ChangedFiles = tc.files
		result := enrichOne(c, EnrichConfig{})

		if result.Domain == nil {
			t.Errorf("expected domain %q, got nil for files %v", tc.expected, tc.files)
			continue
		}
		if *result.Domain != tc.expected {
			t.Errorf("expected domain %q, got %q for files %v", tc.expected, *result.Domain, tc.files)
		}
	}
}

func TestEnrich_PicksDominantDomain(t *testing.T) {
	// 3 auth files, 1 frontend file — should resolve to auth
	c := makeEnrichCommit("d02", "feat: auth overhaul")
	c.ChangedFiles = []string{
		"internal/auth/oauth.go",
		"internal/auth/session.go",
		"internal/auth/middleware.go",
		"apps/web/app/login/page.tsx",
	}

	result := enrichOne(c, EnrichConfig{})

	if result.Domain == nil || *result.Domain != "auth" {
		t.Errorf("expected dominant domain auth, got %v", result.Domain)
	}
}

func TestEnrich_NilDomainWhenNoRuleMatches(t *testing.T) {
	c := makeEnrichCommit("d03", "docs: update readme")
	c.ChangedFiles = []string{"README.md", "CHANGELOG.md"}

	result := enrichOne(c, EnrichConfig{})

	if result.Domain != nil {
		t.Errorf("expected nil domain for unmatched files, got %q", *result.Domain)
	}
}

// ─── Issue Resolution ─────────────────────────────────────────────────────────

func TestEnrich_ResolvesIssuesFromMessage(t *testing.T) {
	resolver := &stubResolver{
		issues: map[int]*LinkedIssue{
			42: {Number: 42, Title: "Add OAuth login", URL: "https://github.com/org/repo/issues/42"},
		},
	}

	c := makeEnrichCommit("i01", "feat: add login\n\nCloses #42")
	result := enrichOne(c, EnrichConfig{IssueResolver: resolver})

	if len(result.LinkedIssues) != 1 {
		t.Fatalf("expected 1 linked issue, got %d", len(result.LinkedIssues))
	}
	if result.LinkedIssues[0].Number != 42 {
		t.Errorf("expected issue #42, got #%d", result.LinkedIssues[0].Number)
	}
}

func TestEnrich_ResolvesIssuesFromPRDescription(t *testing.T) {
	resolver := &stubResolver{
		issues: map[int]*LinkedIssue{
			7: {Number: 7, Title: "Fix payment race condition", URL: "https://github.com/org/repo/issues/7"},
		},
	}

	desc := "This PR fixes the race condition.\n\nFixes #7"
	c := makeEnrichCommit("i02", "fix: payment race")
	c.PRDescription = &desc

	result := enrichOne(c, EnrichConfig{IssueResolver: resolver})

	if len(result.LinkedIssues) != 1 || result.LinkedIssues[0].Number != 7 {
		t.Errorf("expected issue #7 from PR description, got %v", result.LinkedIssues)
	}
}

func TestEnrich_DeduplicatesIssueReferences(t *testing.T) {
	resolver := &stubResolver{
		issues: map[int]*LinkedIssue{
			99: {Number: 99, Title: "Some issue", URL: "https://github.com/org/repo/issues/99"},
		},
	}

	// #99 appears in both message and PR description
	desc := "Closes #99"
	c := makeEnrichCommit("i03", "feat: thing\n\nCloses #99")
	c.PRDescription = &desc

	result := enrichOne(c, EnrichConfig{IssueResolver: resolver})

	if len(result.LinkedIssues) != 1 {
		t.Errorf("expected 1 deduplicated issue, got %d", len(result.LinkedIssues))
	}
}

func TestEnrich_SkipsIssuesGracefullyWhenResolverFails(t *testing.T) {
	resolver := &stubResolver{issues: map[int]*LinkedIssue{}} // empty — all lookups fail

	c := makeEnrichCommit("i04", "feat: thing\n\nCloses #55")
	result := enrichOne(c, EnrichConfig{IssueResolver: resolver})

	// Should not error — just no linked issues
	if len(result.LinkedIssues) != 0 {
		t.Errorf("expected 0 issues on resolver failure, got %d", len(result.LinkedIssues))
	}
}

func TestEnrich_SkipsIssueResolutionWithNilResolver(t *testing.T) {
	c := makeEnrichCommit("i05", "feat: thing\n\nCloses #10")
	result := enrichOne(c, EnrichConfig{IssueResolver: nil})

	if len(result.LinkedIssues) != 0 {
		t.Errorf("expected 0 issues with nil resolver, got %d", len(result.LinkedIssues))
	}
}

func TestEnrich_ParsesAllIssueRefVariants(t *testing.T) {
	resolver := &stubResolver{
		issues: map[int]*LinkedIssue{
			1: {Number: 1, Title: "One"},
			2: {Number: 2, Title: "Two"},
			3: {Number: 3, Title: "Three"},
			4: {Number: 4, Title: "Four"},
		},
	}

	message := "feat: thing\n\nCloses #1\nFixes #2\nResolves #3\nRefs #4"
	c := makeEnrichCommit("i06", message)
	result := enrichOne(c, EnrichConfig{IssueResolver: resolver})

	if len(result.LinkedIssues) != 4 {
		t.Errorf("expected 4 linked issues, got %d", len(result.LinkedIssues))
	}
}

// ─── Enrich (batch) ───────────────────────────────────────────────────────────

func TestEnrich_ProcessesAllCommits(t *testing.T) {
	commits := []Commit{
		makeEnrichCommit("e01", "feat!: breaking thing"),
		makeEnrichCommit("e02", "fix: normal fix"),
		makeEnrichCommit("e03", "feat: another thing"),
	}
	commits[0].ChangedFiles = []string{"internal/auth/oauth.go"}
	commits[1].ChangedFiles = []string{"internal/payment/processor.go"}

	result := Enrich(commits, EnrichConfig{})

	if len(result) != 3 {
		t.Fatalf("expected 3 enriched commits, got %d", len(result))
	}
	if !result[0].IsBreaking {
		t.Error("expected first commit to be breaking")
	}
	if result[0].Domain == nil || *result[0].Domain != "auth" {
		t.Error("expected auth domain on first commit")
	}
	if result[1].Domain == nil || *result[1].Domain != "payments" {
		t.Error("expected payments domain on second commit")
	}
}

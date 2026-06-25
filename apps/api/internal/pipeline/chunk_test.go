package pipeline

import (
	"testing"
	"time"
)

func makeChunkCommit(id, sha, message string, prNumber *int, prTitle *string, files []string, isBreaking bool) Commit {
	return Commit{
		ID:           id,
		ScanID:       "scan-1",
		SHA:          sha,
		Message:      message,
		AuthorName:   "Dev",
		AuthorEmail:  "dev@qShipyard.com",
		CommittedAt:  time.Now(),
		PRNumber:     prNumber,
		PRTitle:      prTitle,
		ChangedFiles: files,
		IsBreaking:   isBreaking,
	}
}

func intPtr(n int) *int       { return &n }
func strPtr(s string) *string { return &s }

// ─── PR Grouping ──────────────────────────────────────────────────────────────

func TestChunk_GroupsCommitsByPR(t *testing.T) {
	commits := []Commit{
		makeChunkCommit("c1", "sha1", "feat: add login", intPtr(10), strPtr("Add OAuth login"), []string{"auth.go"}, false),
		makeChunkCommit("c2", "sha2", "fix: handle redirect", intPtr(10), strPtr("Add OAuth login"), []string{"auth.go"}, false),
		makeChunkCommit("c3", "sha3", "fix: payment bug", intPtr(11), strPtr("Fix payment race"), []string{"payment.go"}, false),
	}

	groups := Chunk(commits, ChunkConfig{ScanID: "scan-1"})

	if len(groups) != 2 {
		t.Fatalf("expected 2 groups, got %d", len(groups))
	}
	if len(groups[0].CommitIDs) != 2 {
		t.Errorf("expected PR 10 group to have 2 commits, got %d", len(groups[0].CommitIDs))
	}
	if len(groups[1].CommitIDs) != 1 {
		t.Errorf("expected PR 11 group to have 1 commit, got %d", len(groups[1].CommitIDs))
	}
}

func TestChunk_UsesPRTitleAsLabel(t *testing.T) {
	commits := []Commit{
		makeChunkCommit("c1", "sha1", "feat: thing", intPtr(5), strPtr("Add user invitations"), []string{"users.go"}, false),
	}

	groups := Chunk(commits, ChunkConfig{ScanID: "scan-1"})

	if groups[0].Label != "Add user invitations" {
		t.Errorf("expected PR title as label, got %q", groups[0].Label)
	}
}

func TestChunk_FallsBackToCommitMessageWhenNoPRTitle(t *testing.T) {
	commits := []Commit{
		makeChunkCommit("c1", "sha1", "feat: add invitations", intPtr(5), nil, []string{"users.go"}, false),
	}

	groups := Chunk(commits, ChunkConfig{ScanID: "scan-1"})

	if groups[0].Label != "feat: add invitations" {
		t.Errorf("expected commit message as label, got %q", groups[0].Label)
	}
}

func TestChunk_PreservesGroupInsertionOrder(t *testing.T) {
	commits := []Commit{
		makeChunkCommit("c1", "sha1", "feat: a", intPtr(1), strPtr("PR One"), []string{"a.go"}, false),
		makeChunkCommit("c2", "sha2", "feat: b", intPtr(2), strPtr("PR Two"), []string{"b.go"}, false),
		makeChunkCommit("c3", "sha3", "feat: c", intPtr(3), strPtr("PR Three"), []string{"c.go"}, false),
	}

	groups := Chunk(commits, ChunkConfig{ScanID: "scan-1"})

	if len(groups) != 3 {
		t.Fatalf("expected 3 groups, got %d", len(groups))
	}
	if groups[0].Label != "PR One" || groups[1].Label != "PR Two" || groups[2].Label != "PR Three" {
		t.Errorf("groups out of order: %v", []string{groups[0].Label, groups[1].Label, groups[2].Label})
	}
}

// ─── Domain Grouping ──────────────────────────────────────────────────────────

func TestChunk_GroupsNoPRCommitsByDomain(t *testing.T) {
	authDomain := "auth"
	paymentDomain := "payments"

	commits := []Commit{
		makeChunkCommit("c1", "sha1", "fix: session expiry", nil, nil, []string{"internal/auth/session.go"}, false),
		makeChunkCommit("c2", "sha2", "fix: token refresh", nil, nil, []string{"internal/auth/token.go"}, false),
		makeChunkCommit("c3", "sha3", "fix: charge failure", nil, nil, []string{"internal/payment/charge.go"}, false),
	}
	commits[0].Domain = &authDomain
	commits[1].Domain = &authDomain
	commits[2].Domain = &paymentDomain

	groups := Chunk(commits, ChunkConfig{ScanID: "scan-1"})

	if len(groups) != 2 {
		t.Fatalf("expected 2 domain groups, got %d", len(groups))
	}
	if len(groups[0].CommitIDs) != 2 {
		t.Errorf("expected auth group to have 2 commits, got %d", len(groups[0].CommitIDs))
	}
}

func TestChunk_SingletonGroupForCommitWithNoDomainAndNoPR(t *testing.T) {
	commits := []Commit{
		makeChunkCommit("c1", "sha1", "docs: update readme", nil, nil, []string{"README.md"}, false),
		makeChunkCommit("c2", "sha2", "docs: update license", nil, nil, []string{"LICENSE"}, false),
	}

	groups := Chunk(commits, ChunkConfig{ScanID: "scan-1"})

	// Each becomes its own singleton group
	if len(groups) != 2 {
		t.Errorf("expected 2 singleton groups, got %d", len(groups))
	}
}

// ─── Group Type Inference ─────────────────────────────────────────────────────

func TestChunk_InfersFeatureGroupType(t *testing.T) {
	commits := []Commit{
		makeChunkCommit("c1", "sha1", "feat: add SSO support", intPtr(20), strPtr("Add SSO"), []string{"auth.go"}, false),
	}

	groups := Chunk(commits, ChunkConfig{ScanID: "scan-1"})

	if groups[0].GroupType != GroupTypeFeature {
		t.Errorf("expected GroupTypeFeature, got %s", groups[0].GroupType)
	}
}

func TestChunk_InfersFixGroupType(t *testing.T) {
	commits := []Commit{
		makeChunkCommit("c1", "sha1", "fix: nil pointer in handler", intPtr(21), strPtr("Fix nil pointer"), []string{"handler.go"}, false),
	}

	groups := Chunk(commits, ChunkConfig{ScanID: "scan-1"})

	if groups[0].GroupType != GroupTypeFix {
		t.Errorf("expected GroupTypeFix, got %s", groups[0].GroupType)
	}
}

func TestChunk_BreakingTakesPrecedenceOverOtherTypes(t *testing.T) {
	commits := []Commit{
		makeChunkCommit("c1", "sha1", "feat!: remove v1 API", intPtr(22), strPtr("Remove v1 API"), []string{"api.go"}, true),
		makeChunkCommit("c2", "sha2", "feat: add v2 API", intPtr(22), strPtr("Remove v1 API"), []string{"api.go"}, false),
	}

	groups := Chunk(commits, ChunkConfig{ScanID: "scan-1"})

	if groups[0].GroupType != GroupTypeBreaking {
		t.Errorf("expected GroupTypeBreaking, got %s", groups[0].GroupType)
	}
}

func TestChunk_InfersChoreGroupType(t *testing.T) {
	cases := []string{
		"chore: update dependencies",
		"refactor: simplify auth flow",
		"docs: add API reference",
		"ci: update deploy workflow",
	}

	for _, msg := range cases {
		commits := []Commit{
			makeChunkCommit("c1", "sha1", msg, intPtr(30), nil, []string{"main.go"}, false),
		}
		groups := Chunk(commits, ChunkConfig{ScanID: "scan-1"})
		if groups[0].GroupType != GroupTypeChore {
			t.Errorf("expected GroupTypeChore for %q, got %s", msg, groups[0].GroupType)
		}
	}
}

// ─── Mixed Commits ────────────────────────────────────────────────────────────

func TestChunk_HandlesMixOfPRAndNoPRCommits(t *testing.T) {
	authDomain := "auth"

	commits := []Commit{
		makeChunkCommit("c1", "sha1", "feat: OAuth", intPtr(10), strPtr("Add OAuth"), []string{"auth.go"}, false),
		makeChunkCommit("c2", "sha2", "fix: session bug", nil, nil, []string{"session.go"}, false),
	}
	commits[1].Domain = &authDomain

	groups := Chunk(commits, ChunkConfig{ScanID: "scan-1"})

	// PR group first, then domain group
	if len(groups) != 2 {
		t.Fatalf("expected 2 groups, got %d", len(groups))
	}
	if groups[0].Label != "Add OAuth" {
		t.Errorf("expected PR group first, got %q", groups[0].Label)
	}
}

func TestChunk_EmptyCommitsReturnsEmptyGroups(t *testing.T) {
	groups := Chunk([]Commit{}, ChunkConfig{ScanID: "scan-1"})

	if len(groups) != 0 {
		t.Errorf("expected 0 groups for empty input, got %d", len(groups))
	}
}

func TestChunk_GroupIDsAreUnique(t *testing.T) {
	commits := []Commit{
		makeChunkCommit("c1", "sha1", "feat: a", intPtr(1), strPtr("PR One"), []string{"a.go"}, false),
		makeChunkCommit("c2", "sha2", "feat: b", intPtr(2), strPtr("PR Two"), []string{"b.go"}, false),
		makeChunkCommit("c3", "sha3", "feat: c", intPtr(3), strPtr("PR Three"), []string{"c.go"}, false),
	}

	groups := Chunk(commits, ChunkConfig{ScanID: "scan-1"})

	seen := map[string]bool{}
	for _, g := range groups {
		if seen[g.ID] {
			t.Errorf("duplicate group ID: %s", g.ID)
		}
		seen[g.ID] = true
	}
}

package pipeline

import (
	"testing"
	"time"
)

func makeCommit(sha, message, authorName, authorEmail string, files []string) Commit {
	return Commit{
		ID:           sha,
		ScanID:       "scan-1",
		SHA:          sha,
		Message:      message,
		AuthorName:   authorName,
		AuthorEmail:  authorEmail,
		CommittedAt:  time.Now(),
		ChangedFiles: files,
	}
}

func TestFilter_KeepsCleanCommits(t *testing.T) {
	commits := []Commit{
		makeCommit("abc1", "feat: add OAuth login", "James", "james@qShipyard.com", []string{"internal/auth/oauth.go"}),
		makeCommit("abc2", "fix: handle nil pointer in payment flow", "Sarah", "sarah@qShipyard.com", []string{"internal/payments/processor.go"}),
	}

	result := Filter(commits, FilterConfig{})

	if len(result.Kept) != 2 {
		t.Errorf("expected 2 kept commits, got %d", len(result.Kept))
	}
	if len(result.Filtered) != 0 {
		t.Errorf("expected 0 filtered commits, got %d", len(result.Filtered))
	}
}

func TestFilter_RemovesBotCommits(t *testing.T) {
	commits := []Commit{
		makeCommit("b01", "chore(deps): bump lodash from 4.17.20 to 4.17.21", "dependabot[bot]", "dependabot[bot]@users.noreply.github.com", []string{"package.json"}),
		makeCommit("b02", "fix(deps): update dependency axios to v1", "renovate[bot]", "renovate@whitesourcesoftware.com", []string{"package.json"}),
		makeCommit("b03", "feat: real work", "James", "james@qShipyard.com", []string{"main.go"}),
	}

	result := Filter(commits, FilterConfig{})

	if len(result.Kept) != 1 {
		t.Errorf("expected 1 kept commit, got %d", len(result.Kept))
	}
	if !result.Filtered[0].IsBotCommit {
		t.Error("expected filtered commit to be marked as bot")
	}
	if !result.Filtered[1].IsBotCommit {
		t.Error("expected filtered commit to be marked as bot")
	}
}

func TestFilter_RemovesNoiseMessages(t *testing.T) {
	noisy := []Commit{
		makeCommit("n01", "wip", "Dev", "dev@qShipyard.com", []string{"main.go"}),
		makeCommit("n02", "WIP: still working", "Dev", "dev@qShipyard.com", []string{"main.go"}),
		makeCommit("n03", "merge branch 'dev' into main", "Dev", "dev@qShipyard.com", []string{"main.go"}),
		makeCommit("n04", "Merge pull request #42 from org/feat/thing", "Dev", "dev@qShipyard.com", []string{"main.go"}),
		makeCommit("n05", "fix typo in readme", "Dev", "dev@qShipyard.com", []string{"README.md"}),
		makeCommit("n06", "fixup! previous commit", "Dev", "dev@qShipyard.com", []string{"main.go"}),
		makeCommit("n07", "squash! cleanup", "Dev", "dev@qShipyard.com", []string{"main.go"}),
	}

	result := Filter(noisy, FilterConfig{})

	if len(result.Kept) != 0 {
		t.Errorf("expected 0 kept commits, got %d — kept: %v", len(result.Kept), result.Kept)
	}
	if len(result.Filtered) != len(noisy) {
		t.Errorf("expected all %d commits filtered, got %d", len(noisy), len(result.Filtered))
	}
}

func TestFilter_RemovesLockFileOnlyCommits(t *testing.T) {
	commits := []Commit{
		makeCommit("l01", "chore: update deps", "Dev", "dev@qShipyard.com", []string{"yarn.lock"}),
		makeCommit("l02", "chore: update deps", "Dev", "dev@qShipyard.com", []string{"go.sum", "package-lock.json"}),
		// has a real file alongside lock file — should be kept
		makeCommit("l03", "feat: add thing", "Dev", "dev@qShipyard.com", []string{"go.sum", "main.go"}),
	}

	result := Filter(commits, FilterConfig{})

	if len(result.Kept) != 1 {
		t.Errorf("expected 1 kept commit, got %d", len(result.Kept))
	}
	if result.Kept[0].SHA != "l03" {
		t.Errorf("expected l03 to be kept, got %s", result.Kept[0].SHA)
	}
}

func TestFilter_DeduplicatesKnownSHAs(t *testing.T) {
	commits := []Commit{
		makeCommit("known1", "feat: already logged last week", "Dev", "dev@qShipyard.com", []string{"main.go"}),
		makeCommit("new1", "feat: new this week", "Dev", "dev@qShipyard.com", []string{"main.go"}),
	}

	result := Filter(commits, FilterConfig{
		KnownSHAs: map[string]bool{"known1": true},
	})

	if len(result.Kept) != 1 || result.Kept[0].SHA != "new1" {
		t.Errorf("expected only new1 to be kept, got %v", result.Kept)
	}
}

func TestFilter_RespectsCustomSkipPatterns(t *testing.T) {
	commits := []Commit{
		makeCommit("c01", "chore: update ci config", "Dev", "dev@qShipyard.com", []string{"main.go"}),
		makeCommit("c02", "feat: real feature", "Dev", "dev@qShipyard.com", []string{"main.go"}),
	}

	result := Filter(commits, FilterConfig{
		SkipPatterns: []string{`^chore:`},
	})

	if len(result.Kept) != 1 || result.Kept[0].SHA != "c02" {
		t.Errorf("expected only c02 kept, got %v", result.Kept)
	}
}

func TestFilter_RespectsCustomSkipAuthors(t *testing.T) {
	commits := []Commit{
		makeCommit("a01", "feat: thing", "release-bot", "release@internal.com", []string{"main.go"}),
		makeCommit("a02", "feat: thing", "James", "james@qShipyard.com", []string{"main.go"}),
	}

	result := Filter(commits, FilterConfig{
		SkipAuthors: []string{"release-bot"},
	})

	if len(result.Kept) != 1 || result.Kept[0].SHA != "a02" {
		t.Errorf("expected only a02 kept, got %v", result.Kept)
	}
}

func TestFilter_NoiseCommitsRetainIsNoiseFlag(t *testing.T) {
	commits := []Commit{
		makeCommit("x01", "wip: testing something", "Dev", "dev@qShipyard.com", []string{"main.go"}),
	}

	result := Filter(commits, FilterConfig{})

	if len(result.Filtered) != 1 {
		t.Fatalf("expected 1 filtered commit")
	}
	if !result.Filtered[0].IsNoise {
		t.Error("expected IsNoise to be true on filtered commit")
	}
}

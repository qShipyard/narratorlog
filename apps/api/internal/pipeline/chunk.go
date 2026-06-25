package pipeline

import (
	"fmt"
	"strings"
)

type ChunkConfig struct {
	ScanID string
}

func Chunk(commits []Commit, cfg ChunkConfig) []CommitGroup {
	// Group by PR first — highest signal
	byPR := groupByPR(commits, cfg.ScanID)

	// Remaining commits (no PR) grouped by domain
	noPR := commitsWithoutPR(commits)
	byDomain := groupByDomain(noPR, cfg.ScanID)

	return append(byPR, byDomain...)
}

// groupByPR collects commits sharing a PR number into one group.
func groupByPR(commits []Commit, scanID string) []CommitGroup {
	// preserve insertion order
	order := []int{}
	buckets := map[int][]Commit{}

	for _, c := range commits {
		if c.PRNumber == nil {
			continue
		}
		n := *c.PRNumber
		if _, exists := buckets[n]; !exists {
			order = append(order, n)
		}
		buckets[n] = append(buckets[n], c)
	}

	groups := make([]CommitGroup, 0, len(order))
	for _, n := range order {
		cs := buckets[n]
		groups = append(groups, CommitGroup{
			ID:        groupID(scanID, fmt.Sprintf("pr-%d", n)),
			ScanID:    scanID,
			Label:     prLabel(cs),
			GroupType: inferGroupType(cs),
			CommitIDs: commitIDs(cs),
		})
	}

	return groups
}

// groupByDomain collects commits without a PR, bucketed by inferred domain.
// Commits with no domain become singleton groups.
func groupByDomain(commits []Commit, scanID string) []CommitGroup {
	order := []string{}
	buckets := map[string][]Commit{}

	for _, c := range commits {
		key := "other"
		if c.Domain != nil {
			key = *c.Domain
		} else {
			// singleton — use SHA as unique key
			key = "singleton-" + c.SHA
		}
		if _, exists := buckets[key]; !exists {
			order = append(order, key)
		}
		buckets[key] = append(buckets[key], c)
	}

	groups := make([]CommitGroup, 0, len(order))
	for _, key := range order {
		cs := buckets[key]
		groups = append(groups, CommitGroup{
			ID:        groupID(scanID, key),
			ScanID:    scanID,
			Label:     domainLabel(key, cs),
			GroupType: inferGroupType(cs),
			CommitIDs: commitIDs(cs),
		})
	}

	return groups
}

func commitsWithoutPR(commits []Commit) []Commit {
	out := commits[:0:0]
	for _, c := range commits {
		if c.PRNumber == nil {
			out = append(out, c)
		}
	}
	return out
}

// inferGroupType derives a GroupType from the commits in the group.
// Breaking takes precedence over everything else.
func inferGroupType(commits []Commit) GroupType {
	for _, c := range commits {
		if c.IsBreaking {
			return GroupTypeBreaking
		}
	}

	// Use the first commit's message prefix as the signal
	if len(commits) == 0 {
		return GroupTypeOther
	}

	msg := strings.ToLower(firstLine(commits[0].Message))

	switch {
	case hasAnyPrefix(msg, "feat:", "feat("):
		return GroupTypeFeature
	case hasAnyPrefix(msg, "fix:", "fix(", "bug:"):
		return GroupTypeFix
	case hasAnyPrefix(msg, "sec:", "security:"):
		return GroupTypeSecurity
	case hasAnyPrefix(msg, "chore:", "refactor:", "docs:", "ci:", "build:", "test:"):
		return GroupTypeChore
	}

	// Fall back to PR title if commit message gives no signal
	if commits[0].PRTitle != nil {
		title := strings.ToLower(*commits[0].PRTitle)
		switch {
		case strings.Contains(title, "feature") || strings.Contains(title, "add "):
			return GroupTypeFeature
		case strings.Contains(title, "fix") || strings.Contains(title, "bug"):
			return GroupTypeFix
		case strings.Contains(title, "security") || strings.Contains(title, "cve"):
			return GroupTypeSecurity
		}
	}

	return GroupTypeOther
}

func prLabel(commits []Commit) string {
	for _, c := range commits {
		if c.PRTitle != nil && strings.TrimSpace(*c.PRTitle) != "" {
			return *c.PRTitle
		}
	}
	// No PR title — use first commit message
	if len(commits) > 0 {
		return firstLine(commits[0].Message)
	}
	return "Untitled"
}

func domainLabel(key string, commits []Commit) string {
	if strings.HasPrefix(key, "singleton-") {
		if len(commits) > 0 {
			return firstLine(commits[0].Message)
		}
		return "Untitled"
	}
	return strings.Title(key) + " changes"
}

func groupID(scanID, suffix string) string {
	return fmt.Sprintf("%s-%s", scanID, suffix)
}

func hasAnyPrefix(s string, prefixes ...string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(s, p) {
			return true
		}
	}
	return false
}

func commitIDs(commits []Commit) []string {
	ids := make([]string, len(commits))
	for i, c := range commits {
		ids[i] = c.ID
	}
	return ids
}

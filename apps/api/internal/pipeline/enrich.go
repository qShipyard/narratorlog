package pipeline

import (
	"regexp"
	"strings"
)

// Issue reference patterns per the GitHub/GitLab spec.
// Matches: closes #123, fixes #42, refs #7, resolves #99 (case-insensitive)
var issueRefPattern = regexp.MustCompile(`(?i)(?:closes?|fixes?|resolves?|refs?)\s+#(\d+)`)

// Conventional commit type prefix — e.g. "feat!:", "fix!:"
var breakingPrefixPattern = regexp.MustCompile(`^[a-z]+(\([^)]+\))?!:`)

// domainRules maps directory prefixes to logical domain names.
// Order matters — first match wins.
var domainRules = []struct {
	prefix string
	domain string
}{
	{"internal/auth", "auth"},
	{"internal/payment", "payments"},
	{"internal/billing", "billing"},
	{"internal/notification", "notifications"},
	{"internal/api", "api"},
	{"internal/worker", "workers"},
	{"internal/db", "database"},
	{"apps/web", "frontend"},
	{"packages/reader", "reader"},
	{"plugins/", "plugins"},
	{"deploy/", "infrastructure"},
	{".github/", "ci"},
}

type EnrichConfig struct {
	// IssueResolver fetches issue titles by number.
	// Nil in tests — issues are skipped gracefully.
	IssueResolver IssueResolver
}

// IssueResolver fetches issue metadata from a git platform.
// Implemented by each source plugin's enrichment helper.
type IssueResolver interface {
	ResolveIssue(number int) (*LinkedIssue, error)
}

func Enrich(commits []Commit, cfg EnrichConfig) []Commit {
	enriched := make([]Commit, len(commits))
	for i, c := range commits {
		enriched[i] = enrichOne(c, cfg)
	}
	return enriched
}

func enrichOne(c Commit, cfg EnrichConfig) Commit {
	c.IsBreaking = detectBreaking(c)
	c.Domain = inferDomain(c.ChangedFiles)
	c.LinkedIssues = resolveIssues(c, cfg.IssueResolver)
	return c
}

// detectBreaking returns true if any breaking change signal is present.
// Signals: conventional commit "!" suffix, or BREAKING CHANGE footer.
func detectBreaking(c Commit) bool {
	firstLine := firstLine(c.Message)
	if breakingPrefixPattern.MatchString(firstLine) {
		return true
	}

	// BREAKING CHANGE footer anywhere in message body
	upper := strings.ToUpper(c.Message)
	if strings.Contains(upper, "BREAKING CHANGE:") || strings.Contains(upper, "BREAKING-CHANGE:") {
		return true
	}

	// PR title can also carry the signal
	if c.PRTitle != nil && breakingPrefixPattern.MatchString(*c.PRTitle) {
		return true
	}

	return false
}

// inferDomain maps changed file paths to a logical codebase domain.
// Returns nil when no rule matches — intentional, not every commit needs a domain.
func inferDomain(files []string) *string {
	counts := make(map[string]int)

	for _, f := range files {
		lower := strings.ToLower(f)
		for _, rule := range domainRules {
			if strings.HasPrefix(lower, rule.prefix) {
				counts[rule.domain]++
				break
			}
		}
	}

	if len(counts) == 0 {
		return nil
	}

	// Return the domain with the most file hits
	top := ""
	max := 0
	for domain, count := range counts {
		if count > max {
			max = count
			top = domain
		}
	}

	return &top
}

// resolveIssues parses issue references from the commit message and PR description,
// then fetches their titles via the resolver. Gracefully skips on resolver errors
// — a missing issue title is not worth failing the pipeline.
func resolveIssues(c Commit, resolver IssueResolver) []LinkedIssue {
	numbers := extractIssueNumbers(c.Message)

	if c.PRDescription != nil {
		numbers = append(numbers, extractIssueNumbers(*c.PRDescription)...)
	}

	numbers = dedupeInts(numbers)

	if len(numbers) == 0 || resolver == nil {
		return nil
	}

	var issues []LinkedIssue
	for _, n := range numbers {
		issue, err := resolver.ResolveIssue(n)
		if err != nil || issue == nil {
			continue
		}
		issues = append(issues, *issue)
	}

	return issues
}

func extractIssueNumbers(text string) []int {
	matches := issueRefPattern.FindAllStringSubmatch(text, -1)
	nums := make([]int, 0, len(matches))
	for _, m := range matches {
		if len(m) > 1 {
			n := 0
			for _, ch := range m[1] {
				if ch >= '0' && ch <= '9' {
					n = n*10 + int(ch-'0')
				}
			}
			if n > 0 {
				nums = append(nums, n)
			}
		}
	}
	return nums
}

func dedupeInts(nums []int) []int {
	seen := make(map[int]bool)
	out := nums[:0]
	for _, n := range nums {
		if !seen[n] {
			seen[n] = true
			out = append(out, n)
		}
	}
	return out
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i != -1 {
		return s[:i]
	}
	return s
}

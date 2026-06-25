package pipeline

import (
	"regexp"
	"strings"
)

var defaultSkipPatterns = []string{
	`^wip`,
	`^merge branch`,
	`^merge pull request`,
	`^fix typo`,
	`^fixup!`,
	`^squash!`,
	`^initial commit`,
}

var defaultBotAuthors = []string{
	"dependabot",
	"renovate",
	"github-actions",
	"snyk-bot",
	"codecov",
	"semantic-release-bot",
}

var lockFiles = map[string]bool{
	"package-lock.json": true,
	"yarn.lock":         true,
	"pnpm-lock.yaml":    true,
	"go.sum":            true,
	"Cargo.lock":        true,
	"Gemfile.lock":      true,
	"poetry.lock":       true,
	"composer.lock":     true,
}

type FilterConfig struct {
	SkipAuthors  []string
	SkipPatterns []string
	KnownSHAs    map[string]bool // SHAs already logged in previous scans
}

type FilterResult struct {
	Kept     []Commit
	Filtered []Commit // kept for audit, marked is_noise = true
}

func Filter(commits []Commit, cfg FilterConfig) FilterResult {
	patterns := compilePatterns(append(defaultSkipPatterns, cfg.SkipPatterns...))
	skipAuthors := mergeAuthors(cfg.SkipAuthors)

	var result FilterResult

	for _, c := range commits {
		c.IsNoise, c.IsBotCommit = classify(c, patterns, skipAuthors, cfg.KnownSHAs)
		if c.IsNoise {
			result.Filtered = append(result.Filtered, c)
		} else {
			result.Kept = append(result.Kept, c)
		}
	}

	return result
}

func classify(c Commit, patterns []*regexp.Regexp, skipAuthors map[string]bool, knownSHAs map[string]bool) (isNoise bool, isBot bool) {
	// Already logged in a previous scan
	if knownSHAs[c.SHA] {
		return true, false
	}

	// Bot detection — check both name and email
	lowerName := strings.ToLower(c.AuthorName)
	lowerEmail := strings.ToLower(c.AuthorEmail)
	for author := range skipAuthors {
		if strings.Contains(lowerName, author) || strings.Contains(lowerEmail, author) {
			return true, true
		}
	}

	// Only lock file changes — no signal for changelog
	if onlyLockFiles(c.ChangedFiles) {
		return true, false
	}

	lower := strings.ToLower(strings.TrimSpace(c.Message))
	for _, p := range patterns {
		if p.MatchString(lower) {
			return true, false
		}
	}

	return false, false
}

func onlyLockFiles(files []string) bool {
	if len(files) == 0 {
		return false
	}
	for _, f := range files {
		parts := strings.Split(f, "/")
		filename := parts[len(parts)-1]
		if !lockFiles[filename] {
			return false
		}
	}
	return true
}

func compilePatterns(raw []string) []*regexp.Regexp {
	out := make([]*regexp.Regexp, 0, len(raw))
	for _, p := range raw {
		if r, err := regexp.Compile(p); err == nil {
			out = append(out, r)
		}
	}
	return out
}

func mergeAuthors(extra []string) map[string]bool {
	m := make(map[string]bool, len(defaultBotAuthors)+len(extra))
	for _, a := range defaultBotAuthors {
		m[strings.ToLower(a)] = true
	}
	for _, a := range extra {
		m[strings.ToLower(a)] = true
	}
	return m
}

package pipeline

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"
)

// Pass 1 input is capped so a single oversized diff cannot blow the model's
// context window. PR description and issue titles are preserved; only the diff
// and codebase context are truncated to fit.
const maxPass1InputChars = 12000

// Pass 2 collapses all chunk summaries into one prompt — capped independently.
const maxPass2InputChars = 24000

const defaultRetryDelay = 5 * time.Second

// AIProvider is the pipeline's view of an AI provider plugin. The real
// implementation shells out to a subprocess; tests inject a mock.
type AIProvider interface {
	Summarize(ctx context.Context, req SummarizePluginRequest) (*SummarizePluginResponse, error)
	Generate(ctx context.Context, req GeneratePluginRequest) (*GeneratePluginResponse, error)
}

type SummarizeInput struct {
	Groups  []CommitGroup
	Commits []Commit
	Config  ScanConfig

	// RetryDelay between a failed AI call and its single retry.
	// Zero falls back to defaultRetryDelay.
	RetryDelay time.Duration
}

type SummarizeResult struct {
	Groups          []CommitGroup   // input groups with Summary populated where pass 1 succeeded
	Drafts          []AudienceDraft // one per audience that generated successfully
	FailedAudiences []string        // audiences whose generation failed after retry
}

// Summarize runs stage 6: pass 1 summarizes each commit group concurrently,
// pass 2 generates one changelog draft per audience from the collected summaries.
// A single failed group or audience is recorded, not fatal — the scan continues.
func Summarize(ctx context.Context, ai AIProvider, in SummarizeInput) (SummarizeResult, error) {
	delay := in.RetryDelay
	if delay == 0 {
		delay = defaultRetryDelay
	}

	groups := make([]CommitGroup, len(in.Groups))
	copy(groups, in.Groups)
	byID := indexCommits(in.Commits)

	// ── Pass 1 — chunk summaries (parallel) ──
	var wg sync.WaitGroup
	for i := range groups {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			req := SummarizePluginRequest{
				Action:  "summarize",
				Group:   buildGroupInput(groups[i], byID),
				Model:   in.Config.AIModel,
				APIKey:  in.Config.AIAPIKey,
				BaseURL: in.Config.AIBaseURL,
			}
			resp, err := retryOnce(delay, func() (*SummarizePluginResponse, error) {
				return ai.Summarize(ctx, req)
			})
			if err != nil {
				return
			}
			s := resp.Summary
			groups[i].Summary = &s
		}(i)
	}
	wg.Wait()

	res := SummarizeResult{Groups: groups}

	// ── Pass 2 — audience drafts (parallel) ──
	summaries := collectSummaries(groups)
	if len(summaries) == 0 {
		return res, nil
	}
	summaries = capPass2Summaries(summaries)

	scanID := scanIDOf(groups)
	audiences := in.Config.Audiences
	drafts := make([]*AudienceDraft, len(audiences))
	failed := make([]bool, len(audiences))

	for i := range audiences {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			aud := audiences[i]
			req := GeneratePluginRequest{
				Action:     "generate",
				Summaries:  summaries,
				Audience:   AudienceInput{ID: aud.ID, Tone: aud.Tone, Description: aud.Description},
				Repository: in.Config.Repo,
				ScanFrom:   in.Config.ScanFrom.UTC().Format(time.RFC3339),
				ScanTo:     in.Config.ScanTo.UTC().Format(time.RFC3339),
				Model:      in.Config.AIModel,
				APIKey:     in.Config.AIAPIKey,
				BaseURL:    in.Config.AIBaseURL,
			}
			resp, err := retryOnce(delay, func() (*GeneratePluginResponse, error) {
				return ai.Generate(ctx, req)
			})
			if err != nil {
				failed[i] = true
				return
			}
			drafts[i] = &AudienceDraft{
				ID:         fmt.Sprintf("%s-%s", scanID, aud.ID),
				ScanID:     scanID,
				AudienceID: aud.ID,
				Tone:       aud.Tone,
				Content:    resp.Content,
				TokensUsed: resp.TokensUsed,
			}
		}(i)
	}
	wg.Wait()

	for i := range audiences {
		if failed[i] {
			res.FailedAudiences = append(res.FailedAudiences, audiences[i].ID)
			continue
		}
		if drafts[i] != nil {
			res.Drafts = append(res.Drafts, *drafts[i])
		}
	}

	return res, nil
}

func retryOnce[T any](delay time.Duration, fn func() (T, error)) (T, error) {
	res, err := fn()
	if err == nil {
		return res, nil
	}
	time.Sleep(delay)
	return fn()
}

func indexCommits(commits []Commit) map[string]Commit {
	idx := make(map[string]Commit, len(commits))
	for _, c := range commits {
		idx[c.ID] = c
	}
	return idx
}

// buildGroupInput assembles the AI input for one group from its member commits.
func buildGroupInput(g CommitGroup, byID map[string]Commit) SummarizeGroupInput {
	in := SummarizeGroupInput{
		Label:     g.Label,
		GroupType: string(g.GroupType),
	}

	var diffs, contexts []string
	seenFiles := map[string]bool{}
	seenIssues := map[string]bool{}

	for _, id := range g.CommitIDs {
		c, ok := byID[id]
		if !ok {
			continue
		}

		if in.PRTitle == nil && c.PRTitle != nil {
			in.PRTitle = c.PRTitle
		}
		if in.PRDescription == nil && c.PRDescription != nil {
			in.PRDescription = c.PRDescription
		}

		for _, issue := range c.LinkedIssues {
			if !seenIssues[issue.Title] {
				seenIssues[issue.Title] = true
				in.IssueTitles = append(in.IssueTitles, issue.Title)
			}
		}
		for _, f := range c.ChangedFiles {
			if !seenFiles[f] {
				seenFiles[f] = true
				in.ChangedFiles = append(in.ChangedFiles, f)
			}
		}
		if c.Diff != nil {
			diffs = append(diffs, *c.Diff)
		}
		if c.CodebaseContext != nil && c.CodebaseContext.SurroundingCode != "" {
			contexts = append(contexts, c.CodebaseContext.SurroundingCode)
		}
	}

	if len(diffs) > 0 {
		d := truncate(strings.Join(diffs, "\n"), maxPass1InputChars)
		in.Diff = &d
	}
	if len(contexts) > 0 {
		c := truncate(strings.Join(contexts, "\n"), maxPass1InputChars)
		in.CodebaseContext = &c
	}

	return in
}

func collectSummaries(groups []CommitGroup) []string {
	var out []string
	for _, g := range groups {
		if g.Summary != nil {
			out = append(out, *g.Summary)
		}
	}
	return out
}

// capPass2Summaries drops trailing summaries once the combined length would
// exceed the pass 2 budget. Keeps whole summaries rather than splitting mid-entry.
func capPass2Summaries(summaries []string) []string {
	total := 0
	for i, s := range summaries {
		total += len(s) + 1
		if total > maxPass2InputChars {
			return summaries[:i]
		}
	}
	return summaries
}

func scanIDOf(groups []CommitGroup) string {
	if len(groups) > 0 {
		return groups[0].ScanID
	}
	return ""
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}

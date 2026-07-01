package handlers

import (
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
)

func scanErrorHint(err pgtype.Text) *string {
	if !err.Valid || strings.TrimSpace(err.String) == "" {
		return nil
	}
	msg := err.String

	// Errors we craft for users are already actionable — show them as-is.
	if strings.Contains(msg, "Settings →") {
		return &msg
	}

	switch {
	case strings.Contains(msg, "Bad credentials"):
		s := "GitHub didn't accept your access token. Open Settings → Git sources, paste a new personal access token with repo read access, save, and run the scan again."
		return &s
	case strings.Contains(msg, "commits_repository_id_fkey"):
		s := "We couldn't save commits for this scan. Rebuild the API and worker containers, then run the scan again."
		return &s
	case strings.Contains(msg, "commits_scan_id_sha_key"):
		s := "This scan already has commits saved from a previous attempt. Run a new scan instead of retrying this one."
		return &s
	case strings.Contains(msg, "No git access token"):
		s := msg
		return &s
	case strings.Contains(msg, "No AI API key"):
		s := msg
		return &s
	case strings.Contains(msg, "AI API key was rejected"):
		s := msg
		return &s
	case strings.Contains(msg, "AI model name"):
		s := msg
		return &s
	case strings.Contains(msg, "AI summarization failed"),
		strings.Contains(msg, "summarize plugin"),
		strings.Contains(msg, "generate plugin"):
		s := "AI summarization failed. Open Settings → AI provider and check your API key and model name, then run the scan again."
		return &s
	case strings.Contains(msg, "source plugin returned error"):
		s := "We couldn't read commits from your git provider. Check your access token in Settings → Git sources, then run the scan again."
		return &s
	default:
		s := "Something went wrong while running this scan. Run it again, or contact support if it keeps failing."
		return &s
	}
}

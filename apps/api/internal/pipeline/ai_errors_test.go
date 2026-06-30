package pipeline

import (
	"errors"
	"strings"
	"testing"
)

func TestFormatAIScanFailure_InvalidAPIKey(t *testing.T) {
	err := FormatAIScanFailure(errors.New(`summarize plugin returned error: Error: 401 Incorrect API key provided`))
	msg := err.Error()
	if !strings.Contains(msg, "API key was rejected") {
		t.Fatalf("expected rejected key message, got %q", msg)
	}
	if !strings.Contains(msg, "Settings → AI provider") {
		t.Fatalf("expected settings pointer, got %q", msg)
	}
}

func TestFormatAIScanFailure_NilCause(t *testing.T) {
	err := FormatAIScanFailure(nil)
	if !strings.Contains(err.Error(), "AI summarization failed") {
		t.Fatalf("unexpected message: %v", err)
	}
}

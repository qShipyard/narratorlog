package handlers

import (
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
)

func TestScanErrorHint(t *testing.T) {
	tests := []struct {
		err  string
		want string
	}{
		{
			err:  "source plugin returned error: HttpError: Bad credentials",
			want: "GitHub didn't accept your access token",
		},
		{
			err:  "AI summarization failed. Open Settings → AI provider and check your API key and model, then run the scan again.",
			want: "AI summarization failed",
		},
	}

	for _, tt := range tests {
		hint := scanErrorHint(pgtype.Text{String: tt.err, Valid: true})
		if hint == nil {
			t.Fatalf("expected hint for %q", tt.err)
		}
		if !strings.Contains(*hint, tt.want) {
			t.Fatalf("hint %q should contain %q", *hint, tt.want)
		}
	}

	if scanErrorHint(pgtype.Text{Valid: false}) != nil {
		t.Fatal("expected nil for empty error")
	}
}

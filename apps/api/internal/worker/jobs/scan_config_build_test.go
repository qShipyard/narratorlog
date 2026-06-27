package jobs

import (
	"testing"
	"time"

	"github.com/narratorlog/narratorlog/internal/auth"
	db "github.com/narratorlog/narratorlog/internal/db"
	"github.com/narratorlog/narratorlog/internal/teamconfig"
)

func TestBuildScanConfigPopulatesAIFromTeamConfig(t *testing.T) {
	enc, err := auth.NewEncryptor("0123456789abcdef0123456789abcdef")
	if err != nil {
		t.Fatalf("NewEncryptor: %v", err)
	}
	ct, _ := enc.Encrypt("sk-team-key")

	tc := &teamconfig.Config{
		AI: teamconfig.AI{
			Provider:        "anthropic",
			Model:           "claude-x",
			APIKeyEncrypted: ct,
			BaseURL:         "https://api.example",
			Depth:           "deep",
		},
	}
	repo := db.Repository{FullName: "acme/app", DefaultBranch: "main", AccessToken: "gh-tok"}

	cfg, err := buildScanConfig(repo, time.Now().Add(-time.Hour), time.Now(), tc, enc)
	if err != nil {
		t.Fatalf("buildScanConfig: %v", err)
	}
	if cfg.AIProvider != "anthropic" || cfg.AIModel != "claude-x" || cfg.AIBaseURL != "https://api.example" {
		t.Fatalf("AI fields not populated: %+v", cfg)
	}
	if cfg.AIAPIKey != "sk-team-key" {
		t.Fatalf("expected decrypted AI key, got %q", cfg.AIAPIKey)
	}
	if string(cfg.AIDepth) != "deep" {
		t.Fatalf("expected depth deep, got %q", cfg.AIDepth)
	}
	if len(cfg.Audiences) == 0 {
		t.Fatalf("expected default audiences populated")
	}
}

func TestBuildScanConfigDefaultsDepthWhenUnset(t *testing.T) {
	enc, _ := auth.NewEncryptor("0123456789abcdef0123456789abcdef")
	tc := &teamconfig.Config{AI: teamconfig.AI{Provider: "openai"}}
	repo := db.Repository{FullName: "acme/app", DefaultBranch: "main"}

	cfg, err := buildScanConfig(repo, time.Now().Add(-time.Hour), time.Now(), tc, enc)
	if err != nil {
		t.Fatalf("buildScanConfig: %v", err)
	}
	if cfg.AIDepth != "standard" {
		t.Fatalf("expected standard depth fallback, got %q", cfg.AIDepth)
	}
	if cfg.AIAPIKey != "" {
		t.Fatalf("expected empty key when none set, got %q", cfg.AIAPIKey)
	}
}

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
		Sources: map[string]teamconfig.Source{
			"github": {TokenEncrypted: mustEncrypt(t, enc, "ghp_test")},
		},
	}
	repo := db.Repository{FullName: "acme/app", DefaultBranch: "main", Provider: "github"}

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

func TestBuildScanConfigResolvesSourceToken(t *testing.T) {
	enc, err := auth.NewEncryptor("0123456789abcdef0123456789abcdef")
	if err != nil {
		t.Fatalf("NewEncryptor: %v", err)
	}
	ct, _ := enc.Encrypt("ghp_scan")

	tc := &teamconfig.Config{
		AI: teamconfig.AI{
			Provider:        "openai",
			APIKeyEncrypted: mustEncrypt(t, enc, "sk-test"),
		},
		Sources: map[string]teamconfig.Source{
			"github": {TokenEncrypted: ct, BaseURL: "https://ghes.example.com"},
		},
	}
	repo := db.Repository{
		FullName:      "acme/app",
		DefaultBranch: "main",
		Provider:      "github",
		AccessToken:   "encrypted-repo-token-should-not-appear",
	}

	cfg, err := buildScanConfig(repo, time.Now().Add(-time.Hour), time.Now(), tc, enc)
	if err != nil {
		t.Fatalf("buildScanConfig: %v", err)
	}
	if cfg.AccessToken != "ghp_scan" {
		t.Fatalf("expected decrypted source token %q, got %q", "ghp_scan", cfg.AccessToken)
	}
	if cfg.SourceBaseURL != "https://ghes.example.com" {
		t.Fatalf("expected SourceBaseURL %q, got %q", "https://ghes.example.com", cfg.SourceBaseURL)
	}
}

func TestBuildScanConfigDefaultsDepthWhenUnset(t *testing.T) {
	enc, _ := auth.NewEncryptor("0123456789abcdef0123456789abcdef")
	tc := &teamconfig.Config{
		AI: teamconfig.AI{
			Provider:        "openai",
			APIKeyEncrypted: mustEncrypt(t, enc, "sk-test"),
		},
		Sources: map[string]teamconfig.Source{
			"github": {TokenEncrypted: mustEncrypt(t, enc, "ghp_test")},
		},
	}
	repo := db.Repository{FullName: "acme/app", DefaultBranch: "main", Provider: "github"}

	cfg, err := buildScanConfig(repo, time.Now().Add(-time.Hour), time.Now(), tc, enc)
	if err != nil {
		t.Fatalf("buildScanConfig: %v", err)
	}
	if cfg.AIDepth != "standard" {
		t.Fatalf("expected standard depth fallback, got %q", cfg.AIDepth)
	}
	if cfg.AIAPIKey != "sk-test" {
		t.Fatalf("expected decrypted AI key, got %q", cfg.AIAPIKey)
	}
}

func TestBuildScanConfigRequiresSourceToken(t *testing.T) {
	enc, _ := auth.NewEncryptor("0123456789abcdef0123456789abcdef")
	tc := &teamconfig.Config{
		AI: teamconfig.AI{
			Provider:        "openai",
			APIKeyEncrypted: mustEncrypt(t, enc, "sk-test"),
		},
	}
	repo := db.Repository{FullName: "acme/app", DefaultBranch: "main", Provider: "github"}

	_, err := buildScanConfig(repo, time.Now().Add(-time.Hour), time.Now(), tc, enc)
	if err == nil {
		t.Fatal("expected error when source token missing")
	}
}

func TestBuildScanConfigRequiresAIKey(t *testing.T) {
	enc, _ := auth.NewEncryptor("0123456789abcdef0123456789abcdef")
	tc := &teamconfig.Config{
		Sources: map[string]teamconfig.Source{
			"github": {TokenEncrypted: mustEncrypt(t, enc, "ghp_test")},
		},
	}
	repo := db.Repository{FullName: "acme/app", DefaultBranch: "main", Provider: "github"}

	_, err := buildScanConfig(repo, time.Now().Add(-time.Hour), time.Now(), tc, enc)
	if err == nil {
		t.Fatal("expected error when AI key missing")
	}
}

func mustEncrypt(t *testing.T, enc *auth.Encryptor, plaintext string) string {
	t.Helper()
	ct, err := enc.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	return ct
}

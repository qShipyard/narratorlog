package teamconfig

import (
	"encoding/json"
	"testing"

	"github.com/narratorlog/narratorlog/internal/auth"
)

func newEnc(t *testing.T) *auth.Encryptor {
	t.Helper()
	enc, err := auth.NewEncryptor("0123456789abcdef0123456789abcdef")
	if err != nil {
		t.Fatalf("NewEncryptor: %v", err)
	}
	return enc
}

func TestParseEmpty(t *testing.T) {
	for _, raw := range [][]byte{nil, []byte(""), []byte("{}")} {
		c, err := Parse(raw)
		if err != nil {
			t.Fatalf("Parse(%q): %v", raw, err)
		}
		if c.AI.Provider != "" || len(c.Routing) != 0 || c.Integrations == nil {
			t.Fatalf("expected zero config with non-nil Integrations, got %+v", c)
		}
	}
}

func TestApplyUpdateEncryptsAndPreservesSecrets(t *testing.T) {
	enc := newEnc(t)
	c, _ := Parse(nil)

	// First update sets the AI key and a slack token.
	err := c.ApplyUpdate(UpdateRequest{
		AI:           AIUpdate{Provider: "anthropic", Model: "claude-x", Depth: "standard", APIKey: "sk-secret"},
		Integrations: map[string]map[string]string{"slack": {"SLACK_BOT_TOKEN": "xoxb-1"}},
		Routing:      []Output{{Audience: "marketing", Plugin: "slack", Config: map[string]interface{}{"channel": "#m"}}},
	}, enc)
	if err != nil {
		t.Fatalf("ApplyUpdate 1: %v", err)
	}
	if c.AI.APIKeyEncrypted == "" || c.AI.APIKeyEncrypted == "sk-secret" {
		t.Fatalf("AI key should be encrypted, got %q", c.AI.APIKeyEncrypted)
	}
	got, err := enc.Decrypt(c.AI.APIKeyEncrypted)
	if err != nil || got != "sk-secret" {
		t.Fatalf("decrypt AI key: got %q err %v", got, err)
	}
	firstEncrypted := c.AI.APIKeyEncrypted

	// Second update leaves APIKey empty → must preserve the existing encrypted value.
	err = c.ApplyUpdate(UpdateRequest{
		AI:           AIUpdate{Provider: "anthropic", Model: "claude-y", Depth: "deep", APIKey: ""},
		Integrations: map[string]map[string]string{"slack": {"SLACK_BOT_TOKEN": ""}},
		Routing:      []Output{},
	}, enc)
	if err != nil {
		t.Fatalf("ApplyUpdate 2: %v", err)
	}
	if c.AI.APIKeyEncrypted != firstEncrypted {
		t.Fatalf("expected AI key preserved, got %q", c.AI.APIKeyEncrypted)
	}
	if c.AI.Model != "claude-y" || c.AI.Depth != "deep" {
		t.Fatalf("expected non-secret AI fields updated, got %+v", c.AI)
	}
	tok, err := enc.Decrypt(c.Integrations["slack"]["SLACK_BOT_TOKEN"])
	if err != nil || tok != "xoxb-1" {
		t.Fatalf("expected slack token preserved, got %q err %v", tok, err)
	}
	if len(c.Routing) != 0 {
		t.Fatalf("expected routing replaced with empty, got %+v", c.Routing)
	}
}

func TestViewMasksSecrets(t *testing.T) {
	enc := newEnc(t)
	c, _ := Parse(nil)
	_ = c.ApplyUpdate(UpdateRequest{
		AI:           AIUpdate{Provider: "openai", Model: "gpt", Depth: "standard", APIKey: "sk-1"},
		Integrations: map[string]map[string]string{"slack": {"SLACK_BOT_TOKEN": "xoxb"}},
	}, enc)

	v := c.View()
	blob, _ := json.Marshal(v)
	if string(blob) == "" {
		t.Fatal("empty view")
	}
	if !v.AI.APIKeySet {
		t.Fatal("expected APIKeySet true")
	}
	if !v.Integrations["slack"]["SLACK_BOT_TOKEN"] {
		t.Fatal("expected slack token marked set")
	}
	// No plaintext or ciphertext leaks into the view JSON.
	for _, leak := range []string{"sk-1", "xoxb", c.AI.APIKeyEncrypted} {
		if contains(string(blob), leak) {
			t.Fatalf("view leaked secret material: %q", leak)
		}
	}
}

func TestSourcesApplyUpdateAndView(t *testing.T) {
	enc := newEnc(t)
	c, _ := Parse(nil)

	err := c.ApplyUpdate(UpdateRequest{
		Sources: map[string]SourceUpdate{
			"github": {Token: "ghp_x", BaseURL: "https://api.github.com"},
		},
	}, enc)
	if err != nil {
		t.Fatalf("ApplyUpdate with sources: %v", err)
	}
	s := c.Sources["github"]
	if s.TokenEncrypted == "" || s.TokenEncrypted == "ghp_x" {
		t.Fatalf("expected token encrypted, got %q", s.TokenEncrypted)
	}
	got, err := enc.Decrypt(s.TokenEncrypted)
	if err != nil || got != "ghp_x" {
		t.Fatalf("decrypt source token: got %q err %v", got, err)
	}
	if s.BaseURL != "https://api.github.com" {
		t.Fatalf("expected BaseURL set, got %q", s.BaseURL)
	}
	firstEncrypted := s.TokenEncrypted

	// Second update with empty Token preserves existing ciphertext but updates BaseURL.
	err = c.ApplyUpdate(UpdateRequest{
		Sources: map[string]SourceUpdate{
			"github": {Token: "", BaseURL: "https://github.example.com"},
		},
	}, enc)
	if err != nil {
		t.Fatalf("ApplyUpdate preserve token: %v", err)
	}
	s = c.Sources["github"]
	if s.TokenEncrypted != firstEncrypted {
		t.Fatalf("expected token preserved, got %q", s.TokenEncrypted)
	}
	if s.BaseURL != "https://github.example.com" {
		t.Fatalf("expected BaseURL updated, got %q", s.BaseURL)
	}

	// View masks token to boolean.
	v := c.View()
	sv := v.Sources["github"]
	if !sv.TokenSet {
		t.Fatal("expected TokenSet true in view")
	}
	if sv.BaseURL != "https://github.example.com" {
		t.Fatalf("expected BaseURL in view, got %q", sv.BaseURL)
	}
	blob, _ := json.Marshal(v)
	for _, leak := range []string{"ghp_x", firstEncrypted} {
		if contains(string(blob), leak) {
			t.Fatalf("view leaked source secret: %q", leak)
		}
	}
}

func TestDecryptedSource(t *testing.T) {
	enc := newEnc(t)
	c, _ := Parse(nil)

	_ = c.ApplyUpdate(UpdateRequest{
		Sources: map[string]SourceUpdate{
			"github": {Token: "ghp_x", BaseURL: "https://api.github.com"},
		},
	}, enc)

	token, baseURL, ok, err := c.DecryptedSource("github", enc)
	if err != nil {
		t.Fatalf("DecryptedSource: %v", err)
	}
	if !ok {
		t.Fatal("expected ok=true for known provider")
	}
	if token != "ghp_x" {
		t.Fatalf("expected token ghp_x, got %q", token)
	}
	if baseURL != "https://api.github.com" {
		t.Fatalf("expected baseURL https://api.github.com, got %q", baseURL)
	}

	_, _, ok, err = c.DecryptedSource("unknown", enc)
	if err != nil {
		t.Fatalf("DecryptedSource unknown: %v", err)
	}
	if ok {
		t.Fatal("expected ok=false for unknown provider")
	}
}

func TestRoutingSnapshot(t *testing.T) {
	c, _ := Parse(nil)
	c.Routing = []Output{{Audience: "developers", Plugin: "notion", Config: map[string]interface{}{"database_id": "db1"}}}
	snap, err := c.RoutingSnapshot()
	if err != nil {
		t.Fatalf("RoutingSnapshot: %v", err)
	}
	var wrapper struct {
		Outputs []Output `json:"outputs"`
	}
	if err := json.Unmarshal(snap, &wrapper); err != nil {
		t.Fatalf("unmarshal snapshot: %v", err)
	}
	if len(wrapper.Outputs) != 1 || wrapper.Outputs[0].Plugin != "notion" {
		t.Fatalf("unexpected snapshot: %s", snap)
	}
}

func contains(s, sub string) bool {
	if sub == "" {
		return false
	}
	return len(s) >= len(sub) && (indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

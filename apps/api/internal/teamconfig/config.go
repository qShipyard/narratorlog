package teamconfig

import (
	"encoding/json"

	"github.com/narratorlog/narratorlog/internal/auth"
)

type AI struct {
	Provider        string `json:"provider"`
	Model           string `json:"model"`
	APIKeyEncrypted string `json:"api_key_encrypted,omitempty"`
	BaseURL         string `json:"base_url"`
	Depth           string `json:"depth"`
}

type Privacy struct {
	ScrubSecrets bool `json:"scrub_secrets"`
	LocalOnly    bool `json:"local_only"`
}

type Output struct {
	Audience string                 `json:"audience"`
	Plugin   string                 `json:"plugin"`
	Config   map[string]interface{} `json:"config"`
}

type Source struct {
	TokenEncrypted string `json:"token_encrypted,omitempty"`
	BaseURL        string `json:"base_url,omitempty"`
}

type Config struct {
	AI           AI                           `json:"ai"`
	Privacy      Privacy                      `json:"privacy"`
	Integrations map[string]map[string]string `json:"integrations"`
	Sources      map[string]Source            `json:"sources,omitempty"`
	Routing      []Output                     `json:"routing"`
}

func Parse(raw []byte) (*Config, error) {
	c := &Config{
		Integrations: map[string]map[string]string{},
		Sources:      map[string]Source{},
	}
	if len(raw) == 0 || string(raw) == "{}" {
		return c, nil
	}
	if err := json.Unmarshal(raw, c); err != nil {
		return nil, err
	}
	if c.Integrations == nil {
		c.Integrations = map[string]map[string]string{}
	}
	if c.Sources == nil {
		c.Sources = map[string]Source{}
	}
	return c, nil
}

func (c *Config) Marshal() ([]byte, error) {
	return json.Marshal(c)
}

// ── Update request (client → server) ──

type AIUpdate struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
	BaseURL  string `json:"base_url"`
	Depth    string `json:"depth"`
	APIKey   string `json:"api_key"` // plaintext; empty means "keep existing"
}

type SourceUpdate struct {
	Token   string `json:"token"`
	BaseURL string `json:"base_url"`
}

type UpdateRequest struct {
	AI           AIUpdate                     `json:"ai"`
	Privacy      Privacy                      `json:"privacy"`
	Integrations map[string]map[string]string `json:"integrations"` // plaintext; empty value means "keep existing"
	Sources      map[string]SourceUpdate      `json:"sources"`
	Routing      []Output                     `json:"routing"`
}

func (c *Config) ApplyUpdate(in UpdateRequest, enc *auth.Encryptor) error {
	c.AI.Provider = in.AI.Provider
	c.AI.Model = in.AI.Model
	c.AI.BaseURL = in.AI.BaseURL
	c.AI.Depth = in.AI.Depth
	if in.AI.APIKey != "" {
		ct, err := enc.Encrypt(in.AI.APIKey)
		if err != nil {
			return err
		}
		c.AI.APIKeyEncrypted = ct
	}

	c.Privacy = in.Privacy

	if c.Integrations == nil {
		c.Integrations = map[string]map[string]string{}
	}
	for plugin, vars := range in.Integrations {
		if c.Integrations[plugin] == nil {
			c.Integrations[plugin] = map[string]string{}
		}
		for name, val := range vars {
			if val == "" {
				continue // preserve existing
			}
			ct, err := enc.Encrypt(val)
			if err != nil {
				return err
			}
			c.Integrations[plugin][name] = ct
		}
	}

	if c.Sources == nil {
		c.Sources = map[string]Source{}
	}
	for provider, in := range in.Sources {
		s := c.Sources[provider]
		s.BaseURL = in.BaseURL
		if in.Token != "" {
			ct, err := enc.Encrypt(in.Token)
			if err != nil {
				return err
			}
			s.TokenEncrypted = ct
		}
		c.Sources[provider] = s
	}

	c.Routing = in.Routing
	return nil
}

// ── Masked client view (server → client) ──

type AIView struct {
	Provider  string `json:"provider"`
	Model     string `json:"model"`
	BaseURL   string `json:"base_url"`
	Depth     string `json:"depth"`
	APIKeySet bool   `json:"api_key_set"`
}

type SourceView struct {
	TokenSet bool   `json:"token_set"`
	BaseURL  string `json:"base_url"`
}

type ClientView struct {
	AI           AIView                     `json:"ai"`
	Privacy      Privacy                    `json:"privacy"`
	Integrations map[string]map[string]bool `json:"integrations"`
	Sources      map[string]SourceView      `json:"sources"`
	Routing      []Output                   `json:"routing"`
}

func (c *Config) View() ClientView {
	integrations := map[string]map[string]bool{}
	for plugin, vars := range c.Integrations {
		integrations[plugin] = map[string]bool{}
		for name, ct := range vars {
			integrations[plugin][name] = ct != ""
		}
	}
	sources := map[string]SourceView{}
	for provider, s := range c.Sources {
		sources[provider] = SourceView{
			TokenSet: s.TokenEncrypted != "",
			BaseURL:  s.BaseURL,
		}
	}
	return ClientView{
		AI: AIView{
			Provider:  c.AI.Provider,
			Model:     c.AI.Model,
			BaseURL:   c.AI.BaseURL,
			Depth:     c.AI.Depth,
			APIKeySet: c.AI.APIKeyEncrypted != "",
		},
		Privacy:      c.Privacy,
		Integrations: integrations,
		Sources:      sources,
		Routing:      c.Routing,
	}
}

func (c *Config) DecryptedSource(provider string, enc *auth.Encryptor) (token, baseURL string, ok bool, err error) {
	s, exists := c.Sources[provider]
	if !exists || s.TokenEncrypted == "" {
		return "", "", false, nil
	}
	token, err = enc.Decrypt(s.TokenEncrypted)
	if err != nil {
		return "", "", false, err
	}
	return token, s.BaseURL, true, nil
}

func (c *Config) RoutingSnapshot() ([]byte, error) {
	routing := c.Routing
	if routing == nil {
		routing = []Output{}
	}
	return json.Marshal(struct {
		Outputs []Output `json:"outputs"`
	}{Outputs: routing})
}

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

type Config struct {
	AI           AI                           `json:"ai"`
	Privacy      Privacy                      `json:"privacy"`
	Integrations map[string]map[string]string `json:"integrations"`
	Routing      []Output                     `json:"routing"`
}

func Parse(raw []byte) (*Config, error) {
	c := &Config{Integrations: map[string]map[string]string{}}
	if len(raw) == 0 || string(raw) == "{}" {
		return c, nil
	}
	if err := json.Unmarshal(raw, c); err != nil {
		return nil, err
	}
	if c.Integrations == nil {
		c.Integrations = map[string]map[string]string{}
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

type UpdateRequest struct {
	AI           AIUpdate                     `json:"ai"`
	Privacy      Privacy                      `json:"privacy"`
	Integrations map[string]map[string]string `json:"integrations"` // plaintext; empty value means "keep existing"
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

type ClientView struct {
	AI           AIView                     `json:"ai"`
	Privacy      Privacy                    `json:"privacy"`
	Integrations map[string]map[string]bool `json:"integrations"`
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
		Routing:      c.Routing,
	}
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

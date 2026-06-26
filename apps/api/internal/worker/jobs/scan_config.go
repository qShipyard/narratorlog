package jobs

import (
	"encoding/json"
	"fmt"
)

// OutputConfig is one output destination from the scan config.
type OutputConfig struct {
	Audience string                 `json:"audience"`
	Plugin   string                 `json:"plugin"`
	Config   map[string]interface{} `json:"config"`
}

// ScanOutputConfig is the output section of .narratorlog.yml
// stored as config_snapshot on the scan record.
type ScanOutputConfig struct {
	Outputs []OutputConfig `json:"outputs"`
}

func parseScanOutputConfig(configSnapshot []byte) (*ScanOutputConfig, error) {
	if len(configSnapshot) == 0 || string(configSnapshot) == "{}" {
		return &ScanOutputConfig{}, nil
	}

	var cfg ScanOutputConfig
	if err := json.Unmarshal(configSnapshot, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse scan config: %w", err)
	}

	return &cfg, nil
}

// OutputsForAudience returns all output configs for a given audience ID.
func (c *ScanOutputConfig) OutputsForAudience(audienceID string) []OutputConfig {
	var out []OutputConfig
	for _, o := range c.Outputs {
		if o.Audience == audienceID {
			out = append(out, o)
		}
	}
	return out
}

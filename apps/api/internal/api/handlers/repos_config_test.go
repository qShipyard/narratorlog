package handlers

import "testing"

func TestValidateRepoConfig(t *testing.T) {
	cases := []struct {
		name    string
		cfg     map[string]any
		wantErr bool
	}{
		{"empty ok", map[string]any{}, false},
		{"weekly ok", map[string]any{"cadence": "weekly"}, false},
		{"manual ok", map[string]any{"cadence": "manual"}, false},
		{"bad cadence", map[string]any{"cadence": "hourly"}, true},
		{"cadence wrong type", map[string]any{"cadence": 3}, true},
		{"branches ok", map[string]any{"base_branches": []any{"main", "dev"}}, false},
		{"branches empty ok", map[string]any{"base_branches": []any{}}, false},
		{"branches not array", map[string]any{"base_branches": "main"}, true},
		{"branches non-string element", map[string]any{"base_branches": []any{"main", 7}}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateRepoConfig(tc.cfg)
			if (err != nil) != tc.wantErr {
				t.Errorf("validateRepoConfig(%v) err=%v, wantErr=%v", tc.cfg, err, tc.wantErr)
			}
		})
	}
}

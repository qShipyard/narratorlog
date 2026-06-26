package jobs

import "encoding/json"

const (
	JobScan      = "scan:run"
	JobDeliver   = "scan:deliver"
	JobScheduled = "scan:scheduled"
	JobCleanup   = "scan:cleanup"
)

type ScanPayload struct {
	ScanID       string `json:"scan_id"`
	RepositoryID string `json:"repository_id"`
	TeamID       string `json:"team_id"`
	TriggerType  string `json:"trigger_type"`
	Lookback     string `json:"lookback"`
	ScanFrom     string `json:"scan_from"`
	ScanTo       string `json:"scan_to"`
}

type DeliveryPayload struct {
	ScanID string `json:"scan_id"`
	TeamID string `json:"team_id"`
}

func Marshal(v any) ([]byte, error) {
	return json.Marshal(v)
}

func Unmarshal[T any](data []byte) (T, error) {
	var v T
	err := json.Unmarshal(data, &v)
	return v, err
}

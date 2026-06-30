package pipeline

import (
	"encoding/json"
	"testing"
)

func TestBuildGroupInputMarshalsEmptySlicesNotNull(t *testing.T) {
	input := buildGroupInput(CommitGroup{
		Label:     "Add auth",
		GroupType: GroupTypeFeature,
	}, map[string]Commit{})

	raw, err := json.Marshal(input)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, field := range []string{"issue_titles", "changed_files"} {
		val, ok := decoded[field]
		if !ok {
			t.Fatalf("expected %s in payload", field)
		}
		if val == nil {
			t.Fatalf("%s must marshal as [] not null", field)
		}
	}
}

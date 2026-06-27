package pipeline

import (
	"sort"
	"testing"
)

func TestBuildPluginEnv(t *testing.T) {
	got := BuildPluginEnv(map[string]string{
		"SLACK_BOT_TOKEN": "xoxb-1",
		"NOTION_TOKEN":    "secret_2",
	})
	sort.Strings(got)
	want := []string{"NOTION_TOKEN=secret_2", "SLACK_BOT_TOKEN=xoxb-1"}
	if len(got) != len(want) {
		t.Fatalf("got %v want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v want %v", got, want)
		}
	}
}

func TestBuildPluginEnvEmpty(t *testing.T) {
	if got := BuildPluginEnv(nil); len(got) != 0 {
		t.Fatalf("expected empty, got %v", got)
	}
}

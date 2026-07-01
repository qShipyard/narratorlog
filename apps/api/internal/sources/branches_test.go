package sources_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/narratorlog/narratorlog/internal/sources"
)

func TestGitHubClient_ListBranches(t *testing.T) {
	page := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/repos/acme/app/branches" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer tok" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		page++
		if page == 1 {
			names := make([]map[string]any, 100)
			for i := range names {
				names[i] = map[string]any{"name": "b" + string(rune('a'+i%26))}
			}
			// first page full → client must request page 2
			json.NewEncoder(w).Encode(names)
			return
		}
		json.NewEncoder(w).Encode([]map[string]any{{"name": "main"}})
	}))
	defer srv.Close()

	c, _ := sources.For("github")
	branches, err := c.ListBranches(context.Background(), "tok", srv.URL, "acme", "app")
	if err != nil {
		t.Fatalf("ListBranches error: %v", err)
	}
	if len(branches) != 101 {
		t.Fatalf("want 101 branches across 2 pages, got %d", len(branches))
	}
	if branches[100] != "main" {
		t.Errorf("last branch: want main, got %s", branches[100])
	}
}

func TestGitLabClient_ListBranches(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.EscapedPath() {
		case "/api/v4/projects/acme%2Fapp":
			json.NewEncoder(w).Encode(map[string]any{"id": 42})
		case "/api/v4/projects/42/repository/branches":
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode([]map[string]any{{"name": "main"}, {"name": "develop"}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	c, _ := sources.For("gitlab")
	branches, err := c.ListBranches(context.Background(), "tok", srv.URL, "acme", "app")
	if err != nil {
		t.Fatalf("ListBranches error: %v", err)
	}
	if len(branches) != 2 || branches[0] != "main" || branches[1] != "develop" {
		t.Fatalf("unexpected branches: %v", branches)
	}
}

func TestBitbucketClient_ListBranches(t *testing.T) {
	first := true
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/2.0/repositories/ws/repo/refs/branches" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if first {
			first = false
			json.NewEncoder(w).Encode(map[string]any{
				"values": []map[string]any{{"name": "main"}},
				"next":   srv.URL + "/2.0/repositories/ws/repo/refs/branches?page=2",
			})
			return
		}
		json.NewEncoder(w).Encode(map[string]any{
			"values": []map[string]any{{"name": "release"}},
		})
	}))
	defer srv.Close()

	c, _ := sources.ForBitbucket(srv.URL)
	branches, err := c.ListBranches(context.Background(), "tok", "", "ws", "repo")
	if err != nil {
		t.Fatalf("ListBranches error: %v", err)
	}
	if len(branches) != 2 || branches[0] != "main" || branches[1] != "release" {
		t.Fatalf("unexpected branches: %v", branches)
	}
}

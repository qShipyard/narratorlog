package sources_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/narratorlog/narratorlog/internal/sources"
)

func TestGitHubClient_ListRepos_PaginationAndMapping(t *testing.T) {
	page := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/user/repos" {
			http.NotFound(w, r)
			return
		}
		page++
		var repos interface{}
		if page == 1 {
			repos = []map[string]interface{}{
				{"id": 101, "full_name": "owner/repo-a", "name": "repo-a", "html_url": "https://github.com/owner/repo-a", "default_branch": "main", "private": false},
				{"id": 202, "full_name": "owner/repo-b", "name": "repo-b", "html_url": "https://github.com/owner/repo-b", "default_branch": "develop", "private": true},
			}
		} else {
			repos = []map[string]interface{}{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(repos)
	}))
	defer srv.Close()

	c, ok := sources.For("github")
	if !ok {
		t.Fatal("For(\"github\") returned false")
	}

	repos, err := c.ListRepos(context.Background(), "tok", srv.URL)
	if err != nil {
		t.Fatalf("ListRepos error: %v", err)
	}
	if len(repos) != 2 {
		t.Fatalf("expected 2 repos, got %d", len(repos))
	}

	r0 := repos[0]
	if r0.ProviderID != "101" {
		t.Errorf("ProviderID: want 101, got %s", r0.ProviderID)
	}
	if r0.FullName != "owner/repo-a" {
		t.Errorf("FullName: want owner/repo-a, got %s", r0.FullName)
	}
	if r0.DefaultBranch != "main" {
		t.Errorf("DefaultBranch: want main, got %s", r0.DefaultBranch)
	}
	if r0.Private != false {
		t.Errorf("Private: want false, got true")
	}

	r1 := repos[1]
	if r1.ProviderID != "202" {
		t.Errorf("ProviderID: want 202, got %s", r1.ProviderID)
	}
	if r1.Private != true {
		t.Errorf("Private: want true, got false")
	}
}

func TestGitHubClient_RegisterWebhook(t *testing.T) {
	type hookConfig struct {
		URL         string `json:"url"`
		ContentType string `json:"content_type"`
		Secret      string `json:"secret"`
	}
	type hookPayload struct {
		Name   string     `json:"name"`
		Active bool       `json:"active"`
		Events []string   `json:"events"`
		Config hookConfig `json:"config"`
	}

	t.Run("201_success", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost {
				t.Errorf("expected POST, got %s", r.Method)
			}
			if r.URL.Path != "/repos/o/r/hooks" {
				t.Errorf("unexpected path: %s", r.URL.Path)
			}
			var p hookPayload
			if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
				t.Errorf("decode body: %v", err)
			}
			if p.Config.URL != "https://hook.example.com" {
				t.Errorf("config.url: want https://hook.example.com, got %s", p.Config.URL)
			}
			if p.Config.Secret != "mysecret" {
				t.Errorf("config.secret: want mysecret, got %s", p.Config.Secret)
			}
			foundPush, foundCreate := false, false
			for _, e := range p.Events {
				if e == "push" {
					foundPush = true
				}
				if e == "create" {
					foundCreate = true
				}
			}
			if !foundPush || !foundCreate {
				t.Errorf("events missing push/create: %v", p.Events)
			}
			w.WriteHeader(http.StatusCreated)
		}))
		defer srv.Close()

		c, _ := sources.For("github")
		err := c.RegisterWebhook(context.Background(), "tok", srv.URL, "o", "r", "https://hook.example.com", "mysecret")
		if err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
	})

	t.Run("422_error", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusUnprocessableEntity)
		}))
		defer srv.Close()

		c, _ := sources.For("github")
		err := c.RegisterWebhook(context.Background(), "tok", srv.URL, "o", "r", "https://hook.example.com", "mysecret")
		if err == nil {
			t.Fatal("expected error for 422, got nil")
		}
	})
}

func TestGitHubClient_ValidateToken(t *testing.T) {
	t.Run("200_nil", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/user" {
				t.Errorf("unexpected path: %s", r.URL.Path)
			}
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"login":"octocat"}`))
		}))
		defer srv.Close()

		c, _ := sources.For("github")
		if err := c.ValidateToken(context.Background(), "tok", srv.URL); err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
	})

	t.Run("401_error", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
		}))
		defer srv.Close()

		c, _ := sources.For("github")
		if err := c.ValidateToken(context.Background(), "tok", srv.URL); err == nil {
			t.Fatal("expected error for 401, got nil")
		}
	})
}

package sources_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/narratorlog/narratorlog/internal/sources"
)

func TestGitLabClient_ListRepos_PaginationAndMapping(t *testing.T) {
	callCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v4/projects" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("PRIVATE-TOKEN") == "" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		callCount++
		w.Header().Set("Content-Type", "application/json")
		if callCount == 1 {
			w.Header().Set("X-Next-Page", "2")
			json.NewEncoder(w).Encode([]map[string]interface{}{
				{
					"id":                   42,
					"path_with_namespace":  "group/project-a",
					"name":                 "project-a",
					"web_url":              "https://gitlab.com/group/project-a",
					"default_branch":       "main",
					"visibility":           "private",
				},
			})
		} else {
			// no X-Next-Page header = stop
			json.NewEncoder(w).Encode([]map[string]interface{}{
				{
					"id":                   99,
					"path_with_namespace":  "group/project-b",
					"name":                 "project-b",
					"web_url":              "https://gitlab.com/group/project-b",
					"default_branch":       "develop",
					"visibility":           "public",
				},
			})
		}
	}))
	defer srv.Close()

	c, ok := sources.For("gitlab")
	if !ok {
		t.Fatal("For(\"gitlab\") returned false")
	}

	repos, err := c.ListRepos(context.Background(), "glpat-test", srv.URL)
	if err != nil {
		t.Fatalf("ListRepos error: %v", err)
	}
	if len(repos) != 2 {
		t.Fatalf("expected 2 repos, got %d", len(repos))
	}

	r0 := repos[0]
	if r0.ProviderID != "42" {
		t.Errorf("ProviderID: want 42, got %s", r0.ProviderID)
	}
	if r0.FullName != "group/project-a" {
		t.Errorf("FullName: want group/project-a, got %s", r0.FullName)
	}
	if r0.Name != "project-a" {
		t.Errorf("Name: want project-a, got %s", r0.Name)
	}
	if r0.URL != "https://gitlab.com/group/project-a" {
		t.Errorf("URL: want https://gitlab.com/group/project-a, got %s", r0.URL)
	}
	if r0.DefaultBranch != "main" {
		t.Errorf("DefaultBranch: want main, got %s", r0.DefaultBranch)
	}
	if !r0.Private {
		t.Errorf("Private: want true for visibility=private, got false")
	}

	r1 := repos[1]
	if r1.ProviderID != "99" {
		t.Errorf("ProviderID: want 99, got %s", r1.ProviderID)
	}
	if r1.Private {
		t.Errorf("Private: want false for visibility=public, got true")
	}
}

func TestGitLabClient_RegisterWebhook(t *testing.T) {
	type hookPayload struct {
		URL        string `json:"url"`
		Token      string `json:"token"`
		PushEvents bool   `json:"push_events"`
	}

	t.Run("201_success", func(t *testing.T) {
		var capturedHookPath string
		var capturedPayload hookPayload

		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch {
			case r.Method == http.MethodGet && r.URL.RawPath == "/api/v4/projects/mygroup%2Fmy-repo":
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]interface{}{"id": 77})
			case r.Method == http.MethodPost && r.URL.Path == "/api/v4/projects/77/hooks":
				capturedHookPath = r.URL.Path
				if err := json.NewDecoder(r.Body).Decode(&capturedPayload); err != nil {
					t.Errorf("decode body: %v", err)
				}
				w.WriteHeader(http.StatusCreated)
			default:
				t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
				http.NotFound(w, r)
			}
		}))
		defer srv.Close()

		c, _ := sources.For("gitlab")
		err := c.RegisterWebhook(context.Background(), "glpat-test", srv.URL, "mygroup", "my-repo", "https://hook.example.com", "mysecret")
		if err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
		if capturedHookPath != "/api/v4/projects/77/hooks" {
			t.Errorf("unexpected hook path: %s", capturedHookPath)
		}
		if capturedPayload.URL != "https://hook.example.com" {
			t.Errorf("url: want https://hook.example.com, got %s", capturedPayload.URL)
		}
		if capturedPayload.Token != "mysecret" {
			t.Errorf("token: want mysecret, got %s", capturedPayload.Token)
		}
		if !capturedPayload.PushEvents {
			t.Errorf("push_events: want true, got false")
		}
	})

	t.Run("422_error", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet {
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]interface{}{"id": 55})
				return
			}
			w.WriteHeader(http.StatusUnprocessableEntity)
		}))
		defer srv.Close()

		c, _ := sources.For("gitlab")
		err := c.RegisterWebhook(context.Background(), "glpat-test", srv.URL, "o", "r", "https://hook.example.com", "mysecret")
		if err == nil {
			t.Fatal("expected error for 422, got nil")
		}
	})
}

func TestGitLabClient_ValidateToken(t *testing.T) {
	t.Run("200_nil", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/api/v4/user" {
				t.Errorf("unexpected path: %s", r.URL.Path)
			}
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"id":1,"username":"testuser"}`))
		}))
		defer srv.Close()

		c, _ := sources.For("gitlab")
		if err := c.ValidateToken(context.Background(), "glpat-test", srv.URL); err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
	})

	t.Run("401_error", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
		}))
		defer srv.Close()

		c, _ := sources.For("gitlab")
		if err := c.ValidateToken(context.Background(), "glpat-test", srv.URL); err == nil {
			t.Fatal("expected error for 401, got nil")
		}
	})
}

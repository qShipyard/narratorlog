package sources_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/narratorlog/narratorlog/internal/sources"
)

func newBitbucketClientWithBase(t *testing.T, baseURL string) sources.Client {
	t.Helper()
	c, ok := sources.ForBitbucket(baseURL)
	if !ok {
		t.Fatal("ForBitbucket returned false")
	}
	return c
}

func TestBitbucketClient_ListRepos_PaginationAndMapping(t *testing.T) {
	page1Served := false

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/2.0/repositories" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") == "" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if !page1Served {
			page1Served = true
			// include a "next" URL pointing to page 2
			resp := map[string]interface{}{
				"values": []map[string]interface{}{
					{
						"uuid":      "{uuid-aaa}",
						"full_name": "workspace/repo-a",
						"name":      "repo-a",
						"links": map[string]interface{}{
							"html": map[string]interface{}{
								"href": "https://bitbucket.org/workspace/repo-a",
							},
						},
						"mainbranch": map[string]interface{}{
							"name": "main",
						},
						"is_private": true,
					},
				},
				"next": r.URL.Scheme + "://" + r.Host + "/2.0/repositories?role=member&pagelen=100&page=2",
			}
			// r.URL.Scheme is empty in httptest; build the full next URL from the request host
			resp["next"] = "http://" + r.Host + "/2.0/repositories?role=member&pagelen=100&page=2"
			json.NewEncoder(w).Encode(resp)
		} else {
			// no "next" = last page
			resp := map[string]interface{}{
				"values": []map[string]interface{}{
					{
						"uuid":      "{uuid-bbb}",
						"full_name": "workspace/repo-b",
						"name":      "repo-b",
						"links": map[string]interface{}{
							"html": map[string]interface{}{
								"href": "https://bitbucket.org/workspace/repo-b",
							},
						},
						"mainbranch": map[string]interface{}{
							"name": "develop",
						},
						"is_private": false,
					},
				},
			}
			json.NewEncoder(w).Encode(resp)
		}
	}))
	defer srv.Close()

	c := newBitbucketClientWithBase(t, srv.URL)

	repos, err := c.ListRepos(context.Background(), "test-token", "")
	if err != nil {
		t.Fatalf("ListRepos error: %v", err)
	}
	if len(repos) != 2 {
		t.Fatalf("expected 2 repos, got %d", len(repos))
	}

	r0 := repos[0]
	if r0.ProviderID != "{uuid-aaa}" {
		t.Errorf("ProviderID: want {uuid-aaa}, got %s", r0.ProviderID)
	}
	if r0.FullName != "workspace/repo-a" {
		t.Errorf("FullName: want workspace/repo-a, got %s", r0.FullName)
	}
	if r0.Name != "repo-a" {
		t.Errorf("Name: want repo-a, got %s", r0.Name)
	}
	if r0.URL != "https://bitbucket.org/workspace/repo-a" {
		t.Errorf("URL: want https://bitbucket.org/workspace/repo-a, got %s", r0.URL)
	}
	if r0.DefaultBranch != "main" {
		t.Errorf("DefaultBranch: want main, got %s", r0.DefaultBranch)
	}
	if !r0.Private {
		t.Errorf("Private: want true, got false")
	}

	r1 := repos[1]
	if r1.ProviderID != "{uuid-bbb}" {
		t.Errorf("ProviderID: want {uuid-bbb}, got %s", r1.ProviderID)
	}
	if r1.Private {
		t.Errorf("Private: want false, got true")
	}
	if r1.DefaultBranch != "develop" {
		t.Errorf("DefaultBranch: want develop, got %s", r1.DefaultBranch)
	}
}

func TestBitbucketClient_RegisterWebhook(t *testing.T) {
	type hookPayload struct {
		Description string   `json:"description"`
		URL         string   `json:"url"`
		Active      bool     `json:"active"`
		Events      []string `json:"events"`
	}

	t.Run("201_success", func(t *testing.T) {
		var capturedPath string
		var capturedPayload hookPayload

		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost {
				t.Errorf("unexpected method: %s", r.Method)
				http.NotFound(w, r)
				return
			}
			capturedPath = r.URL.Path
			if err := json.NewDecoder(r.Body).Decode(&capturedPayload); err != nil {
				t.Errorf("decode body: %v", err)
			}
			w.WriteHeader(http.StatusCreated)
		}))
		defer srv.Close()

		c := newBitbucketClientWithBase(t, srv.URL)
		err := c.RegisterWebhook(context.Background(), "test-token", "", "myworkspace", "my-repo", "https://hook.example.com", "ignored-secret")
		if err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
		if capturedPath != "/2.0/repositories/myworkspace/my-repo/hooks" {
			t.Errorf("unexpected hook path: %s", capturedPath)
		}
		if capturedPayload.URL != "https://hook.example.com" {
			t.Errorf("url: want https://hook.example.com, got %s", capturedPayload.URL)
		}
		if !capturedPayload.Active {
			t.Errorf("active: want true, got false")
		}
		if len(capturedPayload.Events) != 1 || capturedPayload.Events[0] != "repo:push" {
			t.Errorf("events: want [repo:push], got %v", capturedPayload.Events)
		}
	})

	t.Run("400_error", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusBadRequest)
		}))
		defer srv.Close()

		c := newBitbucketClientWithBase(t, srv.URL)
		err := c.RegisterWebhook(context.Background(), "test-token", "", "ws", "repo", "https://hook.example.com", "")
		if err == nil {
			t.Fatal("expected error for 400, got nil")
		}
	})
}

func TestBitbucketClient_ValidateToken(t *testing.T) {
	t.Run("200_nil", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/2.0/user" {
				t.Errorf("unexpected path: %s", r.URL.Path)
			}
			if r.Header.Get("Authorization") != "Bearer test-token" {
				t.Errorf("unexpected auth header: %s", r.Header.Get("Authorization"))
			}
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"uuid":"{user-uuid}","username":"testuser"}`))
		}))
		defer srv.Close()

		c := newBitbucketClientWithBase(t, srv.URL)
		if err := c.ValidateToken(context.Background(), "test-token", ""); err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
	})

	t.Run("401_error", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
		}))
		defer srv.Close()

		c := newBitbucketClientWithBase(t, srv.URL)
		if err := c.ValidateToken(context.Background(), "bad-token", ""); err == nil {
			t.Fatal("expected error for 401, got nil")
		}
	})
}

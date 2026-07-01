package sources

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

const defaultGitLabBase = "https://gitlab.com"

type gitlabClient struct{}

func (g *gitlabClient) resolveBase(baseURL string) string {
	if baseURL == "" {
		return defaultGitLabBase
	}
	return baseURL
}

type gitlabProject struct {
	ID                int64  `json:"id"`
	PathWithNamespace string `json:"path_with_namespace"`
	Name              string `json:"name"`
	WebURL            string `json:"web_url"`
	DefaultBranch     string `json:"default_branch"`
	Visibility        string `json:"visibility"`
}

func (g *gitlabClient) ListRepos(ctx context.Context, token, baseURL string) ([]Repo, error) {
	base := g.resolveBase(baseURL)
	var all []Repo
	page := 1

	for {
		reqURL := fmt.Sprintf("%s/api/v4/projects?membership=true&per_page=100&page=%d", base, page)

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("PRIVATE-TOKEN", token)

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch GitLab projects: %w", err)
		}

		if resp.StatusCode >= 400 {
			resp.Body.Close()
			return nil, fmt.Errorf("GitLab list projects failed with status %d", resp.StatusCode)
		}

		var batch []gitlabProject
		if err := json.NewDecoder(resp.Body).Decode(&batch); err != nil {
			resp.Body.Close()
			return nil, fmt.Errorf("failed to decode GitLab projects: %w", err)
		}
		resp.Body.Close()

		for _, p := range batch {
			all = append(all, Repo{
				ProviderID:    fmt.Sprintf("%d", p.ID),
				FullName:      p.PathWithNamespace,
				Name:          p.Name,
				URL:           p.WebURL,
				DefaultBranch: p.DefaultBranch,
				Private:       p.Visibility != "public",
			})
		}

		nextPage := resp.Header.Get("X-Next-Page")
		if nextPage == "" {
			break
		}
		page++
	}

	return all, nil
}

func (g *gitlabClient) resolveProjectID(ctx context.Context, token, base, owner, repo string) (int64, error) {
	encoded := url.PathEscape(owner + "/" + repo)
	reqURL := fmt.Sprintf("%s/api/v4/projects/%s", base, encoded)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("PRIVATE-TOKEN", token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("failed to resolve GitLab project ID: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return 0, fmt.Errorf("GitLab resolve project failed with status %d", resp.StatusCode)
	}

	var project struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&project); err != nil {
		return 0, fmt.Errorf("failed to decode GitLab project: %w", err)
	}

	return project.ID, nil
}

func (g *gitlabClient) ListBranches(ctx context.Context, token, baseURL, owner, repo string) ([]string, error) {
	base := g.resolveBase(baseURL)
	projectID, err := g.resolveProjectID(ctx, token, base, owner, repo)
	if err != nil {
		return nil, err
	}

	var all []string
	page := 1
	for {
		reqURL := fmt.Sprintf("%s/api/v4/projects/%d/repository/branches?per_page=100&page=%d", base, projectID, page)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("PRIVATE-TOKEN", token)

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch GitLab branches: %w", err)
		}
		if resp.StatusCode >= 400 {
			resp.Body.Close()
			return nil, fmt.Errorf("GitLab branches request failed with status %d", resp.StatusCode)
		}

		var batch []struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&batch); err != nil {
			resp.Body.Close()
			return nil, fmt.Errorf("failed to decode GitLab branches: %w", err)
		}
		nextPage := resp.Header.Get("X-Next-Page")
		resp.Body.Close()

		for _, b := range batch {
			all = append(all, b.Name)
		}
		if nextPage == "" {
			break
		}
		page++
	}

	return all, nil
}

func (g *gitlabClient) RegisterWebhook(ctx context.Context, token, baseURL, owner, repo, webhookURL, secret string) error {
	base := g.resolveBase(baseURL)

	projectID, err := g.resolveProjectID(ctx, token, base, owner, repo)
	if err != nil {
		return err
	}

	payload, err := json.Marshal(map[string]interface{}{
		"url":                   webhookURL,
		"token":                 secret,
		"push_events":           true,
		"merge_requests_events": true,
	})
	if err != nil {
		return err
	}

	reqURL := fmt.Sprintf("%s/api/v4/projects/%d/hooks", base, projectID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("PRIVATE-TOKEN", token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to register GitLab webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("GitLab webhook registration failed with status %d", resp.StatusCode)
	}

	return nil
}

func (g *gitlabClient) ValidateToken(ctx context.Context, token, baseURL string) error {
	_, err := g.AuthenticatedUser(ctx, token, baseURL)
	return err
}

func (g *gitlabClient) AuthenticatedUser(ctx context.Context, token, baseURL string) (string, error) {
	base := g.resolveBase(baseURL)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/api/v4/user", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("PRIVATE-TOKEN", token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to fetch GitLab user: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("GitLab user request failed with status %d", resp.StatusCode)
	}

	var u struct {
		Username string `json:"username"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return "", fmt.Errorf("failed to decode GitLab user: %w", err)
	}
	return u.Username, nil
}

package sources

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

const defaultGitHubBase = "https://api.github.com"

type githubClient struct{}

func (g *githubClient) resolveBase(baseURL string) string {
	if baseURL == "" {
		return defaultGitHubBase
	}
	return baseURL
}

type githubRepo struct {
	ID            int64  `json:"id"`
	FullName      string `json:"full_name"`
	Name          string `json:"name"`
	HTMLURL       string `json:"html_url"`
	DefaultBranch string `json:"default_branch"`
	Private       bool   `json:"private"`
}

func (g *githubClient) ListRepos(ctx context.Context, token, baseURL string) ([]Repo, error) {
	base := g.resolveBase(baseURL)
	var all []Repo
	page := 1

	for {
		url := fmt.Sprintf("%s/user/repos?per_page=100&page=%d&sort=updated&affiliation=owner,collaborator,organization_member", base, page)

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Accept", "application/vnd.github.v3+json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch GitHub repos: %w", err)
		}

		if resp.StatusCode >= 400 {
			resp.Body.Close()
			return nil, fmt.Errorf("GitHub repos request failed with status %d", resp.StatusCode)
		}

		var batch []githubRepo
		if err := json.NewDecoder(resp.Body).Decode(&batch); err != nil {
			resp.Body.Close()
			return nil, fmt.Errorf("failed to decode GitHub repos: %w", err)
		}
		resp.Body.Close()

		if len(batch) == 0 {
			break
		}

		for _, r := range batch {
			all = append(all, Repo{
				ProviderID:    fmt.Sprintf("%d", r.ID),
				FullName:      r.FullName,
				Name:          r.Name,
				URL:           r.HTMLURL,
				DefaultBranch: r.DefaultBranch,
				Private:       r.Private,
			})
		}

		if len(batch) < 100 {
			break
		}
		page++
	}

	return all, nil
}

func (g *githubClient) RegisterWebhook(ctx context.Context, token, baseURL, owner, repo, webhookURL, secret string) error {
	base := g.resolveBase(baseURL)
	url := fmt.Sprintf("%s/repos/%s/%s/hooks", base, owner, repo)

	payload, err := json.Marshal(map[string]interface{}{
		"name":   "web",
		"active": true,
		"events": []string{"push", "create"},
		"config": map[string]string{
			"url":          webhookURL,
			"content_type": "json",
			"secret":       secret,
		},
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to register webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("GitHub webhook registration failed with status %d", resp.StatusCode)
	}

	return nil
}

func (g *githubClient) ValidateToken(ctx context.Context, token, baseURL string) error {
	base := g.resolveBase(baseURL)
	url := base + "/user"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to validate GitHub token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("GitHub token validation failed with status %d", resp.StatusCode)
	}

	return nil
}

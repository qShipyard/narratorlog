package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"golang.org/x/oauth2"
	githuboauth "golang.org/x/oauth2/github"
)

type GitHubOAuthClient struct {
	config *oauth2.Config
}

func NewGitHubOAuthClient(clientID, clientSecret, callbackURL string) *GitHubOAuthClient {
	return &GitHubOAuthClient{
		config: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  callbackURL,
			Scopes:       []string{"repo", "read:user", "user:email"},
			Endpoint:     githuboauth.Endpoint,
		},
	}
}

func (g *GitHubOAuthClient) AuthURL(state string) string {
	return g.config.AuthCodeURL(state, oauth2.AccessTypeOnline)
}

func (g *GitHubOAuthClient) Exchange(ctx context.Context, code string) (string, error) {
	token, err := g.config.Exchange(ctx, code)
	if err != nil {
		return "", fmt.Errorf("failed to exchange code: %w", err)
	}
	return token.AccessToken, nil
}

type GitHubUser struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatar_url"`
}

func (g *GitHubOAuthClient) GetUser(ctx context.Context, accessToken string) (*GitHubUser, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.github.com/user", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch GitHub user: %w", err)
	}
	defer resp.Body.Close()

	var user GitHubUser
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, fmt.Errorf("failed to decode GitHub user: %w", err)
	}

	return &user, nil
}

type GitHubRepo struct {
	ID            int64  `json:"id"`
	FullName      string `json:"full_name"`
	Name          string `json:"name"`
	HTMLURL       string `json:"html_url"`
	DefaultBranch string `json:"default_branch"`
	Private       bool   `json:"private"`
}

func (g *GitHubOAuthClient) ListRepos(ctx context.Context, accessToken string) ([]GitHubRepo, error) {
	var allRepos []GitHubRepo
	page := 1

	for {
		url := fmt.Sprintf("https://api.github.com/user/repos?per_page=100&page=%d&sort=updated&affiliation=owner,collaborator,organization_member", page)

		req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+accessToken)
		req.Header.Set("Accept", "application/vnd.github.v3+json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch GitHub repos: %w", err)
		}
		defer resp.Body.Close()

		var repos []GitHubRepo
		if err := json.NewDecoder(resp.Body).Decode(&repos); err != nil {
			return nil, fmt.Errorf("failed to decode GitHub repos: %w", err)
		}

		if len(repos) == 0 {
			break
		}

		allRepos = append(allRepos, repos...)

		if len(repos) < 100 {
			break
		}
		page++
	}

	return allRepos, nil
}

func (g *GitHubOAuthClient) RegisterWebhook(ctx context.Context, accessToken, owner, repo, webhookURL, secret string) error {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/hooks", owner, repo)

	payload, _ := json.Marshal(map[string]interface{}{
		"name":   "web",
		"active": true,
		"events": []string{"push", "create"},
		"config": map[string]string{
			"url":          webhookURL,
			"content_type": "json",
			"secret":       secret,
		},
	})

	req, err := http.NewRequestWithContext(ctx, "POST", url,
		bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
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

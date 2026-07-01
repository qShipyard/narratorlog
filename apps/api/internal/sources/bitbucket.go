package sources

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

const defaultBitbucketBase = "https://api.bitbucket.org"

type bitbucketClient struct {
	baseAPI string
}

func (b *bitbucketClient) base() string {
	if b.baseAPI != "" {
		return b.baseAPI
	}
	return defaultBitbucketBase
}

type bitbucketRepo struct {
	UUID     string `json:"uuid"`
	FullName string `json:"full_name"`
	Name     string `json:"name"`
	Links    struct {
		HTML struct {
			Href string `json:"href"`
		} `json:"html"`
	} `json:"links"`
	MainBranch struct {
		Name string `json:"name"`
	} `json:"mainbranch"`
	IsPrivate bool `json:"is_private"`
}

type bitbucketReposPage struct {
	Values []bitbucketRepo `json:"values"`
	Next   string          `json:"next"`
}

func (b *bitbucketClient) ListRepos(ctx context.Context, token, baseURL string) ([]Repo, error) {
	nextURL := b.base() + "/2.0/repositories?role=member&pagelen=100"
	var all []Repo

	for nextURL != "" {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, nextURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch Bitbucket repos: %w", err)
		}

		if resp.StatusCode >= 400 {
			resp.Body.Close()
			return nil, fmt.Errorf("Bitbucket list repos failed with status %d", resp.StatusCode)
		}

		var page bitbucketReposPage
		if err := json.NewDecoder(resp.Body).Decode(&page); err != nil {
			resp.Body.Close()
			return nil, fmt.Errorf("failed to decode Bitbucket repos: %w", err)
		}
		resp.Body.Close()

		for _, r := range page.Values {
			all = append(all, Repo{
				ProviderID:    r.UUID,
				FullName:      r.FullName,
				Name:          r.Name,
				URL:           r.Links.HTML.Href,
				DefaultBranch: r.MainBranch.Name,
				Private:       r.IsPrivate,
			})
		}

		nextURL = page.Next
	}

	return all, nil
}

func (b *bitbucketClient) RegisterWebhook(ctx context.Context, token, baseURL, owner, repo, webhookURL, secret string) error {
	reqURL := fmt.Sprintf("%s/2.0/repositories/%s/%s/hooks", b.base(), owner, repo)

	payload, err := json.Marshal(map[string]interface{}{
		"description": "narratorlog",
		"url":         webhookURL,
		"active":      true,
		"events":      []string{"repo:push"},
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to register Bitbucket webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("Bitbucket webhook registration failed with status %d", resp.StatusCode)
	}

	return nil
}

func (b *bitbucketClient) ValidateToken(ctx context.Context, token, baseURL string) error {
	reqURL := b.base() + "/2.0/user"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to validate Bitbucket token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("Bitbucket token validation failed with status %d", resp.StatusCode)
	}

	return nil
}

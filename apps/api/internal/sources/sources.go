package sources

import "context"

type Repo struct {
	ProviderID    string
	FullName      string
	Name          string
	URL           string
	DefaultBranch string
	Private       bool
}

type Client interface {
	ListRepos(ctx context.Context, token, baseURL string) ([]Repo, error)
	RegisterWebhook(ctx context.Context, token, baseURL, owner, repo, webhookURL, secret string) error
	ValidateToken(ctx context.Context, token, baseURL string) error
}

func For(provider string) (Client, bool) {
	switch provider {
	case "github":
		return &githubClient{}, true
	case "gitlab":
		return &gitlabClient{}, true
	case "bitbucket":
		return &bitbucketClient{}, true
	}
	return nil, false
}

// ForBitbucket returns a Bitbucket client with a custom base URL, intended for testing.
func ForBitbucket(baseAPI string) (Client, bool) {
	return &bitbucketClient{baseAPI: baseAPI}, true
}

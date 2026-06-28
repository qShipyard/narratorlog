package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestValidateGitLabToken(t *testing.T) {
	tests := []struct {
		name   string
		token  string
		secret string
		want   bool
	}{
		{
			name:   "matching token",
			token:  "my-secret-token",
			secret: "my-secret-token",
			want:   true,
		},
		{
			name:   "mismatched token",
			token:  "wrong-token",
			secret: "my-secret-token",
			want:   false,
		},
		{
			name:   "empty token against set secret",
			token:  "",
			secret: "my-secret-token",
			want:   false,
		},
		{
			name:   "empty both",
			token:  "",
			secret: "",
			want:   true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := validateGitLabToken(tc.token, tc.secret)
			if got != tc.want {
				t.Errorf("validateGitLabToken() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestValidateGitHubSignature(t *testing.T) {
	secret := "test-webhook-secret"
	body := []byte(`{"ref":"refs/heads/main","pusher":{"name":"octocat"}}`)

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	validSig := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	tests := []struct {
		name      string
		body      []byte
		signature string
		secret    string
		want      bool
	}{
		{
			name:      "valid signature",
			body:      body,
			signature: validSig,
			secret:    secret,
			want:      true,
		},
		{
			name:      "tampered signature",
			body:      body,
			signature: "sha256=" + hex.EncodeToString([]byte("nottherealsignature123456789012")),
			secret:    secret,
			want:      false,
		},
		{
			name:      "missing sha256= prefix",
			body:      body,
			signature: hex.EncodeToString(mac.Sum(nil)),
			secret:    secret,
			want:      false,
		},
		{
			name:      "empty signature",
			body:      body,
			signature: "",
			secret:    secret,
			want:      false,
		},
		{
			name:      "wrong secret",
			body:      body,
			signature: validSig,
			secret:    "wrong-secret",
			want:      false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := validateGitHubSignature(tc.body, tc.signature, tc.secret)
			if got != tc.want {
				t.Errorf("validateGitHubSignature() = %v, want %v", got, tc.want)
			}
		})
	}
}

package pipeline

import (
	"fmt"
	"strings"
)

// FormatAIScanFailure turns a plugin or transport error into an actionable scan failure.
func FormatAIScanFailure(cause error) error {
	if cause == nil {
		return fmt.Errorf("AI summarization failed. Open Settings → AI provider and check your API key and model, then run the scan again.")
	}

	msg := strings.ToLower(cause.Error())
	switch {
	case strings.Contains(msg, "incorrect api key"),
		strings.Contains(msg, "invalid_api_key"),
		strings.Contains(msg, "invalid api key"),
		strings.Contains(msg, "authentication"):
		return fmt.Errorf("Your AI API key was rejected. Open Settings → AI provider, paste a valid key, save, and run the scan again.")
	case strings.Contains(msg, "model") && (strings.Contains(msg, "not exist") || strings.Contains(msg, "not found") || strings.Contains(msg, "invalid")):
		return fmt.Errorf("That AI model name isn't valid. Open Settings → AI provider and check the model field (for OpenAI, try gpt-4o), then run the scan again.")
	case strings.Contains(msg, "rate limit"), strings.Contains(msg, "429"):
		return fmt.Errorf("The AI provider rate-limited this scan. Wait a minute and run the scan again.")
	default:
		return fmt.Errorf("AI summarization failed. Open Settings → AI provider and check your API key and model, then run the scan again.")
	}
}

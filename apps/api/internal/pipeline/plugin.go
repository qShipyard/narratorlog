package pipeline

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"time"
)

// ─── Plugin Runner ────────────────────────────────────────────────────────────

// PluginRunner executes a TypeScript plugin as a subprocess.
// It writes a JSON request to stdin and reads a JSON response from stdout.
// This is the only way the Go pipeline communicates with TypeScript plugins.
type PluginRunner struct {
	// Timeout for a single plugin call. Defaults to 30s.
	Timeout time.Duration
}

// NewPluginRunner returns a PluginRunner with sensible defaults.
func NewPluginRunner() *PluginRunner {
	return &PluginRunner{
		Timeout: 30 * time.Second,
	}
}

// run spawns the plugin at pluginPath, writes request as JSON to stdin,
// and returns the raw stdout bytes as the response.
func (p *PluginRunner) run(ctx context.Context, pluginPath string, request any) ([]byte, error) {
	reqBytes, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal plugin request: %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, p.Timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "node", pluginPath)
	cmd.Stdin = bytes.NewReader(reqBytes)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		// Log stderr for debugging but don't expose it in the error
		stderrOutput := stderr.String()
		if stderrOutput != "" {
			fmt.Printf("[plugin stderr] %s: %s\n", pluginPath, stderrOutput)
		}
		return nil, fmt.Errorf("plugin %s exited with error: %w", pluginPath, err)
	}

	if stdout.Len() == 0 {
		return nil, fmt.Errorf("plugin %s returned empty response", pluginPath)
	}

	return stdout.Bytes(), nil
}

// ─── Source Plugin ────────────────────────────────────────────────────────────

// CallSourcePlugin calls a source plugin and returns raw commits.
func (p *PluginRunner) CallSourcePlugin(
	ctx context.Context,
	pluginPath string,
	req SourcePluginRequest,
) (*SourcePluginResponse, error) {
	raw, err := p.run(ctx, pluginPath, req)
	if err != nil {
		return nil, fmt.Errorf("source plugin call failed: %w", err)
	}

	var resp SourcePluginResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("failed to parse source plugin response: %w", err)
	}

	if resp.Error != nil {
		return nil, fmt.Errorf("source plugin returned error: %s", *resp.Error)
	}

	return &resp, nil
}

// ─── AI Provider Plugin — Pass 1 (Summarize) ─────────────────────────────────

// CallSummarize calls an AI provider plugin for pass 1 — summarizing one commit group.
func (p *PluginRunner) CallSummarize(
	ctx context.Context,
	pluginPath string,
	req SummarizePluginRequest,
) (*SummarizePluginResponse, error) {
	raw, err := p.run(ctx, pluginPath, req)
	if err != nil {
		return nil, fmt.Errorf("summarize plugin call failed: %w", err)
	}

	var resp SummarizePluginResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("failed to parse summarize response: %w", err)
	}

	if resp.Error != nil {
		return nil, fmt.Errorf("summarize plugin returned error: %s", *resp.Error)
	}

	return &resp, nil
}

// ─── AI Provider Plugin — Pass 2 (Generate) ──────────────────────────────────

// CallGenerate calls an AI provider plugin for pass 2 — generating an audience draft.
func (p *PluginRunner) CallGenerate(
	ctx context.Context,
	pluginPath string,
	req GeneratePluginRequest,
) (*GeneratePluginResponse, error) {
	raw, err := p.run(ctx, pluginPath, req)
	if err != nil {
		return nil, fmt.Errorf("generate plugin call failed: %w", err)
	}

	var resp GeneratePluginResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("failed to parse generate response: %w", err)
	}

	if resp.Error != nil {
		return nil, fmt.Errorf("generate plugin returned error: %s", *resp.Error)
	}

	return &resp, nil
}

// ─── Plugin Path Resolver ─────────────────────────────────────────────────────

// PluginPaths holds resolved filesystem paths to each plugin.
// Built from config before the pipeline starts.
type PluginPaths struct {
	Source     string            // e.g. plugins/sources/github/index.js
	AIProvider string            // e.g. plugins/ai-providers/anthropic/index.js
	Outputs    map[string]string // audienceID → output plugin path
}

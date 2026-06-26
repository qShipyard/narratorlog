package jobs

import (
	"fmt"
	"os"
	"path/filepath"
)

// PluginResolver finds the absolute path to a plugin's entry point.
// Looks relative to the binary's working directory or NARRATORLOG_ROOT env.
type PluginResolver struct {
	root string
}

func NewPluginResolver() *PluginResolver {
	root := os.Getenv("NARRATORLOG_ROOT")
	if root == "" {
		// Default — works when running from repo root
		root = "."
	}
	return &PluginResolver{root: root}
}

func (r *PluginResolver) OutputPlugin(name string) (string, error) {
	candidates := []string{
		filepath.Join(r.root, "plugins", "outputs", name, "dist", "index.js"),
		filepath.Join(r.root, "plugins", "outputs", name, "index.js"),
	}

	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			return path, nil
		}
	}

	return "", fmt.Errorf("output plugin %q not found — run pnpm build in plugins/outputs/%s", name, name)
}

func (r *PluginResolver) AIPlugin(name string) (string, error) {
	candidates := []string{
		filepath.Join(r.root, "plugins", "ai-providers", name, "dist", "index.js"),
		filepath.Join(r.root, "plugins", "ai-providers", name, "index.js"),
	}

	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			return path, nil
		}
	}

	return "", fmt.Errorf("AI provider plugin %q not found — run pnpm build in plugins/ai-providers/%s", name, name)
}

func (r *PluginResolver) SourcePlugin(name string) (string, error) {
	candidates := []string{
		filepath.Join(r.root, "plugins", "sources", name, "dist", "index.js"),
		filepath.Join(r.root, "plugins", "sources", name, "index.js"),
	}

	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			return path, nil
		}
	}

	return "", fmt.Errorf("source plugin %q not found — run pnpm build in plugins/sources/%s", name, name)
}

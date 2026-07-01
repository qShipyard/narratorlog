package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/narratorlog/narratorlog/internal/auth"
	db "github.com/narratorlog/narratorlog/internal/db"
	"github.com/narratorlog/narratorlog/internal/pipeline"
	"github.com/narratorlog/narratorlog/internal/store"
	"github.com/narratorlog/narratorlog/internal/teamconfig"
)

type ScanProcessor struct {
	pool     *pgxpool.Pool
	queries  *db.Queries
	enc      *auth.Encryptor
	resolver *PluginResolver
	runner   *pipeline.PluginRunner
}

func NewScanProcessor(pool *pgxpool.Pool, enc *auth.Encryptor) *ScanProcessor {
	return &ScanProcessor{
		pool:     pool,
		queries:  db.New(pool),
		enc:      enc,
		resolver: NewPluginResolver(),
		runner:   pipeline.NewPluginRunner(),
	}
}

// pluginSource adapts the subprocess PluginRunner to the pipeline's CommitSource.
type pluginSource struct {
	runner *pipeline.PluginRunner
	path   string
}

func (s pluginSource) Fetch(ctx context.Context, req pipeline.SourcePluginRequest) (*pipeline.SourcePluginResponse, error) {
	return s.runner.CallSourcePlugin(ctx, s.path, req)
}

// pluginAI adapts the subprocess PluginRunner to the pipeline's AIProvider.
type pluginAI struct {
	runner *pipeline.PluginRunner
	path   string
}

func (a pluginAI) Summarize(ctx context.Context, req pipeline.SummarizePluginRequest) (*pipeline.SummarizePluginResponse, error) {
	return a.runner.CallSummarize(ctx, a.path, req)
}

func (a pluginAI) Generate(ctx context.Context, req pipeline.GeneratePluginRequest) (*pipeline.GeneratePluginResponse, error) {
	return a.runner.CallGenerate(ctx, a.path, req)
}

// markScanFailed records a terminal failure on a background context so the scan
// never stays stuck "running" even when the job's context is already cancelled.
func (p *ScanProcessor) markScanFailed(scanID, reason string) {
	id, err := uuid.Parse(scanID)
	if err != nil {
		return
	}
	_ = p.queries.UpdateScanStatusWithError(context.Background(), db.UpdateScanStatusWithErrorParams{
		Status: db.ScanStatusFailed,
		Error:  pgtype.Text{String: reason, Valid: true},
		ID:     id,
	})
}

func (p *ScanProcessor) ProcessTask(ctx context.Context, t *asynq.Task) (err error) {
	var payload ScanPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("failed to unmarshal scan payload: %w", err)
	}

	// Any failure or panic past this point marks the scan failed, so it never
	// hangs in "running" the way a nil plugin once did.
	defer func() {
		if rec := recover(); rec != nil {
			err = fmt.Errorf("scan panicked: %v", rec)
		}
		if err == nil {
			return
		}
		retryCount, _ := asynq.GetRetryCount(ctx)
		maxRetry, _ := asynq.GetMaxRetry(ctx)
		if retryCount < maxRetry {
			log.Printf("[scan] attempt failed scan_id=%s retry=%d/%d err=%v",
				payload.ScanID, retryCount, maxRetry, err)
			return
		}
		log.Printf("[scan] failed scan_id=%s err=%v", payload.ScanID, err)
		p.markScanFailed(payload.ScanID, err.Error())
	}()

	log.Printf("[scan] starting scan_id=%s repo_id=%s", payload.ScanID, payload.RepositoryID)

	repo, err := p.queries.GetRepositoryByID(ctx, mustParseUUID(payload.RepositoryID))
	if err != nil {
		return fmt.Errorf("failed to fetch repository: %w", err)
	}

	scanFrom, scanTo, err := parseScanWindow(payload)
	if err != nil {
		return fmt.Errorf("invalid scan window: %w", err)
	}

	rawCfg, err := p.queries.GetTeamConfig(ctx, repo.TeamID)
	if err != nil {
		return fmt.Errorf("failed to fetch team config: %w", err)
	}
	tc, err := teamconfig.Parse(rawCfg)
	if err != nil {
		return fmt.Errorf("failed to parse team config: %w", err)
	}
	cfg, err := buildScanConfig(repo, scanFrom, scanTo, tc, p.enc)
	if err != nil {
		return err
	}
	sourcePath, err := p.resolver.SourcePlugin(string(repo.Provider))
	if err != nil {
		return err
	}
	aiPath, err := p.resolver.AIPlugin(tc.AI.Provider)
	if err != nil {
		return err
	}

	st := store.NewPostgresStore(p.pool)
	runner := &pipeline.Runner{
		Store:  st,
		Source: pluginSource{runner: p.runner, path: sourcePath},
		AI:     pluginAI{runner: p.runner, path: aiPath},
		Config: cfg,
	}
	if err = runner.Run(ctx, payload.ScanID); err != nil {
		return err
	}

	log.Printf("[scan] completed scan_id=%s", payload.ScanID)
	return nil
}

func parseScanWindow(payload ScanPayload) (from, to time.Time, err error) {
	if payload.ScanFrom != "" && payload.ScanTo != "" {
		from, err = time.Parse(time.RFC3339, payload.ScanFrom)
		if err != nil {
			return
		}
		to, err = time.Parse(time.RFC3339, payload.ScanTo)
		return
	}

	to = time.Now().UTC()
	lookback := payload.Lookback
	if lookback == "" {
		lookback = "7d"
	}

	duration, err := parseLookback(lookback)
	if err != nil {
		return
	}

	from = to.Add(-duration)
	return
}

func parseLookback(s string) (time.Duration, error) {
	switch s {
	case "1d":
		return 24 * time.Hour, nil
	case "7d":
		return 7 * 24 * time.Hour, nil
	case "14d":
		return 14 * 24 * time.Hour, nil
	case "30d":
		return 30 * 24 * time.Hour, nil
	default:
		return 0, fmt.Errorf("unsupported lookback value: %s", s)
	}
}

func defaultAudiences() []pipeline.AudienceConfig {
	return []pipeline.AudienceConfig{
		{ID: "developers", Tone: "technical"},
		{ID: "product", Tone: "plain-english"},
		{ID: "marketing", Tone: "benefit-focused"},
		{ID: "public", Tone: "friendly"},
	}
}

func buildScanConfig(
	repo db.Repository,
	scanFrom, scanTo time.Time,
	tc *teamconfig.Config,
	enc *auth.Encryptor,
) (pipeline.ScanConfig, error) {
	cfg := pipeline.ScanConfig{
		Provider:     string(repo.Provider),
		Repo:         repo.FullName,
		Branch:       repo.DefaultBranch,
		ScanFrom:     scanFrom,
		ScanTo:       scanTo,
		Audiences:    defaultAudiences(),
		AIProvider:   tc.AI.Provider,
		AIModel:      tc.AI.Model,
		AIBaseURL:    tc.AI.BaseURL,
		AIDepth:      pipeline.AIDepth(tc.AI.Depth),
		ScrubSecrets: tc.Privacy.ScrubSecrets,
		LocalOnly:    tc.Privacy.LocalOnly,
	}
	if cfg.AIDepth == "" {
		cfg.AIDepth = pipeline.DepthStandard
	}
	if tc.AI.APIKeyEncrypted != "" {
		key, err := enc.Decrypt(tc.AI.APIKeyEncrypted)
		if err != nil {
			return pipeline.ScanConfig{}, fmt.Errorf("failed to decrypt AI key: %w", err)
		}
		cfg.AIAPIKey = key
	}
	token, baseURL, ok, err := tc.DecryptedSource(string(repo.Provider), enc)
	if err != nil {
		return pipeline.ScanConfig{}, fmt.Errorf("failed to decrypt source token: %w", err)
	}
	if !ok || token == "" {
		return pipeline.ScanConfig{}, fmt.Errorf("No git access token configured for %s. Go to Settings → Git sources and add a personal access token.", repo.Provider)
	}
	cfg.AccessToken = token
	cfg.SourceBaseURL = baseURL
	if s, ok := tc.Sources[string(repo.Provider)]; ok {
		cfg.AuthorLogin = s.Login
	}

	var repoCfg struct {
		BaseBranches []string `json:"base_branches"`
	}
	if len(repo.Config) > 0 {
		_ = json.Unmarshal(repo.Config, &repoCfg)
	}
	cfg.BaseBranches = repoCfg.BaseBranches

	if tc.AI.APIKeyEncrypted == "" {
		return pipeline.ScanConfig{}, fmt.Errorf("No AI API key configured. Go to Settings → AI provider and add your API key.")
	}

	return cfg, nil
}

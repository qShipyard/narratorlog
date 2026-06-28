package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/narratorlog/narratorlog/internal/auth"
	db "github.com/narratorlog/narratorlog/internal/db"
	"github.com/narratorlog/narratorlog/internal/pipeline"
	"github.com/narratorlog/narratorlog/internal/store"
	"github.com/narratorlog/narratorlog/internal/teamconfig"
)

type ScanProcessor struct {
	pool    *pgxpool.Pool
	queries *db.Queries
	enc     *auth.Encryptor
}

func NewScanProcessor(pool *pgxpool.Pool, enc *auth.Encryptor) *ScanProcessor {
	return &ScanProcessor{
		pool:    pool,
		queries: db.New(pool),
		enc:     enc,
	}
}

func (p *ScanProcessor) ProcessTask(ctx context.Context, t *asynq.Task) error {
	var payload ScanPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("failed to unmarshal scan payload: %w", err)
	}

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
	st := store.NewPostgresStore(p.pool)

	runner := &pipeline.Runner{
		Store:  st,
		Config: cfg,
	}
	if err := runner.Run(ctx, payload.ScanID); err != nil {
		log.Printf("[scan] failed scan_id=%s err=%v", payload.ScanID, err)
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
	if ok {
		cfg.AccessToken = token
		cfg.SourceBaseURL = baseURL
	}
	return cfg, nil
}

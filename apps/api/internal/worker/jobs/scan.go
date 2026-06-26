package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/narratorlog/narratorlog/internal/db"
	"github.com/narratorlog/narratorlog/internal/pipeline"
	"github.com/narratorlog/narratorlog/internal/store"
)

type ScanProcessor struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewScanProcessor(pool *pgxpool.Pool) *ScanProcessor {
	return &ScanProcessor{
		pool:    pool,
		queries: db.New(pool),
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

	cfg := buildScanConfig(repo, scanFrom, scanTo)
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

func buildScanConfig(repo db.Repository, scanFrom, scanTo time.Time) pipeline.ScanConfig {
	return pipeline.ScanConfig{
		Provider:    string(repo.Provider),
		Repo:        repo.FullName,
		Branch:      repo.DefaultBranch,
		ScanFrom:    scanFrom,
		ScanTo:      scanTo,
		AccessToken: repo.AccessToken, // decrypted before this point
		AIDepth:     pipeline.DepthStandard,
	}
}

package jobs

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/narratorlog/narratorlog/internal/db"
	"github.com/narratorlog/narratorlog/internal/teamconfig"
)

// cadenceLookback maps a repo's scan cadence to the lookback window each run covers.
var cadenceLookback = map[string]string{
	"daily":   "1d",
	"weekly":  "7d",
	"monthly": "30d",
}

// DueCheckProcessor runs on a periodic tick and enqueues a scan for every repo
// whose cadence says it's due. Because it queries the DB on each tick, repos added
// or edited after the worker booted are picked up automatically — unlike a static
// per-repo cron registered once at startup.
type DueCheckProcessor struct {
	queries *db.Queries
	client  *asynq.Client
}

func NewDueCheckProcessor(pool *pgxpool.Pool, client *asynq.Client) *DueCheckProcessor {
	return &DueCheckProcessor{queries: db.New(pool), client: client}
}

func (p *DueCheckProcessor) ProcessTask(ctx context.Context, _ *asynq.Task) error {
	repos, err := p.queries.ListDueRepos(ctx)
	if err != nil {
		return err
	}
	for _, repo := range repos {
		if err := p.enqueueScan(ctx, repo); err != nil {
			log.Printf("[due-check] failed to enqueue repo %s: %v", repo.FullName, err)
		}
	}
	return nil
}

func (p *DueCheckProcessor) enqueueScan(ctx context.Context, repo db.Repository) error {
	lookback := cadenceLookback[repoCadence(repo.Config)]
	if lookback == "" {
		lookback = "7d"
	}

	now := time.Now().UTC()
	scan, err := p.queries.CreateScan(ctx, db.CreateScanParams{
		TeamID:         repo.TeamID,
		RepositoryID:   repo.ID,
		Status:         db.ScanStatusPending,
		TriggeredBy:    db.ScanTriggerScheduled,
		ScanFrom:       pgtype.Timestamptz{Time: now.Add(-lookbackDuration(lookback)), Valid: true},
		ScanTo:         pgtype.Timestamptz{Time: now, Valid: true},
		ConfigSnapshot: routingSnapshot(ctx, p.queries, repo.TeamID),
	})
	if err != nil {
		return err
	}

	// Advance the cadence window now so the next tick won't re-enqueue this repo
	// while the scan is still in flight.
	if err := p.queries.UpdateRepositoryLastScanned(ctx, repo.ID); err != nil {
		return err
	}

	payload, err := Marshal(ScanPayload{
		ScanID:       scan.ID.String(),
		RepositoryID: repo.ID.String(),
		TeamID:       repo.TeamID.String(),
		TriggerType:  "scheduled",
		Lookback:     lookback,
	})
	if err != nil {
		return err
	}
	_, err = p.client.Enqueue(asynq.NewTask(JobScan, payload), asynq.MaxRetry(3))
	return err
}

func repoCadence(raw []byte) string {
	var c struct {
		Cadence string `json:"cadence"`
	}
	_ = json.Unmarshal(raw, &c)
	return c.Cadence
}

func lookbackDuration(s string) time.Duration {
	d, err := parseLookback(s)
	if err != nil {
		return 7 * 24 * time.Hour
	}
	return d
}

func routingSnapshot(ctx context.Context, q *db.Queries, teamID uuid.UUID) []byte {
	raw, err := q.GetTeamConfig(ctx, teamID)
	if err != nil {
		return []byte("{}")
	}
	cfg, err := teamconfig.Parse(raw)
	if err != nil {
		return []byte("{}")
	}
	snap, err := cfg.RoutingSnapshot()
	if err != nil {
		return []byte("{}")
	}
	return snap
}

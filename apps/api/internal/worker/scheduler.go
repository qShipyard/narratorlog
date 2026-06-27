package worker

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/narratorlog/narratorlog/internal/db"
	"github.com/narratorlog/narratorlog/internal/worker/jobs"
)

type Scheduler struct {
	scheduler *asynq.Scheduler
	queries   *db.Queries
}

func NewScheduler(redisURL string, pool *pgxpool.Pool) (*Scheduler, error) {
	opt, err := asynq.ParseRedisURI(redisURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse redis URL: %w", err)
	}

	s := asynq.NewScheduler(opt, &asynq.SchedulerOpts{
		Location: time.UTC,
		EnqueueErrorHandler: func(task *asynq.Task, opts []asynq.Option, err error) {
			log.Printf("[scheduler] failed to enqueue task=%s err=%v", task.Type(), err)
		},
	})

	return &Scheduler{
		scheduler: s,
		queries:   db.New(pool),
	}, nil
}

// RegisterWeeklyScans registers a cron entry for each active weekly repo.
// Runs every Monday at 09:00 UTC.
func (s *Scheduler) RegisterWeeklyScans(ctx context.Context) error {
	repos, err := s.queries.ListActiveWeeklyRepos(ctx)
	if err != nil {
		return fmt.Errorf("failed to list active repos: %w", err)
	}

	for _, repo := range repos {
		payload, err := jobs.Marshal(jobs.ScanPayload{
			RepositoryID: repo.ID.String(),
			TeamID:       repo.TeamID.String(),
			TriggerType:  "scheduled",
			Lookback:     "7d",
		})
		if err != nil {
			log.Printf("[scheduler] failed to marshal payload for repo %s: %v", repo.FullName, err)
			continue
		}

		task := asynq.NewTask(jobs.JobScan, payload)
		// Every Monday at 09:00 UTC
		if _, err := s.scheduler.Register("0 9 * * 1", task); err != nil {
			log.Printf("[scheduler] failed to register repo %s: %v", repo.FullName, err)
		}
	}

	return nil
}

func (s *Scheduler) Start() error {
	return s.scheduler.Start()
}

func (s *Scheduler) Shutdown() {
	s.scheduler.Shutdown()
}

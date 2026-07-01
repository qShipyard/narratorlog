package worker

import (
	"fmt"
	"log"
	"time"

	"github.com/hibiken/asynq"
	"github.com/narratorlog/narratorlog/internal/worker/jobs"
)

type Scheduler struct {
	scheduler *asynq.Scheduler
}

func NewScheduler(redisURL string) (*Scheduler, error) {
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

	return &Scheduler{scheduler: s}, nil
}

// RegisterDueScanner registers a single periodic tick. The DueCheckProcessor
// decides on each tick which repos are actually due (per their cadence and
// last_scanned_at), so repos added or edited after boot are picked up without a
// worker restart — the flaw of the old per-repo boot-time cron.
func (s *Scheduler) RegisterDueScanner() error {
	if _, err := s.scheduler.Register("@every 1h", asynq.NewTask(jobs.JobDueCheck, nil)); err != nil {
		return fmt.Errorf("failed to register due-scanner: %w", err)
	}
	return nil
}

func (s *Scheduler) Start() error {
	return s.scheduler.Start()
}

func (s *Scheduler) Shutdown() {
	s.scheduler.Shutdown()
}

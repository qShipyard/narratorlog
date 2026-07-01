package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/narratorlog/narratorlog/internal/auth"
	"github.com/narratorlog/narratorlog/internal/config"
	"github.com/narratorlog/narratorlog/internal/worker"
	"github.com/narratorlog/narratorlog/internal/worker/jobs"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	pool, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(context.Background()); err != nil {
		log.Fatalf("failed to ping database: %v", err)
	}

	enc, err := auth.NewEncryptor(cfg.EncryptionKey)
	if err != nil {
		log.Fatalf("failed to create encryptor: %v", err)
	}

	redisOpt, err := asynq.ParseRedisURI(cfg.RedisURL)
	if err != nil {
		log.Fatalf("failed to parse redis URL: %v", err)
	}

	srv := asynq.NewServer(redisOpt, asynq.Config{
		Concurrency: 10,
		Queues: map[string]int{
			"critical": 6,
			"default":  3,
			"low":      1,
		},
		ErrorHandler: asynq.ErrorHandlerFunc(func(ctx context.Context, task *asynq.Task, err error) {
			log.Printf("[worker] task failed type=%s err=%v", task.Type(), err)
		}),
	})

	asynqClient := asynq.NewClient(redisOpt)
	defer asynqClient.Close()

	scanProcessor := jobs.NewScanProcessor(pool, enc)
	deliveryProcessor := jobs.NewDeliveryProcessor(pool, enc)
	dueCheckProcessor := jobs.NewDueCheckProcessor(pool, asynqClient)

	mux := asynq.NewServeMux()
	mux.HandleFunc(jobs.JobScan, scanProcessor.ProcessTask)
	mux.HandleFunc(jobs.JobDeliver, deliveryProcessor.ProcessTask)
	mux.HandleFunc(jobs.JobScheduled, scanProcessor.ProcessTask)
	mux.HandleFunc(jobs.JobDueCheck, dueCheckProcessor.ProcessTask)

	scheduler, err := worker.NewScheduler(cfg.RedisURL)
	if err != nil {
		log.Fatalf("failed to create scheduler: %v", err)
	}

	if err := scheduler.RegisterDueScanner(); err != nil {
		log.Printf("[worker] warning: failed to register due-scanner: %v", err)
	}

	if err := scheduler.Start(); err != nil {
		log.Fatalf("failed to start scheduler: %v", err)
	}
	defer scheduler.Shutdown()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Println("narratorlog worker starting...")
		if err := srv.Run(mux); err != nil {
			log.Fatalf("worker error: %v", err)
		}
	}()

	<-quit
	log.Println("narratorlog worker stopping...")
	srv.Shutdown()
}

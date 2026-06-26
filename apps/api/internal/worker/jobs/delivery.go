package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/narratorlog/narratorlog/internal/db"
)

type DeliveryProcessor struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewDeliveryProcessor(pool *pgxpool.Pool) *DeliveryProcessor {
	return &DeliveryProcessor{
		pool:    pool,
		queries: db.New(pool),
	}
}

func (p *DeliveryProcessor) ProcessTask(ctx context.Context, t *asynq.Task) error {
	var payload DeliveryPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("failed to unmarshal delivery payload: %w", err)
	}

	log.Printf("[delivery] starting scan_id=%s", payload.ScanID)

	scanID := mustParseUUID(payload.ScanID)

	drafts, err := p.queries.ListDraftsByScan(ctx, scanID)
	if err != nil {
		return fmt.Errorf("failed to fetch drafts: %w", err)
	}

	var failed []string
	for _, draft := range drafts {
		if draft.Status != db.DraftStatusApproved {
			continue
		}

		if err := p.deliverDraft(ctx, draft); err != nil {
			log.Printf("[delivery] failed draft_id=%s err=%v", draft.ID, err)
			failed = append(failed, draft.ID.String())
			continue
		}

		if err := p.queries.MarkDraftDelivered(ctx, draft.ID); err != nil {
			log.Printf("[delivery] failed to mark draft delivered draft_id=%s err=%v", draft.ID, err)
		}
	}

	if len(failed) > 0 {
		// Partial failure — log but don't fail the job
		// Failed deliveries are retryable from the web app
		log.Printf("[delivery] completed with %d failures scan_id=%s", len(failed), payload.ScanID)
	} else {
		log.Printf("[delivery] completed scan_id=%s", payload.ScanID)
	}

	return nil
}

func (p *DeliveryProcessor) deliverDraft(ctx context.Context, draft db.AudienceDraft) error {
	// TODO: resolve output plugin path from scan config
	// TODO: call output plugin via PluginRunner
	// TODO: record delivery result in deliveries table
	log.Printf("[delivery] delivering draft_id=%s audience=%s", draft.ID, draft.AudienceID)
	return nil
}

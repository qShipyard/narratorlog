package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/narratorlog/narratorlog/internal/db"
	"github.com/narratorlog/narratorlog/internal/pipeline"
)

type DeliveryProcessor struct {
	pool     *pgxpool.Pool
	queries  *db.Queries
	resolver *PluginResolver
	runner   *pipeline.PluginRunner
}

func NewDeliveryProcessor(pool *pgxpool.Pool) *DeliveryProcessor {
	return &DeliveryProcessor{
		pool:     pool,
		queries:  db.New(pool),
		resolver: NewPluginResolver(),
		runner:   pipeline.NewPluginRunner(),
	}
}

func (p *DeliveryProcessor) ProcessTask(ctx context.Context, t *asynq.Task) error {
	var payload DeliveryPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("failed to unmarshal delivery payload: %w", err)
	}

	log.Printf("[delivery] starting scan_id=%s", payload.ScanID)

	scanID := mustParseUUID(payload.ScanID)

	scan, err := p.queries.GetScanByID(ctx, scanID)
	if err != nil {
		return fmt.Errorf("failed to fetch scan: %w", err)
	}

	outputCfg, err := parseScanOutputConfig(scan.ConfigSnapshot)
	if err != nil {
		log.Printf("[delivery] failed to parse config scan_id=%s err=%v", payload.ScanID, err)
		outputCfg = &ScanOutputConfig{}
	}

	drafts, err := p.queries.ListDraftsByScan(ctx, scanID)
	if err != nil {
		return fmt.Errorf("failed to fetch drafts: %w", err)
	}

	repo, err := p.queries.GetRepositoryByID(ctx, scan.RepositoryID)
	if err != nil {
		return fmt.Errorf("failed to fetch repository: %w", err)
	}

	var failed []string
	for _, draft := range drafts {
		if draft.Status != db.DraftStatusApproved {
			continue
		}

		outputs := outputCfg.OutputsForAudience(draft.AudienceID)

		// If no outputs configured for this audience — skip silently
		if len(outputs) == 0 {
			log.Printf("[delivery] no outputs configured for audience=%s", draft.AudienceID)
			if err := p.queries.MarkDraftDelivered(ctx, draft.ID); err != nil {
				log.Printf("[delivery] failed to mark draft delivered draft_id=%s", draft.ID)
			}
			continue
		}

		allSucceeded := true
		for _, output := range outputs {
			if err := p.deliverToPlugin(ctx, draft, output, scan, repo); err != nil {
				log.Printf("[delivery] failed draft_id=%s plugin=%s err=%v",
					draft.ID, output.Plugin, err)
				allSucceeded = false
				failed = append(failed, fmt.Sprintf("%s:%s", draft.ID, output.Plugin))
			}
		}

		if allSucceeded {
			if err := p.queries.MarkDraftDelivered(ctx, draft.ID); err != nil {
				log.Printf("[delivery] failed to mark draft delivered draft_id=%s", draft.ID)
			}
		}
	}

	if len(failed) > 0 {
		log.Printf("[delivery] completed with %d failures scan_id=%s failed=%v",
			len(failed), payload.ScanID, failed)
	} else {
		log.Printf("[delivery] completed scan_id=%s", payload.ScanID)
	}

	return nil
}

func (p *DeliveryProcessor) deliverToPlugin(
	ctx context.Context,
	draft db.AudienceDraft,
	output OutputConfig,
	scan db.Scan,
	repo db.Repository,
) error {
	pluginPath, err := p.resolver.OutputPlugin(output.Plugin)
	if err != nil {
		return err
	}

	// Use edited content if reviewer made changes
	content := draft.Content
	var editedContent *string
	if draft.EditedContent.Valid && draft.EditedContent.String != "" {
		editedContent = &draft.EditedContent.String
	}

	req := pipeline.DeliverPluginRequest{
		Action:        "deliver",
		AudienceID:    draft.AudienceID,
		Tone:          draft.Tone,
		Content:       content,
		EditedContent: editedContent,
		Scan: pipeline.DeliverScanMeta{
			ID:         scan.ID.String(),
			Repository: repo.FullName,
			ScanFrom:   scan.ScanFrom.Time.UTC().Format("2006-01-02T15:04:05Z"),
			ScanTo:     scan.ScanTo.Time.UTC().Format("2006-01-02T15:04:05Z"),
		},
		Config: output.Config,
	}

	// Record delivery attempt
	delivery, err := p.queries.CreateDelivery(ctx, db.CreateDeliveryParams{
		DraftID:      draft.ID,
		OutputPlugin: output.Plugin,
	})
	if err != nil {
		log.Printf("[delivery] failed to record delivery attempt: %v", err)
	}

	resp, err := p.runner.CallDeliverPlugin(ctx, pluginPath, req)
	if err != nil {
		if delivery.ID != uuid.Nil {
			errJSON, _ := json.Marshal(map[string]string{"error": err.Error()})
			p.queries.UpdateDeliveryFailed(ctx, db.UpdateDeliveryFailedParams{
				Response: errJSON,
				ID:       delivery.ID,
			})
		}
		return err
	}

	if !resp.Success {
		errMsg := "plugin returned failure"
		if resp.Error != nil {
			errMsg = *resp.Error
		}
		if delivery.ID != uuid.Nil {
			errJSON, _ := json.Marshal(map[string]string{"error": errMsg})
			p.queries.UpdateDeliveryFailed(ctx, db.UpdateDeliveryFailedParams{
				Response: errJSON,
				ID:       delivery.ID,
			})
		}
		return fmt.Errorf("plugin %s failed: %s", output.Plugin, errMsg)
	}

	// Record success
	if delivery.ID != uuid.Nil {
		successJSON, _ := json.Marshal(map[string]string{
			"reference": stringVal(resp.Reference),
			"message":   stringVal(resp.Message),
		})
		p.queries.UpdateDeliverySuccess(ctx, db.UpdateDeliverySuccessParams{
			Response: successJSON,
			ID:       delivery.ID,
		})
	}

	log.Printf("[delivery] success draft_id=%s plugin=%s ref=%s",
		draft.ID, output.Plugin, stringVal(resp.Reference))

	return nil
}

func stringVal(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

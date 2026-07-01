package store

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/narratorlog/narratorlog/internal/db"
	"github.com/narratorlog/narratorlog/internal/pipeline"
)

// PostgresStore implements pipeline.Store using PostgreSQL via sqlc.
type PostgresStore struct {
	q    *db.Queries
	pool *pgxpool.Pool
}

func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{
		q:    db.New(pool),
		pool: pool,
	}
}

// ─── Scan ─────────────────────────────────────────────────────────────────────

func (s *PostgresStore) UpdateScanStatus(ctx context.Context, scanID string, status pipeline.ScanStatus, errMsg *string) error {
	id, err := uuid.Parse(scanID)
	if err != nil {
		return fmt.Errorf("invalid scan ID: %w", err)
	}

	if errMsg != nil {
		return s.q.UpdateScanStatusWithError(ctx, db.UpdateScanStatusWithErrorParams{
			Status: db.ScanStatus(status),
			Error:  pgtype.Text{String: *errMsg, Valid: true},
			ID:     id,
		})
	}

	return s.q.UpdateScanStatus(ctx, db.UpdateScanStatusParams{
		Status: db.ScanStatus(status),
		ID:     id,
	})
}

func (s *PostgresStore) UpdateScanCounts(ctx context.Context, scanID string, commitCount, filteredCount int) error {
	id, err := uuid.Parse(scanID)
	if err != nil {
		return fmt.Errorf("invalid scan ID: %w", err)
	}

	return s.q.UpdateScanCounts(ctx, db.UpdateScanCountsParams{
		CommitCount:   int32(commitCount),
		FilteredCount: int32(filteredCount),
		ID:            id,
	})
}

// ─── Commits ──────────────────────────────────────────────────────────────────

func (s *PostgresStore) SaveCommits(ctx context.Context, commits []pipeline.Commit) error {
	if len(commits) == 0 {
		return nil
	}

	scanID, err := uuid.Parse(commits[0].ScanID)
	if err != nil {
		return fmt.Errorf("invalid scan ID: %w", err)
	}

	scan, err := s.q.GetScanByID(ctx, scanID)
	if err != nil {
		return fmt.Errorf("failed to lookup scan for commits: %w", err)
	}

	for _, c := range commits {
		if c.ScanID != commits[0].ScanID {
			return fmt.Errorf("commits span multiple scans")
		}

		commitScanID, err := uuid.Parse(c.ScanID)
		if err != nil {
			return fmt.Errorf("invalid scan ID: %w", err)
		}

		linkedIssuesJSON, err := json.Marshal(c.LinkedIssues)
		if err != nil {
			return fmt.Errorf("failed to marshal linked issues: %w", err)
		}

		changedFilesJSON, err := json.Marshal(c.ChangedFiles)
		if err != nil {
			return fmt.Errorf("failed to marshal changed files: %w", err)
		}

		err = s.q.CreateCommitIgnoreDuplicate(ctx, db.CreateCommitIgnoreDuplicateParams{
			ScanID:        commitScanID,
			RepositoryID:  scan.RepositoryID,
			Sha:           c.SHA,
			Message:       c.Message,
			AuthorName:    c.AuthorName,
			AuthorEmail:   c.AuthorEmail,
			CommittedAt:   pgtype.Timestamptz{Time: c.CommittedAt, Valid: true},
			PrNumber:      pgtype.Int4{Int32: int32PtrVal(c.PRNumber), Valid: c.PRNumber != nil},
			PrTitle:       pgtype.Text{String: strVal(c.PRTitle), Valid: c.PRTitle != nil},
			PrDescription: pgtype.Text{String: strVal(c.PRDescription), Valid: c.PRDescription != nil},
			LinkedIssues:  linkedIssuesJSON,
			ChangedFiles:  changedFilesJSON,
			Diff:          pgtype.Text{String: strVal(c.Diff), Valid: c.Diff != nil},
			IsNoise:       c.IsNoise,
			IsBot:         c.IsBotCommit,
			IsBreaking:    c.IsBreaking,
			Domain:        pgtype.Text{String: strVal(c.Domain), Valid: c.Domain != nil},
		})
		if err != nil {
			return fmt.Errorf("failed to save commit %s: %w", c.SHA, err)
		}
	}
	return nil
}

func (s *PostgresStore) GetCommits(ctx context.Context, scanID string, includeNoise bool) ([]pipeline.Commit, error) {
	id, err := uuid.Parse(scanID)
	if err != nil {
		return nil, fmt.Errorf("invalid scan ID: %w", err)
	}

	var rows []db.Commit
	if includeNoise {
		rows, err = s.q.ListAllCommitsByScan(ctx, id)
	} else {
		rows, err = s.q.ListCommitsByScan(ctx, id)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to list commits: %w", err)
	}

	commits := make([]pipeline.Commit, len(rows))
	for i, row := range rows {
		commits[i] = dbCommitToPipeline(row)
	}
	return commits, nil
}

func (s *PostgresStore) UpdateCommit(ctx context.Context, c pipeline.Commit) error {
	id, err := uuid.Parse(c.ID)
	if err != nil {
		return fmt.Errorf("invalid commit ID: %w", err)
	}

	linkedIssuesJSON, err := json.Marshal(c.LinkedIssues)
	if err != nil {
		return fmt.Errorf("failed to marshal linked issues: %w", err)
	}

	return s.q.UpdateCommitEnrichment(ctx, db.UpdateCommitEnrichmentParams{
		PrTitle:       pgtype.Text{String: strVal(c.PRTitle), Valid: c.PRTitle != nil},
		PrDescription: pgtype.Text{String: strVal(c.PRDescription), Valid: c.PRDescription != nil},
		LinkedIssues:  linkedIssuesJSON,
		IsBreaking:    c.IsBreaking,
		Domain:        pgtype.Text{String: strVal(c.Domain), Valid: c.Domain != nil},
		ID:            id,
	})
}

func (s *PostgresStore) GetKnownSHAs(ctx context.Context, repositoryID string) (map[string]bool, error) {
	id, err := uuid.Parse(repositoryID)
	if err != nil {
		return nil, fmt.Errorf("invalid repository ID: %w", err)
	}

	shas, err := s.q.GetKnownSHAsByRepository(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get known SHAs: %w", err)
	}

	out := make(map[string]bool, len(shas))
	for _, sha := range shas {
		out[sha] = true
	}
	return out, nil
}

// ─── Commit Groups ────────────────────────────────────────────────────────────

func (s *PostgresStore) SaveCommitGroups(ctx context.Context, groups []pipeline.CommitGroup) error {
	for _, g := range groups {
		scanID, err := uuid.Parse(g.ScanID)
		if err != nil {
			return fmt.Errorf("invalid scan ID: %w", err)
		}

		commitUUIDs := make([]uuid.UUID, len(g.CommitIDs))
		for i, cid := range g.CommitIDs {
			commitUUIDs[i], err = uuid.Parse(cid)
			if err != nil {
				return fmt.Errorf("invalid commit ID %s: %w", cid, err)
			}
		}

		_, err = s.q.CreateCommitGroup(ctx, db.CreateCommitGroupParams{
			ScanID:    scanID,
			Label:     g.Label,
			CommitIds: commitUUIDs,
			GroupType: db.GroupType(g.GroupType),
		})
		if err != nil {
			return fmt.Errorf("failed to save commit group %s: %w", g.Label, err)
		}
	}
	return nil
}

func (s *PostgresStore) GetCommitGroups(ctx context.Context, scanID string) ([]pipeline.CommitGroup, error) {
	id, err := uuid.Parse(scanID)
	if err != nil {
		return nil, fmt.Errorf("invalid scan ID: %w", err)
	}

	rows, err := s.q.ListCommitGroupsByScan(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to list commit groups: %w", err)
	}

	groups := make([]pipeline.CommitGroup, len(rows))
	for i, row := range rows {
		commitIDs := make([]string, len(row.CommitIds))
		for j, cid := range row.CommitIds {
			commitIDs[j] = cid.String()
		}

		var summary *string
		if row.Summary.Valid {
			summary = &row.Summary.String
		}

		groups[i] = pipeline.CommitGroup{
			ID:        row.ID.String(),
			ScanID:    row.ScanID.String(),
			Label:     row.Label,
			GroupType: pipeline.GroupType(row.GroupType),
			CommitIDs: commitIDs,
			Summary:   summary,
		}
	}
	return groups, nil
}

func (s *PostgresStore) UpdateCommitGroupSummary(ctx context.Context, groupID string, summary string) error {
	id, err := uuid.Parse(groupID)
	if err != nil {
		return fmt.Errorf("invalid group ID: %w", err)
	}

	return s.q.UpdateCommitGroupSummary(ctx, db.UpdateCommitGroupSummaryParams{
		Summary: pgtype.Text{String: summary, Valid: true},
		ID:      id,
	})
}

// ─── Audience Drafts ──────────────────────────────────────────────────────────

func (s *PostgresStore) SaveAudienceDraft(ctx context.Context, draft pipeline.AudienceDraft) error {
	scanID, err := uuid.Parse(draft.ScanID)
	if err != nil {
		return fmt.Errorf("invalid scan ID: %w", err)
	}

	_, err = s.q.CreateAudienceDraft(ctx, db.CreateAudienceDraftParams{
		ScanID:     scanID,
		AudienceID: draft.AudienceID,
		Tone:       draft.Tone,
		Content:    draft.Content,
	})
	return err
}

// ─── Audit ────────────────────────────────────────────────────────────────────

func (s *PostgresStore) CreateAuditLog(ctx context.Context, entry pipeline.AuditEntry) error {
	teamID, err := uuid.Parse(entry.TeamID)
	if err != nil {
		return fmt.Errorf("invalid team ID: %w", err)
	}

	metaJSON, err := json.Marshal(entry.Metadata)
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	var userID pgtype.UUID
	if entry.UserID != nil {
		uid, err := uuid.Parse(*entry.UserID)
		if err != nil {
			return fmt.Errorf("invalid user ID: %w", err)
		}
		userID = pgtype.UUID{Bytes: uid, Valid: true}
	}

	var entityID pgtype.UUID
	if entry.EntityID != nil {
		eid, err := uuid.Parse(*entry.EntityID)
		if err != nil {
			return fmt.Errorf("invalid entity ID: %w", err)
		}
		entityID = pgtype.UUID{Bytes: eid, Valid: true}
	}

	return s.q.CreateAuditLog(ctx, db.CreateAuditLogParams{
		TeamID:     teamID,
		UserID:     userID,
		Action:     entry.Action,
		EntityType: entry.EntityType,
		EntityID:   entityID,
		Metadata:   metaJSON,
	})
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func dbCommitToPipeline(row db.Commit) pipeline.Commit {
	c := pipeline.Commit{
		ID:          row.ID.String(),
		ScanID:      row.ScanID.String(),
		SHA:         row.Sha,
		Message:     row.Message,
		AuthorName:  row.AuthorName,
		AuthorEmail: row.AuthorEmail,
		CommittedAt: row.CommittedAt.Time,
		IsNoise:     row.IsNoise,
		IsBotCommit: row.IsBot,
		IsBreaking:  row.IsBreaking,
	}

	if row.PrNumber.Valid {
		n := int(row.PrNumber.Int32)
		c.PRNumber = &n
	}
	if row.PrTitle.Valid {
		c.PRTitle = &row.PrTitle.String
	}
	if row.PrDescription.Valid {
		c.PRDescription = &row.PrDescription.String
	}
	if row.Domain.Valid {
		c.Domain = &row.Domain.String
	}
	if row.Diff.Valid {
		c.Diff = &row.Diff.String
	}

	if len(row.LinkedIssues) > 0 {
		json.Unmarshal(row.LinkedIssues, &c.LinkedIssues)
	}
	if len(row.ChangedFiles) > 0 {
		json.Unmarshal(row.ChangedFiles, &c.ChangedFiles)
	}

	return c
}

func strVal(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func int32PtrVal(n *int) int32 {
	if n == nil {
		return 0
	}
	return int32(*n)
}

// Compile-time check that PostgresStore satisfies pipeline.Store.
var _ pipeline.Store = (*PostgresStore)(nil)

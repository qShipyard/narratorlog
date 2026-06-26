package pipeline

import (
	"context"
	"fmt"
	"sync"
)

type memStore struct {
	mu sync.Mutex

	statuses  []ScanStatus
	commitIDs []string
	commits   map[string]Commit
	groupIDs  []string
	groups    map[string]CommitGroup
	drafts    []AudienceDraft
}

func newMemStore() *memStore {
	return &memStore{
		commits: map[string]Commit{},
		groups:  map[string]CommitGroup{},
	}
}

func (s *memStore) UpdateScanStatus(_ context.Context, _ string, status ScanStatus, _ *string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.statuses = append(s.statuses, status)
	return nil
}

func (s *memStore) UpdateScanCounts(_ context.Context, _ string, _, _ int) error {
	return nil
}

func (s *memStore) SaveCommits(_ context.Context, commits []Commit) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, c := range commits {
		if _, ok := s.commits[c.ID]; !ok {
			s.commitIDs = append(s.commitIDs, c.ID)
		}
		s.commits[c.ID] = c
	}
	return nil
}

func (s *memStore) GetCommits(_ context.Context, scanID string, includeNoise bool) ([]Commit, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []Commit
	for _, id := range s.commitIDs {
		c := s.commits[id]
		if c.ScanID != scanID {
			continue
		}
		if !includeNoise && c.IsNoise {
			continue
		}
		out = append(out, c)
	}
	return out, nil
}

func (s *memStore) UpdateCommit(_ context.Context, commit Commit) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.commits[commit.ID]; !ok {
		return fmt.Errorf("update of unknown commit %s", commit.ID)
	}
	s.commits[commit.ID] = commit
	return nil
}

func (s *memStore) GetKnownSHAs(_ context.Context, _ string) (map[string]bool, error) {
	return map[string]bool{}, nil
}

func (s *memStore) SaveCommitGroups(_ context.Context, groups []CommitGroup) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, g := range groups {
		if _, ok := s.groups[g.ID]; !ok {
			s.groupIDs = append(s.groupIDs, g.ID)
		}
		s.groups[g.ID] = g
	}
	return nil
}

func (s *memStore) GetCommitGroups(_ context.Context, scanID string) ([]CommitGroup, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []CommitGroup
	for _, id := range s.groupIDs {
		g := s.groups[id]
		if g.ScanID == scanID {
			out = append(out, g)
		}
	}
	return out, nil
}

func (s *memStore) UpdateCommitGroupSummary(_ context.Context, groupID string, summary string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, ok := s.groups[groupID]
	if !ok {
		return fmt.Errorf("summary for unknown group %s", groupID)
	}
	g.Summary = &summary
	s.groups[groupID] = g
	return nil
}

func (s *memStore) SaveAudienceDraft(_ context.Context, draft AudienceDraft) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.drafts = append(s.drafts, draft)
	return nil
}

func (s *memStore) CreateAuditLog(_ context.Context, _ AuditEntry) error {
	return nil
}

func (s *memStore) lastStatus() ScanStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.statuses) == 0 {
		return ""
	}
	return s.statuses[len(s.statuses)-1]
}

type mockSource struct {
	resp *SourcePluginResponse
	err  error
}

func (m *mockSource) Fetch(_ context.Context, _ SourcePluginRequest) (*SourcePluginResponse, error) {
	return m.resp, m.err
}

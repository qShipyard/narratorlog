package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"
)

type InMemoryStateStore struct {
	states map[string]string
}

func NewInMemoryStateStore() *InMemoryStateStore {
	return &InMemoryStateStore{
		states: make(map[string]string),
	}
}

func (s *InMemoryStateStore) Generate() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("failed to generate state: %w", err)
	}
	state := hex.EncodeToString(b)
	s.states[state] = time.Now().String()
	return state, nil
}

func (s *InMemoryStateStore) Validate(ctx context.Context, state string) bool {
	_, ok := s.states[state]
	if ok {
		delete(s.states, state)
	}
	return ok
}

package jobs

import "github.com/google/uuid"

func mustParseUUID(s string) uuid.UUID {
	id, err := uuid.Parse(s)
	if err != nil {
		panic("invalid UUID: " + s)
	}
	return id
}

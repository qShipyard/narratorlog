package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const sessionTTL = 7 * 24 * time.Hour

type SessionClaims struct {
	UserID string `json:"user_id"`
	TeamID string `json:"team_id"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

type SessionManager struct {
	secret []byte
}

func NewSessionManager(secret string) *SessionManager {
	return &SessionManager{secret: []byte(secret)}
}

func (s *SessionManager) CreateToken(userID, teamID, role string) (token, tokenHash string, expiresAt time.Time, err error) {
	expiresAt = time.Now().Add(sessionTTL)

	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		return "", "", time.Time{}, fmt.Errorf("failed to generate session token: %w", err)
	}

	claims := SessionClaims{
		UserID: userID,
		TeamID: teamID,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	token, err = t.SignedString(s.secret)
	if err != nil {
		return "", "", time.Time{}, fmt.Errorf("failed to sign session token: %w", err)
	}

	tokenHash = hashToken(token)
	return token, tokenHash, expiresAt, nil
}

func (s *SessionManager) ValidateToken(token string) (*SessionClaims, error) {
	t, err := jwt.ParseWithClaims(token, &SessionClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.secret, nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	claims, ok := t.Claims.(*SessionClaims)
	if !ok || !t.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}

	return claims, nil
}

func HashToken(token string) string {
	return hashToken(token)
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

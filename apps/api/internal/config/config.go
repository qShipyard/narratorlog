package config

import (
	"fmt"
	"os"
)

type Config struct {
	// Server
	Port   string
	AppURL string

	// Database
	DatabaseURL string

	// Redis
	RedisURL string

	// Security
	AppSecret     string
	EncryptionKey string

	// Reader
	ReaderSocket string
}

func Load() (*Config, error) {
	cfg := &Config{}

	cfg.Port = envOrDefault("PORT", "8080")
	cfg.AppURL = mustEnv("APP_URL")
	cfg.DatabaseURL = mustEnv("DATABASE_URL")
	cfg.RedisURL = envOrDefault("REDIS_URL", "redis://localhost:6379")
	cfg.AppSecret = mustEnv("APP_SECRET")
	cfg.EncryptionKey = mustEnv("ENCRYPTION_KEY")
	cfg.ReaderSocket = envOrDefault("READER_SOCKET", "/tmp/narratorlog-reader.sock")

	if err := cfg.validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

func (c *Config) validate() error {
	if len(c.AppSecret) < 32 {
		return fmt.Errorf("APP_SECRET must be at least 32 characters")
	}
	if len(c.EncryptionKey) < 32 {
		return fmt.Errorf("ENCRYPTION_KEY must be at least 32 characters")
	}
	return nil
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required environment variable %s is not set", key))
	}
	return v
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

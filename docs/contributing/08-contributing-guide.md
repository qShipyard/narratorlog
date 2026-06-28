# narratorlog — Contributing Guide

Welcome. narratorlog is an open-source engineering communication tool built by the community, for the community. This guide explains how to get involved at every level.

---

## Before You Start

Read the problem statement (`docs/01-problem-statement.md`) and the product requirements (`docs/02-product-requirements.md`). Understanding what narratorlog is trying to solve will make your contributions more focused and valuable.

---

## Ways to Contribute

### No code required
- Improve documentation
- Report bugs with clear reproduction steps
- Suggest features with a clear problem statement
- Help other users in discussions
- Share narratorlog with your team and report what works and what does not

### Junior / getting started
- Build a new output plugin (Discord, Microsoft Teams, email templates)
- Improve error messages in the CLI
- Add test cases for the filter stage
- Improve the onboarding setup wizard flow

### Intermediate
- Build a new source plugin (Bitbucket, Azure DevOps, Gitea)
- Add a new AI provider plugin (Gemini, Mistral, custom)
- Improve commit noise detection patterns
- Add new audience tone templates
- Contribute to the Next.js web app (new pages, UI improvements)

### Senior / core
- Pipeline stage improvements
- Rust reader — new language support or context extraction improvements
- Performance optimisation
- Security review and hardening
- Architecture discussions

---

## Development Setup

### Prerequisites

```bash
# Required
go 1.25+
rust 1.78+ (with cargo)
node 20+
pnpm 9+
docker + docker compose
```

### Clone and Install

```bash
git clone https://github.com/qShipyard/narratorlog
cd narratorlog

# Install JS dependencies
pnpm install

# Build Rust reader (only needed for `deep` AI depth)
cd packages/reader && cargo build && cd ../..
```

Install the [`migrate`](https://github.com/golang-migrate/migrate) CLI used to apply database migrations:

```bash
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
```

### Start Development Environment

```bash
# Start Postgres + Redis
docker compose -f deploy/docker-compose.dev.yml up -d

# Run database migrations
export DATABASE_URL="postgresql://narratorlog:narratorlog@localhost:5433/narratorlog?sslmode=disable"
migrate -path apps/api/internal/db/migrations -database "$DATABASE_URL" up

# Start API server
cd apps/api && go run ./cmd/api

# Start worker (separate terminal)
cd apps/api && go run ./cmd/worker

# Start web app (separate terminal)
cd apps/web && pnpm dev
```

Web app: http://localhost:3000
API: http://localhost:8080

### Environment Setup

Copy the example env file and fill in your values:

```bash
cp deploy/.env.example .env
```

For local development you need these in your environment (the values below match
`docker-compose.dev.yml`):
- `DATABASE_URL` — `postgresql://narratorlog:narratorlog@localhost:5433/narratorlog?sslmode=disable`
- `REDIS_URL` — `redis://localhost:6379`
- `APP_SECRET` — any 32+ character string
- `ENCRYPTION_KEY` — any 32+ character string; the API and worker must share the same value
- To connect a git provider (GitHub/GitLab/Bitbucket), no env is needed — paste a Personal Access Token in the app under Settings → Sources (it is encrypted into the team config).

---

## Project Structure Quick Reference

```
apps/api/internal/pipeline/    Go — the 8-stage pipeline engine
apps/api/internal/api/         Go — HTTP handlers and routes
apps/api/internal/worker/      Go — background job processing
packages/reader/src/           Rust — codebase context extraction
packages/sdk/src/              TypeScript — plugin SDK
plugins/sources/               TypeScript — git platform plugins
plugins/ai-providers/          TypeScript — LLM provider plugins
plugins/outputs/               TypeScript — delivery plugins
apps/web/app/                  Next.js — web application
```

---

## Writing a Plugin

The fastest way to contribute is to write an output plugin. Here is how:

### 1. Scaffold

```bash
narratorlog create-plugin --type=output --name=your-plugin-name
```

This creates `plugins/outputs/your-plugin-name/` with fully typed boilerplate.

### 2. Implement

Open `plugins/outputs/your-plugin-name/index.ts` and fill in the `deliver()` method. The SDK handles all stdin/stdout communication.

### 3. Test

```bash
# Test your plugin directly
echo '{"action":"deliver","audience_id":"developers","content":"## Test\n\n- Item one","scan":{"id":"test","repository":"org/repo","scan_from":"2026-06-14T00:00:00Z","scan_to":"2026-06-21T00:00:00Z"},"config":{}}' \
  | node plugins/outputs/your-plugin-name/index.js
```

### 4. Document

Update your plugin's `README.md` with:
- What it does
- Required environment variables
- Configuration options with examples
- Example `.narratorlog.yml` snippet

### 5. Submit

Open a pull request. The PR template will guide you through the checklist.

Full plugin writing guide: `docs/contributing/plugin-guide.md`

---

## Contribution Standards

### Go Code

- Run `gofmt` and `go vet` before committing
- New pipeline stage functions must have unit tests
- Error handling: always return errors, never swallow them
- No global state in pipeline functions — pass config explicitly

### TypeScript Code

- Run `pnpm typecheck` and `pnpm lint` before committing
- Plugins must handle all errors and return them in the response — never throw
- Use the `getFinalContent()` helper from the SDK — never access `content` directly

### Rust Code

- Run `cargo fmt` and `cargo clippy` before committing
- The reader must never panic on malformed input — return errors
- New language parsers must have fixture-based tests

### Commits

Use Conventional Commits format:
```
feat(outputs): add Microsoft Teams plugin
fix(pipeline): handle empty diff in enrich stage
docs(contributing): clarify plugin testing steps
chore(deps): update @anthropic-ai/sdk to 0.27.0
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`

---

## Pull Request Process

1. Fork the repository
2. Create a branch: `git checkout -b feat/your-feature-name`
3. Make your changes
4. Run tests: `pnpm test` (JS) and `go test ./...` (Go)
5. Push and open a pull request against `main`
6. Fill in the PR template — it is short, just the essentials
7. A maintainer will review within 72 hours

### PR Checklist

- [ ] Tests added or updated for the change
- [ ] Documentation updated if behaviour changed
- [ ] No new environment variables added without updating `.env.example`
- [ ] Plugin README updated if this is a plugin
- [ ] `CHANGELOG.md` not manually edited (narratorlog generates its own)

---

## Reporting Bugs

Open an issue using the Bug Report template. Include:
- narratorlog version (`narratorlog --version`)
- Operating system and architecture
- Steps to reproduce (the simpler the better)
- Expected behaviour
- Actual behaviour
- Relevant logs (redact any secrets)

---

## Suggesting Features

Open an issue using the Feature Request template. Include:
- The problem you are trying to solve (not just the solution)
- Who is affected and how often
- What you have tried already
- Your proposed solution (optional — we may have a different approach)

Features are discussed in the issue before any code is written. This saves everyone time.

---

## Attribution

narratorlog is open source under the [LICENSE] license with an attribution clause. Any output generated by narratorlog must retain the narratorlog attribution. If you contribute code, you agree that your contribution is licensed under the same terms.

We will credit all contributors in our release notes — generated by narratorlog, naturally.

---

## Community

- **GitHub Discussions** — questions, ideas, show and tell
- **GitHub Issues** — bugs and feature requests
- **Discord** — real-time community chat (link in README)

We are building something the community should be proud of. Be direct, be kind, and build things that solve real problems.

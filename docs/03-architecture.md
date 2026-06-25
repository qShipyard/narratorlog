# narratorlog — Technical Architecture Document (TAD)

## Architecture Overview

narratorlog is a self-hosted system composed of four runtime services and a plugin layer. All services are deployed together via Docker Compose.

```
┌─────────────────────────────────────────────────────────────────┐
│                         narratorlog                             │
│                                                                 │
│  ┌─────────────────┐        ┌──────────────────────────────┐   │
│  │   Web App       │        │         Go API               │   │
│  │   Next.js 14    │◄──────►│   REST + WebSocket           │   │
│  │   Tailwind      │        │   Gin router                 │   │
│  │   Shadcn/ui     │        │   Auth, repos, scans,        │   │
│  └─────────────────┘        │   drafts, approvals          │   │
│                             └──────────────┬───────────────┘   │
│                                            │                   │
│                    ┌───────────────────────┼──────────────┐    │
│                    │                       │              │    │
│           ┌────────▼───────┐    ┌─────────▼──────┐  ┌────▼──┐ │
│           │  Go Worker     │    │  PostgreSQL     │  │ Rust  │ │
│           │  Asynq + Redis │    │  Primary store  │  │Reader │ │
│           │  Pipeline jobs │    │                 │  │Sidecar│ │
│           │  Scheduler     │    └────────────────-┘  └───────┘ │
│           └────────────────┘                                   │
│                    │                                           │
│           ┌────────▼────────────────────────────────────────┐  │
│           │              Plugin Layer (TypeScript)           │  │
│           │   Sources · AI Providers · Output Adapters      │  │
│           └────────────────────────────────────────────────-┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Redis   (job queue · session cache · rate limiting)     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| Web App | Next.js 14 (App Router) | Standard, contributor-friendly, server components |
| Styling | Tailwind CSS + Shadcn/ui | Fast to build, consistent, easy to customise |
| API Server | Go (Gin) | Single binary, fast, strong concurrency, secure |
| Pipeline Engine | Go | Same binary as API, goroutines for parallel stages |
| Background Workers | Go + Asynq | Redis-backed job queue, reliable delivery, retries |
| Codebase Reader | Rust | Memory safety, AST parsing, CPU-bound file work |
| Plugin System | TypeScript | Widest contributor base, all AI SDKs available |
| Database | PostgreSQL | Reliable, well-understood, excellent for structured data |
| Cache + Queue | Redis | Asynq job queue, session cache, rate limiting |
| Auth | OAuth 2.0 + JWT | GitHub/GitLab/Bitbucket OAuth, JWT session tokens |
| Monorepo | Turborepo + pnpm | Parallel builds, caching, clean task graph |
| Container | Docker + Compose | Primary self-host method, reproducible environments |
| CLI Distribution | goreleaser | Single binary, multi-platform, brew/apt/scoop |

---

## Repository Structure

```
narratorlog/
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # test all packages on PR
│   │   ├── release.yml               # goreleaser on tag push
│   │   └── docker.yml                # build + push image on release
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   ├── feature_request.md
│   │   └── plugin_request.md
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── CODEOWNERS
│
├── apps/
│   ├── web/                          # Next.js web application
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/
│   │   │   │   └── setup/
│   │   │   └── (app)/
│   │   │       ├── dashboard/
│   │   │       ├── scans/
│   │   │       │   └── [id]/
│   │   │       │       └── review/
│   │   │       ├── repositories/
│   │   │       ├── team/
│   │   │       └── settings/
│   │   ├── components/
│   │   ├── lib/
│   │   └── package.json
│   │
│   └── api/                          # Go API + Pipeline + Worker + CLI
│       ├── cmd/
│       │   ├── api/main.go           # HTTP server entrypoint
│       │   ├── worker/main.go        # background worker entrypoint
│       │   └── cli/main.go           # CLI entrypoint
│       ├── internal/
│       │   ├── pipeline/             # 8-stage pipeline engine
│       │   │   ├── runner.go
│       │   │   ├── scan.go
│       │   │   ├── filter.go
│       │   │   ├── enrich.go
│       │   │   ├── context.go
│       │   │   ├── chunk.go
│       │   │   ├── summarize.go
│       │   │   ├── approval.go
│       │   │   └── deliver.go
│       │   ├── api/
│       │   │   ├── handlers/
│       │   │   ├── middleware/
│       │   │   └── routes.go
│       │   ├── worker/
│       │   │   ├── jobs/
│       │   │   └── scheduler.go
│       │   ├── db/
│       │   │   ├── migrations/
│       │   │   └── queries/
│       │   ├── auth/
│       │   └── config/
│       ├── go.mod
│       └── go.sum
│
├── packages/
│   ├── reader/                       # Rust codebase reader (Unix socket sidecar)
│   │   ├── src/
│   │   │   ├── main.rs               # Unix socket server
│   │   │   ├── parser.rs             # language-aware AST parsing
│   │   │   ├── context.rs            # surrounding context extraction
│   │   │   └── graph.rs              # import graph resolution
│   │   └── Cargo.toml
│   │
│   └── sdk/                          # TypeScript SDK for plugin authors
│       ├── src/
│       │   ├── types.ts              # all shared types
│       │   ├── plugin.ts             # base plugin classes
│       │   └── index.ts
│       └── package.json
│
├── plugins/
│   ├── sources/
│   │   ├── github/
│   │   ├── gitlab/
│   │   └── git-cli/
│   ├── ai-providers/
│   │   ├── anthropic/
│   │   ├── openai/
│   │   ├── ollama/
│   │   └── groq/
│   └── outputs/
│       ├── markdown/
│       ├── slack/
│       ├── notion/
│       ├── discord/
│       ├── linear/
│       └── email/
│
├── docs/
│   ├── getting-started/
│   ├── privacy/
│   ├── integrations/
│   └── contributing/
│
├── deploy/
│   ├── docker-compose.yml            # production self-host
│   ├── docker-compose.dev.yml        # local development
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   ├── Dockerfile.reader
│   └── nginx.conf
│
├── .narratorlog.yml                  # we dogfood our own tool
├── .goreleaser.yml
├── turbo.json
├── pnpm-workspace.yaml
├── CONTRIBUTING.md
├── LICENSE
├── README.md
└── ROADMAP.md
```

---

## Service Design

### Go API (`apps/api/cmd/api`)

Responsibilities:
- Serve the REST API consumed by the web app
- Handle OAuth flows (GitHub, GitLab, Bitbucket)
- Manage webhook ingestion
- Queue jobs into Redis via Asynq
- Serve WebSocket connections for real-time scan progress updates

Key packages:
- `github.com/gin-gonic/gin` — HTTP router
- `github.com/google/uuid` — ID generation
- `github.com/jackc/pgx/v5` — PostgreSQL driver
- `github.com/hibiken/asynq` — job queue client
- `golang.org/x/oauth2` — OAuth 2.0

---

### Go Worker (`apps/api/cmd/worker`)

Responsibilities:
- Process pipeline jobs from Redis queue
- Run scheduled scans (cron)
- Execute delivery jobs after approval
- Handle retries and dead-letter queue

Job types:
```go
const (
    JobScan      = "scan:run"
    JobDeliver   = "scan:deliver"
    JobScheduled = "scan:scheduled"
    JobCleanup   = "scan:cleanup"
)
```

---

### Go CLI (`apps/api/cmd/cli`)

Responsibilities:
- Provide terminal interface for developers
- Run pipeline directly (without web app or worker)
- Scaffold new plugins
- Show scan history and status

The CLI shares `internal/pipeline` with the API and worker. Same engine, different entrypoint.

---

### Rust Reader (`packages/reader`)

Responsibilities:
- Run as a long-lived Unix socket server
- Receive file read requests from Go pipeline (context stage)
- Parse ASTs for changed files (language-aware)
- Extract surrounding function context
- Resolve one level of import dependencies
- Return structured context JSON

Communication: Unix socket at `/tmp/narratorlog-reader.sock`

Languages supported in v1:
- Go
- TypeScript / JavaScript
- Python
- Rust
- Ruby

Protocol:
```json
// Request (Go → Rust)
{
  "file_path": "internal/auth/middleware.go",
  "diff": "...",
  "language": "go"
}

// Response (Rust → Go)
{
  "file_path": "internal/auth/middleware.go",
  "changed_functions": ["ValidateToken", "RefreshSession"],
  "context": "// surrounding code...",
  "imports": ["internal/db", "internal/config"]
}
```

---

### Plugin Layer (TypeScript)

Plugins are TypeScript packages that implement typed interfaces from `@narratorlog/sdk`.

Communication with Go core: subprocess JSON (stdin/stdout).

Go spawns a plugin process, writes a JSON request to stdin, reads the JSON response from stdout, and terminates the process. Simple, debuggable, language-agnostic at the boundary.

---

## The Pipeline — 8 Stages

```
Stage 1  SCAN          Fetch raw commits from source plugin
Stage 2  FILTER        Remove noise, deduplicate
Stage 3  ENRICH        Add PR context, linked issues, domain inference
Stage 4  CONTEXT       Codebase reading via Rust reader (optional)
Stage 5  CHUNK         Group commits into logical units
Stage 6  SUMMARIZE     AI two-pass summarization per audience
Stage 7  APPROVAL      Notify team, await review in web app
Stage 8  DELIVER       Send approved drafts via output plugins
```

Stages 1-6 run automatically. Stage 7 pauses and waits for human input. Stage 8 runs after all drafts are approved.

Stages 4 and 6 run with internal parallelism (goroutines). All other stages are sequential.

Full pipeline spec: see `05-pipeline-spec.md`

---

## Data Flow

```
GitHub Webhook (push event)
  → POST /webhooks/github
  → validate HMAC signature
  → enqueue ScanJob in Redis
  → return 200 immediately

Worker picks up ScanJob
  → create scan record (status: running)
  → Stage 1: call GitHub source plugin (subprocess)
      → plugin fetches commits via GitHub API
      → returns JSON array of RawCommit
  → Stage 2: filter in Go
  → Stage 3: enrich in Go (calls GitHub API for PR/issue details)
  → Stage 4: for each changed file (if depth = deep)
      → write request to Unix socket
      → Rust reader returns context
  → Stage 5: chunk in Go
  → Stage 6: for each chunk (parallel goroutines)
      → write to AI provider plugin stdin
      → plugin calls AI API
      → returns summary string
      → collect all summaries
      → for each audience (parallel goroutines)
          → write summaries + audience config to AI provider plugin
          → plugin returns audience draft
  → store audience_drafts in PostgreSQL
  → update scan status: awaiting_approval
  → send notification (Slack/email/web app)

Team reviews in web app
  → edit drafts
  → approve drafts
  → all approved: enqueue DeliveryJob

Worker picks up DeliveryJob
  → for each approved draft
      → call output plugin(s) for that audience
      → record delivery result
  → update scan status: delivered
```

---

## Security Architecture

### Authentication
- OAuth 2.0 with GitHub, GitLab, Bitbucket
- JWT session tokens, HTTP-only secure cookies
- Token rotation on each request
- Sessions stored in Redis with TTL

### Data Security
- OAuth access tokens encrypted at rest (AES-256-GCM)
- Database connection over TLS
- All inter-service communication within Docker network (not exposed externally)
- Webhook signature validation (HMAC-SHA256) on all incoming webhooks

### AI Privacy
- Secret scrubbing runs on all diffs before any AI provider call
- Scrubbing patterns: API keys, tokens, passwords, `.env` patterns
- Depth level explicitly chosen by team — no silent escalation
- Local-only mode (Ollama) supported — prevents any data leaving infrastructure

### Audit Trail
- Every significant action logged to `audit_log` table
- Actions: scan triggered, draft approved, draft rejected, delivery attempted, member invited, repo connected, config changed
- Audit log is append-only (no deletes)

---

## Deployment

### Docker Compose (Primary)

```yaml
services:
  web:
    image: ghcr.io/narratorlog/web:latest
    ports: ["3000:3000"]
    environment:
      - API_URL=http://api:8080

  api:
    image: ghcr.io/narratorlog/api:latest
    ports: ["8080:8080"]
    depends_on: [postgres, redis, reader]
    environment:
      - DATABASE_URL
      - REDIS_URL
      - READER_SOCKET=/tmp/reader.sock

  worker:
    image: ghcr.io/narratorlog/api:latest   # same image, different entrypoint
    command: ["worker"]
    depends_on: [postgres, redis, reader]

  reader:
    image: ghcr.io/narratorlog/reader:latest
    volumes:
      - /tmp:/tmp                            # shared socket path

  postgres:
    image: postgres:16
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf

volumes:
  postgres_data:
  redis_data:
```

### CLI Binary Distribution

Built with goreleaser. Distributed via:
- GitHub Releases (direct download)
- Homebrew tap (`brew install narratorlog/tap/narratorlog`)
- apt repository
- Scoop bucket (Windows)
- Docker image

---

## Environment Configuration

```env
# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/narratorlog

# Redis
REDIS_URL=redis://redis:6379

# App
APP_SECRET=<32-byte-random>       # JWT signing key
APP_URL=https://your-domain.com

# OAuth (configure the platforms you use)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITLAB_CLIENT_ID=
GITLAB_CLIENT_SECRET=
BITBUCKET_CLIENT_ID=
BITBUCKET_CLIENT_SECRET=

# Encryption
ENCRYPTION_KEY=<32-byte-random>   # for OAuth token encryption

# Reader
READER_SOCKET=/tmp/narratorlog-reader.sock
```

---

## Key Design Decisions and Rationale

| Decision | Rationale |
|---|---|
| Go for API and pipeline | Single binary deployment, strong concurrency for parallel pipeline stages, no supply chain risk from node_modules |
| Rust for codebase reader | Memory safety without GC for file-heavy work, AST parsing at speed, isolated from contributor-facing code |
| TypeScript for plugins | Widest contributor base, all AI SDKs have TS as first-class |
| Subprocess JSON for plugin communication | Simple, debuggable, language-agnostic, no port management |
| Unix socket for Rust reader | Fast IPC, reader stays warm between calls, avoids per-file subprocess overhead |
| PostgreSQL over SQLite | Multi-user web app requires concurrent writes; SQLite not appropriate |
| Asynq over custom queue | Battle-tested, Redis-backed, excellent retry and dead-letter support |
| No multi-tenancy | Teams self-host their own instance; no shared infrastructure to reason about |
| Flat config file (`.narratorlog.yml`) | Version-controlled, team-owned, no UI required to configure |

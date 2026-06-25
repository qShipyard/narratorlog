# narratorlog — Documentation Index

> Your codebase has a story. narratorlog tells it.

---

## Documents

### Product

| Doc | What it covers |
|---|---|
| [01 — Problem Statement](product/01-problem-statement.md) | Why narratorlog exists. The communication gap between engineering and every other team. |
| [02 — Product Requirements](product/02-product-requirements.md) | What narratorlog does, for who, and the full feature set with behaviour specs. |

### Technical

| Doc | What it covers |
|---|---|
| [03 — Architecture](technical/03-architecture.md) | Full system architecture — services, stack decisions, repo structure, deployment. |
| [04 — Database Schema](technical/04-database-schema.md) | Every table, column, index, and migration strategy. |
| [05 — Pipeline Spec](technical/05-pipeline-spec.md) | The 8-stage pipeline in detail — inputs, outputs, error handling, configuration. |
| [06 — API Design](technical/06-api-design.md) | All REST routes, request/response shapes, auth, pagination, WebSocket. |
| [07 — Plugin Interface Spec](technical/07-plugin-interface-spec.md) | Plugin communication protocol, TypeScript interfaces, examples for all three plugin types. |

### Contributing

| Doc | What it covers |
|---|---|
| [08 — Contributing Guide](contributing/08-contributing-guide.md) | Development setup, contribution standards, PR process, community. |

---

## Key Decisions — Quick Reference

| Decision | Choice | Where documented |
|---|---|---|
| Primary language (API + Pipeline) | Go | Architecture |
| Codebase reader | Rust (Unix socket sidecar) | Architecture, Pipeline Spec |
| Plugin language | TypeScript | Plugin Interface Spec |
| Web app | Next.js 14 | Architecture |
| Database | PostgreSQL + sqlc | Database Schema |
| Job queue | Asynq (Redis-backed) | Architecture |
| Plugin communication | Subprocess JSON (stdin/stdout) | Plugin Interface Spec |
| Auth | OAuth 2.0 + JWT session cookies | API Design |
| Self-host method | Docker Compose | Architecture |
| AI provider model | BYOAI — provider agnostic | PRD, Plugin Interface Spec |
| Multi-tenancy | None — each team deploys their own instance | PRD |
| Web dashboard | No general dashboard — focused review/approval UI only | PRD |
| Attribution | Output footer + OSS license attribution clause | PRD, Contributing |

---

## The Pipeline — One Page

```
Trigger (schedule / webhook / manual / CLI)
  │
  ▼
Stage 1  SCAN          Fetch commits from git platform via source plugin
  │
  ▼
Stage 2  FILTER        Remove noise (bots, typos, duplicates)
  │
  ▼
Stage 3  ENRICH        Add PR/issue context, detect breaking changes, infer domain
  │
  ▼
Stage 4  CONTEXT       Read surrounding codebase context via Rust reader (depth=deep only)
  │
  ▼
Stage 5  CHUNK         Group commits by PR/domain into logical units
  │
  ▼
Stage 6  SUMMARIZE     AI two-pass: chunk summaries → audience drafts (parallel)
  │
  ▼
Stage 7  APPROVAL      Notify team → human review/edit/approve in web app ← PAUSE
  │
  ▼
Stage 8  DELIVER       Send approved drafts via output plugins
```

---

## The Stack — One Page

```
Web App       Next.js 14 + Tailwind + Shadcn/ui
API           Go + Gin
Pipeline      Go (internal/pipeline)
Worker        Go + Asynq
Reader        Rust (Unix socket sidecar)
Plugins       TypeScript (@narratorlog/sdk)
Database      PostgreSQL (queries via sqlc)
Queue/Cache   Redis
Auth          OAuth 2.0 + JWT
Deploy        Docker Compose
CLI dist      goreleaser (brew / apt / scoop / direct)
```

---

## Repo Structure — One Page

```
narratorlog/
├── apps/
│   ├── web/           Next.js web app
│   └── api/           Go API + Worker + CLI (shared internal packages)
├── packages/
│   ├── reader/        Rust codebase reader
│   └── sdk/           TypeScript plugin SDK
├── plugins/
│   ├── sources/       github, gitlab, git-cli
│   ├── ai-providers/  anthropic, openai, ollama, groq
│   └── outputs/       markdown, slack, notion, discord, linear, email
├── docs/
├── deploy/            docker-compose.yml, Dockerfiles, nginx.conf
└── .narratorlog.yml   we dogfood our own tool
```

# narratorlog Roadmap

This is a living document. Updated as the project evolves.

---

## v0.1 — Foundation ✅
- [x] Architecture and documentation complete
- [x] Repo skeleton and plugin SDK scaffolded
- [x] Go pipeline core — all 8 stages
- [x] PostgreSQL schema and migrations
- [x] GitHub source plugin
- [x] Anthropic AI provider plugin
- [x] Slack output plugin
- [x] Markdown output plugin
- [x] Rust codebase reader — Go and TypeScript support
- [ ] CLI — init, generate, preview, status

## v0.2 — Web App (Current)
- [x] Next.js web app — auth, dashboard, scan review, approval
- [x] Email/password login, first-run setup wizard
- [x] Git source connections via Personal Access Token — GitHub, GitLab, Bitbucket (no OAuth app)
- [x] Team settings — AI provider, delivery channels, privacy (teams.config)
- [x] OpenAI AI provider plugin
- [x] Ollama AI provider plugin (local/private)
- [x] Notion output plugin
- [x] Docker Compose self-host setup
- [x] GitLab source plugin
- [ ] Real-time scan progress via WebSocket

## v0.3 — Community
- [x] Discord, Linear, email output plugins
- [x] Contribution docs and plugin guide
- [ ] Plugin scaffolding CLI (create-plugin command)
- [x] Bitbucket source plugin
- [ ] Groq AI provider plugin
- [ ] Rust reader — Python, Rust, Ruby support
- [ ] GitHub Action marketplace listing

## v0.4 — Automation & Personal Shipping Log
Goal: scans run themselves; manual runs remain only as a double-check. Each user tracks the PRs *they* authored, not whole-team branch activity.

**Personal PR scoping**
- [x] Resolve PAT owner's provider identity (`GET /user`) and store it per connection (`teamconfig.Source.Login`)
- [x] GitHub: filter pipeline input to PRs authored by that user — across any base branch
- [x] GitLab (merge requests) + Bitbucket (PRs, nickname-matched) author-centric flip
- [x] Configurable target/base branch selection per repository (per-repo settings dialog: cadence + live base-branch picker)

**Automation (both triggers)**
- [x] Due-scanner tick: hourly due-check driven by `cadence` + `last_scanned_at` (replaces boot-time static cron; picks up repos added after boot)
- [x] Cadence options — daily, weekly, monthly (`ListDueRepos`)
- [x] Event-driven scans: webhooks enqueue on PR merge (GitHub `pull_request` merged) / push
- [x] Manual scan retained as an explicit "run now" double-check

**Local LLM**
- [ ] Ollama batteries-included compose profile — auto-pull a recommended small model for offline/out-of-box use (BYO still supported)

**Parked ideas**
- Quality digests / metrics report type (separate from automation plumbing)
- Real-time scan progress via WebSocket (carried from v0.2)

## v1.0 — Stable
- [ ] Production-hardened pipeline
- [ ] Full test coverage on core pipeline
- [ ] Security audit
- [ ] Performance benchmarks
- [ ] Stable plugin API (semver commitment)
- [ ] Full documentation site

---

Have an idea? Open a feature request on GitHub.

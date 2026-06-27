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
- [x] Email/password + GitHub OAuth login, first-run setup wizard
- [x] Team settings — AI provider, delivery channels, privacy (teams.config)
- [x] OpenAI AI provider plugin
- [x] Ollama AI provider plugin (local/private)
- [x] Notion output plugin
- [x] Docker Compose self-host setup
- [ ] GitLab source plugin
- [ ] Real-time scan progress via WebSocket

## v0.3 — Community
- [x] Discord, Linear, email output plugins
- [x] Contribution docs and plugin guide
- [ ] Plugin scaffolding CLI (create-plugin command)
- [ ] Bitbucket source plugin
- [ ] Groq AI provider plugin
- [ ] Rust reader — Python, Rust, Ruby support
- [ ] GitHub Action marketplace listing

## v1.0 — Stable
- [ ] Production-hardened pipeline
- [ ] Full test coverage on core pipeline
- [ ] Security audit
- [ ] Performance benchmarks
- [ ] Stable plugin API (semver commitment)
- [ ] Full documentation site

---

Have an idea? Open a feature request on GitHub.

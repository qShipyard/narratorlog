# narratorlog — Product Requirements Document (PRD)

## Product Vision

> Your codebase has a story. narratorlog tells it.

narratorlog is a self-hosted, open-source engineering communication tool. It reads git commits, understands them in the context of the codebase, and delivers the right story to every audience — automatically, with human approval before anything is published.

---

## Core Principles

**1. Self-hosted, always**
Teams deploy narratorlog on their own infrastructure. Their code, their data, their control. Nothing is sent anywhere they have not explicitly configured.

**2. Bring your own AI**
narratorlog is AI-provider agnostic. Teams connect their own Anthropic, OpenAI, Ollama, Groq, or custom LLM endpoint. The tool never holds API keys beyond the team's own instance.

**3. Human approval before publish**
AI generates drafts. Humans review, edit, and approve them. Nothing reaches an audience without explicit sign-off.

**4. Audience-aware by design**
One scan produces multiple outputs — each written in the voice and language appropriate for its audience. A single source of truth, multiple stories told correctly.

**5. Flexible by default**
Cadence, depth, audiences, approval flow, output destinations — all configurable. Sensible defaults get teams started. Full configuration lets them make it their own.

**6. Attribution required**
narratorlog is open source. Teams self-host and use it freely. Every generated output carries a narratorlog attribution. The OSS license includes an attribution clause.

---

## Users

### Primary Users (interact with the tool directly)

**Engineering Team (Developers)**
Connect repos, configure the tool, run scans, review the developer-facing changelog draft.

**Engineering Manager / Tech Lead**
Reviews all drafts, approves before delivery, monitors shipping patterns and team velocity.

**Product Manager**
Reviews and approves product-facing draft. May edit before approval. Does not configure the tool.

**Marketing / Growth**
Reviews and approves marketing-facing draft. Edits copy before approval. Does not configure the tool.

### Secondary Users (receive output, never touch the tool)

**Founders / Executives** — receive the high-level narrative via email or Slack
**End Users / Customers** — receive public changelog via hosted page or email digest
**New Team Members** — use the changelog history to understand how the product evolved

---

## Core Features

### 1. Git Platform Integration

Connect repositories from:
- GitHub (OAuth + webhook)
- GitLab (OAuth + webhook)
- Bitbucket (OAuth + webhook)
- Local git (CLI, no webhook)

On connection:
- Register webhook for push and tag events
- Store encrypted OAuth token per repository
- Run an initial scan immediately to show value

---

### 2. Commit Scanning

Fetch all commits within a configured window. For each commit, capture:
- SHA, message, author, timestamp
- Pull request title and description (if merge commit)
- Linked issue titles and descriptions
- Changed file list
- Diff (if depth is standard or deep)

**Signal priority hierarchy:**
```
PR Description > Linked Issue Title > Commit Message > Diff Summary
```

Commit messages are unreliable. PR descriptions carry intent. The tool prefers higher-signal sources.

---

### 3. Noise Filtering

Before AI sees anything, filter out:
- Bot commits (dependabot, renovate, github-actions, etc.)
- Pattern-matched noise (`fix typo`, `wip`, `merge branch X into Y`)
- Commits already included in a previous scan (deduplication by SHA)
- Empty or meaningless commits

Teams configure additional skip patterns in `.narratorlog.yml`.

---

### 4. Enrichment

For each non-noise commit:
- Resolve PR details via platform API
- Resolve linked issues via platform API
- Detect breaking changes (`BREAKING CHANGE:` footer or `!` prefix)
- Infer codebase domain from changed file paths (e.g. `internal/auth/` → auth domain)
- Tag author for contribution attribution

---

### 5. Codebase Context Reading (Optional)

Three configurable depth levels:

**messages-only** — AI receives commit messages and PR descriptions only. No code leaves the machine beyond what is in commit metadata.

**standard** — AI receives commit messages, PR descriptions, and diffs. More context, better summaries.

**deep** — AI receives all of the above plus surrounding code context for changed functions. The Rust reader extracts N lines above and below each changed function and resolves one level of imports. Produces the richest summaries. Most context sent to AI provider.

Teams configure depth per repository. Teams using Ollama (local AI) can use deep mode with no data leaving their infrastructure.

**Privacy transparency:**
Before any context is sent, teams are shown exactly what will be transmitted. Secret scrubbing (API keys, tokens, env vars) runs on all diffs before transmission.

---

### 6. Commit Grouping

Group commits into logical units before summarization:
- Primary: group by pull request (multiple commits → one PR entry)
- Secondary: group by inferred domain (for repos without strict PR discipline)
- Tag each group: feature, fix, breaking, chore, security

Groups become the unit of AI summarization, not individual commits.

---

### 7. AI Summarization — Two Pass

**Pass 1 — Chunk summarization (parallel)**
Each commit group is summarized independently. Fast, stays within context limits, runs in parallel.

**Pass 2 — Audience generation (parallel)**
From the chunk summaries, generate one complete draft per configured audience. Each audience gets a different tone and focus.

**Built-in audience tones:**

| Audience | Tone | Focus |
|---|---|---|
| developers | Technical, precise | What changed, what might break, what to review |
| team / manager | Plain English, factual | What shipped, velocity signal, blockers resolved |
| product | Feature-oriented | Which features moved, what is ready to demo |
| marketing | Benefit-focused, no jargon | What is new for users, what to announce |
| public | Friendly, clear | Customer-facing release notes |

Teams configure which audiences they need. Custom audiences with custom tones are supported.

---

### 8. Human Approval Gate

Every draft goes through approval before delivery. No exceptions.

Approval flow options (configurable per team):
- **Web app** — reviewers edit and approve in narratorlog's UI
- **Slack** — draft posted to channel with Approve / Edit / Reject actions
- **Email** — draft sent to reviewers with action links
- **GitHub PR** — draft committed as a PR, approved via GitHub review

Timeout behaviour is configurable — auto-approve after N hours, or never auto-approve.

Multiple reviewers can comment and discuss a draft before approval. One designated approver per audience makes the final call.

---

### 9. Output Delivery

After approval, deliver to configured destinations:

| Plugin | What it does |
|---|---|
| markdown | Writes CHANGELOG.md and optionally opens a PR |
| slack | Posts to configured channel(s) |
| notion | Updates a configured Notion page |
| linear | Posts as a Linear comment or document |
| discord | Posts to configured channel |
| email | Sends digest to configured recipients |
| custom | HTTP webhook to any endpoint |

Multiple outputs per audience. The developer draft goes to Slack #engineering and CHANGELOG.md. The marketing draft goes to Notion and email. All from one approval.

---

### 10. Web Application

The team interface. Where all non-CLI interaction happens.

**Key pages:**

`/setup` — Onboarding wizard. Connect git platform, configure AI provider, set audiences, configure approval, run first scan.

`/dashboard` — Weekly summary across all repos. Pending approvals highlighted. Recent deliveries shown. Shipping velocity signal.

`/scans` — History of all pipeline runs. Status, trigger type, commit count, delivery status.

`/scans/:id/review` — The primary working page. Left panel: commit groups (what actually shipped). Right panel: audience drafts, tabbed by audience. Editable. Commentable. Approvable. Delivery triggered from here.

`/repositories` — Manage connected repos. Per-repo configuration. Last scan time. Scan history.

`/team` — Team members, roles, invite new members.

`/settings` — AI provider config, global defaults, delivery channel config.

`/settings/privacy` — Transparent breakdown of what gets sent where in each depth mode.

---

### 11. CLI

For developers who prefer terminal workflows and for CI/CD integration.

```bash
narratorlog init              # interactive setup wizard
narratorlog generate          # run full pipeline
narratorlog preview           # dry run, show output without delivering
narratorlog history           # list past scans
narratorlog status            # last scan status, pending approvals
narratorlog create-plugin     # scaffold a new plugin
```

The CLI uses the same pipeline engine as the web app. Same config file. Same output.

---

### 12. Scheduling

Cadence options per repository:
- **weekly** — runs every Monday at configured time (default)
- **on-tag** — runs when a git tag is pushed
- **on-merge** — runs when a PR is merged to the default branch
- **manual** — only runs when explicitly triggered

---

## Non-Functional Requirements

**Performance**
- Pipeline run for a typical week (50-100 commits) completes in under 2 minutes
- AI summarization stages run in parallel — wall clock time is the slowest single AI call
- Web app pages load in under 1 second on a self-hosted instance

**Security**
- OAuth tokens stored encrypted at rest (AES-256)
- Sessions use secure, HTTP-only cookies with rotation
- All diffs scrubbed for secrets before transmission to AI providers
- Audit log captures every significant action
- No external network calls beyond configured AI provider and git platform

**Reliability**
- Failed pipeline stages are retried with exponential backoff (max 3 attempts)
- Pipeline failures do not lose data — state is persisted at each stage
- Webhook delivery includes verification (HMAC signature validation)

**Privacy**
- Teams explicitly choose depth level — no silent escalation
- Privacy settings page shows exactly what each depth level transmits
- Local-only mode (Ollama) supported at all depth levels

**Contribution**
- Plugin interface is stable and versioned
- Plugin scaffolding CLI generates fully typed boilerplate
- Core pipeline is independently testable with fixture commit data
- No Rust knowledge required to contribute plugins or web app

---

## Out of Scope (v1)

- Project management features (narratorlog does not create tasks or track work)
- Code review features (narratorlog reads commits, it does not review code)
- Real-time collaboration (async approval is sufficient for v1)
- Mobile application
- Hosted / SaaS version (self-hosted only)
- Multi-language codebase reader beyond Go, TypeScript, Python, Rust, Ruby (v1 scope)

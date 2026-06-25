# narratorlog — Pipeline Specification

## Overview

The narratorlog pipeline transforms raw git commits into audience-specific, human-approved changelogs. It runs as a background job, triggered by schedule, webhook, manual request, or CLI command.

The pipeline has 8 stages. Stages 1-6 run automatically. Stage 7 pauses for human review. Stage 8 runs after all drafts are approved.

```
Stage 1  SCAN              Fetch raw commits from source plugin
Stage 2  FILTER            Remove noise, deduplicate
Stage 3  ENRICH            Add PR/issue context, domain inference
Stage 4  CONTEXT           Codebase reading via Rust reader (optional)
Stage 5  CHUNK             Group commits into logical units
Stage 6  SUMMARIZE         AI two-pass summarization per audience
Stage 7  APPROVAL          Human review and approval in web app
Stage 8  DELIVER           Send approved drafts via output plugins
```

---

## Stage 1 — SCAN

**Responsibility:** Fetch all commits from the configured git platform within the scan window.

**Input:** Scan config (repository, branch, scan_from, scan_to, depth)

**Process:**
1. Determine scan window:
   - If `cadence: weekly` → `scan_from` = last Monday 00:00 UTC, `scan_to` = now
   - If `cadence: on-tag` → `scan_from` = previous tag, `scan_to` = current tag
   - If `cadence: on-merge` → `scan_from` = last scan's `scan_to`, `scan_to` = now
   - If manual → use provided window or default 7d lookback
2. Call source plugin (subprocess JSON)
3. Source plugin fetches commits from platform API
4. Store raw commits in `commits` table
5. Update scan `commit_count`

**Output:** Array of `RawCommit` stored in database

**Source plugin input:**
```json
{
  "provider": "github",
  "repo": "org/repo",
  "branch": "main",
  "scan_from": "2026-06-14T00:00:00Z",
  "scan_to": "2026-06-21T00:00:00Z",
  "access_token": "gho_xxx",
  "depth": "standard"
}
```

**Source plugin output:**
```json
{
  "commits": [
    {
      "sha": "abc123",
      "message": "feat: add OAuth login flow",
      "author_name": "James Okafor",
      "author_email": "james@example.com",
      "committed_at": "2026-06-18T14:32:00Z",
      "pr_number": 142,
      "pr_title": "Add GitHub OAuth login",
      "pr_description": "Implements GitHub OAuth...",
      "changed_files": ["internal/auth/oauth.go", "internal/auth/handlers.go"],
      "diff": "diff --git a/internal/auth/oauth.go..."
    }
  ]
}
```

**Error handling:** If source plugin fails, mark scan as `failed` with error. Retry up to 3 times with exponential backoff.

---

## Stage 2 — FILTER

**Responsibility:** Remove commits that should not appear in the changelog. Mark noise without deleting — filtered commits remain in DB with `is_noise = true` for auditability.

**Input:** All commits for this scan from database

**Noise detection rules (applied in order):**

1. **Bot author detection**
   - Author email matches: `*[bot]@users.noreply.github.com`
   - Author name matches: `dependabot`, `renovate`, `github-actions`, `snyk-bot`, `codecov`
   - Configurable via `skip_authors` in config

2. **Message pattern matching**
   - Matches `skip_patterns` from config
   - Built-in defaults: `^wip`, `^merge branch`, `^merge pull request`, `^fix typo`, `^fixup!`, `^squash!`

3. **Deduplication**
   - SHA already exists in a previous scan for this repository
   - Prevents overlap when windows overlap slightly

4. **Empty changes**
   - `changed_files` is empty
   - Commit touches only lock files (`package-lock.json`, `yarn.lock`, `go.sum`, `Cargo.lock`)

**Output:** Commits with `is_noise` and `is_bot` flags set. `filtered_count` updated on scan record.

---

## Stage 3 — ENRICH

**Responsibility:** Add context to each non-noise commit. Makes the AI's job significantly better by providing intent (from PR/issue) rather than just code change.

**Input:** Non-noise commits from database

**Enrichment steps per commit (run in parallel, max 10 concurrent):**

1. **PR resolution** (if `pr_number` present)
   - Fetch full PR via platform API
   - Extract: title, description, labels, review comments
   - If description is empty, use first review comment that contains context

2. **Issue resolution** (parse from PR description or commit message)
   - Patterns: `Closes #123`, `Fixes #123`, `Refs #123`, GitHub autolinks
   - Fetch each referenced issue via platform API
   - Extract: title, body (first 500 chars), labels

3. **Breaking change detection**
   - Commit message contains `BREAKING CHANGE:` footer (Conventional Commits spec)
   - Commit message type contains `!` suffix (e.g. `feat!:`)
   - PR labels contain `breaking-change`
   - Set `is_breaking = true`

4. **Domain inference** (from `changed_files`)
   - Map file paths to logical domains using the repo's directory structure
   - Examples:
     - `internal/auth/**` → `auth`
     - `internal/payments/**` → `payments`
     - `apps/web/**` → `frontend`
     - `deploy/**` → `infrastructure`
   - Domain used for grouping and changelog section headings

5. **Author attribution**
   - Preserve author name for contribution credit in developer-facing output

**Output:** Enriched commits stored in database

---

## Stage 4 — CONTEXT (Optional)

**Responsibility:** Extract surrounding codebase context for changed functions. Gives the AI understanding of what changed code *does* in the wider system, not just what lines changed.

**Triggered when:** `ai.depth = "deep"` in config

**Input:** Enriched commits with diffs

**Process per commit:**
1. For each file in `changed_files`:
   - Send read request to Rust reader via Unix socket
   - Reader parses AST, identifies changed functions from diff
   - Reader extracts N lines of surrounding context per changed function
   - Reader resolves one level of imports (what does this file import?)
2. Collect context responses
3. Store in `commits.codebase_context` (JSONB)

**Unix socket protocol:**

Request:
```json
{
  "file_path": "internal/auth/oauth.go",
  "diff": "@@ -45,6 +45,24 @@...",
  "language": "go",
  "context_lines": 20
}
```

Response:
```json
{
  "file_path": "internal/auth/oauth.go",
  "changed_functions": ["HandleCallback", "exchangeToken"],
  "context": "// HandleCallback processes the OAuth callback...\nfunc HandleCallback(...) {\n...",
  "imports": ["internal/db", "internal/config", "golang.org/x/oauth2"]
}
```

**Privacy note:** At this stage, actual source code is read from disk and sent to the Rust reader (local). If depth is `deep`, the context is later included in the AI provider request. Teams are shown what will be sent before the AI call is made (on first use).

**Error handling:** If reader is unavailable or a file cannot be parsed, skip context for that file and continue. Context is enhancement, not a hard requirement.

---

## Stage 5 — CHUNK

**Responsibility:** Group related commits into logical units. The chunk is the unit of AI summarization — not the individual commit.

**Input:** Enriched (and optionally contextualized) non-noise commits

**Grouping strategy (applied in priority order):**

1. **By pull request** (primary — highest signal)
   - All commits sharing a `pr_number` form one group
   - Group label = PR title
   - Group type inferred from PR labels or commit message prefix

2. **By domain** (secondary — for repos without strict PR discipline)
   - Commits without a PR, grouped by inferred `domain`
   - Group label = domain name + date range
   - Group type = `other`

3. **Singleton** (fallback)
   - Commits that don't fit other groups
   - One commit = one group
   - Group label = commit message (first line, truncated to 72 chars)

**Group type inference:**
- `feature` — PR label `enhancement`, `feature`, or commit prefix `feat:`
- `fix` — PR label `bug`, `fix`, or commit prefix `fix:`
- `breaking` — `is_breaking = true` on any commit in group
- `security` — PR label `security` or commit message contains `CVE`, `security`, `vulnerability`
- `chore` — commit prefix `chore:`, `refactor:`, `docs:`, `ci:`, `build:`
- `other` — default

**Output:** `commit_groups` stored in database

---

## Stage 6 — SUMMARIZE

**Responsibility:** Generate AI summaries. Two-pass approach to manage context window limits and produce high-quality audience-specific output.

**Input:** Commit groups with all enriched data

### Pass 1 — Chunk Summarization (parallel)

One AI call per commit group. All calls run concurrently.

**Prompt structure:**
```
You are a technical writer creating internal changelog entries.

Summarize the following code change in 2-3 sentences.
Be specific about what changed and why it matters.
Do not include implementation details unless they affect behaviour.
Do not use marketing language.

Pull Request: {pr_title}
Description: {pr_description}
Linked Issues: {issue_titles}
Changed Files: {changed_files}
Diff Summary: {diff or context}
```

**Output per group:** 2-3 sentence technical summary stored in `commit_groups.summary`

### Pass 2 — Audience Generation (parallel)

One AI call per configured audience. All calls run concurrently.
Input is the collected Pass 1 summaries — not the raw commits.

**Prompt structure:**
```
You are writing a {audience.tone} changelog for {audience.id}.

Audience: {audience.description}
Tone: {audience.tone}
Format: Use the structure provided. Group by type (Features, Fixes, etc.)

Here is what shipped this week:
{chunk_summaries}

Write the changelog now. Do not include preamble or explanation.
Attribution footer: "Generated by narratorlog · narratorlog.dev"
```

**Audience tone definitions:**

| audience_id | tone | description |
|---|---|---|
| developers | Technical, precise | Engineers reviewing changes, looking for what might break or what to review |
| manager | Plain English, factual | Engineering managers tracking velocity and team progress |
| product | Feature-oriented | Product managers understanding what moved and what is ready to demo |
| marketing | Benefit-focused, no jargon | Growth and marketing teams writing copy and announcements |
| public | Friendly, clear | End users reading release notes |

**Output per audience:** Full changelog draft stored in `audience_drafts`

**Token management:**
- Pass 1 prompts are capped at 4000 tokens input per group
- If a group exceeds this, truncate diff/context (preserve PR description and issue titles)
- Pass 2 prompts are capped at 8000 tokens input
- If chunk summaries exceed this, summarize summaries (recursive pass)

**Error handling:**
- If an AI call fails, retry once after 5 seconds
- If retry fails, mark that draft as `failed` — do not fail the entire scan
- Failed drafts shown in web app with option to regenerate

---

## Stage 7 — APPROVAL

**Responsibility:** Pause the pipeline and notify the team that drafts are ready for review.

**Input:** All `audience_drafts` for this scan

**Process:**
1. Update scan status to `awaiting_approval`
2. Send notification via configured approval channel(s):
   - **Web app** — notification badge in UI, email to all reviewers
   - **Slack** — message to configured channel with link to review page
   - **Email** — digest email to configured reviewers with link

**Notification content:**
```
narratorlog: Week of June 14–21 is ready for review

Repository: org/backend
Commits: 35 (from 47 total — 12 filtered as noise)
Drafts ready: Developers · Product · Marketing

[Review and Approve →] https://your-instance.com/scans/{id}/review
```

**Timeout behaviour (configurable):**
- `approval.timeout: 24h` — auto-approve all pending drafts after 24 hours
- `approval.timeout: never` — drafts never auto-approve; must be manually approved
- Auto-approved drafts are logged with `approved_by = null` in audit log

**Rejection handling:**
- Reviewer can reject a draft → status set to `rejected`
- Rejected drafts can be regenerated (triggers new Pass 2 AI call for that audience)
- Scan does not deliver until all configured audiences have an approved draft

---

## Stage 8 — DELIVER

**Responsibility:** Send approved drafts to configured output destinations.

**Triggered when:** All `audience_drafts` for a scan have status `approved`

**Process:**
1. Enqueue `DeliveryJob` in Redis
2. Worker picks up job
3. For each approved draft:
   - Determine which output plugin(s) handle this audience
   - Call each output plugin (subprocess JSON)
   - Record result in `deliveries` table
   - On failure: retry up to 3 times with exponential backoff
4. Update scan status to `delivered` when all deliveries succeed

**Output plugin input:**
```json
{
  "audience_id": "marketing",
  "tone": "benefit-focused",
  "content": "...",
  "edited_content": "...",
  "scan": {
    "id": "uuid",
    "repository": "org/backend",
    "scan_from": "2026-06-14T00:00:00Z",
    "scan_to": "2026-06-21T00:00:00Z"
  },
  "config": {
    "channel": "#marketing",
    "mention": "@channel"
  }
}
```

**Output plugin response:**
```json
{
  "success": true,
  "reference": "https://notion.so/page/xxx",   // optional delivery reference
  "message": "Posted to #marketing"
}
```

**Partial delivery handling:**
- If one output plugin fails but others succeed, the scan is still marked `delivered`
- Failed deliveries shown in web app with retry option
- Delivery failures do not revert approvals

---

## Pipeline State Machine

```
pending
  → running          (worker picks up job)
  → filtering        (stage 2)
  → enriching        (stage 3)
  → reading_context  (stage 4, if depth = deep)
  → chunking         (stage 5)
  → summarizing      (stage 6)
  → awaiting_approval (stage 7 — human review)
  → delivering       (stage 8 triggered)
  → delivered        (all deliveries complete)
  → failed           (any unrecoverable error)
  → cancelled        (manually cancelled)
```

Transitions are logged in `audit_log`.

---

## Configuration Reference (Pipeline-relevant)

```yaml
scan:
  provider: github              # github | gitlab | bitbucket | git_cli
  repo: org/repo                # required for github/gitlab/bitbucket
  branch: main                  # default branch to scan
  cadence: weekly               # weekly | on-tag | on-merge | manual
  lookback: 7d                  # used when cadence = weekly or manual

filter:
  skip_authors:                 # additional bot/author names to skip
    - dependabot[bot]
    - renovate[bot]
  skip_patterns:                # regex patterns matched against commit message
    - "^wip"
    - "^merge branch"

ai:
  provider: anthropic           # anthropic | openai | ollama | groq | custom
  model: claude-sonnet-4-6
  depth: standard               # messages-only | standard | deep
  context_lines: 20             # lines of surrounding context (depth = deep only)

audiences:
  - id: developers
    tone: technical
  - id: product
    tone: plain-english
  - id: marketing
    tone: benefit-focused

approval:
  required: true
  via: slack                    # slack | email | web | none
  channel: "#eng-leads"
  timeout: 24h

outputs:
  - audience: developers
    plugin: slack
    config:
      channel: "#engineering"
  - audience: product
    plugin: notion
    config:
      page_id: "xxx"
  - audience: marketing
    plugin: markdown
    config:
      path: "./public/changelog.md"
      open_pr: true

privacy:
  scrub_secrets: true
  local_only: false
```

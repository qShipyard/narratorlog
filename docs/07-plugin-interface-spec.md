# narratorlog — Plugin Interface Specification

## Overview

narratorlog's plugin system allows the community to extend three layers:

- **Source plugins** — fetch commits from git platforms
- **AI provider plugins** — call LLMs to generate summaries and drafts
- **Output plugins** — deliver approved drafts to destinations

All plugins are TypeScript packages that implement typed interfaces from `@narratorlog/sdk`. The Go core communicates with plugins via subprocess JSON (stdin/stdout).

---

## Communication Protocol

The Go core spawns a plugin as a Node.js subprocess, writes a JSON request to stdin, reads a JSON response from stdout, and terminates the process.

```
Go core
  → spawn: node plugins/outputs/slack/index.js
  → write to stdin:  { "action": "deliver", "payload": {...} }
  → read from stdout: { "success": true, "message": "..." }
  → terminate process
```

**Rules:**
- Plugin MUST read exactly one JSON object from stdin
- Plugin MUST write exactly one JSON object to stdout
- Plugin MUST exit with code 0 on success, non-zero on failure
- Plugin MUST NOT write anything to stdout except the response JSON
- Plugin MAY write debug logs to stderr (Go core logs these at debug level)
- Plugin timeout: 30 seconds (configurable per output)

---

## SDK — `@narratorlog/sdk`

Install in your plugin:
```bash
npm install @narratorlog/sdk
```

The SDK provides:
- All shared TypeScript types
- Base plugin classes with stdin/stdout handling built in
- Helper utilities (secret scrubbing, retry logic, etc.)

---

## Source Plugins

Fetches raw commits from a git platform.

narratorlog is a **personal shipping log**: the access token is a personal one, so
it doubles as identity. When `author_login` is set on the request, a source plugin
should return only the commits from PRs that handle authored — merged into **any**
base branch, not just the repo default. When it is absent, the plugin falls back to
branch-centric listing (all activity on `branch`). The token owner's handle is
resolved once when the token is saved (via the provider's authenticated-user
endpoint) and stored on the source connection.

### Interface

```typescript
import { SourcePlugin, SourceRequest, SourceResponse } from '@narratorlog/sdk'

export class MySourcePlugin implements SourcePlugin {
  async fetch(request: SourceRequest): Promise<SourceResponse> {
    // your implementation
  }
}
```

### Types

```typescript
interface SourceRequest {
  provider: string              // 'github' | 'gitlab' | 'bitbucket' | 'git_cli'
  repo: string                  // 'org/repo'
  branch: string                // 'main' — used only for branch-centric fallback
  scan_from: string             // ISO 8601 UTC
  scan_to: string               // ISO 8601 UTC
  access_token: string          // personal access token for the platform API
  depth: 'messages-only' | 'standard' | 'deep'
  base_url?: string             // self-hosted / enterprise API base
  author_login?: string         // when set, scope to PRs THIS handle authored
                                // (any base branch); the personal shipping log
}

interface RawCommit {
  sha: string
  message: string
  author_name: string
  author_email: string
  committed_at: string          // ISO 8601 UTC
  pr_number?: number
  pr_title?: string
  pr_description?: string
  pr_author_login?: string      // the PR author (for author-scoped provenance)
  pr_base_branch?: string       // the branch the PR merged into
  changed_files: string[]
  diff?: string                 // only included if depth >= 'standard'
}

interface SourceResponse {
  commits: RawCommit[]
  error?: string
}
```

### Example — GitHub Source Plugin

```typescript
import { SourcePlugin, SourceRequest, SourceResponse, runPlugin } from '@narratorlog/sdk'
import { Octokit } from '@octokit/rest'

class GitHubSourcePlugin implements SourcePlugin {
  async fetch(request: SourceRequest): Promise<SourceResponse> {
    const octokit = new Octokit({ auth: request.access_token })
    const [owner, repo] = request.repo.split('/')

    const { data: commits } = await octokit.repos.listCommits({
      owner,
      repo,
      sha: request.branch,
      since: request.scan_from,
      until: request.scan_to,
      per_page: 100,
    })

    const rawCommits = await Promise.all(
      commits.map(c => this.enrichCommit(octokit, owner, repo, c, request.depth))
    )

    return { commits: rawCommits }
  }

  private async enrichCommit(octokit, owner, repo, commit, depth) {
    // fetch PR, diff, etc.
  }
}

// SDK handles stdin/stdout
runPlugin(new GitHubSourcePlugin())
```

---

## AI Provider Plugins

Calls an LLM to generate summaries and audience drafts.

### Interface

```typescript
import { AIProviderPlugin, SummarizeRequest, SummarizeResponse,
         GenerateRequest, GenerateResponse } from '@narratorlog/sdk'

export class MyAIPlugin implements AIProviderPlugin {
  async summarize(request: SummarizeRequest): Promise<SummarizeResponse> {
    // Pass 1: summarize one commit group
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    // Pass 2: generate audience draft from chunk summaries
  }
}
```

### Types

```typescript
interface CommitGroupContext {
  label: string
  group_type: 'feature' | 'fix' | 'breaking' | 'chore' | 'security' | 'other'
  pr_title?: string
  pr_description?: string
  issue_titles: string[]
  changed_files: string[]
  diff?: string
  codebase_context?: string
}

interface SummarizeRequest {
  action: 'summarize'
  group: CommitGroupContext
  model: string
  api_key?: string              // if cloud provider
  base_url?: string             // if Ollama or custom
}

interface SummarizeResponse {
  summary: string               // 2-3 sentence technical summary
  tokens_used?: number
  error?: string
}

interface Audience {
  id: string                    // developers | product | marketing | etc
  tone: string
  description?: string
}

interface GenerateRequest {
  action: 'generate'
  summaries: string[]           // Pass 1 summaries
  audience: Audience
  repository: string            // for context
  scan_from: string
  scan_to: string
  model: string
  api_key?: string
  base_url?: string
}

interface GenerateResponse {
  content: string               // full formatted changelog draft
  tokens_used?: number
  error?: string
}
```

### Example — Anthropic Provider Plugin

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { AIProviderPlugin, SummarizeRequest, SummarizeResponse,
         GenerateRequest, GenerateResponse, runPlugin } from '@narratorlog/sdk'

class AnthropicPlugin implements AIProviderPlugin {
  async summarize(request: SummarizeRequest): Promise<SummarizeResponse> {
    const client = new Anthropic({ apiKey: request.api_key })

    const message = await client.messages.create({
      model: request.model,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: this.buildSummarizePrompt(request.group)
      }]
    })

    return {
      summary: message.content[0].type === 'text' ? message.content[0].text : '',
      tokens_used: message.usage.input_tokens + message.usage.output_tokens
    }
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const client = new Anthropic({ apiKey: request.api_key })

    const message = await client.messages.create({
      model: request.model,
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: this.buildGeneratePrompt(request)
      }]
    })

    return {
      content: message.content[0].type === 'text' ? message.content[0].text : '',
      tokens_used: message.usage.input_tokens + message.usage.output_tokens
    }
  }

  private buildSummarizePrompt(group: CommitGroupContext): string {
    return `You are a technical writer creating internal changelog entries.

Summarize the following code change in 2-3 sentences.
Be specific about what changed and why it matters.
Do not use marketing language.

Pull Request: ${group.pr_title || 'N/A'}
Description: ${group.pr_description || 'N/A'}
Linked Issues: ${group.issue_titles.join(', ') || 'None'}
Changed Files: ${group.changed_files.join(', ')}
${group.diff ? `Diff:\n${group.diff}` : ''}
${group.codebase_context ? `Context:\n${group.codebase_context}` : ''}`
  }

  private buildGeneratePrompt(request: GenerateRequest): string {
    return `You are writing a changelog for the ${request.audience.id} audience.

Tone: ${request.audience.tone}
Repository: ${request.repository}
Period: ${request.scan_from} to ${request.scan_to}

What shipped this week:
${request.summaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Write the changelog now. Group by type (Features, Fixes, etc.).
End with: "Generated by narratorlog · narratorlog.dev"`
  }
}

runPlugin(new AnthropicPlugin())
```

---

## Output Plugins

Delivers an approved draft to a destination.

### Interface

```typescript
import { OutputPlugin, DeliverRequest, DeliverResponse } from '@narratorlog/sdk'

export class MyOutputPlugin implements OutputPlugin {
  async deliver(request: DeliverRequest): Promise<DeliverResponse> {
    // deliver the content somewhere
  }
}
```

### Types

```typescript
interface DeliverRequest {
  action: 'deliver'
  audience_id: string
  tone: string
  content: string               // original AI-generated content
  edited_content?: string       // reviewer edits (use this if present)
  scan: {
    id: string
    repository: string
    scan_from: string
    scan_to: string
  }
  config: Record<string, unknown>  // plugin-specific config from .narratorlog.yml
}

interface DeliverResponse {
  success: boolean
  reference?: string            // URL or ID of the delivered content
  message?: string              // human-readable delivery summary
  error?: string                // error message if success = false
}
```

### The `final_content` Helper

Plugins should always use the `final_content` helper from the SDK. It returns `edited_content` if present, otherwise `content`:

```typescript
import { getFinalContent } from '@narratorlog/sdk'

const content = getFinalContent(request)  // edited_content ?? content
```

### Example — Slack Output Plugin

```typescript
import { OutputPlugin, DeliverRequest, DeliverResponse,
         getFinalContent, runPlugin } from '@narratorlog/sdk'

class SlackOutputPlugin implements OutputPlugin {
  async deliver(request: DeliverRequest): Promise<DeliverResponse> {
    const content = getFinalContent(request)
    const { channel, mention } = request.config as { channel: string; mention?: string }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel,
        text: mention ? `${mention}\n${content}` : content,
        mrkdwn: true
      })
    })

    const data = await response.json()

    if (!data.ok) {
      return { success: false, error: data.error }
    }

    return {
      success: true,
      reference: `https://slack.com/archives/${data.channel}/p${data.ts.replace('.', '')}`,
      message: `Posted to ${channel}`
    }
  }
}

runPlugin(new SlackOutputPlugin())
```

### Example — Markdown Output Plugin

```typescript
import { OutputPlugin, DeliverRequest, DeliverResponse,
         getFinalContent, runPlugin } from '@narratorlog/sdk'
import { writeFile, readFile } from 'fs/promises'
import { existsSync } from 'fs'

class MarkdownOutputPlugin implements OutputPlugin {
  async deliver(request: DeliverRequest): Promise<DeliverResponse> {
    const content = getFinalContent(request)
    const { path: filePath, prepend } = request.config as {
      path: string
      prepend?: boolean
    }

    const header = `## Week of ${formatDate(request.scan.scan_from)}\n\n`
    const entry = `${header}${content}\n\n---\n\n`

    if (prepend !== false && existsSync(filePath)) {
      const existing = await readFile(filePath, 'utf-8')
      await writeFile(filePath, entry + existing)
    } else {
      await writeFile(filePath, entry)
    }

    return {
      success: true,
      reference: filePath,
      message: `Written to ${filePath}`
    }
  }
}

runPlugin(new MarkdownOutputPlugin())
```

---

## Plugin Registration

Plugins are registered in `.narratorlog.yml`. The Go core resolves plugin paths relative to the repo root.

```yaml
# Built-in plugins (shipped with narratorlog)
ai:
  provider: anthropic           # uses plugins/ai-providers/anthropic

outputs:
  - audience: developers
    plugin: slack               # uses plugins/outputs/slack
  - audience: marketing
    plugin: notion              # uses plugins/outputs/notion

# Custom / community plugins
outputs:
  - audience: product
    plugin: ./my-plugins/teams  # relative path to local plugin
    config:
      webhook_url: https://...

  - audience: marketing
    plugin: narratorlog-plugin-linear  # npm package name
    config:
      team_id: xxx
```

**Plugin resolution order:**
1. Relative path (starts with `./`) → resolved from repo root
2. npm package name → resolved from `node_modules`
3. Built-in name (e.g. `slack`) → resolved from narratorlog's bundled plugins

---

## Scaffolding New Plugins

The CLI scaffolds a fully typed plugin from a template:

```bash
narratorlog create-plugin --type=output --name=teams
```

Creates:
```
plugins/outputs/teams/
  index.ts          # plugin implementation (fill in deliver())
  package.json      # npm package config
  README.md         # how to configure this plugin
  tsconfig.json
```

The generated `index.ts` has the full interface already in place with TODOs for the implementation.

---

## Plugin Development Tips

**Testing your plugin locally:**
```bash
echo '{"action":"deliver","audience_id":"developers","content":"## Week...", ...}' \
  | node plugins/outputs/teams/index.js
```

**Environment variables:**
Plugins access credentials via environment variables, not the request payload. Document required env vars in your plugin's README.

```typescript
// Good — credentials from environment
const token = process.env.SLACK_BOT_TOKEN

// Bad — never expect credentials in the request payload
const token = request.config.token
```

**Error handling:**
Never throw unhandled exceptions. Catch all errors and return them in the response:

```typescript
async deliver(request: DeliverRequest): Promise<DeliverResponse> {
  try {
    // implementation
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
```

**Plugin versioning:**
Plugins follow semantic versioning. Breaking changes to the interface are versioned in the SDK. Old plugins continue to work until the major version changes.

---

## Built-in Plugins (Shipped with narratorlog)

| Type | Plugin | Description |
|---|---|---|
| Source | `github` | GitHub REST API + PR resolution |
| Source | `gitlab` | GitLab API + MR resolution |
| Source | `git-cli` | Local git CLI, no platform API needed |
| AI | `anthropic` | Claude via Anthropic API |
| AI | `openai` | GPT-4o via OpenAI API |
| AI | `ollama` | Any Ollama-hosted model (local) |
| AI | `groq` | Groq API (fast inference) |
| Output | `markdown` | Write to CHANGELOG.md |
| Output | `slack` | Post to Slack channel |
| Output | `notion` | Update Notion page |
| Output | `discord` | Post to Discord channel |
| Output | `linear` | Post to Linear document |
| Output | `email` | Send email digest |

---

## Community Plugin Registry

Community plugins are listed in `PLUGINS.md` in the narratorlog repository. To list your plugin, open a PR adding it to the registry with:

- Plugin name and npm package
- Supported plugin type (source / ai / output)
- Brief description
- Author and repository link
- Required environment variables

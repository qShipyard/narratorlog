// ─── Shared Types ────────────────────────────────────────────────────────────

export type GitProvider = 'github' | 'gitlab' | 'bitbucket' | 'git_cli'
export type AIDepth = 'messages-only' | 'standard' | 'deep'
export type GroupType = 'feature' | 'fix' | 'breaking' | 'chore' | 'security' | 'other'
export type AudienceId = 'developers' | 'manager' | 'product' | 'marketing' | 'public' | string

// ─── Source Plugin Types ──────────────────────────────────────────────────────

export interface SourceRequest {
  provider: GitProvider
  repo: string
  branch: string
  scan_from: string       // ISO 8601 UTC
  scan_to: string         // ISO 8601 UTC
  access_token: string
  depth: AIDepth
  base_url?: string
}

export interface RawCommit {
  sha: string
  message: string
  author_name: string
  author_email: string
  committed_at: string
  pr_number?: number
  pr_title?: string
  pr_description?: string
  changed_files: string[]
  diff?: string
}

export interface SourceResponse {
  commits: RawCommit[]
  error?: string
}

// ─── AI Provider Plugin Types ─────────────────────────────────────────────────

export interface CommitGroupContext {
  label: string
  group_type: GroupType
  pr_title?: string
  pr_description?: string
  issue_titles: string[]
  changed_files: string[]
  diff?: string
  codebase_context?: string
}

export interface SummarizeGroupInput {
  label: string
  group_type: GroupType
  pr_title?: string
  pr_description?: string
  issue_titles: string[]
  changed_files: string[]
  diff?: string
  codebase_context?: string
}

export interface AudienceInput {
  id: AudienceId
  tone: string
  description?: string
}

export interface SummarizeRequest {
  action: 'summarize'
  group: CommitGroupContext
  model: string
  api_key?: string
  base_url?: string
}

export interface SummarizeResponse {
  summary: string
  tokens_used?: number
  error?: string
}

export interface Audience {
  id: AudienceId
  tone: string
  description?: string
}

export interface GenerateRequest {
  action: 'generate'
  summaries: string[]
  audience: Audience
  repository: string
  scan_from: string
  scan_to: string
  model: string
  api_key?: string
  base_url?: string
}

export interface GenerateResponse {
  content: string
  tokens_used?: number
  error?: string
}

// ─── Output Plugin Types ──────────────────────────────────────────────────────

export interface ScanMeta {
  id: string
  repository: string
  scan_from: string
  scan_to: string
}

export interface DeliverRequest {
  action: 'deliver'
  audience_id: AudienceId
  tone: string
  content: string
  edited_content?: string
  scan: ScanMeta
  config: Record<string, unknown>
}

export interface DeliverResponse {
  success: boolean
  reference?: string
  message?: string
  error?: string
}

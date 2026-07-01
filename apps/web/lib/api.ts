import axios from 'axios'

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

const PUBLIC_ROUTES = ['/setup', '/login', '/activate']

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`))
}

api.interceptors.response.use(
  res => res,
  err => {
    if (typeof window !== 'undefined' && err.response?.status === 401) {
      const path = window.location.pathname
      const url = err.config?.url ?? ''
      const isSetupStatus = url.includes('/setup/status')
      if (!isPublicRoute(path) && !isSetupStatus) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  name: string
  avatar_url?: string
  role: 'admin' | 'reviewer' | 'viewer'
  team: {
    id: string
    name: string
    slug: string
  }
}

export interface Repository {
  id: string
  name: string
  full_name: string
  url: string
  provider: 'github' | 'gitlab' | 'bitbucket' | 'git_cli'
  default_branch: string
  is_active: boolean
  last_scanned_at?: string
  config: Record<string, unknown>
}

export interface Scan {
  id: string
  repository?: {
    id: string
    full_name: string
  }
  status: ScanStatus
  triggered_by: 'scheduled' | 'manual' | 'webhook' | 'cli'
  scan_from: string
  scan_to: string
  commit_count: number
  filtered_count: number
  error?: string | null
  error_hint?: string
  drafts_pending: number
  drafts_approved: number
  created_at: string
}

export type ScanStatus =
  | 'pending'
  | 'running'
  | 'filtering'
  | 'enriching'
  | 'reading_context'
  | 'chunking'
  | 'summarizing'
  | 'awaiting_approval'
  | 'approved'
  | 'delivering'
  | 'delivered'
  | 'failed'
  | 'cancelled'

export interface CommitGroup {
  id: string
  label: string
  group_type: 'feature' | 'fix' | 'breaking' | 'chore' | 'security' | 'other'
  commit_count: number
  summary?: string
  commits: string[]
}

export interface AudienceDraft {
  id: string
  audience_id: string
  tone: string
  content: string
  edited_content?: string
  status: 'draft' | 'approved' | 'rejected' | 'delivered'
  approved_by?: { id: string; name: string }
  approved_at?: string
  comment_count: number
  created_at: string
}

export interface Comment {
  id: string
  user: {
    id: string
    name: string
    avatar_url?: string
  }
  content: string
  created_at: string
}

export interface ScanDelivery {
  id: string
  draft_id: string
  audience_id: string
  output_plugin: string
  status: 'pending' | 'success' | 'failed'
  attempt_count: number
  delivered_at?: string
  created_at: string
  response?: unknown
}

export interface HealthCheck {
  ok: boolean
  active?: number
}

export interface HealthResponse {
  status: 'ok' | 'degraded'
  version: string
  checks: {
    database?: HealthCheck
    redis?: HealthCheck
    worker?: HealthCheck
  }
}

export interface TeamMember {
  id: string
  name: string
  email: string
  role: User['role']
  avatar_url?: string
  created_at: string
}

export interface InviteMemberResponse {
  id: string
  name: string
  email: string
  role: User['role']
  temporary_password: string
}

export interface Pagination {
  next_cursor?: string
  has_more: boolean
  total: number
}

export interface AvailableRepo {
  provider_id: string
  full_name: string
  name: string
  url: string
  default_branch: string
  private: boolean
  already_connected: boolean
}

export interface RoutingEntry {
  audience: string
  plugin: string
  config: Record<string, unknown>
}

export interface TeamConfigView {
  ai: {
    provider: string
    model: string
    base_url: string
    depth: string
    api_key_set: boolean
  }
  privacy: { scrub_secrets: boolean; local_only: boolean }
  integrations: Record<string, Record<string, boolean>>
  routing: RoutingEntry[]
  sources: Record<string, { token_set: boolean; base_url: string }>
  activation_complete: boolean
}

export interface TeamConfigUpdate {
  ai: {
    provider: string
    model: string
    base_url: string
    depth: string
    api_key: string // empty string = keep existing
  }
  privacy: { scrub_secrets: boolean; local_only: boolean }
  integrations: Record<string, Record<string, string>> // empty value = keep existing
  routing: RoutingEntry[]
  sources: Record<string, { token: string; base_url: string }>
  activation_complete: boolean
}

// Build an update payload that preserves everything in the current config.
// Empty token / api_key / integration value all mean "keep existing" on the
// server, so callers only set the one field they intend to change.
export function configViewToUpdate(v: TeamConfigView): TeamConfigUpdate {
  const sources: Record<string, { token: string; base_url: string }> = {}
  for (const p of ['github', 'gitlab', 'bitbucket']) {
    sources[p] = { token: '', base_url: v.sources?.[p]?.base_url ?? '' }
  }
  return {
    ai: {
      provider: v.ai.provider,
      model: v.ai.model,
      base_url: v.ai.base_url,
      depth: v.ai.depth,
      api_key: '',
    },
    privacy: v.privacy,
    integrations: {},
    routing: v.routing ?? [],
    sources,
    activation_complete: v.activation_complete ?? false,
  }
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const healthApi = {
  get: () => api.get<HealthResponse>('/health'),
}

export const setupApi = {
  status: () => api.get<{ setup_complete: boolean }>('/setup/status'),
  complete: (data: {
    team_name: string
    admin_name: string
    email: string
    password: string
  }) => api.post('/setup', data),
}

export const authApi = {
  me: () => api.get<User>('/api/v1/me'),
  login: (email: string, password: string) =>
    api.post<User>('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
}

export const reposApi = {
  list: () => api.get<{ data: Repository[] }>('/api/v1/repos'),
  available: (provider: string) =>
    api.get<{ data: AvailableRepo[] }>('/api/v1/repos/available', { params: { provider } }),
  connect: (data: {
    provider: string
    provider_id: string
    full_name: string
    url: string
    default_branch: string
  }) => api.post<Repository>('/api/v1/repos', data),
  get: (id: string) => api.get<Repository>(`/api/v1/repos/${id}`),
  update: (id: string, config: Record<string, unknown>) =>
    api.patch<Repository>(`/api/v1/repos/${id}`, { config }),
  disconnect: (id: string) => api.delete(`/api/v1/repos/${id}`),
}

export const scansApi = {
  list: (params?: { repo_id?: string; status?: string; cursor?: string }) =>
    api.get<{ data: Scan[]; pagination: Pagination }>('/api/v1/scans', { params }),
  trigger: (data: { repository_id: string; lookback?: string }) =>
    api.post<{ id: string; status: string }>('/api/v1/scans', data),
  get: (id: string) => api.get<Scan>(`/api/v1/scans/${id}`),
  groups: (id: string) => api.get<{ data: CommitGroup[] }>(`/api/v1/scans/${id}/groups`),
  drafts: (id: string) => api.get<{ data: AudienceDraft[] }>(`/api/v1/scans/${id}/drafts`),
  deliver: (id: string) => api.post(`/api/v1/scans/${id}/deliver`),
  deliveries: (id: string) => api.get<{ data: ScanDelivery[] }>(`/api/v1/scans/${id}/deliveries`),
}

export const draftsApi = {
  update: (id: string, edited_content: string) =>
    api.patch<AudienceDraft>(`/api/v1/drafts/${id}`, { edited_content }),
  approve: (id: string) =>
    api.post<AudienceDraft & { all_approved: boolean }>(`/api/v1/drafts/${id}/approve`),
  reject: (id: string, reason?: string) =>
    api.post<AudienceDraft>(`/api/v1/drafts/${id}/reject`, { reason }),
  regenerate: (id: string) => api.post(`/api/v1/drafts/${id}/regenerate`),
  comments: (id: string) => api.get<{ data: Comment[] }>(`/api/v1/drafts/${id}/comments`),
  addComment: (id: string, content: string) =>
    api.post<Comment>(`/api/v1/drafts/${id}/comments`, { content }),
  deleteComment: (id: string) => api.delete(`/api/v1/comments/${id}`),
}

export const teamApi = {
  get: () => api.get('/api/v1/team'),
  members: () => api.get<{ data: TeamMember[] }>('/api/v1/team/members'),
  invite: (data: { name: string; email: string; role: User['role'] }) =>
    api.post<InviteMemberResponse>('/api/v1/team/invite', data),
  updateRole: (id: string, role: User['role']) =>
    api.patch<{ id: string; role: User['role'] }>(`/api/v1/team/members/${id}`, { role }),
  remove: (id: string) => api.delete(`/api/v1/team/members/${id}`),
  getConfig: () => api.get<TeamConfigView>('/api/v1/team/config'),
  updateConfig: (data: TeamConfigUpdate) =>
    api.put<TeamConfigView>('/api/v1/team/config', data),
  getSources: () =>
    api.get<Record<string, { token_set: boolean; base_url: string }>>('/api/v1/sources'),
}
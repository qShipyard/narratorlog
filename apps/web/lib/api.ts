import axios from 'axios'

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      window.location.href = '/login'
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
  repository: {
    id: string
    full_name: string
  }
  status: ScanStatus
  triggered_by: 'scheduled' | 'manual' | 'webhook' | 'cli'
  scan_from: string
  scan_to: string
  commit_count: number
  filtered_count: number
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
}

// ─── API calls ────────────────────────────────────────────────────────────────

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
  available: () => api.get<{ data: AvailableRepo[] }>('/api/v1/repos/available'),
  connect: (data: {
    provider: string
    provider_id: string
    full_name: string
    url: string
    default_branch: string
    access_token: string
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
  members: () => api.get('/api/v1/team/members'),
  invite: (email: string, role: string) => api.post('/api/v1/team/invite', { email, role }),
  updateRole: (id: string, role: string) => api.patch(`/api/v1/team/members/${id}`, { role }),
  remove: (id: string) => api.delete(`/api/v1/team/members/${id}`),
  getConfig: () => api.get<TeamConfigView>('/api/v1/team/config'),
  updateConfig: (data: TeamConfigUpdate) =>
    api.put<TeamConfigView>('/api/v1/team/config', data),
}
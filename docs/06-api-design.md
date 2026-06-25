# narratorlog — API Design

## Overview

REST API served by the Go API service. Base URL: `https://your-instance.com/api/v1`

All requests and responses use JSON. All timestamps are ISO 8601 UTC. All IDs are UUIDs.

---

## Authentication

Session-based auth using HTTP-only secure cookies.

OAuth flow:
```
GET  /auth/github              → redirect to GitHub OAuth
GET  /auth/github/callback     → exchange code, set session cookie, redirect to /dashboard
GET  /auth/gitlab              → redirect to GitLab OAuth
GET  /auth/gitlab/callback
GET  /auth/bitbucket           → redirect to Bitbucket OAuth
GET  /auth/bitbucket/callback
POST /auth/logout              → clear session cookie
GET  /auth/me                  → current user
```

All `/api/v1/*` routes require a valid session cookie. Unauthenticated requests return `401`.

---

## Standard Error Response

```json
{
  "error": {
    "code": "REPO_NOT_FOUND",
    "message": "Repository not found or you do not have access to it.",
    "details": {}
  }
}
```

| HTTP Status | When |
|---|---|
| 400 | Invalid request body or parameters |
| 401 | Not authenticated |
| 403 | Authenticated but not authorized for this action |
| 404 | Resource not found |
| 409 | Conflict (duplicate resource) |
| 422 | Validation error |
| 500 | Internal server error |

---

## Pagination

List endpoints use cursor-based pagination.

```
GET /api/v1/scans?limit=20&cursor=uuid
```

Response includes:
```json
{
  "data": [...],
  "pagination": {
    "next_cursor": "uuid-of-last-item",
    "has_more": true,
    "total": 142
  }
}
```

---

## Routes

### Auth

#### `GET /auth/me`
Returns the current authenticated user.

**Response 200:**
```json
{
  "id": "uuid",
  "email": "james@example.com",
  "name": "James Okafor",
  "avatar_url": "https://...",
  "role": "admin",
  "team": {
    "id": "uuid",
    "name": "Acme Engineering",
    "slug": "acme"
  }
}
```

---

### Repositories

#### `GET /api/v1/repos`
List connected repositories.

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "backend",
      "full_name": "acme/backend",
      "url": "https://github.com/acme/backend",
      "provider": "github",
      "default_branch": "main",
      "is_active": true,
      "last_scanned_at": "2026-06-21T09:00:00Z",
      "config": {}
    }
  ]
}
```

---

#### `GET /api/v1/repos/available`
List repos available to connect from the user's connected git platform.

**Response 200:**
```json
{
  "data": [
    {
      "provider_id": "123456",
      "full_name": "acme/frontend",
      "url": "https://github.com/acme/frontend",
      "already_connected": false
    }
  ]
}
```

---

#### `POST /api/v1/repos`
Connect a repository.

**Request:**
```json
{
  "provider": "github",
  "provider_id": "123456",
  "full_name": "acme/backend",
  "url": "https://github.com/acme/backend",
  "default_branch": "main"
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "full_name": "acme/backend",
  "is_active": true,
  "webhook_registered": true
}
```

Side effects:
- Registers webhook on the git platform
- Enqueues initial scan job

---

#### `GET /api/v1/repos/:id`
Get repository detail with current config.

---

#### `PATCH /api/v1/repos/:id`
Update repository config.

**Request:**
```json
{
  "config": {
    "branch": "develop",
    "cadence": "on-tag",
    "ai_depth": "deep",
    "audiences": ["developers", "product"]
  }
}
```

**Response 200:** Updated repository object

---

#### `DELETE /api/v1/repos/:id`
Disconnect a repository. Removes webhook. Does not delete scan history.

**Response 204:** No content

---

### Scans

#### `GET /api/v1/scans`
List all scans, newest first.

**Query params:**
- `repo_id` — filter by repository
- `status` — filter by status
- `limit` — default 20, max 100
- `cursor` — pagination cursor

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "repository": {
        "id": "uuid",
        "full_name": "acme/backend"
      },
      "status": "awaiting_approval",
      "triggered_by": "scheduled",
      "scan_from": "2026-06-14T00:00:00Z",
      "scan_to": "2026-06-21T00:00:00Z",
      "commit_count": 47,
      "filtered_count": 12,
      "drafts_pending": 2,
      "drafts_approved": 1,
      "created_at": "2026-06-21T09:00:00Z"
    }
  ],
  "pagination": { "next_cursor": "uuid", "has_more": false }
}
```

---

#### `POST /api/v1/scans`
Trigger a manual scan.

**Request:**
```json
{
  "repository_id": "uuid",
  "lookback": "7d",
  "scan_from": "2026-06-14T00:00:00Z",
  "scan_to": "2026-06-21T00:00:00Z"
}
```

`scan_from` / `scan_to` override `lookback` if provided.

**Response 202:**
```json
{
  "id": "uuid",
  "status": "pending",
  "message": "Scan queued."
}
```

---

#### `GET /api/v1/scans/:id`
Get full scan detail.

**Response 200:**
```json
{
  "id": "uuid",
  "repository": { "id": "uuid", "full_name": "acme/backend" },
  "status": "awaiting_approval",
  "triggered_by": "scheduled",
  "triggered_by_user": null,
  "scan_from": "2026-06-14T00:00:00Z",
  "scan_to": "2026-06-21T00:00:00Z",
  "commit_count": 47,
  "filtered_count": 12,
  "config_snapshot": {},
  "created_at": "2026-06-21T09:00:00Z",
  "updated_at": "2026-06-21T09:04:21Z"
}
```

---

#### `GET /api/v1/scans/:id/commits`
List commits in a scan.

**Query params:**
- `noise` — `true` to include noise commits (default: false)

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "sha": "abc123",
      "message": "feat: add OAuth login",
      "author_name": "James Okafor",
      "committed_at": "2026-06-18T14:32:00Z",
      "pr_number": 142,
      "pr_title": "Add GitHub OAuth login",
      "is_breaking": false,
      "is_noise": false,
      "is_bot": false,
      "domain": "auth",
      "group_id": "uuid"
    }
  ]
}
```

---

#### `GET /api/v1/scans/:id/groups`
List commit groups in a scan.

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "label": "Add GitHub OAuth login",
      "group_type": "feature",
      "commit_count": 3,
      "summary": "Implements GitHub OAuth 2.0 login flow...",
      "commits": ["uuid1", "uuid2", "uuid3"]
    }
  ]
}
```

---

#### `DELETE /api/v1/scans/:id`
Cancel a pending or running scan.

**Response 204:** No content

---

### Audience Drafts

#### `GET /api/v1/scans/:id/drafts`
Get all audience drafts for a scan.

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "audience_id": "developers",
      "tone": "technical",
      "content": "## Week of June 14–21, 2026\n\n### Features\n...",
      "edited_content": null,
      "status": "draft",
      "approved_by": null,
      "approved_at": null,
      "comment_count": 2,
      "created_at": "2026-06-21T09:04:00Z"
    }
  ]
}
```

---

#### `PATCH /api/v1/drafts/:id`
Edit draft content. Only reviewers and admins.

**Request:**
```json
{
  "edited_content": "## Week of June 14–21\n\n..."
}
```

**Response 200:** Updated draft object

---

#### `POST /api/v1/drafts/:id/approve`
Approve a draft. Role: reviewer or admin.

**Request:** Empty body or optional note:
```json
{ "note": "Looks good, approved for delivery." }
```

**Response 200:**
```json
{
  "id": "uuid",
  "status": "approved",
  "approved_by": { "id": "uuid", "name": "Sarah Chen" },
  "approved_at": "2026-06-21T11:30:00Z",
  "all_approved": false
}
```

If `all_approved: true`, delivery job is enqueued automatically.

---

#### `POST /api/v1/drafts/:id/reject`
Reject a draft and optionally trigger regeneration.

**Request:**
```json
{
  "reason": "Tone is too technical for marketing audience.",
  "regenerate": true
}
```

**Response 200:** Updated draft object with status `rejected`. If `regenerate: true`, a new draft is queued immediately.

---

#### `POST /api/v1/drafts/:id/regenerate`
Trigger AI regeneration of a specific draft.

**Response 202:**
```json
{ "message": "Regeneration queued." }
```

---

#### `POST /api/v1/scans/:id/deliver`
Manually trigger delivery. All drafts must be approved first.

**Response 202:**
```json
{ "message": "Delivery queued." }
```

---

### Draft Comments

#### `GET /api/v1/drafts/:id/comments`
Get comments on a draft.

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "user": { "id": "uuid", "name": "Sarah Chen", "avatar_url": "..." },
      "content": "The second bullet point needs clarification.",
      "created_at": "2026-06-21T10:15:00Z"
    }
  ]
}
```

---

#### `POST /api/v1/drafts/:id/comments`
Add a comment.

**Request:**
```json
{ "content": "Can we rephrase the breaking change note?" }
```

**Response 201:** Created comment object

---

#### `DELETE /api/v1/comments/:id`
Delete own comment.

**Response 204:** No content

---

### Team

#### `GET /api/v1/team`
Get team details.

---

#### `GET /api/v1/team/members`
List team members.

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "James Okafor",
      "email": "james@example.com",
      "role": "admin",
      "avatar_url": "...",
      "created_at": "2026-01-10T00:00:00Z"
    }
  ]
}
```

---

#### `POST /api/v1/team/invite`
Invite a new member. Sends email with setup link.

**Request:**
```json
{
  "email": "sarah@example.com",
  "role": "reviewer"
}
```

**Response 201:**
```json
{ "message": "Invitation sent to sarah@example.com" }
```

---

#### `PATCH /api/v1/team/members/:id`
Update member role. Admin only.

**Request:**
```json
{ "role": "reviewer" }
```

---

#### `DELETE /api/v1/team/members/:id`
Remove member. Admin only. Cannot remove self.

**Response 204:** No content

---

### Webhooks (Inbound)

#### `POST /webhooks/github`
Receive GitHub webhook events.

Headers required:
- `X-GitHub-Event` — event type
- `X-Hub-Signature-256` — HMAC-SHA256 signature

Handled events:
- `push` → if push to default branch, enqueue scan
- `create` (tag) → if `cadence: on-tag`, enqueue scan
- `pull_request` (closed + merged) → if `cadence: on-merge`, enqueue scan

**Response 200:** `{ "received": true }`

---

#### `POST /webhooks/gitlab`
#### `POST /webhooks/bitbucket`

Same pattern as GitHub webhook handler. Platform-specific signature validation.

---

### Health

#### `GET /health`
Service health check.

**Response 200:**
```json
{
  "status": "ok",
  "version": "1.2.0",
  "services": {
    "database": "ok",
    "redis": "ok",
    "reader": "ok"
  }
}
```

If any service is unhealthy, returns `503` with the failing service marked.

---

## WebSocket

Real-time scan progress updates.

```
WS /ws/scans/:id
```

Messages from server:
```json
{ "event": "stage_update", "stage": "enriching", "progress": 45 }
{ "event": "stage_update", "stage": "summarizing", "progress": 80 }
{ "event": "scan_complete", "status": "awaiting_approval" }
{ "event": "scan_failed", "error": "AI provider returned 429" }
```

The web app connects to this socket when a scan is in progress to show real-time progress on the scan detail page.

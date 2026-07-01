import { Commits, MergeRequests } from '@gitbeaker/rest'
import type { CommitSchema, CommitDiffSchema, MergeRequestSchema } from '@gitbeaker/rest'
import {
  SourcePlugin,
  SourceRequest,
  SourceResponse,
  RawCommit,
  runSourcePlugin,
} from '@narratorlog/sdk'

type CommitsInstance = InstanceType<typeof Commits>
type MergeRequestsInstance = InstanceType<typeof MergeRequests>

export function mapCommit(
  raw: CommitSchema,
  depth: SourceRequest['depth'],
  diffFiles: CommitDiffSchema[],
  mr: MergeRequestSchema | null
): RawCommit {
  const commit: RawCommit = {
    sha: raw.id,
    message: raw.message,
    author_name: raw.author_name,
    author_email: raw.author_email,
    committed_at: raw.committed_date ?? raw.created_at,
    changed_files: [],
  }

  if (mr) {
    commit.pr_number = mr.iid
    commit.pr_title = mr.title
    commit.pr_description = mr.description ?? undefined
    commit.pr_author_login = mr.author?.username
    commit.pr_base_branch = mr.target_branch
  }

  if (depth === 'standard' || depth === 'deep') {
    commit.changed_files = diffFiles.map(f => f.new_path)
    if (depth === 'deep') {
      const joined = diffFiles.map(f => f.diff).filter(Boolean).join('\n')
      if (joined) commit.diff = joined
    }
  }

  return commit
}

class GitLabSourcePlugin implements SourcePlugin {
  async fetch(request: SourceRequest): Promise<SourceResponse> {
    try {
      const clientOpts = {
        host: request.base_url || 'https://gitlab.com',
        token: request.access_token,
      }
      const commits = new Commits(clientOpts) as CommitsInstance

      // Personal scope: merge requests this user authored, merged into any target
      // branch. Falls back to branch-centric listing when no author is set.
      const results = request.author_login
        ? await this.fetchAuthoredMRCommits(
            commits,
            new MergeRequests(clientOpts) as MergeRequestsInstance,
            request
          )
        : await this.fetchBranchCommits(commits, request)

      return { commits: results }
    } catch (err) {
      return { commits: [], error: String(err) }
    }
  }

  // ── Author-centric: my merged MRs → their commits (any target branch) ──

  private async fetchAuthoredMRCommits(
    commits: CommitsInstance,
    mergeRequests: MergeRequestsInstance,
    request: SourceRequest
  ): Promise<RawCommit[]> {
    const mrs = (await mergeRequests.all({
      projectId: request.repo,
      authorUsername: request.author_login,
      state: 'merged',
      scope: 'all',
      updatedAfter: request.scan_from,
      updatedBefore: request.scan_to,
    })) as MergeRequestSchema[]

    const from = new Date(request.scan_from).getTime()
    const to = new Date(request.scan_to).getTime()

    const results: RawCommit[] = []
    const seen = new Set<string>()

    for (const mr of mrs) {
      // updatedAfter/Before is a coarse pre-filter; keep only MRs actually merged
      // inside the scan window.
      if (!mr.merged_at) continue
      const mergedAt = new Date(mr.merged_at).getTime()
      if (mergedAt < from || mergedAt > to) continue

      const mrCommits = (await mergeRequests.allCommits(request.repo, mr.iid)) as CommitSchema[]
      for (const c of mrCommits) {
        if (seen.has(c.id)) continue // a commit can belong to more than one MR
        seen.add(c.id)

        const diffFiles = await this.fetchDiff(commits, request.repo, c.id, request.depth)
        results.push(mapCommit(c, request.depth, diffFiles, mr))
      }
    }

    return results
  }

  // ── Branch-centric fallback (all activity on a branch) ──

  private async fetchBranchCommits(
    commits: CommitsInstance,
    request: SourceRequest
  ): Promise<RawCommit[]> {
    const rawCommits = (await commits.all(request.repo, {
      refName: request.branch,
      since: request.scan_from,
      until: request.scan_to,
    })) as CommitSchema[]

    return Promise.all(
      rawCommits.map(c => this.buildCommit(commits, request.repo, c, request.depth))
    )
  }

  private async buildCommit(
    commits: CommitsInstance,
    projectPath: string,
    raw: CommitSchema,
    depth: SourceRequest['depth']
  ): Promise<RawCommit> {
    const [diffFiles, mr] = await Promise.all([
      this.fetchDiff(commits, projectPath, raw.id, depth),
      this.resolveMR(commits, projectPath, raw.id),
    ])

    return mapCommit(raw, depth, diffFiles, mr)
  }

  private async fetchDiff(
    commits: CommitsInstance,
    projectPath: string,
    sha: string,
    depth: SourceRequest['depth']
  ): Promise<CommitDiffSchema[]> {
    if (depth !== 'standard' && depth !== 'deep') return []
    try {
      return await commits.showDiff(projectPath, sha) as CommitDiffSchema[]
    } catch {
      return []
    }
  }

  private async resolveMR(
    commits: CommitsInstance,
    projectPath: string,
    sha: string
  ): Promise<MergeRequestSchema | null> {
    try {
      const mrs = await commits.allMergeRequests(projectPath, sha) as MergeRequestSchema[]
      return mrs.find(mr => mr.state === 'merged') ?? null
    } catch {
      return null
    }
  }
}

runSourcePlugin(new GitLabSourcePlugin())

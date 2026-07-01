import { Commits } from '@gitbeaker/rest'
import type { CommitSchema, CommitDiffSchema, MergeRequestSchema } from '@gitbeaker/rest'
import {
  SourcePlugin,
  SourceRequest,
  SourceResponse,
  RawCommit,
  runSourcePlugin,
} from '@narratorlog/sdk'

type CommitsInstance = InstanceType<typeof Commits>

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

      const rawCommits = await commits.all(request.repo, {
        refName: request.branch,
        since: request.scan_from,
        until: request.scan_to,
      }) as CommitSchema[]

      const results = await Promise.all(
        rawCommits.map(c => this.buildCommit(commits, request.repo, c, request.depth))
      )

      return { commits: results }
    } catch (err) {
      return { commits: [], error: String(err) }
    }
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

import { Octokit } from '@octokit/rest'
import {
  SourcePlugin,
  SourceRequest,
  SourceResponse,
  RawCommit,
  runSourcePlugin,
} from '@narratorlog/sdk'

class GitHubSourcePlugin implements SourcePlugin {
  async fetch(request: SourceRequest): Promise<SourceResponse> {
    const octokit = new Octokit({ auth: request.access_token })
    const [owner, repo] = request.repo.split('/')

    if (!owner || !repo) {
      return { commits: [], error: `invalid repo format: ${request.repo} — expected owner/repo` }
    }

    try {
      const commits = await this.fetchCommits(octokit, owner, repo, request)
      return { commits }
    } catch (err) {
      return { commits: [], error: String(err) }
    }
  }

  private async fetchCommits(
    octokit: Octokit,
    owner: string,
    repo: string,
    request: SourceRequest
  ): Promise<RawCommit[]> {
    const listResponse = await octokit.repos.listCommits({
      owner,
      repo,
      sha: request.branch,
      since: request.scan_from,
      until: request.scan_to,
      per_page: 100,
    })

    const commits = await Promise.all(
      listResponse.data.map(c => this.buildCommit(octokit, owner, repo, c, request))
    )

    return commits.filter((c): c is RawCommit => c !== null) as RawCommit[]
  }

  private async buildCommit(
    octokit: Octokit,
    owner: string,
    repo: string,
    raw: Awaited<ReturnType<typeof octokit.repos.listCommits>>['data'][number],
    request: SourceRequest
  ): Promise<RawCommit | null> {
    if (!raw.commit.author?.date) return null

    const commit: RawCommit = {
      sha: raw.sha,
      message: raw.commit.message,
      author_name: raw.commit.author?.name ?? 'Unknown',
      author_email: raw.commit.author?.email ?? '',
      committed_at: raw.commit.author.date,
      changed_files: [],
    }

    // Resolve PR — search for a PR that contains this commit
    const pr = await this.resolvePR(octokit, owner, repo, raw.sha)
    if (pr) {
      commit.pr_number = pr.number
      commit.pr_title = pr.title
      commit.pr_description = pr.body ?? undefined
    }

    // Fetch diff if depth requires it
    if (request.depth === 'standard' || request.depth === 'deep') {
      const detail = await octokit.repos.getCommit({ owner, repo, ref: raw.sha })
      commit.changed_files = detail.data.files?.map(f => f.filename) ?? []
      if (request.depth === 'deep') {
        commit.diff = detail.data.files
          ?.map(f => f.patch ?? '')
          .filter(Boolean)
          .join('\n') ?? undefined
      }
    }

    return commit
  }

  private async resolvePR(
    octokit: Octokit,
    owner: string,
    repo: string,
    sha: string
  ): Promise<{ number: number; title: string; body: string | null } | null> {
    try {
      const response = await octokit.repos.listPullRequestsAssociatedWithCommit({
        owner,
        repo,
        commit_sha: sha,
      })

      const merged = response.data.find(pr => pr.merged_at !== null)
      if (!merged) return null

      return {
        number: merged.number,
        title: merged.title,
        body: merged.body,
      }
    } catch {
      return null
    }
  }
}

runSourcePlugin(new GitHubSourcePlugin())
import { Octokit } from '@octokit/rest'
import {
  SourcePlugin,
  SourceRequest,
  SourceResponse,
  RawCommit,
  runSourcePlugin,
} from '@narratorlog/sdk'

const FETCH_CONCURRENCY = 8

type PRDetail = Awaited<ReturnType<Octokit['pulls']['get']>>['data']
type PRCommit = Awaited<ReturnType<Octokit['pulls']['listCommits']>>['data'][number]

// mapLimit runs fn over items with at most `limit` in flight, preserving order.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}

class GitHubSourcePlugin implements SourcePlugin {
  async fetch(request: SourceRequest): Promise<SourceResponse> {
    const octokit = new Octokit({
      auth: request.access_token,
      ...(request.base_url ? { baseUrl: request.base_url } : {}),
    })
    const [owner, repo] = request.repo.split('/')

    if (!owner || !repo) {
      return { commits: [], error: `invalid repo format: ${request.repo} — expected owner/repo` }
    }

    try {
      // Personal scope: the PRs this user authored, merged into any base branch.
      // Falls back to branch-centric listing when no author is set.
      const commits = request.author_login
        ? await this.fetchAuthoredPRCommits(octokit, owner, repo, request)
        : await this.fetchCommits(octokit, owner, repo, request)
      return { commits }
    } catch (err) {
      return { commits: [], error: String(err) }
    }
  }

  // ── Author-centric: my merged PRs → their commits (any base branch) ──

  private async fetchAuthoredPRCommits(
    octokit: Octokit,
    owner: string,
    repo: string,
    request: SourceRequest
  ): Promise<RawCommit[]> {
    const from = request.scan_from.split('T')[0]
    const to = request.scan_to.split('T')[0]
    const q = `repo:${owner}/${repo} is:pr is:merged author:${request.author_login} merged:${from}..${to}`

    const search = await octokit.search.issuesAndPullRequests({ q, per_page: 100 })

    // Pull each PR's detail + commit list concurrently. Sequential per-PR and
    // per-commit round-trips blow past the source-plugin timeout on active repos.
    const perPR = await mapLimit(search.data.items, FETCH_CONCURRENCY, async item => {
      const [pr, prCommits] = await Promise.all([
        octokit.pulls.get({ owner, repo, pull_number: item.number }),
        octokit.paginate(octokit.pulls.listCommits, {
          owner,
          repo,
          pull_number: item.number,
          per_page: 100,
        }),
      ])
      return { pr: pr.data, prCommits }
    })

    // Dedup by sha synchronously — a commit can belong to more than one PR — so
    // the concurrent file-attach step below never races on the seen set.
    const seen = new Set<string>()
    const pending: { raw: PRCommit; pr: PRDetail }[] = []
    for (const { pr, prCommits } of perPR) {
      for (const c of prCommits) {
        if (seen.has(c.sha)) continue
        seen.add(c.sha)
        pending.push({ raw: c, pr })
      }
    }

    const built = await mapLimit(pending, FETCH_CONCURRENCY, async ({ raw, pr }) => {
      const commit = this.baseCommit(raw.sha, raw.commit)
      if (!commit) return null

      commit.pr_number = pr.number
      commit.pr_title = pr.title
      commit.pr_description = pr.body ?? undefined
      commit.pr_author_login = pr.user?.login ?? undefined
      commit.pr_base_branch = pr.base.ref

      await this.attachFiles(octokit, owner, repo, raw.sha, commit, request)
      return commit
    })

    return built.filter((c): c is RawCommit => c !== null)
  }

  // ── Branch-centric fallback (whole-repo activity on a branch) ──

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
    const commit = this.baseCommit(raw.sha, raw.commit)
    if (!commit) return null

    const pr = await this.resolvePR(octokit, owner, repo, raw.sha)
    if (pr) {
      commit.pr_number = pr.number
      commit.pr_title = pr.title
      commit.pr_description = pr.body ?? undefined
    }

    await this.attachFiles(octokit, owner, repo, raw.sha, commit, request)
    return commit
  }

  // ── Shared helpers ──

  private baseCommit(
    sha: string,
    commit: { message: string; author: { name?: string; email?: string; date?: string } | null }
  ): RawCommit | null {
    if (!commit.author?.date) return null
    return {
      sha,
      message: commit.message,
      author_name: commit.author?.name ?? 'Unknown',
      author_email: commit.author?.email ?? '',
      committed_at: commit.author.date,
      changed_files: [],
    }
  }

  private async attachFiles(
    octokit: Octokit,
    owner: string,
    repo: string,
    sha: string,
    commit: RawCommit,
    request: SourceRequest
  ): Promise<void> {
    if (request.depth !== 'standard' && request.depth !== 'deep') return

    const detail = await octokit.repos.getCommit({ owner, repo, ref: sha })
    commit.changed_files = detail.data.files?.map(f => f.filename) ?? []
    if (request.depth === 'deep') {
      commit.diff = detail.data.files
        ?.map(f => f.patch ?? '')
        .filter(Boolean)
        .join('\n') ?? undefined
    }
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

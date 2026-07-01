import {
  SourcePlugin,
  SourceRequest,
  SourceResponse,
  RawCommit,
  runSourcePlugin,
} from '@narratorlog/sdk'

const BASE_URL = 'https://api.bitbucket.org'

interface BitbucketCommit {
  hash: string
  message: string
  author: {
    raw: string
    user?: { display_name: string }
  }
  date: string
}

interface BitbucketDiffstatEntry {
  new?: { path: string }
  old?: { path: string }
}

interface BitbucketPR {
  id: number
  title: string
  state: string
  summary?: { raw?: string }
  author?: { nickname?: string; account_id?: string; display_name?: string }
  destination?: { branch?: { name?: string } }
  updated_on?: string
}

export interface ParsedAuthor {
  name: string
  email: string
}

export function parseAuthor(raw: string): ParsedAuthor {
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/)
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() }
  }
  return { name: raw.trim(), email: '' }
}

export function mapCommit(
  raw: BitbucketCommit,
  depth: SourceRequest['depth'],
  diffstat: BitbucketDiffstatEntry[],
  diff: string | null,
  prInfo: BitbucketPR | null
): RawCommit {
  const { name: author_name, email: author_email } = parseAuthor(raw.author.raw)

  const commit: RawCommit = {
    sha: raw.hash,
    message: raw.message,
    author_name: author_name || (raw.author.user?.display_name ?? ''),
    author_email,
    committed_at: raw.date,
    changed_files: [],
  }

  if (prInfo) {
    commit.pr_number = prInfo.id
    commit.pr_title = prInfo.title
    if (prInfo.summary?.raw) {
      commit.pr_description = prInfo.summary.raw
    }
    commit.pr_author_login = prInfo.author?.nickname ?? prInfo.author?.account_id
    commit.pr_base_branch = prInfo.destination?.branch?.name
  }

  if (depth === 'standard' || depth === 'deep') {
    commit.changed_files = diffstat.map(e => e.new?.path ?? e.old?.path ?? '')
    if (depth === 'deep' && diff) {
      commit.diff = diff
    }
  }

  return commit
}

async function bbFetch(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Bitbucket API error ${res.status}: ${url}`)
  return res.json()
}

async function fetchDiffstat(
  repo: string,
  sha: string,
  token: string
): Promise<BitbucketDiffstatEntry[]> {
  try {
    const url = `${BASE_URL}/2.0/repositories/${repo}/diffstat/${sha}`
    const data = await bbFetch(url, token) as { values: BitbucketDiffstatEntry[] }
    return data.values ?? []
  } catch {
    return []
  }
}

async function fetchDiff(
  repo: string,
  sha: string,
  token: string
): Promise<string | null> {
  try {
    const url = `${BASE_URL}/2.0/repositories/${repo}/diff/${sha}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return res.text()
  } catch {
    return null
  }
}

async function resolvePR(
  repo: string,
  sha: string,
  token: string
): Promise<BitbucketPR | null> {
  try {
    const url = `${BASE_URL}/2.0/repositories/${repo}/commit/${sha}/pullrequests`
    const data = await bbFetch(url, token) as { values: BitbucketPR[] }
    return (data.values ?? []).find(pr => pr.state === 'MERGED') ?? null
  } catch {
    return null
  }
}

class BitbucketSourcePlugin implements SourcePlugin {
  async fetch(request: SourceRequest): Promise<SourceResponse> {
    try {
      // Personal scope: pull requests this user authored, merged into any target
      // branch. Falls back to branch-centric listing when no author is set.
      const results = request.author_login
        ? await this.fetchAuthoredPRCommits(request)
        : await this.fetchBranchCommits(request)
      return { commits: results }
    } catch (err) {
      return { commits: [], error: String(err) }
    }
  }

  // ── Author-centric: my merged PRs → their commits (any target branch) ──

  private async fetchAuthoredPRCommits(request: SourceRequest): Promise<RawCommit[]> {
    const { repo, access_token, author_login, scan_from, scan_to, depth } = request
    const fromMs = new Date(scan_from).getTime()
    const toMs = new Date(scan_to).getTime()

    const results: RawCommit[] = []
    const seen = new Set<string>()

    // Server-side narrow to merged PRs touched since the window opened; author is
    // matched client-side since Bitbucket's queryable PR fields are limited.
    const q = encodeURIComponent(`state="MERGED" AND updated_on>="${scan_from}"`)
    let nextUrl: string | null =
      `${BASE_URL}/2.0/repositories/${repo}/pullrequests?q=${q}&pagelen=50`

    while (nextUrl) {
      const page = await bbFetch(nextUrl, access_token) as {
        values: BitbucketPR[]
        next?: string
      }

      for (const pr of page.values ?? []) {
        const prLogin = pr.author?.nickname ?? pr.author?.account_id ?? ''
        if (prLogin !== author_login) continue
        if (pr.updated_on && new Date(pr.updated_on).getTime() > toMs) continue

        for (const c of await this.fetchPRCommits(repo, pr.id, access_token)) {
          if (seen.has(c.hash)) continue // a commit can belong to more than one PR
          seen.add(c.hash)
          const ms = new Date(c.date).getTime()
          if (ms < fromMs || ms > toMs) continue
          results.push(await this.buildCommit(repo, c, depth, access_token, pr))
        }
      }

      nextUrl = page.next ?? null
    }

    return results
  }

  private async fetchPRCommits(
    repo: string,
    prID: number,
    token: string
  ): Promise<BitbucketCommit[]> {
    const commits: BitbucketCommit[] = []
    let nextUrl: string | null =
      `${BASE_URL}/2.0/repositories/${repo}/pullrequests/${prID}/commits?pagelen=100`

    while (nextUrl) {
      const page = await bbFetch(nextUrl, token) as {
        values: BitbucketCommit[]
        next?: string
      }
      commits.push(...(page.values ?? []))
      nextUrl = page.next ?? null
    }

    return commits
  }

  // ── Branch-centric fallback (all activity on a branch) ──

  private async fetchBranchCommits(request: SourceRequest): Promise<RawCommit[]> {
    const { repo, branch, access_token, scan_from, scan_to, depth } = request
    const scanFromMs = new Date(scan_from).getTime()
    const scanToMs = new Date(scan_to).getTime()

    const kept: BitbucketCommit[] = []
    let nextUrl: string | null =
      `${BASE_URL}/2.0/repositories/${repo}/commits/${branch}`

    while (nextUrl) {
      const page = await bbFetch(nextUrl, access_token) as {
        values: BitbucketCommit[]
        next?: string
      }
      const commits: BitbucketCommit[] = page.values ?? []

      let stopPaging = false
      for (const c of commits) {
        const ms = new Date(c.date).getTime()
        if (ms < scanFromMs) {
          stopPaging = true
          break
        }
        if (ms <= scanToMs) {
          kept.push(c)
        }
      }

      nextUrl = stopPaging ? null : (page.next ?? null)
    }

    return Promise.all(kept.map(c => this.buildCommit(repo, c, depth, access_token)))
  }

  private async buildCommit(
    repo: string,
    raw: BitbucketCommit,
    depth: SourceRequest['depth'],
    token: string,
    knownPR?: BitbucketPR
  ): Promise<RawCommit> {
    const [diffstat, diff, prInfo] = await Promise.all([
      depth === 'standard' || depth === 'deep'
        ? fetchDiffstat(repo, raw.hash, token)
        : Promise.resolve<BitbucketDiffstatEntry[]>([]),
      depth === 'deep'
        ? fetchDiff(repo, raw.hash, token)
        : Promise.resolve<string | null>(null),
      knownPR ? Promise.resolve(knownPR) : resolvePR(repo, raw.hash, token),
    ])

    return mapCommit(raw, depth, diffstat, diff, prInfo)
  }
}

runSourcePlugin(new BitbucketSourcePlugin())

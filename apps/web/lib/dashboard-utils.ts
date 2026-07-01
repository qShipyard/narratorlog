import { Scan } from '@/lib/api'

/** One pending story per repo — avoids duplicate review rows on the dashboard. */
export function latestPendingByRepo(scans: Scan[]): Scan[] {
  const seen = new Set<string>()
  const result: Scan[] = []
  for (const scan of scans) {
    if (scan.status !== 'awaiting_approval') continue
    const repoId = scan.repository?.id
    if (!repoId || seen.has(repoId)) continue
    seen.add(repoId)
    result.push(scan)
  }
  return result
}

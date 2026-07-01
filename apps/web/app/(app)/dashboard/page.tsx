'use client'

import { useQueries, useQuery } from '@tanstack/react-query'
import { scansApi, reposApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ScanCard } from '@/components/scan-card'
import { PageHeader } from '@/components/page-header'
import { FirstRunChecklist } from '@/components/first-run-checklist'
import { ReadinessStrip } from '@/components/readiness-strip'
import { LedgerList, LedgerPanel } from '@/components/ledger-list'
import { RevealGroup, RevealItem } from '@/components/reveal'
import { useReadiness } from '@/lib/hooks/use-readiness'
import { draftPreviewText } from '@/lib/draft-preview'
import { latestPendingByRepo } from '@/lib/dashboard-utils'
import { copy } from '@/lib/copy'
import { cn } from '@/lib/utils'

export default function DashboardPage() {
  const { data: scansData } = useQuery({
    queryKey: ['scans'],
    queryFn: () => scansApi.list().then(r => r.data),
  })

  const { data: reposData } = useQuery({
    queryKey: ['repos'],
    queryFn: () => reposApi.list().then(r => r.data),
  })

  const scans = scansData?.data ?? []
  const repos = reposData?.data ?? []

  const { readiness, isLoading: readinessLoading } = useReadiness(scans)

  const pendingApprovals = latestPendingByRepo(scans)
  const delivered = scans.filter(s => s.status === 'delivered')

  const draftQueries = useQueries({
    queries: pendingApprovals.map(scan => ({
      queryKey: ['scan-drafts', scan.id],
      queryFn: () => scansApi.drafts(scan.id).then(r => r.data),
      staleTime: 30_000,
    })),
  })

  const previewByScanId = new Map(
    pendingApprovals.map((scan, i) => {
      const drafts = draftQueries[i]?.data?.data ?? []
      const preview = draftPreviewText(drafts)
      return [scan.id, preview] as const
    }),
  )

  const stats = [
    { label: 'Repositories', value: repos.length },
    { label: copy.totalStories, value: scans.length },
    { label: copy.needsReview, value: pendingApprovals.length, signal: true },
    { label: copy.sent, value: delivered.length },
  ]

  return (
    <div className="p-8 space-y-8 max-w-5xl">
      <PageHeader
        eyebrow="Workspace"
        title="Dashboard"
        description="What your team shipped, read back as a story."
      />

      <FirstRunChecklist repos={repos} scans={scans} />

      <ReadinessStrip readiness={readiness} isLoading={readinessLoading} />

      {pendingApprovals.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow text-signal-foreground">{copy.awaitingReview}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {pendingApprovals.length} {pendingApprovals.length === 1 ? 'story' : 'stories'} waiting for approval
              </p>
            </div>
            <Link href="/scans">
              <Button variant="outline" size="sm">View all</Button>
            </Link>
          </div>
          <RevealGroup>
            <LedgerList>
              {pendingApprovals.map(scan => (
                <RevealItem key={scan.id}>
                  <ScanCard
                    scan={scan}
                    highlight
                    preview={previewByScanId.get(scan.id)}
                  />
                </RevealItem>
              ))}
            </LedgerList>
          </RevealGroup>
        </section>
      )}

      <LedgerPanel>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border/70">
          {stats.map(s => (
            <div key={s.label} className="px-5 py-4">
              <p className="eyebrow">{s.label}</p>
              <p
                className={cn(
                  'font-display text-[2rem] leading-none font-semibold mt-3 tabular-nums',
                  s.signal && s.value > 0 && 'text-signal',
                )}
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </LedgerPanel>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="eyebrow">{copy.recentStories}</p>
          <Link href="/scans">
            <Button variant="ghost" size="sm">{copy.viewAllStories}</Button>
          </Link>
        </div>
        {scans.length === 0 ? (
          <LedgerPanel className="py-14 text-center">
            <p className="text-muted-foreground text-sm">{copy.noStoriesYet}</p>
            <Link href="/repositories">
              <Button className="mt-4" size="sm">Connect a repository</Button>
            </Link>
          </LedgerPanel>
        ) : (
          <RevealGroup>
            <LedgerList>
              {scans.slice(0, 6).map(scan => (
                <RevealItem key={scan.id}>
                  <ScanCard scan={scan} />
                </RevealItem>
              ))}
            </LedgerList>
          </RevealGroup>
        )}
      </section>
    </div>
  )
}

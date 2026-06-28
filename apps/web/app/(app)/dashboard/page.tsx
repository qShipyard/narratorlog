'use client'

import { useQuery } from '@tanstack/react-query'
import { scansApi, reposApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ScanCard } from '@/components/scan-card'
import { PageHeader } from '@/components/page-header'
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

  const pendingApprovals = scans.filter(s => s.status === 'awaiting_approval')
  const delivered = scans.filter(s => s.status === 'delivered')

  const stats = [
    { label: 'Repositories', value: repos.length },
    { label: 'Total scans', value: scans.length },
    { label: 'Awaiting review', value: pendingApprovals.length, signal: true },
    { label: 'Delivered', value: delivered.length },
  ]

  return (
    <div className="p-8 space-y-8 max-w-5xl">
      <PageHeader
        eyebrow="Workspace"
        title="Dashboard"
        description="What your team shipped, read back as a story."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 rounded-xl border bg-card overflow-hidden divide-x divide-y sm:divide-y-0 divide-border">
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

      {pendingApprovals.length > 0 && (
        <section className="space-y-3">
          <p className="eyebrow">Awaiting your approval</p>
          <div className="rail">
            {pendingApprovals.map(scan => (
              <ScanCard key={scan.id} scan={scan} highlight />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Recent scans</p>
          <Link href="/scans">
            <Button variant="ghost" size="sm">View all</Button>
          </Link>
        </div>
        {scans.length === 0 ? (
          <div className="rounded-xl border bg-card py-14 text-center">
            <p className="text-muted-foreground text-sm">
              No scans yet. Connect a repository to begin the story.
            </p>
            <Link href="/repositories">
              <Button className="mt-4" size="sm">Connect a repository</Button>
            </Link>
          </div>
        ) : (
          <div className="rail">
            {scans.slice(0, 6).map(scan => (
              <ScanCard key={scan.id} scan={scan} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
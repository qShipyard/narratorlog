'use client'

import { Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { scansApi, reposApi } from '@/lib/api'
import { ScanCard } from '@/components/scan-card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LedgerList, LedgerPanel } from '@/components/ledger-list'
import { RevealGroup, RevealItem } from '@/components/reveal'
import { useScanTrigger } from '@/lib/hooks/use-scan-trigger'
import { useReadiness } from '@/lib/hooks/use-readiness'
import { copy } from '@/lib/copy'
import { toast } from 'sonner'

function ScansContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const repoFilter = searchParams.get('repo') ?? 'all'

  const trigger = useScanTrigger()

  const { data: scansData } = useQuery({
    queryKey: ['scans', repoFilter],
    queryFn: () => scansApi.list(repoFilter !== 'all' ? { repo_id: repoFilter } : {}).then(r => r.data),
  })

  const { data: reposData } = useQuery({
    queryKey: ['repos'],
    queryFn: () => reposApi.list().then(r => r.data),
  })

  const scans = scansData?.data ?? []
  const repos = reposData?.data ?? []
  const { readiness } = useReadiness(scans)

  function setRepoFilter(value: string) {
    const params = new URLSearchParams(searchParams)
    if (value === 'all') params.delete('repo')
    else params.set('repo', value)
    const query = params.toString()
    router.replace(query ? `/scans?${query}` : '/scans')
  }

  function handleTriggerStory() {
    if (repoFilter === 'all') {
      toast.error(copy.selectRepoToRun)
      return
    }
    if (!readiness.canRunStory) {
      const blocker = readiness.runStoryBlocker
      toast.error(
        blocker ? `${blocker.label} isn't set up yet.` : "Story can't run until setup is complete.",
        {
          action: blocker?.fixHref
            ? { label: blocker.fixLabel ?? 'Fix', onClick: () => router.push(blocker.fixHref!) }
            : undefined,
        },
      )
      return
    }
    trigger.mutate({ repository_id: repoFilter })
  }

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <PageHeader
        eyebrow="Pipeline"
        title={copy.stories}
        description="Every story run, newest first."
        action={
          <Button onClick={handleTriggerStory} disabled={trigger.isPending}>
            {trigger.isPending ? 'Queuing…' : copy.runStory}
          </Button>
        }
      />

      <Select value={repoFilter} onValueChange={setRepoFilter}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="All repositories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All repositories</SelectItem>
          {repos.map(r => (
            <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {scans.length === 0 ? (
        <LedgerPanel className="py-14 text-center">
          <p className="text-muted-foreground text-sm">{copy.noStoriesRun}</p>
        </LedgerPanel>
      ) : (
        <RevealGroup>
          <LedgerList>
            {scans.map(scan => (
              <RevealItem key={scan.id}>
                <ScanCard scan={scan} highlight={scan.status === 'awaiting_approval'} />
              </RevealItem>
            ))}
          </LedgerList>
        </RevealGroup>
      )}
    </div>
  )
}

export default function ScansPage() {
  return (
    <Suspense>
      <ScansContent />
    </Suspense>
  )
}

'use client'

import { Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { scansApi, reposApi } from '@/lib/api'
import { ScanCard } from '@/components/scan-card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RevealGroup, RevealItem } from '@/components/reveal'
import { useScanTrigger } from '@/lib/hooks/use-scan-trigger'
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

  function setRepoFilter(value: string) {
    const params = new URLSearchParams(searchParams)
    if (value === 'all') params.delete('repo')
    else params.set('repo', value)
    const query = params.toString()
    router.replace(query ? `/scans?${query}` : '/scans')
  }

  function handleTriggerScan() {
    if (repoFilter === 'all') {
      toast.error('Select a repository to run a scan.')
      return
    }
    trigger.mutate({ repository_id: repoFilter })
  }

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <PageHeader
        eyebrow="Pipeline"
        title="Scans"
        description="Every pipeline run, newest first."
        action={
          <Button onClick={handleTriggerScan} disabled={trigger.isPending}>
            {trigger.isPending ? 'Queuing…' : 'Run scan'}
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
        <div className="rounded-xl border bg-card py-14 text-center">
          <p className="text-muted-foreground text-sm">
            No scans yet. Run one to read back what shipped.
          </p>
        </div>
      ) : (
        <RevealGroup className="rail">
          {scans.map(scan => (
            <RevealItem key={scan.id}>
              <ScanCard scan={scan} highlight={scan.status === 'awaiting_approval'} />
            </RevealItem>
          ))}
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

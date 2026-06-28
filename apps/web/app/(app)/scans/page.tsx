'use client'

import { useQuery } from '@tanstack/react-query'
import { scansApi, reposApi } from '@/lib/api'
import { ScanCard } from '@/components/scan-card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useState } from 'react'
import { toast } from 'sonner'

export default function ScansPage() {
  const [repoFilter, setRepoFilter] = useState<string>('all')

  const { data: scansData, refetch } = useQuery({
    queryKey: ['scans', repoFilter],
    queryFn: () => scansApi.list(repoFilter !== 'all' ? { repo_id: repoFilter } : {}).then(r => r.data),
  })

  const { data: reposData } = useQuery({
    queryKey: ['repos'],
    queryFn: () => reposApi.list().then(r => r.data),
  })

  const scans = scansData?.data ?? []
  const repos = reposData?.data ?? []

  async function handleTriggerScan() {
    if (repoFilter === 'all') {
      toast.error('Select a repository to trigger a scan.')
      return
    }
    try {
      await scansApi.trigger({ repository_id: repoFilter, lookback: '7d' })
      toast.success('Scan queued.')
      refetch()
    } catch {
      toast.error('Failed to trigger scan.')
    }
  }

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <PageHeader
        eyebrow="Pipeline"
        title="Scans"
        description="Every pipeline run, newest first."
        action={<Button onClick={handleTriggerScan}>Run scan</Button>}
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
            No scans yet. Trigger one to read back what shipped.
          </p>
        </div>
      ) : (
        <div className="rail">
          {scans.map(scan => (
            <ScanCard key={scan.id} scan={scan} highlight={scan.status === 'awaiting_approval'} />
          ))}
        </div>
      )}
    </div>
  )
}
'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { reposApi, scansApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { SignalMark } from '@/components/signal-mark'
import { LedgerList, LedgerPanel } from '@/components/ledger-list'
import { RevealGroup, RevealItem } from '@/components/reveal'
import { ConnectRepoDialog } from '@/components/repositories/connect-repo-dialog'
import { isLiveStatus } from '@/components/pipeline-timeline'
import { useScanTrigger } from '@/lib/hooks/use-scan-trigger'
import { getRepoStoryStatusLabel } from '@/lib/status-labels'
import { copy } from '@/lib/copy'
import { GitBranch, ExternalLink, Plus } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { repoScheduleLabel } from '@/lib/repo-schedule'
import { Repository, Scan } from '@/lib/api'

function StatusDot({ scan }: { scan?: Scan }) {
  if (scan && isLiveStatus(scan.status)) return <SignalMark state="live" />
  const tone =
    scan?.status === 'awaiting_approval' ? 'bg-signal'
    : scan?.status === 'failed' || scan?.status === 'cancelled' ? 'bg-destructive'
    : scan?.status === 'delivered' || scan?.status === 'approved' ? 'bg-emerald-500'
    : 'bg-rail'
  return <span className={cn('block size-2.5 rounded-full', tone)} />
}

function RepoRow({ repo, latest }: { repo: Repository; latest?: Scan }) {
  const trigger = useScanTrigger()
  const live = latest ? isLiveStatus(latest.status) : false
  const needsReview = latest?.status === 'awaiting_approval'
  const pending = trigger.isPending && trigger.variables?.repository_id === repo.id

  return (
    <div className="group flex items-center gap-4 px-5 py-4 hover:bg-muted/40 transition-colors">
      <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[0.8rem] font-bold truncate">{repo.full_name}</span>
          <span className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground rounded bg-muted px-1.5 py-0.5">
            {repo.provider}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 font-mono">
          {repo.default_branch}
          {' · '}
          {repoScheduleLabel(repo.config)}
          {repo.last_scanned_at && (
            <>
              {' · '}
              <Link href={`/scans?repo=${repo.id}`} className="hover:text-foreground hover:underline">
                scanned {new Date(repo.last_scanned_at).toLocaleDateString()}
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="flex items-center gap-2">
          <StatusDot scan={latest} />
          <span className={cn(
            'font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em]',
            needsReview ? 'text-signal-foreground'
            : live ? 'text-primary'
            : 'text-muted-foreground',
          )}>
            {getRepoStoryStatusLabel(latest)}
          </span>
        </span>

        {needsReview ? (
          <Link href={`/scans/${latest!.id}/review`}>
            <Button size="sm">Review</Button>
          </Link>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={pending || live}
            onClick={() => trigger.mutate({ repository_id: repo.id })}
          >
            {pending ? 'Queuing…' : live ? copy.working : copy.runStory}
          </Button>
        )}

        <Link href={`/scans?repo=${repo.id}`}>
          <Button variant="ghost" size="sm" className="opacity-60 group-hover:opacity-100">
            {copy.viewStories}
          </Button>
        </Link>

        <a
          href={repo.url}
          target="_blank"
          rel="noopener noreferrer"
          className="opacity-50 group-hover:opacity-100 transition-opacity"
        >
          <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
        </a>
      </div>
    </div>
  )
}

export default function RepositoriesPage() {
  const queryClient = useQueryClient()
  const [showConnectDialog, setShowConnectDialog] = useState(false)

  const { data: reposData, isLoading } = useQuery({
    queryKey: ['repos'],
    queryFn: () => reposApi.list().then(r => r.data),
  })

  const { data: scansData } = useQuery({
    queryKey: ['scans'],
    queryFn: () => scansApi.list().then(r => r.data),
  })

  const repos = reposData?.data ?? []
  const scans = scansData?.data ?? []

  const latestByRepo = new Map<string, Scan>()
  for (const s of scans) {
    if (s.repository && !latestByRepo.has(s.repository.id)) latestByRepo.set(s.repository.id, s)
  }

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <PageHeader
        eyebrow="Sources"
        title="Repositories"
        description="The repositories narratorlog reads and turns into changelogs."
        action={
          <Button onClick={() => setShowConnectDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Connect repository
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <SignalMark state="loading" /> Loading repositories…
        </div>
      ) : repos.length === 0 ? (
        <LedgerPanel className="py-14 text-center space-y-4">
          <GitBranch className="h-7 w-7 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground text-sm">No repositories connected yet.</p>
          <Button onClick={() => setShowConnectDialog(true)}>
            Connect your first repository
          </Button>
        </LedgerPanel>
      ) : (
        <RevealGroup>
          <LedgerList>
            {repos.map(repo => (
              <RevealItem key={repo.id}>
                <RepoRow repo={repo} latest={latestByRepo.get(repo.id)} />
              </RevealItem>
            ))}
          </LedgerList>
        </RevealGroup>
      )}

      <ConnectRepoDialog
        open={showConnectDialog}
        onClose={() => setShowConnectDialog(false)}
        onConnected={() => {
          queryClient.invalidateQueries({ queryKey: ['repos'] })
          setShowConnectDialog(false)
        }}
      />
    </div>
  )
}

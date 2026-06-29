'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  reposApi,
  teamApi,
  scansApi,
  configViewToUpdate,
  AvailableRepo,
  Repository,
  Scan,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/page-header'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { KeyField, KeyGuideId } from '@/components/key-field'
import { SignalMark } from '@/components/signal-mark'
import { RevealGroup, RevealItem } from '@/components/reveal'
import { isLiveStatus } from '@/components/pipeline-timeline'
import { useScanTrigger } from '@/lib/hooks/use-scan-trigger'
import { GitBranch, ExternalLink, Plus, Lock, Globe, Check, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const PROVIDERS = [
  { id: 'github', label: 'GitHub' },
  { id: 'gitlab', label: 'GitLab' },
  { id: 'bitbucket', label: 'Bitbucket' },
] as const

function statusLabel(scan?: Scan): string {
  if (!scan) return 'Never scanned'
  if (isLiveStatus(scan.status)) return 'Scanning'
  switch (scan.status) {
    case 'awaiting_approval': return 'Needs review'
    case 'approved': return 'Approved'
    case 'delivered': return 'Delivered'
    case 'failed': return 'Last scan failed'
    case 'cancelled': return 'Cancelled'
    case 'pending': return 'Queued'
    default: return 'Idle'
  }
}

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
    <div className="group flex items-center gap-4 px-5 py-4">
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
            {statusLabel(latest)}
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
            {pending ? 'Queuing…' : live ? 'Scanning…' : 'Run scan'}
          </Button>
        )}

        <Link href={`/scans?repo=${repo.id}`}>
          <Button variant="ghost" size="sm" className="opacity-60 group-hover:opacity-100">
            Scans
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

  // Latest scan per repo — the list is newest-first, so the first match wins.
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
        <div className="rounded-xl border bg-card py-14 text-center space-y-4">
          <GitBranch className="h-7 w-7 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground text-sm">No repositories connected yet.</p>
          <Button onClick={() => setShowConnectDialog(true)}>
            Connect your first repository
          </Button>
        </div>
      ) : (
        <RevealGroup className="rounded-xl border bg-card divide-y divide-border overflow-hidden">
          {repos.map(repo => (
            <RevealItem key={repo.id}>
              <RepoRow repo={repo} latest={latestByRepo.get(repo.id)} />
            </RevealItem>
          ))}
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

function ConnectRepoDialog({
  open,
  onClose,
  onConnected,
}: {
  open: boolean
  onClose: () => void
  onConnected: () => void
}) {
  const [step, setStep] = useState<'platform' | 'repos'>('platform')
  const [provider, setProvider] = useState<'github' | 'gitlab' | 'bitbucket'>('github')
  const [searchQuery, setSearchQuery] = useState('')

  const handleClose = () => {
    setStep('platform')
    setProvider('github')
    setSearchQuery('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect a repository</DialogTitle>
        </DialogHeader>

        {step === 'platform' && (
          <PlatformStep
            onSelectProvider={(p) => {
              setProvider(p)
              setStep('repos')
            }}
          />
        )}

        {step === 'repos' && (
          <RepoListStep
            provider={provider}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onConnected={onConnected}
            onBack={() => setStep('platform')}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PlatformStep({
  onSelectProvider,
}: {
  onSelectProvider: (provider: 'github' | 'gitlab' | 'bitbucket') => void
}) {
  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: () => teamApi.getSources().then((r) => r.data),
  })

  return (
    <div className="space-y-2 py-2 min-w-0">
      <p className="text-sm text-muted-foreground">
        Connect a platform with a token, then pick a repository — all here.
      </p>
      {PROVIDERS.map((p) => (
        <ProviderRow
          key={p.id}
          provider={p.id}
          label={p.label}
          connected={sources?.[p.id]?.token_set === true}
          onSelectProvider={() => onSelectProvider(p.id)}
        />
      ))}
    </div>
  )
}

function ProviderRow({
  provider,
  label,
  connected,
  onSelectProvider,
}: {
  provider: 'github' | 'gitlab' | 'bitbucket'
  label: string
  connected: boolean
  onSelectProvider: () => void
}) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState('')
  const [baseUrl, setBaseUrl] = useState('')

  const connect = useMutation({
    mutationFn: async () => {
      const cfg = (await teamApi.getConfig()).data
      const update = configViewToUpdate(cfg)
      update.sources[provider] = { token, base_url: baseUrl }
      return teamApi.updateConfig(update)
    },
    onSuccess: () => {
      toast.success(`${label} connected.`)
      qc.invalidateQueries({ queryKey: ['sources'] })
      qc.invalidateQueries({ queryKey: ['team-config'] })
      onSelectProvider()
    },
    onError: () => toast.error('Could not connect. Check the token and try again.'),
  })

  if (connected) {
    return (
      <button
        onClick={onSelectProvider}
        className="w-full flex items-center gap-3 p-4 rounded-lg border hover:bg-muted transition-colors text-left"
      >
        <GitBranch className="h-5 w-5" />
        <div className="flex-1">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">Select a repository to connect</p>
        </div>
        <span className="inline-flex items-center gap-1 font-mono text-[0.6rem] font-bold uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5" /> Connected
        </span>
      </button>
    )
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 hover:bg-muted transition-colors text-left"
      >
        <GitBranch className="h-5 w-5" />
        <div className="flex-1">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">Add a token to connect</p>
        </div>
        <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-90')} />
      </button>

      {open && (
        <div className="border-t bg-muted/30 p-4 space-y-3">
          <KeyField
            guideId={provider as KeyGuideId}
            value={token}
            onChange={setToken}
          />
          {(provider === 'github' || provider === 'gitlab') && (
            <div className="space-y-1.5">
              <Label className="text-xs">Base URL (optional)</Label>
              <Input
                placeholder={
                  provider === 'github'
                    ? 'https://github.example.com — Enterprise'
                    : 'https://gitlab.example.com — self-hosted'
                }
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
          )}
          <Button
            size="sm"
            className="w-full"
            disabled={!token.trim() || connect.isPending}
            onClick={() => connect.mutate()}
          >
            {connect.isPending ? 'Connecting…' : `Connect ${label}`}
          </Button>
        </div>
      )}
    </div>
  )
}

function RepoListStep({
  provider,
  searchQuery,
  onSearchChange,
  onConnected,
  onBack,
}: {
  provider: 'github' | 'gitlab' | 'bitbucket'
  searchQuery: string
  onSearchChange: (q: string) => void
  onConnected: () => void
  onBack: () => void
}) {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['available-repos', provider],
    queryFn: () => reposApi.available(provider).then(r => r.data),
  })

  const repos = data?.data ?? []

  const filtered = repos.filter(r =>
    r.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const connectMutation = useMutation({
    mutationFn: (repo: AvailableRepo) =>
      reposApi.connect({
        provider,
        provider_id: repo.provider_id,
        full_name: repo.full_name,
        url: repo.url,
        default_branch: repo.default_branch,
      }),
    onSuccess: (_, repo) => {
      toast.success(`${repo.full_name} connected.`)
      queryClient.invalidateQueries({ queryKey: ['repos'] })
      onConnected()
    },
    onError: () => toast.error('Failed to connect repository.'),
  })

  const providerLabel = provider === 'gitlab' ? 'GitLab' : provider === 'bitbucket' ? 'Bitbucket' : 'GitHub'

  if (error) {
    return (
      <div className="py-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          {providerLabel} not connected yet.
        </p>
        <Button variant="outline" size="sm" onClick={onBack}>
          Connect {providerLabel}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3 min-w-0">
      <input
        type="text"
        placeholder="Search repositories..."
        value={searchQuery}
        onChange={e => onSearchChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
      />

      <div className="max-h-80 overflow-y-auto space-y-1 min-w-0">
        {isLoading ? (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-4">
            <SignalMark state="loading" /> Loading repositories…
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No repositories found.
          </p>
        ) : (
          filtered.map(repo => (
            <div
              key={repo.provider_id}
              className="flex items-center gap-3 p-3 rounded-md hover:bg-muted transition-colors"
            >
              {repo.private
                ? <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                : <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[0.8rem] font-bold truncate">{repo.full_name}</p>
                <p className="font-mono text-xs text-muted-foreground">{repo.default_branch}</p>
              </div>
              {repo.already_connected ? (
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Check className="h-3.5 w-3.5" />
                  Connected
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={connectMutation.isPending}
                  onClick={() => connectMutation.mutate(repo)}
                >
                  Connect
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="border-t pt-3 flex justify-between items-center">
        <button
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
        <p className="text-xs text-muted-foreground">
          {repos.length} repositories found
        </p>
      </div>
    </div>
  )
}

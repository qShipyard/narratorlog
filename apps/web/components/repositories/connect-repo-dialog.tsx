'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  reposApi,
  teamApi,
  configViewToUpdate,
  AvailableRepo,
  Repository,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { KeyField, KeyGuideId } from '@/components/key-field'
import { SignalMark } from '@/components/signal-mark'
import { GIT_PROVIDERS, GitProvider } from '@/lib/team-config-constants'
import { GitBranch, Lock, Globe, Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const PROVIDER_LABELS: Record<GitProvider, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
}

export function ConnectRepoDialog({
  open,
  onClose,
  onConnected,
}: {
  open: boolean
  onClose: () => void
  onConnected: (repo?: Repository) => void
}) {
  const [step, setStep] = useState<'platform' | 'repos'>('platform')
  const [provider, setProvider] = useState<GitProvider>('github')
  const [searchQuery, setSearchQuery] = useState('')

  function handleClose() {
    setStep('platform')
    setProvider('github')
    setSearchQuery('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect a repository</DialogTitle>
        </DialogHeader>

        {step === 'platform' && (
          <PlatformStep
            onSelectProvider={p => {
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
            onConnected={repo => {
              handleClose()
              onConnected(repo)
            }}
            onBack={() => setStep('platform')}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PlatformStep({ onSelectProvider }: { onSelectProvider: (p: GitProvider) => void }) {
  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: () => teamApi.getSources().then(r => r.data),
  })

  return (
    <div className="space-y-2 py-2 min-w-0">
      <p className="text-sm text-muted-foreground">
        Connect a platform with a token, then pick a repository.
      </p>
      {GIT_PROVIDERS.map(id => (
        <ProviderRow
          key={id}
          provider={id}
          label={PROVIDER_LABELS[id]}
          connected={sources?.[id]?.token_set === true}
          onSelectProvider={() => onSelectProvider(id)}
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
  provider: GitProvider
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
        type="button"
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
        type="button"
        onClick={() => setOpen(o => !o)}
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
          <KeyField guideId={provider as KeyGuideId} value={token} onChange={setToken} />
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
                onChange={e => setBaseUrl(e.target.value)}
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
  provider: GitProvider
  searchQuery: string
  onSearchChange: (q: string) => void
  onConnected: (repo: Repository) => void
  onBack: () => void
}) {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['available-repos', provider],
    queryFn: () => reposApi.available(provider).then(r => r.data),
  })

  const repos = data?.data ?? []
  const filtered = repos.filter(r =>
    r.full_name.toLowerCase().includes(searchQuery.toLowerCase()),
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
    onSuccess: res => {
      toast.success(`${res.data.full_name} connected.`)
      queryClient.invalidateQueries({ queryKey: ['repos'] })
      onConnected(res.data)
    },
    onError: () => toast.error('Failed to connect repository.'),
  })

  const providerLabel = PROVIDER_LABELS[provider]

  if (error) {
    return (
      <div className="py-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">{providerLabel} not connected yet.</p>
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
          <p className="text-sm text-muted-foreground py-4 text-center">No repositories found.</p>
        ) : (
          filtered.map(repo => (
            <div
              key={repo.provider_id}
              className="flex items-center gap-3 p-3 rounded-md hover:bg-muted transition-colors"
            >
              {repo.private ? (
                <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
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
        <button type="button" onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground">
          ← Back
        </button>
        <p className="text-xs text-muted-foreground">{repos.length} repositories found</p>
      </div>
    </div>
  )
}

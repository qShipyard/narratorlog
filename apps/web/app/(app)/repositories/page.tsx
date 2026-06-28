'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { reposApi, teamApi, AvailableRepo } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { GitBranch, ExternalLink, Plus, Lock, Globe, Check } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

export default function RepositoriesPage() {
  const queryClient = useQueryClient()
  const [showConnectDialog, setShowConnectDialog] = useState(false)

  const { data: reposData, isLoading } = useQuery({
    queryKey: ['repos'],
    queryFn: () => reposApi.list().then(r => r.data),
  })

  const repos = reposData?.data ?? []

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
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : repos.length === 0 ? (
        <div className="rounded-xl border bg-card py-14 text-center space-y-4">
          <GitBranch className="h-7 w-7 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground text-sm">No repositories connected yet.</p>
          <Button onClick={() => setShowConnectDialog(true)}>
            Connect your first repository
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-card divide-y divide-border overflow-hidden">
          {repos.map(repo => (
            <div key={repo.id} className="group flex items-center gap-4 px-5 py-4">
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
                    ` · scanned ${new Date(repo.last_scanned_at).toLocaleDateString()}`
                  )}
                </p>
              </div>
              <a href={repo.url} target="_blank" rel="noopener noreferrer" className="opacity-50 group-hover:opacity-100 transition-opacity">
                <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </a>
            </div>
          ))}
        </div>
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

  // Reset on close
  const handleClose = () => {
    setStep('platform')
    setProvider('github')
    setSearchQuery('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect a repository</DialogTitle>
        </DialogHeader>

        {step === 'platform' && (
          <PlatformStep
            onAlreadyConnected={(p) => {
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
  onAlreadyConnected,
}: {
  onAlreadyConnected: (provider: 'github' | 'gitlab' | 'bitbucket') => void
}) {
  const { data: sources, isLoading } = useQuery({
    queryKey: ['sources'],
    queryFn: () => teamApi.getSources().then((r) => r.data),
  })

  const githubConnected = sources?.github?.token_set === true
  const gitlabConnected = sources?.gitlab?.token_set === true
  const bitbucketConnected = sources?.bitbucket?.token_set === true

  return (
    <div className="space-y-4 py-2">
      <p className="text-sm text-muted-foreground">
        Choose a platform to connect.
      </p>

      <div className="space-y-2">
        {githubConnected ? (
          <button
            onClick={() => onAlreadyConnected('github')}
            disabled={isLoading}
            className="w-full flex items-center gap-3 p-4 rounded-lg border hover:bg-muted transition-colors text-left"
          >
            <GitBranch className="h-5 w-5" />
            <div>
              <p className="text-sm font-medium">GitHub</p>
              <p className="text-xs text-muted-foreground">Select a repository to connect</p>
            </div>
          </button>
        ) : (
          <a
            href="/settings"
            className="w-full flex items-center gap-3 p-4 rounded-lg border hover:bg-muted transition-colors text-left"
          >
            <GitBranch className="h-5 w-5" />
            <div>
              <p className="text-sm font-medium">GitHub</p>
              <p className="text-xs text-muted-foreground">
                {isLoading ? 'Checking…' : 'Connect in Settings → Sources'}
              </p>
            </div>
          </a>
        )}

        {gitlabConnected ? (
          <button
            onClick={() => onAlreadyConnected('gitlab')}
            disabled={isLoading}
            className="w-full flex items-center gap-3 p-4 rounded-lg border hover:bg-muted transition-colors text-left"
          >
            <GitBranch className="h-5 w-5" />
            <div>
              <p className="text-sm font-medium">GitLab</p>
              <p className="text-xs text-muted-foreground">Select a repository to connect</p>
            </div>
          </button>
        ) : (
          <a
            href="/settings"
            className="w-full flex items-center gap-3 p-4 rounded-lg border hover:bg-muted transition-colors text-left"
          >
            <GitBranch className="h-5 w-5" />
            <div>
              <p className="text-sm font-medium">GitLab</p>
              <p className="text-xs text-muted-foreground">
                {isLoading ? 'Checking…' : 'Connect in Settings → Sources'}
              </p>
            </div>
          </a>
        )}

        {bitbucketConnected ? (
          <button
            onClick={() => onAlreadyConnected('bitbucket')}
            disabled={isLoading}
            className="w-full flex items-center gap-3 p-4 rounded-lg border hover:bg-muted transition-colors text-left"
          >
            <GitBranch className="h-5 w-5" />
            <div>
              <p className="text-sm font-medium">Bitbucket</p>
              <p className="text-xs text-muted-foreground">Select a repository to connect</p>
            </div>
          </button>
        ) : (
          <a
            href="/settings"
            className="w-full flex items-center gap-3 p-4 rounded-lg border hover:bg-muted transition-colors text-left"
          >
            <GitBranch className="h-5 w-5" />
            <div>
              <p className="text-sm font-medium">Bitbucket</p>
              <p className="text-xs text-muted-foreground">
                {isLoading ? 'Checking…' : 'Connect in Settings → Sources'}
              </p>
            </div>
          </a>
        )}
      </div>
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

  const providerLabel = provider === 'gitlab' ? 'GitLab' : 'GitHub'

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
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Search repositories..."
        value={searchQuery}
        onChange={e => onSearchChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
      />

      <div className="max-h-80 overflow-y-auto space-y-1">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Loading repositories...
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
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5" />
                  Connected
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
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
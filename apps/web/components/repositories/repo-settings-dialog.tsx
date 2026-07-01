'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { reposApi, Repository } from '@/lib/api'
import { CADENCE_OPTIONS, RepoCadence, repoCadence } from '@/lib/repo-schedule'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SignalMark } from '@/components/signal-mark'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function RepoSettingsDialog({
  open,
  repo,
  onClose,
}: {
  open: boolean
  repo: Repository
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [cadence, setCadence] = useState<RepoCadence>(repoCadence(repo.config))
  const [selected, setSelected] = useState<string[]>(repo.config?.base_branches ?? [])

  const { data, isLoading, error } = useQuery({
    queryKey: ['repo-branches', repo.id],
    queryFn: () => reposApi.branches(repo.id).then(r => r.data),
    enabled: open,
  })
  const branches = data?.data ?? []

  const save = useMutation({
    mutationFn: () => reposApi.update(repo.id, { cadence, base_branches: selected }),
    onSuccess: () => {
      toast.success('Settings saved.')
      qc.invalidateQueries({ queryKey: ['repos'] })
      onClose()
    },
    onError: () => toast.error('Could not save settings.'),
  })

  function toggle(branch: string) {
    setSelected(prev =>
      prev.includes(branch) ? prev.filter(b => b !== branch) : [...prev, branch],
    )
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">{repo.full_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label className="text-xs">Scan cadence</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {CADENCE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCadence(opt.value)}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-xs transition-colors',
                    cadence === opt.value ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-muted',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Push and merged-PR webhooks always run automatically, regardless of cadence.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Base branches</Label>
            <p className="text-xs text-muted-foreground">
              Only narrate PRs merged into these branches. None selected = all branches.
            </p>
            {isLoading ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <SignalMark state="loading" /> Loading branches…
              </p>
            ) : error ? (
              <p className="text-xs text-destructive">Could not load branches from the provider.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
                {branches.map(branch => (
                  <label
                    key={branch}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(branch)}
                      onChange={() => toggle(branch)}
                    />
                    <span className="font-mono text-xs">{branch}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

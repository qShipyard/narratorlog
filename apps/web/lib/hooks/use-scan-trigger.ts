'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { scansApi, Repository, TeamConfigView } from '@/lib/api'
import { copy } from '@/lib/copy'
import { computeReadiness } from '@/lib/readiness'

function readinessFromCache(
  qc: ReturnType<typeof useQueryClient>,
): ReturnType<typeof computeReadiness> {
  const config = qc.getQueryData<TeamConfigView>(['team-config'])
  const repos = qc.getQueryData<{ data: Repository[] }>(['repos'])?.data ?? []
  return computeReadiness(config, repos)
}

export function useScanTrigger() {
  const qc = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: (vars: { repository_id: string; lookback?: string }) => {
      const readiness = readinessFromCache(qc)
      if (!readiness.canRunStory) {
        const blocker = readiness.runStoryBlocker
        const message = blocker
          ? `${blocker.label} isn't set up yet.`
          : "Story can't run until setup is complete."
        toast.error(message, {
          action: blocker?.fixHref
            ? {
                label: blocker.fixLabel ?? 'Fix',
                onClick: () => router.push(blocker.fixHref!),
              }
            : undefined,
        })
        return Promise.reject(new Error('readiness_blocked'))
      }
      return scansApi.trigger({ lookback: '7d', ...vars })
    },
    onSuccess: () => {
      toast.success(copy.storyQueued)
      qc.invalidateQueries({ queryKey: ['scans'] })
      qc.invalidateQueries({ queryKey: ['repos'] })
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.message === 'readiness_blocked') return
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? copy.storyFailed
      toast.error(message)
    },
  })
}

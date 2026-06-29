'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { scansApi } from '@/lib/api'

// Triggers a scan and refreshes both the scans and repositories views, so a run
// started from either page lights up the other.
export function useScanTrigger() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { repository_id: string; lookback?: string }) =>
      scansApi.trigger({ lookback: '7d', ...vars }),
    onSuccess: () => {
      toast.success('Scan queued.')
      qc.invalidateQueries({ queryKey: ['scans'] })
      qc.invalidateQueries({ queryKey: ['repos'] })
    },
    onError: () => toast.error('Failed to trigger scan.'),
  })
}

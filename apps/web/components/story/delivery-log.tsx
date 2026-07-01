'use client'

import { useQuery } from '@tanstack/react-query'
import { scansApi, ScanDelivery, ScanStatus } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { isAxiosError } from 'axios'

function statusLabel(status: ScanDelivery['status']) {
  switch (status) {
    case 'success': return 'Sent'
    case 'failed': return 'Failed'
    default: return 'Pending'
  }
}

export function DeliveryLog({
  scanId,
  status,
}: {
  scanId: string
  status?: ScanStatus
}) {
  const [open, setOpen] = useState(true)
  const show = status === 'delivering' || status === 'delivered'

  const { data, isError } = useQuery({
    queryKey: ['scan-deliveries', scanId],
    queryFn: async () => {
      try {
        return (await scansApi.deliveries(scanId)).data
      } catch (err) {
        if (isAxiosError(err) && err.response?.status === 404) return { data: [] as ScanDelivery[] }
        throw err
      }
    },
    enabled: show,
    refetchInterval: status === 'delivering' ? 3000 : false,
    retry: false,
  })

  if (!show || isError) return null

  const deliveries = data?.data ?? []
  if (deliveries.length === 0 && status !== 'delivering') return null

  return (
    <div className="rounded-xl border bg-card/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="eyebrow">Delivery log</span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="border-t divide-y divide-border">
          {deliveries.length === 0 ? (
            <li className="px-5 py-4 text-sm text-muted-foreground">Sending to your channels…</li>
          ) : (
            deliveries.map(d => (
              <li key={d.id} className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
                <div className="min-w-0">
                  <p className="font-medium capitalize">{d.audience_id}</p>
                  <p className="font-mono text-xs text-muted-foreground truncate">{d.output_plugin}</p>
                </div>
                <span
                  className={cn(
                    'font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] shrink-0',
                    d.status === 'success' && 'text-emerald-400',
                    d.status === 'failed' && 'text-destructive',
                    d.status === 'pending' && 'text-muted-foreground',
                  )}
                >
                  {statusLabel(d.status)}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

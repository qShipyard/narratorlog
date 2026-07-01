'use client'

import { useState } from 'react'
import { ScanStatus } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { PipelineTimeline, isLiveStatus } from '@/components/pipeline-timeline'
import { getStoryStatusLabel, COLLAPSED_LIVE_LABEL } from '@/lib/status-labels'
import { cn } from '@/lib/utils'

const STAGE_COUNT = 8

function progressPercent(status: ScanStatus): number {
  const index: Record<ScanStatus, number> = {
    pending: 0,
    running: 0,
    filtering: 0,
    enriching: 1,
    reading_context: 2,
    chunking: 3,
    summarizing: 4,
    awaiting_approval: 5,
    approved: 5,
    delivering: 6,
    delivered: 7,
    failed: -1,
    cancelled: -1,
  }
  const current = index[status]
  if (current < 0) return 0
  if (status === 'delivered') return 100
  return Math.round(((current + 1) / STAGE_COUNT) * 100)
}

function collapsedLabel(status: ScanStatus): string {
  if (status === 'failed' || status === 'cancelled') return getStoryStatusLabel(status)
  if (isLiveStatus(status)) return COLLAPSED_LIVE_LABEL
  return getStoryStatusLabel(status)
}

export function PipelinePanel({ status }: { status: ScanStatus }) {
  const [expanded, setExpanded] = useState(
    status === 'failed' || status === 'cancelled',
  )
  const failed = status === 'failed' || status === 'cancelled'
  const percent = progressPercent(status)

  if (!expanded) {
    return (
      <div className="rounded-xl border bg-card/60 px-5 py-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-sm font-medium">{collapsedLabel(status)}</p>
            <div className="h-1 rounded-full bg-rail overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  failed ? 'bg-destructive' : 'bg-primary',
                  isLiveStatus(status) && 'bg-signal',
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setExpanded(true)}>
            Show details
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card/60 px-5 py-4 space-y-3">
      <PipelineTimeline status={status} />
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setExpanded(false)}>
          Hide details
        </Button>
      </div>
    </div>
  )
}

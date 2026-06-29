import { ScanStatus } from '@/lib/api'
import { cn } from '@/lib/utils'

const STAGES = [
  { key: 'filtering', label: 'Filter' },
  { key: 'enriching', label: 'Enrich' },
  { key: 'reading_context', label: 'Read' },
  { key: 'chunking', label: 'Chunk' },
  { key: 'summarizing', label: 'Narrate' },
  { key: 'awaiting_approval', label: 'Review' },
  { key: 'delivering', label: 'Deliver' },
  { key: 'delivered', label: 'Delivered' },
] as const

const STATUS_INDEX: Record<ScanStatus, number> = {
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

const LIVE: ScanStatus[] = [
  'running', 'filtering', 'enriching', 'reading_context', 'chunking', 'summarizing', 'delivering',
]

export function isLiveStatus(status: ScanStatus) {
  return LIVE.includes(status)
}

export function PipelineTimeline({ status }: { status: ScanStatus }) {
  const failed = status === 'failed' || status === 'cancelled'
  const current = STATUS_INDEX[status]
  const live = isLiveStatus(status)
  const allDone = status === 'delivered'

  return (
    <div className="flex items-start">
      {STAGES.map((stage, i) => {
        const done = allDone || i < current
        const active = !allDone && !failed && i === current
        const connectorDone = i < current
        const connectorLive = live && i === current - 1

        return (
          <div key={stage.key} className="flex items-start flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-2 shrink-0">
              <span
                className={cn(
                  'size-2.5 rounded-full transition-colors',
                  done && 'bg-primary',
                  active && 'bg-signal ring-4 ring-signal/20',
                  active && live && 'animate-pulse',
                  !done && !active && 'bg-rail',
                  failed && 'bg-destructive',
                )}
              />
              <span
                className={cn(
                  'font-mono text-[0.6rem] uppercase tracking-[0.1em] whitespace-nowrap',
                  active ? 'text-signal' : done ? 'text-foreground/70' : 'text-muted-foreground',
                )}
              >
                {stage.label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div className="h-2.5 flex items-center flex-1 px-1.5 min-w-6">
                <span
                  className={cn(
                    'h-px w-full rounded-full',
                    connectorLive && 'connector-live',
                    !connectorLive && (connectorDone ? 'bg-primary' : 'bg-rail'),
                  )}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

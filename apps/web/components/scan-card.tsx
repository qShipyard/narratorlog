import { Scan, ScanStatus } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getStoryStatus, STATUS_TONE_CLASS } from '@/lib/status-labels'

function StatusChip({ status }: { status: ScanStatus }) {
  const { label, tone } = getStoryStatus(status)
  const live = tone === 'live'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border border-current/15 px-1.5 py-0.5 font-mono text-[0.625rem] font-bold uppercase tracking-[0.14em]',
        STATUS_TONE_CLASS[tone],
      )}
    >
      {live && <span className="size-1.5 rounded-[1px] bg-current animate-pulse" />}
      {label}
    </span>
  )
}

export function ScanCard({
  scan,
  highlight,
  preview,
}: {
  scan: Scan
  highlight?: boolean
  preview?: string
}) {
  const needsReview = scan.status === 'awaiting_approval'

  return (
    <div
      className={cn(
        'rail-node group flex items-start gap-4 px-5 py-4 transition-colors',
        needsReview || highlight
          ? 'is-signal bg-signal/[0.04] hover:bg-signal/[0.07]'
          : 'hover:bg-muted/40',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-mono text-[0.8125rem] font-bold tracking-tight truncate text-foreground">
            {scan.repository?.full_name ?? 'Unknown repository'}
          </span>
          <StatusChip status={scan.status} />
        </div>
        {preview ? (
          <p className="mt-2 text-sm text-foreground/75 leading-relaxed line-clamp-2 font-serif">
            {preview}
          </p>
        ) : null}
        <div
          className={cn(
            'flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground',
            preview ? 'mt-2' : 'mt-1.5',
          )}
        >
          <span className="font-mono tabular-nums">{scan.commit_count} commits</span>
          <span className="text-rail">·</span>
          <span className="font-mono tabular-nums">{scan.filtered_count} filtered</span>
          <span className="text-rail">·</span>
          <span>{formatDistanceToNow(new Date(scan.created_at), { addSuffix: true })}</span>
        </div>
      </div>

      <div className="shrink-0 pt-0.5">
        {needsReview ? (
          <Link href={`/scans/${scan.id}/review`}>
            <Button size="sm">Review</Button>
          </Link>
        ) : (
          <Link href={`/scans/${scan.id}`}>
            <Button variant="outline" size="sm" className="opacity-70 group-hover:opacity-100">
              View
            </Button>
          </Link>
        )}
      </div>
    </div>
  )
}

import { Scan, ScanStatus } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'

type Tone = 'signal' | 'success' | 'destructive' | 'active' | 'muted'

const statusConfig: Record<ScanStatus, { label: string; tone: Tone }> = {
  pending:           { label: 'Pending',         tone: 'muted' },
  running:           { label: 'Running',         tone: 'active' },
  filtering:         { label: 'Filtering',       tone: 'active' },
  enriching:         { label: 'Enriching',       tone: 'active' },
  reading_context:   { label: 'Reading context', tone: 'active' },
  chunking:          { label: 'Chunking',        tone: 'active' },
  summarizing:       { label: 'Summarizing',     tone: 'active' },
  awaiting_approval: { label: 'Needs review',    tone: 'signal' },
  approved:          { label: 'Approved',        tone: 'success' },
  delivering:        { label: 'Delivering',      tone: 'active' },
  delivered:         { label: 'Delivered',       tone: 'success' },
  failed:            { label: 'Failed',          tone: 'destructive' },
  cancelled:         { label: 'Cancelled',       tone: 'muted' },
}

const toneClass: Record<Tone, string> = {
  signal: 'bg-signal/15 text-signal-foreground',
  success: 'text-emerald-700 dark:text-emerald-400',
  destructive: 'bg-destructive/10 text-destructive',
  active: 'text-primary',
  muted: 'text-muted-foreground',
}

function StatusChip({ status }: { status: ScanStatus }) {
  const { label, tone } = statusConfig[status]
  const live = tone === 'active'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em]',
        toneClass[tone],
      )}
    >
      {live && <span className="size-1.5 rounded-full bg-current animate-pulse" />}
      {label}
    </span>
  )
}

export function ScanCard({ scan, highlight }: { scan: Scan; highlight?: boolean }) {
  const needsReview = scan.status === 'awaiting_approval'

  return (
    <div
      className={cn(
        'rail-node group flex items-center gap-4 rounded-lg border border-transparent px-4 py-3.5 transition-colors',
        needsReview || highlight
          ? 'is-signal bg-signal/[0.06] hover:bg-signal/10'
          : 'hover:bg-muted/60',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[0.8rem] font-bold truncate text-foreground">
            {scan.repository.full_name}
          </span>
          <StatusChip status={scan.status} />
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{scan.commit_count} commits</span>
          <span className="text-rail">·</span>
          <span className="font-mono">{scan.filtered_count} filtered</span>
          <span className="text-rail">·</span>
          <span>{formatDistanceToNow(new Date(scan.created_at), { addSuffix: true })}</span>
        </div>
      </div>

      {needsReview ? (
        <Link href={`/scans/${scan.id}/review`}>
          <Button size="sm">Review</Button>
        </Link>
      ) : (
        <Link href={`/scans/${scan.id}`}>
          <Button
            variant="ghost"
            size="sm"
            className="opacity-60 group-hover:opacity-100"
          >
            View
          </Button>
        </Link>
      )}
    </div>
  )
}

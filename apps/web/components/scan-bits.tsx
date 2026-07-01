import { ScanStatus, CommitGroup } from '@/lib/api'
import { isLiveStatus } from '@/components/pipeline-timeline'
import { SignalMark } from '@/components/signal-mark'
import { cn } from '@/lib/utils'
import { getStoryStatusLabel, STATUS_LINE_TONE_CLASS, getStoryStatus } from '@/lib/status-labels'

export function StatusLine({ status }: { status: ScanStatus }) {
  const live = isLiveStatus(status)
  const { tone } = getStoryStatus(status)
  const label = getStoryStatusLabel(status)

  return (
    <span className={cn('inline-flex items-center gap-1.5', STATUS_LINE_TONE_CLASS[tone])}>
      {live && <SignalMark state="live" />}
      {label}
    </span>
  )
}

export function GroupTypeBadge({ type }: { type: string }) {
  const config: Record<string, string> = {
    feature: 'text-primary',
    fix: 'text-emerald-400',
    breaking: 'text-destructive',
    security: 'text-signal',
    chore: 'text-muted-foreground',
    other: 'text-muted-foreground',
  }

  return (
    <span
      className={cn(
        'font-mono text-[0.6rem] font-bold uppercase tracking-[0.12em] shrink-0',
        config[type] ?? config.other,
      )}
    >
      {type}
    </span>
  )
}

export function ScanGroups({ groups, live }: { groups: CommitGroup[]; live: boolean }) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-5 py-10 text-center">
        <p className="text-muted-foreground text-sm">
          {live ? 'Reading the log…' : 'Nothing grouped yet.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {groups.map(group => (
        <div key={group.id} className="rounded-lg border bg-card px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium leading-snug">{group.label}</span>
            <GroupTypeBadge type={group.group_type} />
          </div>
          <p className="font-mono text-[0.7rem] text-muted-foreground mt-1.5">
            {group.commit_count} commit{group.commit_count === 1 ? '' : 's'}
          </p>
          {group.summary && (
            <p className="text-xs text-muted-foreground leading-relaxed mt-2">
              {group.summary}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

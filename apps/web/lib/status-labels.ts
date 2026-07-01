import { ScanStatus } from '@/lib/api'
import { isLiveStatus } from '@/components/pipeline-timeline'
import { copy } from '@/lib/copy'

export type StatusTone = 'signal' | 'success' | 'destructive' | 'live' | 'muted'

export type StoryStatusMeta = {
  label: string
  tone: StatusTone
}

export const STORY_STATUS: Record<ScanStatus, StoryStatusMeta> = {
  pending: { label: 'Queued', tone: 'muted' },
  running: { label: 'Reading commits', tone: 'live' },
  filtering: { label: 'Filtering noise', tone: 'live' },
  enriching: { label: 'Adding context', tone: 'live' },
  reading_context: { label: 'Reading codebase', tone: 'live' },
  chunking: { label: 'Grouping changes', tone: 'live' },
  summarizing: { label: 'Writing drafts', tone: 'live' },
  awaiting_approval: { label: copy.needsReview, tone: 'signal' },
  approved: { label: 'Approved', tone: 'success' },
  delivering: { label: 'Sending…', tone: 'live' },
  delivered: { label: copy.sent, tone: 'success' },
  failed: { label: "Couldn't finish", tone: 'destructive' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
}

/** Short label while the pipeline is actively running. */
export const COLLAPSED_LIVE_LABEL = copy.working

export function getStoryStatus(status: ScanStatus): StoryStatusMeta {
  return STORY_STATUS[status]
}

export function getStoryStatusLabel(status: ScanStatus, collapsed = false): string {
  if (collapsed && isLiveStatus(status)) return COLLAPSED_LIVE_LABEL
  return STORY_STATUS[status].label
}

export function getRepoStoryStatusLabel(scan?: { status: ScanStatus }): string {
  if (!scan) return copy.neverRun
  if (isLiveStatus(scan.status)) return copy.working
  if (scan.status === 'failed') return 'Last story failed'
  return STORY_STATUS[scan.status].label
}

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  signal: 'bg-signal/15 text-signal-foreground',
  success: 'text-emerald-700 dark:text-emerald-400',
  destructive: 'bg-destructive/10 text-destructive',
  live: 'text-primary',
  muted: 'text-muted-foreground',
}

export const STATUS_LINE_TONE_CLASS: Record<StatusTone, string> = {
  signal: 'text-signal',
  success: 'text-emerald-400',
  destructive: 'text-destructive',
  live: 'text-primary',
  muted: 'text-muted-foreground',
}

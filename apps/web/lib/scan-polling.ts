import { ScanStatus } from '@/lib/api'
import { isLiveStatus } from '@/components/pipeline-timeline'

/** Poll scan status while the pipeline is actively running. */
export function shouldPollScanStatus(status?: ScanStatus) {
  return status ? isLiveStatus(status) || status === 'pending' || status === 'delivering' : false
}

/**
 * Poll groups/drafts while the scan runs, and briefly after narration finishes.
 * Status can flip to awaiting_approval before the drafts query catches up.
 */
export function shouldPollScanResources(
  status?: ScanStatus,
  draftCount = 0,
  groupCount = 0,
) {
  if (shouldPollScanStatus(status)) return true
  return (
    status === 'awaiting_approval' &&
    draftCount === 0 &&
    groupCount > 0
  )
}

/** Scan reached review but drafts haven't landed in the client yet. */
export function isAwaitingDrafts(
  status?: ScanStatus,
  draftCount = 0,
  groupCount = 0,
) {
  return (
    status === 'awaiting_approval' &&
    draftCount === 0 &&
    groupCount > 0
  )
}

/** After this long with no drafts, treat empty as a real failure. */
export const DRAFT_WAIT_MS = 45_000

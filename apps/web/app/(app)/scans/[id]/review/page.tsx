'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scansApi, teamApi, ScanStatus } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusLine } from '@/components/scan-bits'
import { SourceGroupsPanel } from '@/components/story/source-groups-panel'
import { PipelinePanel } from '@/components/story/pipeline-panel'
import { DeliveryLog } from '@/components/story/delivery-log'
import { DraftPanel, DraftPanelHandle } from '@/components/story/draft-panel'
import { CopyDraftButton } from '@/components/copy-draft-button'
import { Send, ChevronLeft, Check, AlertCircle } from 'lucide-react'
import { useState, use, useEffect, useRef, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  isAwaitingDrafts,
  shouldPollScanResources,
  shouldPollScanStatus,
} from '@/lib/scan-polling'
import { copy } from '@/lib/copy'
import { getStoryStatusLabel } from '@/lib/status-labels'
import { allDraftsText } from '@/lib/clipboard'
import { isLiveStatus } from '@/components/pipeline-timeline'

function apiErrorMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
    ?.message ?? fallback
}

function deliverDisabledReason(opts: {
  allApproved: boolean
  hasRouting: boolean
  status?: ScanStatus
  pending: boolean
}): string | null {
  if (opts.pending) return 'Sending in progress…'
  if (opts.status === 'delivering') return 'Sending to your channels…'
  if (opts.status === 'delivered') return 'Already sent'
  if (!opts.allApproved) return 'Approve all drafts before sending'
  if (!opts.hasRouting) return 'No delivery routes — copy drafts instead'
  return null
}

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const queryClient = useQueryClient()
  const prevStatus = useRef<ScanStatus | undefined>(undefined)
  const draftPanelRef = useRef<DraftPanelHandle>(null)
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined)

  const { data: scan } = useQuery({
    queryKey: ['scan', id],
    queryFn: () => scansApi.get(id).then(r => r.data),
    refetchInterval: q => (shouldPollScanStatus(q.state.data?.status) ? 3000 : false),
  })

  const { data: teamConfig } = useQuery({
    queryKey: ['team-config'],
    queryFn: () => teamApi.getConfig().then(r => r.data),
  })

  const status = scan?.status
  const live = status ? isLiveStatus(status) : false
  const hasRouting = (teamConfig?.routing?.length ?? 0) > 0

  useEffect(() => {
    if (prevStatus.current === 'delivering' && status === 'delivered') {
      toast.success('Sent to your channels.')
    }
    prevStatus.current = status
  }, [status])

  const { data: groupsData } = useQuery({
    queryKey: ['scan-groups', id],
    queryFn: () => scansApi.groups(id).then(r => r.data),
    refetchInterval: () => {
      const scanData = queryClient.getQueryData<{ status: ScanStatus }>(['scan', id])
      const draftsCache = queryClient.getQueryData<{ data: unknown[] }>(['scan-drafts', id])
      const groupsCache = queryClient.getQueryData<{ data: unknown[] }>(['scan-groups', id])
      return shouldPollScanResources(
        scanData?.status ?? status,
        draftsCache?.data?.length ?? 0,
        groupsCache?.data?.length ?? 0,
      )
        ? 3000
        : false
    },
  })

  const { data: draftsData, refetch: refetchDrafts } = useQuery({
    queryKey: ['scan-drafts', id],
    queryFn: () => scansApi.drafts(id).then(r => r.data),
    refetchInterval: () => {
      const scanData = queryClient.getQueryData<{ status: ScanStatus }>(['scan', id])
      const draftsCache = queryClient.getQueryData<{ data: unknown[] }>(['scan-drafts', id])
      const groupsCache = queryClient.getQueryData<{ data: unknown[] }>(['scan-groups', id])
      return shouldPollScanResources(
        scanData?.status ?? status,
        draftsCache?.data?.length ?? 0,
        groupsCache?.data?.length ?? 0,
      )
        ? 3000
        : false
    },
  })

  const groups = groupsData?.data ?? []
  const drafts = useMemo(() => draftsData?.data ?? [], [draftsData?.data])
  const waitingForDrafts = isAwaitingDrafts(status, drafts.length, groups.length)
  const resolvedTab = activeTab ?? drafts[0]?.audience_id

  const allApproved = drafts.length > 0 && drafts.every(d => d.status === 'approved')
  const approvedCount = drafts.filter(d => d.status === 'approved').length

  const deliverMutation = useMutation({
    mutationFn: () => scansApi.deliver(id),
    onSuccess: () => {
      toast.success('Sending to your channels…')
      queryClient.invalidateQueries({ queryKey: ['scan', id] })
      queryClient.invalidateQueries({ queryKey: ['scan-drafts', id] })
      queryClient.invalidateQueries({ queryKey: ['scan-deliveries', id] })
    },
    onError: err => toast.error(apiErrorMessage(err, 'Could not deliver. Try again.')),
  })

  const cycleAudience = useCallback(
    (direction: 1 | -1) => {
      if (drafts.length === 0) return
      const ids = drafts.map(d => d.audience_id)
      const idx = resolvedTab ? ids.indexOf(resolvedTab) : 0
      const next = ids[(idx + direction + ids.length) % ids.length]
      setActiveTab(next)
    },
    [drafts, resolvedTab],
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const inField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      if (e.key === 'Escape' && inField) {
        target.blur()
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        draftPanelRef.current?.save()
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        draftPanelRef.current?.approve()
        return
      }

      if (e.key === 'Tab' && !e.shiftKey && !inField && drafts.length > 1) {
        e.preventDefault()
        cycleAudience(1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drafts.length, cycleAudience])

  const sendDisabled =
    !allApproved || !hasRouting || deliverMutation.isPending || status === 'delivering'
  const sendReason = deliverDisabledReason({
    allApproved,
    hasRouting,
    status,
    pending: deliverMutation.isPending,
  })

  return (
    <div className="p-8 pb-16 max-w-6xl mx-auto space-y-8">
        <header className="space-y-6">
          <div className="flex items-start gap-4">
            <Link href="/scans">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <ChevronLeft className="h-4 w-4 mr-1" />
                {copy.stories}
              </Button>
            </Link>
            <div className="flex-1 min-w-0">
              <p className="eyebrow">{status ? <StatusLine status={status} /> : 'Investigation'}</p>
              <h1 className="font-display text-2xl font-semibold tracking-tight mt-1.5 truncate">
                {scan?.repository?.full_name ?? 'Loading…'}
              </h1>
              {scan && (
                <p className="font-mono text-xs text-muted-foreground mt-1.5">
                  {new Date(scan.scan_from).toLocaleDateString()} – {new Date(scan.scan_to).toLocaleDateString()}
                  {' · '}{scan.commit_count} commits · {scan.filtered_count} filtered
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {drafts.length > 0 && (
                <CopyDraftButton text={allDraftsText(drafts)} label={copy.copyAll} />
              )}
              <span className="font-mono text-xs text-muted-foreground tabular-nums hidden sm:inline">
                {approvedCount}/{drafts.length} approved
              </span>
              <div className="flex flex-col items-end gap-1">
                <Button
                  disabled={sendDisabled}
                  onClick={() => deliverMutation.mutate()}
                  title={sendReason ?? undefined}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {status === 'delivering' ? 'Sending…' : status === 'delivered' ? copy.sent : copy.sendAll}
                </Button>
                {sendReason && !deliverMutation.isPending && status !== 'delivered' && (
                  <p className="font-mono text-[0.65rem] text-muted-foreground max-w-[12rem] text-right">
                    {sendReason}
                  </p>
                )}
              </div>
            </div>
          </div>

          {!hasRouting && allApproved && status !== 'delivered' && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm">
                  No delivery destinations yet. Use <strong>Copy all</strong> to share approved drafts manually, or add a route in Settings to send to Slack, email, or another channel.
                </p>
                <div className="flex flex-wrap gap-2">
                  {drafts.length > 0 && (
                    <CopyDraftButton text={allDraftsText(drafts)} label={copy.copyAll} />
                  )}
                  <Link href="/settings#delivery">
                    <Button variant="outline" size="sm">Set up delivery</Button>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {status === 'delivered' && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
              <p className="text-sm text-emerald-400">
                All routed drafts were sent. Check your channels for the published updates, or copy drafts again if needed.
              </p>
            </div>
          )}

          {status && <PipelinePanel status={status} />}

          <DeliveryLog scanId={id} status={status} />
        </header>

        {status === 'failed' || status === 'cancelled' ? (
          <div className="rounded-xl border bg-card py-16 text-center">
            <p className="font-mono text-sm text-destructive">
              {status ? getStoryStatusLabel(status) : "Couldn't finish"} · {scan?.filtered_count ?? 0} commits read before it stopped
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              The story couldn&apos;t be finished. Run a new story to try again.
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-8 lg:items-start">
            <section className="space-y-3">
              <p className="eyebrow">Source · what shipped</p>
              <SourceGroupsPanel groups={groups} live={live || waitingForDrafts} />
            </section>

            <section className="space-y-3 lg:sticky lg:top-0 lg:self-start">
              <div className="flex items-center justify-between gap-2">
                <p className="eyebrow">Narration · the story</p>
                <p className="font-mono text-[0.6rem] text-muted-foreground hidden md:block">
                  ⌘S save · ⌘↵ approve · Tab next audience
                </p>
              </div>
              {drafts.length === 0 ? (
                <div className="rounded-xl border bg-card px-5 py-16 text-center">
                  {live || waitingForDrafts ? (
                    <p className="font-serif text-lg italic text-muted-foreground">
                      The story is still being written…
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-sm">No drafts generated yet.</p>
                  )}
                </div>
              ) : (
                <Tabs value={resolvedTab} onValueChange={setActiveTab}>
                  <TabsList className="bg-transparent p-0 gap-1 h-auto flex-wrap justify-start">
                    {drafts.map(draft => (
                      <TabsTrigger
                        key={draft.id}
                        value={draft.audience_id}
                        className="capitalize font-mono text-xs data-[state=active]:bg-accent rounded-md px-3 py-1.5"
                      >
                        {draft.audience_id}
                        {draft.status === 'approved' && (
                          <Check className="h-3 w-3 ml-1.5 text-emerald-400" />
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {drafts.map(draft => (
                    <TabsContent key={draft.id} value={draft.audience_id} className="mt-4">
                      <DraftPanel
                        ref={resolvedTab === draft.audience_id ? draftPanelRef : undefined}
                        draft={draft}
                        onRefresh={refetchDrafts}
                        reviewMode
                      />
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </section>
          </div>
        )}
    </div>
  )
}

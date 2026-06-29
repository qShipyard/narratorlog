'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scansApi, draftsApi, AudienceDraft, ScanStatus } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { PipelineTimeline, isLiveStatus } from '@/components/pipeline-timeline'
import { NarrationProse } from '@/components/narration-prose'
import { StatusLine, ScanGroups } from '@/components/scan-bits'
import { CheckCircle, XCircle, RefreshCw, Send, ChevronLeft, Check } from 'lucide-react'
import { useState, use } from 'react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'

function shouldPoll(status?: ScanStatus) {
  return status ? isLiveStatus(status) || status === 'pending' : false
}

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const queryClient = useQueryClient()

  const { data: scan } = useQuery({
    queryKey: ['scan', id],
    queryFn: () => scansApi.get(id).then(r => r.data),
    refetchInterval: q => (shouldPoll(q.state.data?.status) ? 3000 : false),
  })

  const status = scan?.status
  const live = status ? isLiveStatus(status) : false

  const { data: groupsData } = useQuery({
    queryKey: ['scan-groups', id],
    queryFn: () => scansApi.groups(id).then(r => r.data),
    refetchInterval: shouldPoll(status) ? 4000 : false,
  })

  const { data: draftsData, refetch: refetchDrafts } = useQuery({
    queryKey: ['scan-drafts', id],
    queryFn: () => scansApi.drafts(id).then(r => r.data),
    refetchInterval: shouldPoll(status) ? 4000 : false,
  })

  const groups = groupsData?.data ?? []
  const drafts = draftsData?.data ?? []

  const allApproved = drafts.length > 0 && drafts.every(d => d.status === 'approved')
  const approvedCount = drafts.filter(d => d.status === 'approved').length

  const deliverMutation = useMutation({
    mutationFn: () => scansApi.deliver(id),
    onSuccess: () => {
      toast.success('Delivery queued.')
      queryClient.invalidateQueries({ queryKey: ['scan', id] })
    },
    onError: () => toast.error('Failed to queue delivery.'),
  })

  return (
    <div className="dark theater min-h-screen text-foreground">
      <div className="mx-auto max-w-6xl p-8 space-y-8">
        <header className="space-y-6">
          <div className="flex items-start gap-4">
            <Link href="/scans">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <ChevronLeft className="h-4 w-4 mr-1" />
                Scans
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

            <div className="flex items-center gap-3 shrink-0">
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {approvedCount}/{drafts.length} approved
              </span>
              <Button
                disabled={!allApproved || deliverMutation.isPending}
                onClick={() => deliverMutation.mutate()}
              >
                <Send className="h-4 w-4 mr-2" />
                Deliver all
              </Button>
            </div>
          </div>

          {status && (
            <div className="rounded-xl border bg-card/60 px-5 py-4">
              <PipelineTimeline status={status} />
            </div>
          )}
        </header>

        {status === 'failed' || status === 'cancelled' ? (
          <div className="rounded-xl border bg-card py-16 text-center">
            <p className="font-mono text-sm text-destructive">
              scan {status} · {scan?.filtered_count ?? 0} commits read before it stopped
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              The story couldn’t be finished. Trigger a new scan to try again.
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-8">
            {/* Source — the machine record */}
            <section className="space-y-3">
              <p className="eyebrow">Source · what shipped</p>
              <ScanGroups groups={groups} live={live} />
            </section>

            {/* Narration — the human story */}
            <section className="space-y-3">
              <p className="eyebrow">Narration · the story</p>
              {drafts.length === 0 ? (
                <div className="rounded-xl border bg-card px-5 py-16 text-center">
                  {live ? (
                    <p className="font-serif text-lg italic text-muted-foreground">
                      The story is still being written…
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-sm">No drafts generated yet.</p>
                  )}
                </div>
              ) : (
                <Tabs defaultValue={drafts[0]?.audience_id}>
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
                      <DraftPanel draft={draft} onRefresh={refetchDrafts} />
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function DraftPanel({ draft, onRefresh }: { draft: AudienceDraft; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(draft.edited_content ?? draft.content)

  const saveMutation = useMutation({
    mutationFn: () => draftsApi.update(draft.id, content),
    onSuccess: () => {
      toast.success('Draft saved.')
      setEditing(false)
      onRefresh()
    },
    onError: () => toast.error('Failed to save draft.'),
  })

  const approveMutation = useMutation({
    mutationFn: () => draftsApi.approve(draft.id),
    onSuccess: (res) => {
      toast.success('Draft approved.')
      if (res.data.all_approved) {
        toast.success('All drafts approved — ready to deliver.')
      }
      onRefresh()
    },
    onError: () => toast.error('Failed to approve draft.'),
  })

  const rejectMutation = useMutation({
    mutationFn: () => draftsApi.reject(draft.id),
    onSuccess: () => {
      toast.success('Draft rejected.')
      onRefresh()
    },
    onError: () => toast.error('Failed to reject draft.'),
  })

  const regenerateMutation = useMutation({
    mutationFn: () => draftsApi.regenerate(draft.id),
    onSuccess: () => {
      toast.success('Regeneration queued.')
      onRefresh()
    },
    onError: () => toast.error('Failed to regenerate draft.'),
  })

  const isApproved = draft.status === 'approved'

  return (
    <div className={cn('rounded-xl border bg-card overflow-hidden', isApproved && 'border-emerald-500/30')}>
      <div className="flex items-center justify-between gap-2 px-5 py-3 border-b">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
          {draft.tone} tone
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending || isApproved}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Regenerate
          </Button>
          {!editing && !isApproved && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          {editing && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="px-6 py-6">
        {editing ? (
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            className="min-h-96 font-mono text-xs resize-none"
          />
        ) : (
          <NarrationProse content={draft.edited_content ?? draft.content} />
        )}
      </div>

      {!isApproved ? (
        <div className="px-5 py-3 border-t flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => rejectMutation.mutate()}
            disabled={rejectMutation.isPending}
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            Reject
          </Button>
          <Button
            size="sm"
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
          >
            <CheckCircle className="h-3.5 w-3.5 mr-1" />
            Approve
          </Button>
        </div>
      ) : (
        draft.approved_by && (
          <div className="px-5 py-3 border-t">
            <p className="font-mono text-[0.7rem] text-emerald-400">
              approved by {draft.approved_by.name}
              {draft.approved_at && ` · ${formatDistanceToNow(new Date(draft.approved_at), { addSuffix: true })}`}
            </p>
          </div>
        )
      )}
    </div>
  )
}

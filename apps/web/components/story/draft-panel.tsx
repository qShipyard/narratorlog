'use client'

import { forwardRef, useImperativeHandle, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { draftsApi, AudienceDraft } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { NarrationProse } from '@/components/narration-prose'
import { CopyDraftButton } from '@/components/copy-draft-button'
import { DraftComments } from '@/components/story/draft-comments'
import { draftText } from '@/lib/clipboard'
import { CheckCircle, XCircle, RefreshCw, Check } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

export type DraftPanelHandle = {
  save: () => void
  approve: () => void
  isEditing: () => boolean
}

/** Max height for draft body — keeps review actions visible without page scroll. */
const DRAFT_BODY_MAX = 'max-h-[min(46vh,440px)]'

export const DraftPanel = forwardRef<
  DraftPanelHandle,
  { draft: AudienceDraft; onRefresh: () => void; reviewMode?: boolean }
>(function DraftPanel({ draft, onRefresh, reviewMode = false }, ref) {
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
    onSuccess: res => {
      toast.success('Draft approved.')
      if (res.data.all_approved) {
        toast.success('All drafts approved — ready to send or copy.')
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

  useImperativeHandle(ref, () => ({
    save: () => {
      if (editing) saveMutation.mutate()
    },
    approve: () => {
      if (!editing && draft.status !== 'approved') approveMutation.mutate()
    },
    isEditing: () => editing,
  }))

  const isApproved = draft.status === 'approved'
  const isEdited =
    draft.edited_content != null && draft.edited_content.trim() !== draft.content.trim()

  return (
    <div
      className={cn(
        'rounded-xl border bg-card flex flex-col overflow-hidden',
        isApproved && 'border-emerald-500/30',
      )}
    >
      <div className="flex items-center justify-between gap-2 px-5 py-3 border-b shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground truncate">
            {draft.tone} tone
          </span>
          {isEdited && (
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-signal shrink-0">
              Edited
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <CopyDraftButton text={draftText(draft)} />
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

      <div
        className={cn(
          'relative min-h-0 overflow-y-auto overscroll-y-contain px-6 py-6',
          reviewMode && DRAFT_BODY_MAX,
        )}
      >
        {editing ? (
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            className={cn('min-h-[280px] font-mono text-xs resize-none', reviewMode && 'max-h-full')}
          />
        ) : (
          <NarrationProse content={draft.edited_content ?? draft.content} />
        )}
        {reviewMode && !editing && (
          <div
            className="pointer-events-none sticky bottom-0 left-0 right-0 h-8 -mx-6 -mb-6 bg-gradient-to-t from-card to-transparent"
            aria-hidden
          />
        )}
      </div>

      {reviewMode ? (
        <div className="shrink-0 border-t bg-muted/25 px-5 py-4 space-y-4">
          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground mb-2">
              Review
            </p>
            <DraftComments draftId={draft.id} embedded />
          </div>

          {isApproved ? (
            draft.approved_by && (
              <div className="flex items-center gap-1.5 pt-1 border-t border-border/60">
                <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <p className="font-mono text-[0.7rem] text-emerald-600">
                  Approved by {draft.approved_by.name}
                  {draft.approved_at &&
                    ` · ${formatDistanceToNow(new Date(draft.approved_at), { addSuffix: true })}`}
                </p>
              </div>
            )
          ) : (
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/60">
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
                disabled={approveMutation.isPending || editing}
                title={editing ? 'Save your edits first' : undefined}
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                Approve
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
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
              <div className="px-5 py-3 border-t flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <p className="font-mono text-[0.7rem] text-emerald-400">
                  approved by {draft.approved_by.name}
                  {draft.approved_at &&
                    ` · ${formatDistanceToNow(new Date(draft.approved_at), { addSuffix: true })}`}
                </p>
              </div>
            )
          )}
          <DraftComments draftId={draft.id} />
        </>
      )}
    </div>
  )
})

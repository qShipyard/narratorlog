'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { draftsApi, Comment } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function DraftComments({
  draftId,
  embedded = false,
}: {
  draftId: string
  embedded?: boolean
}) {
  const qc = useQueryClient()
  const [content, setContent] = useState('')

  const { data } = useQuery({
    queryKey: ['draft-comments', draftId],
    queryFn: () => draftsApi.comments(draftId).then(r => r.data),
  })

  const comments = data?.data ?? []

  const add = useMutation({
    mutationFn: () => draftsApi.addComment(draftId, content.trim()),
    onSuccess: () => {
      setContent('')
      qc.invalidateQueries({ queryKey: ['draft-comments', draftId] })
      toast.success('Comment added.')
    },
    onError: () => toast.error("Couldn't add comment. Try again."),
  })

  if (embedded) {
    return (
      <div className="space-y-2">
        {comments.length > 0 && (
          <ul className={cn('space-y-1.5 overflow-y-auto', comments.length > 2 && 'max-h-28 pr-1')}>
            {comments.map(c => (
              <CommentRow key={c.id} comment={c} compact />
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Leave a note for reviewers…"
            className="min-h-[2.5rem] max-h-20 text-sm resize-none py-2"
            rows={1}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && content.trim()) {
                e.preventDefault()
                add.mutate()
              }
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 self-end"
            disabled={!content.trim() || add.isPending}
            onClick={() => add.mutate()}
          >
            Add note
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="border-t px-5 py-4 space-y-3">
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
        Comments {comments.length > 0 && `· ${comments.length}`}
      </p>
      {comments.length > 0 && (
        <ul className="space-y-2">
          {comments.map(c => (
            <CommentRow key={c.id} comment={c} />
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Leave a note for reviewers…"
          className="min-h-[4rem] text-sm resize-none"
          rows={2}
        />
        <Button
          size="sm"
          className="shrink-0 self-end"
          disabled={!content.trim() || add.isPending}
          onClick={() => add.mutate()}
        >
          Add
        </Button>
      </div>
    </div>
  )
}

function CommentRow({ comment, compact }: { comment: Comment; compact?: boolean }) {
  return (
    <li
      className={cn(
        'rounded-lg bg-muted/40 text-sm',
        compact ? 'px-2.5 py-1.5' : 'px-3 py-2',
      )}
    >
      <p className={cn('text-foreground leading-relaxed', compact && 'text-xs line-clamp-2')}>
        {comment.content}
      </p>
      <p className="font-mono text-[0.65rem] text-muted-foreground mt-0.5">
        {comment.user.name} · {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
      </p>
    </li>
  )
}

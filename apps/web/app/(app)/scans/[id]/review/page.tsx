'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scansApi, draftsApi, AudienceDraft } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { CheckCircle, XCircle, RefreshCw, Send, ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { use } from 'react'

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const queryClient = useQueryClient()

  const { data: scan } = useQuery({
    queryKey: ['scan', id],
    queryFn: () => scansApi.get(id).then(r => r.data),
  })

  const { data: groupsData } = useQuery({
    queryKey: ['scan-groups', id],
    queryFn: () => scansApi.groups(id).then(r => r.data),
  })

  const { data: draftsData, refetch: refetchDrafts } = useQuery({
    queryKey: ['scan-drafts', id],
    queryFn: () => scansApi.drafts(id).then(r => r.data),
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
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/scans">
          <Button variant="ghost" size="sm">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Scans
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {scan?.repository.full_name ?? 'Loading...'}
          </h1>
          {scan && (
            <p className="text-muted-foreground text-sm mt-1">
              {new Date(scan.scan_from).toLocaleDateString()} – {new Date(scan.scan_to).toLocaleDateString()}
              · {scan.commit_count} commits · {scan.filtered_count} filtered
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
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

      <div className="grid grid-cols-5 gap-6">
        {/* Left — commit groups */}
        <div className="col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            What shipped
          </h2>
          {groups.map(group => (
            <Card key={group.id}>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-medium leading-snug">
                    {group.label}
                  </CardTitle>
                  <GroupTypeBadge type={group.group_type} />
                </div>
              </CardHeader>
              {group.summary && (
                <CardContent className="px-4 pb-4">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {group.summary}
                  </p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        {/* Right — audience drafts */}
        <div className="col-span-3">
          {drafts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground text-sm">No drafts generated yet.</p>
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue={drafts[0]?.audience_id}>
              <TabsList className="w-full justify-start">
                {drafts.map(draft => (
                  <TabsTrigger key={draft.id} value={draft.audience_id} className="capitalize">
                    {draft.audience_id}
                    {draft.status === 'approved' && (
                      <CheckCircle className="h-3 w-3 ml-1.5 text-green-500" />
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>

              {drafts.map(draft => (
                <TabsContent key={draft.id} value={draft.audience_id} className="mt-4">
                  <DraftPanel
                    draft={draft}
                    onRefresh={refetchDrafts}
                  />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DraftStatusBadge status={draft.status} />
            <span className="text-xs text-muted-foreground capitalize">{draft.tone} tone</span>
          </div>
          <div className="flex items-center gap-2">
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
      </CardHeader>

      <Separator />

      <CardContent className="pt-4">
        {editing ? (
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            className="min-h-96 font-mono text-xs resize-none"
          />
        ) : (
          <pre className="text-xs leading-relaxed whitespace-pre-wrap font-sans">
            {draft.edited_content ?? draft.content}
          </pre>
        )}
      </CardContent>

      {!isApproved && (
        <>
          <Separator />
          <div className="p-4 flex items-center justify-end gap-2">
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
        </>
      )}

      {isApproved && draft.approved_by && (
        <div className="px-4 pb-4">
          <p className="text-xs text-muted-foreground">
            Approved by {draft.approved_by.name}{' '}
            {draft.approved_at && formatDistanceToNow(new Date(draft.approved_at), { addSuffix: true })}
          </p>
        </div>
      )}
    </Card>
  )
}

function GroupTypeBadge({ type }: { type: string }) {
  const config: Record<string, string> = {
    feature: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    fix: 'bg-green-500/10 text-green-600 border-green-500/20',
    breaking: 'bg-red-500/10 text-red-600 border-red-500/20',
    security: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    chore: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
    other: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
  }

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border capitalize shrink-0 ${config[type] ?? config.other}`}>
      {type}
    </span>
  )
}

function DraftStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; class: string }> = {
    draft: { label: 'Draft', class: 'bg-gray-500/10 text-gray-600 border-gray-500/20' },
    approved: { label: 'Approved', class: 'bg-green-500/10 text-green-600 border-green-500/20' },
    rejected: { label: 'Rejected', class: 'bg-red-500/10 text-red-600 border-red-500/20' },
    delivered: { label: 'Delivered', class: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  }

  const c = config[status] ?? config.draft

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${c.class}`}>
      {c.label}
    </span>
  )
}
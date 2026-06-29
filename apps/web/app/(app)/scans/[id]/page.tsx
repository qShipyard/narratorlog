'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ChevronLeft, PencilLine } from 'lucide-react'
import { scansApi, ScanStatus } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PipelineTimeline, isLiveStatus } from '@/components/pipeline-timeline'
import { NarrationProse } from '@/components/narration-prose'
import { StatusLine, ScanGroups } from '@/components/scan-bits'
import { cn } from '@/lib/utils'

function shouldPoll(status?: ScanStatus) {
  return status ? isLiveStatus(status) || status === 'pending' : false
}

export default function ScanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

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

  const { data: draftsData } = useQuery({
    queryKey: ['scan-drafts', id],
    queryFn: () => scansApi.drafts(id).then(r => r.data),
    refetchInterval: shouldPoll(status) ? 4000 : false,
  })

  const groups = groupsData?.data ?? []
  const drafts = draftsData?.data ?? []
  const needsReview = status === 'awaiting_approval'

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
              <p className="eyebrow">{status ? <StatusLine status={status} /> : 'Scan'}</p>
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

            {needsReview && (
              <Link href={`/scans/${id}/review`} className="shrink-0">
                <Button>
                  <PencilLine className="h-4 w-4 mr-2" />
                  Review drafts
                </Button>
              </Link>
            )}
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
              The story couldn’t be finished. Run a new scan to try again.
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-8">
            <section className="space-y-3">
              <p className="eyebrow">Source · what shipped</p>
              <ScanGroups groups={groups} live={live} />
            </section>

            <section className="space-y-3">
              <p className="eyebrow">Narration · the story</p>
              {drafts.length === 0 ? (
                <div className="rounded-xl border bg-card px-5 py-16 text-center">
                  {live ? (
                    <p className="font-serif text-lg italic text-muted-foreground">
                      The story is still being written…
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-sm">No narration generated yet.</p>
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
                        <span
                          className={cn(
                            'ml-1.5 font-bold',
                            draft.status === 'delivered' ? 'text-emerald-400'
                            : draft.status === 'approved' ? 'text-emerald-400'
                            : 'text-muted-foreground',
                          )}
                        >
                          ·
                        </span>
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {drafts.map(draft => (
                    <TabsContent key={draft.id} value={draft.audience_id} className="mt-4">
                      <div className="rounded-xl border bg-card overflow-hidden">
                        <div className="flex items-center justify-between gap-2 px-5 py-3 border-b">
                          <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
                            {draft.tone} tone
                          </span>
                          <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
                            {draft.status}
                          </span>
                        </div>
                        <div className="px-6 py-6">
                          <NarrationProse content={draft.edited_content ?? draft.content} />
                        </div>
                      </div>
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

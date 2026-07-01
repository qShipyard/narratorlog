'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { CommitGroup } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { LedgerPanel } from '@/components/ledger-list'
import { GroupTypeBadge } from '@/components/scan-bits'

const DEFAULT_PAGE_SIZE = 5

function groupPageKey(groups: CommitGroup[]) {
  return groups.map(g => g.id).join('|')
}

export function SourceGroupsPanel({
  groups,
  live,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  groups: CommitGroup[]
  live: boolean
  pageSize?: number
}) {
  const [page, setPage] = useState(0)
  const groupKey = useMemo(() => groupPageKey(groups), [groups])

  useEffect(() => {
    setPage(0)
  }, [groupKey])

  const total = groups.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const start = safePage * pageSize
  const end = Math.min(start + pageSize, total)
  const visible = groups.slice(start, end)

  if (total === 0) {
    return (
      <LedgerPanel className="px-5 py-10 text-center">
        <p className="text-muted-foreground text-sm">
          {live ? 'Reading the log…' : 'Nothing grouped yet.'}
        </p>
      </LedgerPanel>
    )
  }

  const showPager = total > pageSize

  return (
    <LedgerPanel className="flex flex-col overflow-hidden">
      <ul className="divide-y divide-border/70">
        {visible.map(group => (
          <li key={group.id} className="px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-medium leading-snug">{group.label}</span>
              <GroupTypeBadge type={group.group_type} />
            </div>
            <p className="font-mono text-[0.7rem] text-muted-foreground mt-1.5 tabular-nums">
              {group.commit_count} commit{group.commit_count === 1 ? '' : 's'}
            </p>
            {group.summary && (
              <p className="text-xs text-muted-foreground leading-relaxed mt-2 line-clamp-2">
                {group.summary}
              </p>
            )}
          </li>
        ))}
      </ul>

      {showPager && (
        <footer className="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-2.5 bg-muted/20">
          <p className="font-mono text-[0.65rem] text-muted-foreground tabular-nums">
            {start + 1}–{end} of {total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              disabled={safePage === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-mono text-[0.65rem] text-muted-foreground min-w-[3.5rem] text-center tabular-nums">
              {safePage + 1}/{totalPages}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </footer>
      )}
    </LedgerPanel>
  )
}

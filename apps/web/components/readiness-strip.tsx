'use client'

import Link from 'next/link'
import { Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { allStripChecksOk, stripChecks, type Readiness } from '@/lib/readiness'
import { LedgerPanel } from '@/components/ledger-list'

export function ReadinessStrip({
  readiness,
  isLoading,
}: {
  readiness: Readiness
  isLoading?: boolean
}) {
  if (isLoading) return null
  if (allStripChecksOk(readiness)) return null

  const checks = stripChecks(readiness)

  return (
    <LedgerPanel className="px-5 py-4">
      <p className="eyebrow">Readiness</p>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {checks.map(check => (
          <li key={check.id} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                'flex size-4 items-center justify-center rounded-full border',
                check.ok
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-rail text-transparent',
              )}
            >
              {check.ok && <Check className="h-2.5 w-2.5" />}
            </span>
            <span className={check.ok ? 'text-muted-foreground' : 'text-foreground'}>
              {check.label}
            </span>
            {!check.ok && check.fixHref && (
              <Link
                href={check.fixHref}
                className="inline-flex items-center gap-0.5 font-mono text-[0.65rem] font-bold uppercase tracking-[0.1em] text-primary hover:underline"
              >
                {check.fixLabel ?? 'Fix'}
                <ChevronRight className="h-3 w-3" />
              </Link>
            )}
            {check.id === 'worker_healthy' && !check.ok && (
              <span className="font-mono text-[0.65rem] text-muted-foreground">
                Start the worker process
              </span>
            )}
          </li>
        ))}
      </ul>
    </LedgerPanel>
  )
}

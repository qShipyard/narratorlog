import { cn } from '@/lib/utils'

/** Bordered ledger container for lists and grouped content. */
export function LedgerPanel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/80 bg-card shadow-[0_1px_0_oklch(1_0_0/0.6)_inset]',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Marker-rail list — the signature ledger layout for story rows. */
export function LedgerList({
  children,
  className,
  panel = true,
}: {
  children: React.ReactNode
  className?: string
  panel?: boolean
}) {
  const inner = (
    <div className={cn('rail divide-y divide-border/70', className)}>{children}</div>
  )
  if (!panel) return inner
  return <LedgerPanel className="overflow-hidden">{inner}</LedgerPanel>
}

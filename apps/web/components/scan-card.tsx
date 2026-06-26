import { Scan, ScanStatus } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const statusConfig: Record<ScanStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending:            { label: 'Pending',           variant: 'secondary' },
  running:            { label: 'Running',           variant: 'default' },
  filtering:          { label: 'Filtering',         variant: 'default' },
  enriching:          { label: 'Enriching',         variant: 'default' },
  reading_context:    { label: 'Reading context',   variant: 'default' },
  chunking:           { label: 'Chunking',          variant: 'default' },
  summarizing:        { label: 'Summarizing',       variant: 'default' },
  awaiting_approval:  { label: 'Needs review',      variant: 'outline' },
  approved:           { label: 'Approved',          variant: 'default' },
  delivering:         { label: 'Delivering',        variant: 'default' },
  delivered:          { label: 'Delivered',         variant: 'default' },
  failed:             { label: 'Failed',            variant: 'destructive' },
  cancelled:          { label: 'Cancelled',         variant: 'secondary' },
}

export function ScanCard({ scan, highlight }: { scan: Scan; highlight?: boolean }) {
  const status = statusConfig[scan.status]

  return (
    <Card className={cn(highlight && 'border-yellow-400/50 bg-yellow-400/5')}>
      <CardContent className="py-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {scan.repository.full_name}
            </span>
            <Badge variant={status.variant} className="text-xs shrink-0">
              {status.label}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-muted-foreground">
              {scan.commit_count} commits · {scan.filtered_count} filtered
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(scan.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>

        {scan.status === 'awaiting_approval' && (
          <Link href={`/scans/${scan.id}/review`}>
            <Button size="sm">Review</Button>
          </Link>
        )}

        {scan.status !== 'awaiting_approval' && (
          <Link href={`/scans/${scan.id}`}>
            <Button variant="ghost" size="sm">View</Button>
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
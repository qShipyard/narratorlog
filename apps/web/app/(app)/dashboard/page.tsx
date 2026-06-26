'use client'

import { useQuery } from '@tanstack/react-query'
import { scansApi, reposApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GitBranch, ScanLine, Clock, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { ScanCard } from '@/components/scan-card'

export default function DashboardPage() {
  const { data: scansData } = useQuery({
    queryKey: ['scans'],
    queryFn: () => scansApi.list().then(r => r.data),
  })

  const { data: reposData } = useQuery({
    queryKey: ['repos'],
    queryFn: () => reposApi.list().then(r => r.data),
  })

  const scans = scansData?.data ?? []
  const repos = reposData?.data ?? []

  const pendingApprovals = scans.filter(s => s.status === 'awaiting_approval')
  const delivered = scans.filter(s => s.status === 'delivered')

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          What your team shipped recently.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Repositories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{repos.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Scans
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{scans.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Awaiting Approval
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              <span className="text-2xl font-bold">{pendingApprovals.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Delivered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-2xl font-bold">{delivered.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {pendingApprovals.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Awaiting Your Approval</h2>
          <div className="space-y-2">
            {pendingApprovals.map(scan => (
              <ScanCard key={scan.id} scan={scan} highlight />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent Scans</h2>
          <Link href="/scans">
            <Button variant="ghost" size="sm">View all</Button>
          </Link>
        </div>
        {scans.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground text-sm">No scans yet.</p>
              <Link href="/repositories">
                <Button className="mt-4" size="sm">Connect a repository</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {scans.slice(0, 5).map(scan => (
              <ScanCard key={scan.id} scan={scan} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
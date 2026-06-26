'use client'

import { useQuery } from '@tanstack/react-query'
import { reposApi } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GitBranch, ExternalLink } from 'lucide-react'

export default function RepositoriesPage() {
  const { data } = useQuery({
    queryKey: ['repos'],
    queryFn: () => reposApi.list().then(r => r.data),
  })

  const repos = data?.data ?? []

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Repositories</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Connected git repositories.
        </p>
      </div>

      {repos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <GitBranch className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No repositories connected yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {repos.map(repo => (
            <Card key={repo.id}>
              <CardContent className="py-4 flex items-center gap-4">
                <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{repo.full_name}</span>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {repo.provider}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Branch: {repo.default_branch}
                    {repo.last_scanned_at && ` · Last scanned ${new Date(repo.last_scanned_at).toLocaleDateString()}`}
                  </p>
                </div>
                <a href={repo.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
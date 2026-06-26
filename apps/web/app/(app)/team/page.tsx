'use client'

import { useQuery } from '@tanstack/react-query'
import { teamApi } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

export default function TeamPage() {
  const { data } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => teamApi.members().then(r => r.data),
  })

  const members = data?.data ?? []

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your team members and roles.
        </p>
      </div>

      <div className="space-y-2">
        {members.map((member: any) => (
          <Card key={member.id}>
            <CardContent className="py-4 flex items-center gap-4">
              <Avatar className="h-8 w-8">
                <AvatarImage src={member.avatar_url} />
                <AvatarFallback className="text-xs">
                  {member.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{member.name}</p>
                <p className="text-xs text-muted-foreground">{member.email}</p>
              </div>
              <Badge variant="secondary" className="capitalize">{member.role}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
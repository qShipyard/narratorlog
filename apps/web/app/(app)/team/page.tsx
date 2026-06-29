'use client'

import { useQuery } from '@tanstack/react-query'
import { teamApi } from '@/lib/api'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PageHeader } from '@/components/page-header'
import { RevealGroup, RevealItem } from '@/components/reveal'

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  avatar_url?: string
}

export default function TeamPage() {
  const { data } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => teamApi.members().then(r => r.data),
  })

  const members = data?.data ?? []

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <PageHeader
        eyebrow="People"
        title="Team"
        description="Who can review and approve what narratorlog writes."
      />

      <RevealGroup className="rounded-xl border bg-card divide-y divide-border overflow-hidden">
        {members.map((member: TeamMember) => (
          <RevealItem key={member.id} className="flex items-center gap-4 px-5 py-4">
            <Avatar className="h-9 w-9">
              <AvatarImage src={member.avatar_url} />
              <AvatarFallback className="text-[0.7rem] font-mono">
                {member.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{member.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{member.email}</p>
            </div>
            <span className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {member.role}
            </span>
          </RevealItem>
        ))}
      </RevealGroup>
    </div>
  )
}
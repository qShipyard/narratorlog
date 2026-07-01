'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi, teamApi, TeamMember, User } from '@/lib/api'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { RevealGroup, RevealItem } from '@/components/reveal'
import { InviteMemberDialog } from '@/components/team/invite-member-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

const ROLE_LABELS: Record<User['role'], string> = {
  admin: 'Admin',
  reviewer: 'Reviewer',
  viewer: 'Viewer',
}

export default function TeamPage() {
  const qc = useQueryClient()
  const [showInvite, setShowInvite] = useState(false)

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => authApi.me().then(r => r.data),
  })

  const { data } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => teamApi.members().then(r => r.data),
  })

  const members = data?.data ?? []
  const isAdmin = me?.role === 'admin'

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <PageHeader
        eyebrow="People"
        title="Team"
        description="Who can review and approve what narratorlog writes."
        action={
          isAdmin ? (
            <Button onClick={() => setShowInvite(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Invite member
            </Button>
          ) : undefined
        }
      />

      <RevealGroup className="rounded-xl border bg-card divide-y divide-border overflow-hidden">
        {members.map((member: TeamMember) => (
          <RevealItem key={member.id}>
            <MemberRow
              member={member}
              currentUserId={me?.id}
              isAdmin={isAdmin}
              onChanged={() => qc.invalidateQueries({ queryKey: ['team-members'] })}
            />
          </RevealItem>
        ))}
      </RevealGroup>

      <InviteMemberDialog open={showInvite} onClose={() => setShowInvite(false)} />
    </div>
  )
}

function MemberRow({
  member,
  currentUserId,
  isAdmin,
  onChanged,
}: {
  member: TeamMember
  currentUserId?: string
  isAdmin: boolean
  onChanged: () => void
}) {
  const isSelf = member.id === currentUserId

  const updateRole = useMutation({
    mutationFn: (role: User['role']) => teamApi.updateRole(member.id, role),
    onSuccess: () => {
      toast.success('Role updated.')
      onChanged()
    },
    onError: () => toast.error('Failed to update role.'),
  })

  const remove = useMutation({
    mutationFn: () => teamApi.remove(member.id),
    onSuccess: () => {
      toast.success('Member removed.')
      onChanged()
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Failed to remove member.'
      toast.error(msg)
    },
  })

  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <Avatar className="h-9 w-9">
        <AvatarImage src={member.avatar_url} />
        <AvatarFallback className="text-[0.7rem] font-mono">
          {member.name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {member.name}
          {isSelf && (
            <span className="ml-2 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground">
              You
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground font-mono truncate">{member.email}</p>
      </div>

      {isAdmin && !isSelf ? (
        <div className="flex items-center gap-2 shrink-0">
          <Select
            value={member.role}
            onValueChange={v => updateRole.mutate(v as User['role'])}
            disabled={updateRole.isPending}
          >
            <SelectTrigger size="sm" className="w-[7.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABELS) as User['role'][]).map(role => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Remove ${member.name} from the team?`)) {
                remove.mutate()
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <span className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted-foreground shrink-0">
          {ROLE_LABELS[member.role]}
        </span>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { teamApi, User } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CopyDraftButton } from '@/components/copy-draft-button'
import { toast } from 'sonner'

const ROLES: { value: User['role']; label: string }[] = [
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'admin', label: 'Admin' },
  { value: 'viewer', label: 'Viewer' },
]

export function InviteMemberDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<User['role']>('reviewer')
  const [tempPassword, setTempPassword] = useState<string | null>(null)

  function reset() {
    setName('')
    setEmail('')
    setRole('reviewer')
    setTempPassword(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  const invite = useMutation({
    mutationFn: () => teamApi.invite({ name: name.trim(), email: email.trim(), role }),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['team-members'] })
      setTempPassword(res.data.temporary_password)
      toast.success('Member added.')
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Could not add member.'
      toast.error(msg)
    },
  })

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tempPassword ? 'Share login details' : 'Invite member'}</DialogTitle>
        </DialogHeader>

        {tempPassword ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share this temporary password with {name}. They can sign in at the login page and change it later.
            </p>
            <div className="rounded-lg border bg-muted/40 px-4 py-3 font-mono text-sm break-all">
              {tempPassword}
            </div>
            <div className="flex justify-end gap-2">
              <CopyDraftButton text={tempPassword} label="Copy password" />
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault()
              invite.mutate()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="invite-name">Name</Label>
              <Input
                id="invite-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Alex Chen"
                required
                minLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="alex@company.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={v => setRole(v as User['role'])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Reviewers can approve drafts. Admins can configure the instance.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={invite.isPending || !name.trim() || !email.trim()}>
                {invite.isPending ? 'Adding…' : 'Add member'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

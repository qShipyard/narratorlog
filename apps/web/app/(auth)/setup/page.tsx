'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { setupApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from 'sonner'
import { CheckCircle } from 'lucide-react'

type Step = 'team' | 'admin' | 'confirm'

export default function SetupPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('team')
  const [loading, setLoading] = useState(false)

  const [teamName, setTeamName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Redirect if already set up
  useEffect(() => {
    setupApi.status().then(res => {
      if (res.data.setup_complete) router.push('/login')
    }).catch(() => {})
  }, [router])

  async function handleComplete() {
    if (password !== confirmPassword) {
      toast.error('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      await setupApi.complete({
        team_name: teamName,
        admin_name: adminName,
        email,
        password,
      })
      toast.success('Setup complete. Welcome to narratorlog.')
      router.push('/dashboard')
    } catch {
      toast.error('Setup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const steps = [
    { id: 'team', label: 'Workspace' },
    { id: 'admin', label: 'Admin account' },
    { id: 'confirm', label: 'Confirm' },
  ]

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md px-4 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">narratorlog</h1>
          <p className="text-muted-foreground text-sm">Let&apos;s get you set up.</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 text-xs ${
                step === s.id
                  ? 'text-foreground font-medium'
                  : steps.indexOf(steps.find(x => x.id === step)!) > i
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/40'
              }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs border ${
                  step === s.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : steps.indexOf(steps.find(x => x.id === step)!) > i
                    ? 'border-muted-foreground/40 text-muted-foreground'
                    : 'border-muted-foreground/20 text-muted-foreground/40'
                }`}>
                  {steps.indexOf(steps.find(x => x.id === step)!) > i
                    ? <CheckCircle className="h-3 w-3" />
                    : i + 1
                  }
                </span>
                {s.label}
              </div>
              {i < steps.length - 1 && (
                <div className="w-8 h-px bg-border" />
              )}
            </div>
          ))}
        </div>

        {/* Step 1 — Workspace */}
        {step === 'team' && (
          <Card>
            <CardHeader>
              <CardTitle>Name your workspace</CardTitle>
              <CardDescription>
                This is usually your company or team name.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="team-name">Workspace name</Label>
                <Input
                  id="team-name"
                  placeholder="Acme Engineering"
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                disabled={teamName.trim().length < 2}
                onClick={() => setStep('admin')}
              >
                Continue
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2 — Admin account */}
        {step === 'admin' && (
          <Card>
            <CardHeader>
              <CardTitle>Create your admin account</CardTitle>
              <CardDescription>
                This is the account you&apos;ll use to sign in.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-name">Full name</Label>
                <Input
                  id="admin-name"
                  placeholder="James Okafor"
                  value={adminName}
                  onChange={e => setAdminName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="james@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep('team')}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={!adminName || !email || !password || !confirmPassword}
                  onClick={() => setStep('confirm')}
                >
                  Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3 — Confirm */}
        {step === 'confirm' && (
          <Card>
            <CardHeader>
              <CardTitle>Almost done</CardTitle>
              <CardDescription>
                Review your setup before finishing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 rounded-lg bg-muted p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Workspace</span>
                  <span className="font-medium">{teamName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Admin name</span>
                  <span className="font-medium">{adminName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium">{email}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep('admin')}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={loading}
                  onClick={handleComplete}
                >
                  {loading ? 'Setting up...' : 'Complete setup'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { setupApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { SignalMark } from '@/components/signal-mark'
import { duration, ease } from '@/lib/motion'
import { toast } from 'sonner'
import { CheckCircle } from 'lucide-react'
import {
  parseSetupStep,
  setupStepHref,
  setupStepIndex,
  SETUP_STEPS,
  type SetupStepId,
} from '@/lib/setup'

function SetupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const step = parseSetupStep(searchParams.get('step'))
  const [loading, setLoading] = useState(false)

  const [teamName, setTeamName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    setupApi.status().then(res => {
      if (res.data.setup_complete) router.replace('/login')
    }).catch(() => {})
  }, [router])

  useEffect(() => {
    if (step === 'admin' && teamName.trim().length < 2) {
      router.replace(setupStepHref('team'))
    }
    if (step === 'confirm' && (!adminName.trim() || !email.trim() || !password || !confirmPassword)) {
      router.replace(setupStepHref('admin'))
    }
  }, [step, teamName, adminName, email, password, confirmPassword, router])

  function goToStep(next: SetupStepId) {
    router.push(setupStepHref(next))
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault()
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
      router.push('/activate')
    } catch {
      toast.error('Setup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const currentIndex = setupStepIndex(step)

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <motion.div
        className="w-full max-w-md px-4 space-y-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.slow, ease }}
      >
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex items-center gap-2.5">
            <SignalMark state="live" />
            <span className="leading-none">
              <span className="block font-display text-2xl font-bold tracking-tight">narratorlog</span>
              <span className="block font-mono text-[0.5rem] uppercase tracking-[0.2em] text-muted-foreground mt-0.5">
                by qShipyard
              </span>
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            Three quick steps, then we&apos;ll walk you to your first story.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2">
          {SETUP_STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 text-xs ${
                step === s.id
                  ? 'text-foreground font-medium'
                  : currentIndex > i
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/40'
              }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs border ${
                  step === s.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : currentIndex > i
                    ? 'border-muted-foreground/40 text-muted-foreground'
                    : 'border-muted-foreground/20 text-muted-foreground/40'
                }`}>
                  {currentIndex > i
                    ? <CheckCircle className="h-3 w-3" />
                    : i + 1
                  }
                </span>
                {s.label}
              </div>
              {i < SETUP_STEPS.length - 1 && (
                <div className="w-8 h-px bg-border" />
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: duration.base, ease }}
          >
            {step === 'team' && (
              <Card>
                <CardHeader>
                  <CardTitle>Name your workspace</CardTitle>
                  <CardDescription>
                    This is usually your company or team name.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="space-y-4"
                    onSubmit={e => {
                      e.preventDefault()
                      goToStep('admin')
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="team-name">Workspace name</Label>
                      <Input
                        id="team-name"
                        placeholder="qShipyard"
                        value={teamName}
                        onChange={e => setTeamName(e.target.value)}
                        required
                        minLength={2}
                        autoFocus
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={teamName.trim().length < 2}
                    >
                      Continue
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {step === 'admin' && (
              <Card>
                <CardHeader>
                  <CardTitle>Create your admin account</CardTitle>
                  <CardDescription>
                    This is the account you&apos;ll use to sign in.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="space-y-4"
                    onSubmit={e => {
                      e.preventDefault()
                      goToStep('confirm')
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="admin-name">Full name</Label>
                      <Input
                        id="admin-name"
                        placeholder="James Okafor"
                        value={adminName}
                        onChange={e => setAdminName(e.target.value)}
                        required
                        minLength={2}
                        autoFocus
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
                        required
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
                        required
                        minLength={8}
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
                        required
                        minLength={8}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" asChild>
                        <Link href={setupStepHref('team')}>Back</Link>
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1"
                        disabled={!adminName.trim() || !email.trim() || !password || !confirmPassword}
                      >
                        Continue
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {step === 'confirm' && (
              <Card>
                <CardHeader>
                  <CardTitle>Almost done</CardTitle>
                  <CardDescription>
                    Review your setup before finishing.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={handleComplete}>
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
                      <Button variant="outline" className="flex-1" asChild>
                        <Link href={setupStepHref('admin')}>Back</Link>
                      </Button>
                      <Button type="submit" className="flex-1" disabled={loading}>
                        {loading ? 'Setting up…' : 'Complete setup'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

export default function SetupPage() {
  return (
    <Suspense>
      <SetupContent />
    </Suspense>
  )
}

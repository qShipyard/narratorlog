'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { authApi, setupApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SignalMark } from '@/components/signal-mark'
import { duration, ease } from '@/lib/motion'
import { toast } from 'sonner'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const { data: setupStatus } = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => setupApi.status().then(r => r.data),
    retry: false,
  })

  useEffect(() => {
    if (setupStatus && !setupStatus.setup_complete) {
      router.replace('/setup')
    }
  }, [setupStatus, router])

  if (!setupStatus || !setupStatus.setup_complete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    )
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await authApi.login(email, password)
      router.push('/dashboard')
    } catch {
      toast.error('Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <motion.div
        className="w-full max-w-sm space-y-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.slow, ease }}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <SignalMark state="live" />
            <span className="leading-none">
              <span className="block font-display text-lg font-bold tracking-tight">narratorlog</span>
              <span className="block font-mono text-[0.5rem] uppercase tracking-[0.2em] text-muted-foreground mt-0.5">
                by qShipyard
              </span>
            </span>
          </div>
          <div>
            <p className="eyebrow">Sign in</p>
            <h1 className="font-display text-2xl font-semibold tracking-tight mt-1.5">
              Read back what shipped.
            </h1>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 rounded-xl border bg-card p-6">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
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
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="text-center font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
          Self-hosted · your data stays on your infrastructure
        </p>
      </motion.div>
    </div>
  )
}
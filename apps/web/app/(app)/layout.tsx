'use client'

import { useQuery } from '@tanstack/react-query'
import { authApi, setupApi } from '@/lib/api'
import { Sidebar } from '@/components/sidebar'
import { CommandPalette } from '@/components/command-palette'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  const { data: setupStatus } = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => setupApi.status().then(r => r.data),
    retry: false,
  })

  const { data: user, isError, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => authApi.me().then(r => r.data),
    retry: false,
    enabled: setupStatus?.setup_complete === true,
  })

  useEffect(() => {
    if (setupStatus && !setupStatus.setup_complete) {
      router.replace('/setup')
    }
  }, [setupStatus, router])

  useEffect(() => {
    if (setupStatus?.setup_complete && isError) {
      router.replace('/login')
    }
  }, [setupStatus, isError, router])

  if (!setupStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    )
  }

  if (!setupStatus.setup_complete) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Opening setup…</div>
      </div>
    )
  }

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    )
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar user={user} />
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain ledger-paper">
        {children}
      </main>
      <CommandPalette />
    </div>
  )
}
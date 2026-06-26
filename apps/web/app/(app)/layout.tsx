'use client'

import { useQuery } from '@tanstack/react-query'
import { authApi, setupApi } from '@/lib/api'
import { Sidebar } from '@/components/sidebar'
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
      router.push('/setup')
    }
  }, [setupStatus, router])

  useEffect(() => {
    if (isError) router.push('/login')
  }, [isError, router])

  if (isLoading || !setupStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
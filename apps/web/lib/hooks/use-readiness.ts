'use client'

import { useQuery } from '@tanstack/react-query'
import { reposApi, Scan, teamApi, healthApi } from '@/lib/api'
import { computeReadiness, Readiness } from '@/lib/readiness'

export function useReadiness(scans: Scan[] = []): {
  readiness: Readiness
  isLoading: boolean
} {
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['team-config'],
    queryFn: () => teamApi.getConfig().then(r => r.data),
  })

  const { data: reposData, isLoading: reposLoading } = useQuery({
    queryKey: ['repos'],
    queryFn: () => reposApi.list().then(r => r.data),
  })

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => healthApi.get().then(r => r.data),
    refetchInterval: 60_000,
    retry: false,
  })

  const repos = reposData?.data ?? []

  return {
    readiness: computeReadiness(config, repos, scans, health),
    isLoading: configLoading || reposLoading,
  }
}

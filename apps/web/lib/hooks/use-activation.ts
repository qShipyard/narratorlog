'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { teamApi, TeamConfigUpdate, configViewToUpdate } from '@/lib/api'

export function useActivationSave() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (apply: (base: TeamConfigUpdate) => TeamConfigUpdate) => {
      const { data } = await teamApi.getConfig()
      const payload = apply(configViewToUpdate(data))
      const res = await teamApi.updateConfig(payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-config'] })
      qc.invalidateQueries({ queryKey: ['sources'] })
    },
  })
}

export function useMarkActivationComplete() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data } = await teamApi.getConfig()
      const update = configViewToUpdate(data)
      update.activation_complete = true
      await teamApi.updateConfig(update)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-config'] })
    },
  })
}

export function useSkipActivation() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data } = await teamApi.getConfig()
      if (!data.activation_complete) {
        const update = configViewToUpdate(data)
        update.activation_complete = true
        await teamApi.updateConfig(update)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-config'] })
    },
  })
}

export type RepoCadence = 'manual' | 'daily' | 'weekly' | 'monthly'

export const CADENCE_OPTIONS: { value: RepoCadence; label: string }[] = [
  { value: 'manual', label: 'Manual only' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

export function repoCadence(config: Record<string, unknown>): RepoCadence {
  const cadence = config?.cadence
  if (cadence === 'daily' || cadence === 'weekly' || cadence === 'monthly') {
    return cadence
  }
  return 'manual'
}

export function repoScheduleLabel(config: Record<string, unknown>): string {
  return CADENCE_OPTIONS.find(o => o.value === repoCadence(config))?.label ?? 'Manual only'
}

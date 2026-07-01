export type RepoCadence = 'weekly' | 'on-tag' | 'on-merge' | 'manual'

export function repoCadence(config: Record<string, unknown>): RepoCadence | undefined {
  const cadence = config?.cadence
  if (cadence === 'weekly' || cadence === 'on-tag' || cadence === 'on-merge' || cadence === 'manual') {
    return cadence
  }
  return undefined
}

export function repoScheduleLabel(config: Record<string, unknown>): string {
  switch (repoCadence(config)) {
    case 'weekly':
      return 'Every Monday at 9:00 UTC'
    case 'on-tag':
      return 'On release tag'
    case 'on-merge':
      return 'On merged PR'
    case 'manual':
      return 'Manual only'
    default:
      return 'Manual only'
  }
}

export type SetupStepId = 'team' | 'admin' | 'confirm'

export const SETUP_STEPS: { id: SetupStepId; label: string }[] = [
  { id: 'team', label: 'Workspace' },
  { id: 'admin', label: 'Admin account' },
  { id: 'confirm', label: 'Confirm' },
]

export function parseSetupStep(value: string | null): SetupStepId {
  if (value === 'admin' || value === 'confirm') return value
  return 'team'
}

export function setupStepIndex(step: SetupStepId): number {
  return SETUP_STEPS.findIndex(s => s.id === step)
}

export function setupStepHref(step: SetupStepId): string {
  return step === 'team' ? '/setup' : `/setup?step=${step}`
}

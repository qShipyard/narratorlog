export type ActivationStepId = 'ai' | 'git' | 'repo' | 'delivery' | 'story'

export const ACTIVATION_STEPS: { id: ActivationStepId; label: string }[] = [
  { id: 'ai', label: 'AI' },
  { id: 'git', label: 'Git' },
  { id: 'repo', label: 'Repo' },
  { id: 'delivery', label: 'Send' },
  { id: 'story', label: 'Review' },
]

export function parseActivationStep(value: string | null): ActivationStepId {
  const ids = ACTIVATION_STEPS.map(s => s.id)
  if (value && ids.includes(value as ActivationStepId)) {
    return value as ActivationStepId
  }
  return 'ai'
}

export function activationStepIndex(step: ActivationStepId): number {
  return ACTIVATION_STEPS.findIndex(s => s.id === step)
}

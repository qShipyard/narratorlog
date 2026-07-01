'use client'

import { CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ACTIVATION_STEPS,
  ActivationStepId,
  activationStepIndex,
} from '@/lib/activation'

export function ActivationStepper({ current }: { current: ActivationStepId }) {
  const currentIndex = activationStepIndex(current)

  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 flex-wrap">
      {ACTIVATION_STEPS.map((s, i) => {
        const done = i < currentIndex
        const active = s.id === current
        return (
          <div key={s.id} className="flex items-center gap-1 sm:gap-2">
            <div
              className={cn(
                'flex items-center gap-1.5 text-xs',
                active ? 'text-foreground font-medium'
                  : done ? 'text-muted-foreground'
                  : 'text-muted-foreground/40',
              )}
            >
              <span
                className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-xs border',
                  active ? 'border-primary bg-primary text-primary-foreground'
                    : done ? 'border-muted-foreground/40 text-muted-foreground'
                    : 'border-muted-foreground/20 text-muted-foreground/40',
                )}
              >
                {done ? <CheckCircle className="h-3 w-3" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < ACTIVATION_STEPS.length - 1 && (
              <div className={cn('w-4 sm:w-8 h-px', done ? 'bg-primary' : 'bg-border')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

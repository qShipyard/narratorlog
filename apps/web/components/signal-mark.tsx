'use client'

import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

type SignalState = 'idle' | 'live' | 'loading'

const base = 'block size-2.5 rounded-[2px] bg-signal'

// The qShipyard signature mark. Static when idle, a slow breathing halo when
// something is live, and a steady blink as the universal loading indicator —
// it replaces spinners throughout the app.
export function SignalMark({
  state = 'idle',
  className,
}: {
  state?: SignalState
  className?: string
}) {
  if (state === 'live') {
    return (
      <span className={cn('relative inline-flex', className)}>
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-[2px] bg-signal"
          animate={{ opacity: [0.5, 0, 0.5], scale: [1, 2, 1] }}
          transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
        />
        <span className={cn(base, 'relative')} />
      </span>
    )
  }

  if (state === 'loading') {
    return (
      <motion.span
        className={cn(base, className)}
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity }}
      />
    )
  }

  return <span className={cn(base, className)} />
}

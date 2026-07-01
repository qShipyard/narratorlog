import type { Variants } from 'motion/react'

export const ease: [number, number, number, number] = [0.22, 1, 0.36, 1]

export const duration = {
  fast: 0.16,
  base: 0.24,
  slow: 0.36,
} as const

export const stagger = 0.04

export const riseIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: duration.base, ease } },
}

export const railDraw: Variants = {
  hidden: { scaleY: 0 },
  show: { scaleY: 1, transition: { duration: duration.slow, ease } },
}

export const markDraw: Variants = {
  hidden: { scale: 0, opacity: 0 },
  show: { scale: 1, opacity: 1, transition: { duration: duration.base, ease } },
}

export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: stagger } },
}

'use client'

import { useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { Check, X } from 'lucide-react'
import { teamApi, Repository, Scan } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { SignalMark } from '@/components/signal-mark'
import { duration, ease } from '@/lib/motion'
import { copy } from '@/lib/copy'
import { cn } from '@/lib/utils'
import { ActivationStepId } from '@/lib/activation'

const DISMISS_KEY = 'nl-onboarding-dismissed'

const dismissStore = {
  listeners: new Set<() => void>(),
  subscribe(cb: () => void) {
    dismissStore.listeners.add(cb)
    return () => dismissStore.listeners.delete(cb)
  },
  get: () => typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1',
  getServer: () => false,
  set() {
    localStorage.setItem(DISMISS_KEY, '1')
    dismissStore.listeners.forEach(l => l())
  },
}

function hasGitSource(config: Awaited<ReturnType<typeof teamApi.getConfig>>['data']): boolean {
  return ['github', 'gitlab', 'bitbucket'].some(
    p => config.sources?.[p]?.token_set === true,
  )
}

function nextActivationStep(
  config: Awaited<ReturnType<typeof teamApi.getConfig>>['data'],
  repos: Repository[],
  scans: Scan[],
): ActivationStepId {
  if (!config.ai.api_key_set) return 'ai'
  if (!hasGitSource(config)) return 'git'
  if (repos.length === 0) return 'repo'
  if (scans.length === 0) return 'story'
  return 'story'
}

export function FirstRunChecklist({
  repos,
  scans,
}: {
  repos: Repository[]
  scans: Scan[]
}) {
  const dismissed = useSyncExternalStore(
    dismissStore.subscribe,
    dismissStore.get,
    dismissStore.getServer,
  )

  const { data: config } = useQuery({
    queryKey: ['team-config'],
    queryFn: () => teamApi.getConfig().then(r => r.data),
  })

  const reviewable = scans.find(s => s.status === 'awaiting_approval')
  const activateStep = config ? nextActivationStep(config, repos, scans) : 'ai'

  const steps = [
    {
      title: 'Add an AI key',
      description: 'The model that turns commits into prose.',
      done: config?.ai.api_key_set === true,
      cta: (
        <Link href="/activate?step=ai">
          <Button size="sm">Add a key</Button>
        </Link>
      ),
    },
    {
      title: 'Connect git & a repository',
      description: 'Point narratorlog at the code it should read.',
      done: repos.length > 0 && hasGitSource(config!),
      cta: (
        <Link href="/activate?step=git">
          <Button size="sm">Connect a repository</Button>
        </Link>
      ),
    },
    {
      title: 'Run your first story',
      description: 'Read back what shipped as a story.',
      done: scans.length > 0,
      cta: (
        <Link href="/activate?step=story">
          <Button size="sm">{copy.runFirstStory}</Button>
        </Link>
      ),
    },
    {
      title: 'Review & deliver',
      description: 'Approve the draft and send it where your team reads.',
      done: scans.some(s => s.status === 'delivered'),
      cta: reviewable ? (
        <Link href={`/scans/${reviewable.id}/review`}>
          <Button size="sm">Review draft</Button>
        </Link>
      ) : (
        <Link href="/scans">
          <Button size="sm" variant="outline">{copy.viewStories}</Button>
        </Link>
      ),
    },
  ]

  const currentIndex = steps.findIndex(s => !s.done)
  const allDone = currentIndex === -1

  if (dismissed || allDone || !config || config.activation_complete) return null

  return (
    <AnimatePresence>
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: duration.base, ease }}
        className="rounded-xl border bg-card p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Setup · {steps.filter(s => s.done).length} of {steps.length}</p>
            <h2 className="font-display text-lg font-semibold mt-1">Get to your first story</h2>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/activate?step=${activateStep}`}>
              <Button size="sm" variant="outline">Continue setup</Button>
            </Link>
            <button
              onClick={() => dismissStore.set()}
              aria-label="Dismiss setup"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <ol className="mt-5 space-y-1">
          {steps.map((step, i) => {
            const current = i === currentIndex
            const last = i === steps.length - 1
            return (
              <li key={step.title} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <StepNode index={i} done={step.done} current={current} />
                  {!last && (
                    <span className={cn('w-px flex-1 my-1', step.done ? 'bg-primary' : 'bg-rail')} />
                  )}
                </div>

                <div className={cn('flex-1 pb-4', last && 'pb-0')}>
                  <p
                    className={cn(
                      'text-sm font-medium',
                      step.done ? 'text-muted-foreground' : 'text-foreground',
                    )}
                  >
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                  {current && <div className="mt-2.5">{step.cta}</div>}
                </div>
              </li>
            )
          })}
        </ol>
      </motion.section>
    </AnimatePresence>
  )
}

function StepNode({ index, done, current }: { index: number; done: boolean; current: boolean }) {
  if (done) {
    return (
      <span className="size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
        <Check className="h-3 w-3" />
      </span>
    )
  }
  if (current) {
    return (
      <span className="size-5 rounded-full border border-signal/50 flex items-center justify-center">
        <SignalMark state="live" />
      </span>
    )
  }
  return (
    <span className="size-5 rounded-full border border-rail flex items-center justify-center font-mono text-[0.6rem] font-bold text-muted-foreground">
      {index + 1}
    </span>
  )
}

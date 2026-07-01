import { Repository, Scan, TeamConfigView, HealthResponse } from '@/lib/api'

export type ReadinessCheckId =
  | 'ai_configured'
  | 'git_source'
  | 'repo_connected'
  | 'story_generated'
  | 'story_delivered'
  | 'delivery_routing'
  | 'worker_healthy'

export type ReadinessCheck = {
  id: ReadinessCheckId
  label: string
  ok: boolean
  fixHref?: string
  fixLabel?: string
}

export type Readiness = {
  canRunStory: boolean
  canDeliver: boolean
  checks: ReadinessCheck[]
  activationStep: 0 | 1 | 2 | 3 | 4
  activationComplete: boolean
  /** First check blocking a story run, if any. */
  runStoryBlocker?: ReadinessCheck
}

const GIT_PROVIDERS = ['github', 'gitlab', 'bitbucket'] as const

function hasGitSource(config?: TeamConfigView): boolean {
  if (!config?.sources) return false
  return GIT_PROVIDERS.some(p => config.sources[p]?.token_set === true)
}

export function computeReadiness(
  config: TeamConfigView | undefined,
  repos: Repository[],
  scans: Scan[] = [],
  health?: HealthResponse,
): Readiness {
  const workerOk = health == null || health.checks.worker?.ok !== false

  const checks: ReadinessCheck[] = [
    {
      id: 'ai_configured',
      label: 'AI writer',
      ok: config?.ai.api_key_set === true,
      fixHref: '/settings#ai',
      fixLabel: 'Add AI key',
    },
    {
      id: 'git_source',
      label: 'Git access',
      ok: hasGitSource(config),
      fixHref: '/settings#sources',
      fixLabel: 'Add token',
    },
    {
      id: 'repo_connected',
      label: 'Repository',
      ok: repos.length > 0,
      fixHref: '/repositories',
      fixLabel: 'Connect repo',
    },
    {
      id: 'story_generated',
      label: 'First story',
      ok: scans.length > 0,
      fixHref: '/repositories',
      fixLabel: 'Run story',
    },
    {
      id: 'story_delivered',
      label: 'Delivered',
      ok: scans.some(s => s.status === 'delivered'),
      fixHref: '/scans',
      fixLabel: 'Review stories',
    },
    {
      id: 'delivery_routing',
      label: 'Delivery routes',
      ok: (config?.routing?.length ?? 0) > 0,
      fixHref: '/settings#delivery',
      fixLabel: 'Add route',
    },
    {
      id: 'worker_healthy',
      label: 'Background worker',
      ok: workerOk,
      fixHref: '/settings',
      fixLabel: 'Check worker',
    },
  ]

  const aiOk = checks.find(c => c.id === 'ai_configured')!.ok
  const gitOk = checks.find(c => c.id === 'git_source')!.ok
  const repoOk = checks.find(c => c.id === 'repo_connected')!.ok
  const storyOk = checks.find(c => c.id === 'story_generated')!.ok
  const deliveredOk = checks.find(c => c.id === 'story_delivered')!.ok
  const routingOk = checks.find(c => c.id === 'delivery_routing')!.ok

  const runStoryBlocker = checks.find(
    c => (c.id === 'ai_configured' || c.id === 'git_source' || c.id === 'repo_connected') && !c.ok,
  )

  let activationStep: Readiness['activationStep'] = 0
  if (aiOk) activationStep = 1
  if (aiOk && gitOk) activationStep = 2
  if (aiOk && gitOk && repoOk) activationStep = 3
  if (aiOk && gitOk && repoOk && (routingOk || storyOk)) activationStep = 4

  return {
    canRunStory: aiOk && gitOk && repoOk,
    canDeliver: routingOk,
    checks,
    activationStep,
    activationComplete:
      config?.activation_complete === true ||
      (aiOk && gitOk && repoOk && storyOk && deliveredOk),
    runStoryBlocker,
  }
}

/** Checks shown in the dashboard readiness strip (setup essentials). */
export const READINESS_STRIP_IDS: ReadinessCheckId[] = [
  'ai_configured',
  'git_source',
  'repo_connected',
  'delivery_routing',
]

export function stripChecks(readiness: Readiness): ReadinessCheck[] {
  const base = readiness.checks.filter(c => READINESS_STRIP_IDS.includes(c.id))
  const worker = readiness.checks.find(c => c.id === 'worker_healthy')
  if (worker && !worker.ok) return [...base, worker]
  return base
}

export function allStripChecksOk(readiness: Readiness): boolean {
  return stripChecks(readiness).every(c => c.ok)
}

'use client'

import { useEffect, useState, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import Link from 'next/link'
import {
  authApi,
  setupApi,
  reposApi,
  scansApi,
  teamApi,
  TeamConfigUpdate,
  Repository,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SignalMark } from '@/components/signal-mark'
import { ActivationStepper } from '@/components/activation/activation-stepper'
import { AiConfigFields, aiConfigValid } from '@/components/settings/ai-config-fields'
import { ConnectRepoDialog } from '@/components/repositories/connect-repo-dialog'
import { KeyField, KeyGuideId } from '@/components/key-field'
import { PipelineTimeline, isLiveStatus } from '@/components/pipeline-timeline'
import { StatusLine } from '@/components/scan-bits'
import { useActivationSave, useMarkActivationComplete, useSkipActivation } from '@/lib/hooks/use-activation'
import { useScanTrigger } from '@/lib/hooks/use-scan-trigger'
import {
  parseActivationStep,
  ActivationStepId,
  activationStepIndex,
  ACTIVATION_STEPS,
  isActivationCompleteLocal,
} from '@/lib/activation'
import {
  AUDIENCES,
  OUTPUT_PLUGINS,
  INTEGRATION_SECRET,
  GIT_PROVIDERS,
  GitProvider,
  DEFAULT_AI_MODELS,
} from '@/lib/team-config-constants'
import { shouldPollScanStatus } from '@/lib/scan-polling'
import { duration, ease } from '@/lib/motion'
import { toast } from 'sonner'
import { GitBranch } from 'lucide-react'

function ActivateContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const step = parseActivationStep(searchParams.get('step'))
  const redirected = useRef(false)

  const save = useActivationSave()
  const markComplete = useMarkActivationComplete()
  const skip = useSkipActivation()
  const trigger = useScanTrigger()

  const [aiForm, setAiForm] = useState<TeamConfigUpdate['ai'] | null>(null)
  const [gitProvider, setGitProvider] = useState<GitProvider>('github')
  const [gitToken, setGitToken] = useState('')
  const [gitBaseUrl, setGitBaseUrl] = useState('')
  const [connectedRepo, setConnectedRepo] = useState<Repository | null>(null)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [deliveryAudience, setDeliveryAudience] = useState('developers')
  const [deliveryPlugin, setDeliveryPlugin] = useState('slack')
  const [deliverySecret, setDeliverySecret] = useState('')
  const storyTriggeredRef = useRef(false)

  const { data: setupStatus } = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => setupApi.status().then(r => r.data),
    retry: false,
  })

  const { data: user, isError: authError, isLoading: authLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => authApi.me().then(r => r.data),
    retry: false,
    enabled: setupStatus?.setup_complete === true,
  })

  const { data: teamConfig, isLoading: configLoading } = useQuery({
    queryKey: ['team-config'],
    queryFn: () => teamApi.getConfig().then(r => r.data),
    enabled: !!user,
  })

  const { data: reposData } = useQuery({
    queryKey: ['repos'],
    queryFn: () => reposApi.list().then(r => r.data),
    enabled: !!user,
  })
  const repos = reposData?.data ?? []
  const activeRepo = connectedRepo ?? repos[0] ?? null

  const { data: scansData } = useQuery({
    queryKey: ['scans'],
    queryFn: () => scansApi.list().then(r => r.data),
    enabled: step === 'story' && !!user,
    refetchInterval: step === 'story' ? 3000 : false,
  })

  const latestStory = scansData?.data?.find(s => s.repository?.id === activeRepo?.id)
  const storyStatus = latestStory?.status

  const { data: liveScan } = useQuery({
    queryKey: ['scan', latestStory?.id],
    queryFn: () => scansApi.get(latestStory!.id).then(r => r.data),
    enabled: !!latestStory?.id && step === 'story',
    refetchInterval: q =>
      shouldPollScanStatus(q.state.data?.status) ? 3000 : false,
  })

  const displayStatus = liveScan?.status ?? storyStatus

  useEffect(() => {
    if (setupStatus && !setupStatus.setup_complete) router.replace('/setup')
  }, [setupStatus, router])

  useEffect(() => {
    if (authError) router.replace('/login')
  }, [authError, router])

  useEffect(() => {
    if (teamConfig?.activation_complete || isActivationCompleteLocal()) {
      router.replace('/dashboard')
    }
  }, [teamConfig?.activation_complete, router])

  if (teamConfig && !aiForm) {
    setAiForm({
      provider: teamConfig.ai.provider || 'anthropic',
      model: teamConfig.ai.model || DEFAULT_AI_MODELS.anthropic,
      base_url: teamConfig.ai.base_url || '',
      depth: teamConfig.ai.depth || 'standard',
      api_key: '',
    })
  }

  useEffect(() => {
    if (step === 'story' && activeRepo && !storyTriggeredRef.current && !latestStory) {
      storyTriggeredRef.current = true
      trigger.mutate({ repository_id: activeRepo.id })
    }
  }, [step, activeRepo, latestStory, trigger])

  useEffect(() => {
    if (redirected.current || step !== 'story' || !latestStory) return
    if (displayStatus === 'awaiting_approval') {
      redirected.current = true
      markComplete.mutate(undefined, {
        onSuccess: () => router.push(`/scans/${latestStory.id}/review`),
      })
    }
  }, [step, displayStatus, latestStory, markComplete, router])

  function goToStep(next: ActivationStepId) {
    router.replace(`/activate?step=${next}`)
  }

  async function handleSaveAi() {
    if (!aiForm || !aiConfigValid(aiForm, teamConfig?.ai.api_key_set)) {
      toast.error('Add a provider, model, and API key to continue.')
      return
    }
    await save.mutateAsync(base => ({ ...base, ai: { ...aiForm } }))
    toast.success('AI writer saved.')
    goToStep('git')
  }

  async function handleSaveGit() {
    if (!gitToken.trim() && !teamConfig?.sources?.[gitProvider]?.token_set) {
      toast.error('Paste a personal access token to continue.')
      return
    }
    await save.mutateAsync(base => ({
      ...base,
      sources: {
        ...base.sources,
        [gitProvider]: { token: gitToken, base_url: gitBaseUrl },
      },
    }))
    toast.success('Git access saved.')
    goToStep('repo')
  }

  async function handleSaveDelivery() {
    if (deliverySecret.trim()) {
      const envVar = INTEGRATION_SECRET[deliveryPlugin]
      await save.mutateAsync(base => ({
        ...base,
        integrations: {
          ...base.integrations,
          [deliveryPlugin]: { [envVar]: deliverySecret },
        },
        routing: [
          ...base.routing.filter(r => r.audience !== deliveryAudience),
          { audience: deliveryAudience, plugin: deliveryPlugin, config: {} },
        ],
      }))
      toast.success('Delivery route saved.')
    }
    goToStep('story')
  }

  function handleSkipAll() {
    skip.mutate(undefined, { onSuccess: () => router.push('/dashboard') })
  }

  if (authLoading || !user || configLoading || !aiForm) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-muted-foreground text-sm">
        <SignalMark state="loading" /> Loading…
      </div>
    )
  }

  const stepNum = activationStepIndex(step) + 1

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-10 px-4">
      <motion.div
        className="w-full max-w-lg space-y-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.slow, ease }}
      >
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex items-center gap-2.5">
            <SignalMark state="live" />
            <span className="leading-none">
              <span className="block font-display text-2xl font-bold tracking-tight">narratorlog</span>
              <span className="block font-mono text-[0.5rem] uppercase tracking-[0.2em] text-muted-foreground mt-0.5">
                Get to your first story
              </span>
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            Step {stepNum} of {ACTIVATION_STEPS.length}
          </p>
        </div>

        <ActivationStepper current={step} />

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: duration.base, ease }}
          >
            {step === 'ai' && (
              <Card>
                <CardHeader>
                  <CardTitle>Choose your AI writer</CardTitle>
                  <CardDescription>
                    The model that turns commits into prose for each audience.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <AiConfigFields
                    value={aiForm}
                    apiKeySet={teamConfig?.ai.api_key_set}
                    onChange={setAiForm}
                  />
                  <div className="flex gap-2 pt-2">
                    <Button variant="ghost" className="text-muted-foreground" onClick={handleSkipAll}>
                      Skip for now
                    </Button>
                    <Button className="flex-1" disabled={save.isPending} onClick={handleSaveAi}>
                      {save.isPending ? 'Saving…' : 'Continue'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 'git' && (
              <Card>
                <CardHeader>
                  <CardTitle>Connect git</CardTitle>
                  <CardDescription>
                    Read-only access to commits and pull requests.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Platform</Label>
                    <Select value={gitProvider} onValueChange={v => setGitProvider(v as GitProvider)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {GIT_PROVIDERS.map(p => (
                          <SelectItem key={p} value={p}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                            {teamConfig?.sources?.[p]?.token_set ? ' · connected' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <KeyField
                    guideId={gitProvider as KeyGuideId}
                    label="Personal access token"
                    value={gitToken}
                    saved={teamConfig?.sources?.[gitProvider]?.token_set}
                    onChange={setGitToken}
                  />
                  {(gitProvider === 'github' || gitProvider === 'gitlab') && (
                    <div className="space-y-2">
                      <Label className="text-xs">Base URL (optional)</Label>
                      <Input
                        value={gitBaseUrl}
                        onChange={e => setGitBaseUrl(e.target.value)}
                        placeholder="Self-hosted instance URL"
                      />
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" onClick={() => goToStep('ai')}>Back</Button>
                    <Button className="flex-1" disabled={save.isPending} onClick={handleSaveGit}>
                      {save.isPending ? 'Saving…' : 'Continue'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 'repo' && (
              <Card>
                <CardHeader>
                  <CardTitle>Connect a repository</CardTitle>
                  <CardDescription>
                    We register a webhook so stories run automatically on push.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {activeRepo ? (
                    <div className="flex items-center gap-3 rounded-lg border p-4">
                      <GitBranch className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm font-bold truncate">{activeRepo.full_name}</p>
                        <p className="text-xs text-muted-foreground">{activeRepo.default_branch}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No repository connected yet.</p>
                  )}
                  <Button variant="outline" className="w-full" onClick={() => setShowConnectModal(true)}>
                    {activeRepo ? 'Connect another repository' : 'Browse repositories'}
                  </Button>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" onClick={() => goToStep('git')}>Back</Button>
                    <Button className="flex-1" disabled={!activeRepo} onClick={() => goToStep('delivery')}>
                      Continue
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 'delivery' && (
              <Card>
                <CardHeader>
                  <CardTitle>Where should stories go?</CardTitle>
                  <CardDescription>
                    Optional — review and copy drafts in the app anytime.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Audience</Label>
                      <Select value={deliveryAudience} onValueChange={setDeliveryAudience}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {AUDIENCES.map(a => (
                            <SelectItem key={a} value={a}>{a}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Channel</Label>
                      <Select value={deliveryPlugin} onValueChange={setDeliveryPlugin}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {OUTPUT_PLUGINS.map(p => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <KeyField
                    guideId={deliveryPlugin as KeyGuideId}
                    value={deliverySecret}
                    saved={Boolean(
                      teamConfig?.integrations?.[deliveryPlugin]?.[INTEGRATION_SECRET[deliveryPlugin]],
                    )}
                    onChange={setDeliverySecret}
                  />
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" onClick={() => goToStep('repo')}>Back</Button>
                    <Button variant="ghost" onClick={() => goToStep('story')}>Skip</Button>
                    <Button className="flex-1" disabled={save.isPending} onClick={handleSaveDelivery}>
                      {save.isPending ? 'Saving…' : 'Continue'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 'story' && (
              <Card>
                <CardHeader>
                  <CardTitle>Your first story</CardTitle>
                  <CardDescription>
                    {activeRepo
                      ? `Reading ${activeRepo.full_name} — last 7 days`
                      : 'Connect a repository first.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!activeRepo ? (
                    <Button onClick={() => goToStep('repo')}>Connect a repository</Button>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-sm">
                        <SignalMark state={displayStatus && isLiveStatus(displayStatus) ? 'live' : 'idle'} />
                        {displayStatus ? <StatusLine status={displayStatus} /> : 'Starting…'}
                      </div>
                      {displayStatus && (
                        <div className="rounded-lg border px-4 py-3">
                          <PipelineTimeline status={displayStatus} />
                        </div>
                      )}
                      {displayStatus === 'failed' && (
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">
                            {liveScan?.error_hint ?? 'Check your AI key and try again.'}
                          </p>
                          <Link href="/settings#ai">
                            <Button variant="outline" size="sm">Open AI settings</Button>
                          </Link>
                        </div>
                      )}
                      {displayStatus === 'awaiting_approval' && latestStory && (
                        <Button className="w-full" asChild>
                          <Link href={`/scans/${latestStory.id}/review`}>Review draft</Link>
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>

        <p className="text-center">
          <button
            type="button"
            onClick={handleSkipAll}
            className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
          >
            I&apos;ll configure later → dashboard
          </button>
        </p>
      </motion.div>

      <ConnectRepoDialog
        open={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onConnected={repo => {
          if (repo) setConnectedRepo(repo)
        }}
      />
    </div>
  )
}

export default function ActivatePage() {
  return (
    <Suspense>
      <ActivateContent />
    </Suspense>
  )
}

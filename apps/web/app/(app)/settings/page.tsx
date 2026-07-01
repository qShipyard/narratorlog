'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { teamApi, TeamConfigUpdate, RoutingEntry, configViewToUpdate } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/page-header'
import { KeyField, KeyGuideId } from '@/components/key-field'
import { LedgerPanel } from '@/components/ledger-list'

const TABS = [
  { id: 'ai', label: 'AI writer' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'sources', label: 'Git access' },
  { id: 'privacy', label: 'Privacy' },
] as const

type SettingsTab = (typeof TABS)[number]['id']

function isSettingsTab(value: string): value is SettingsTab {
  return TABS.some(t => t.id === value)
}

function tabFromHash(): SettingsTab {
  if (typeof window === 'undefined') return 'ai'
  const hash = window.location.hash.replace('#', '')
  return isSettingsTab(hash) ? hash : 'ai'
}

function Section({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <LedgerPanel className="p-6 space-y-5">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="font-display text-lg font-semibold mt-1">{title}</h2>
        {description && (
          <p className="text-muted-foreground text-sm mt-1 max-w-prose">{description}</p>
        )}
      </div>
      {children}
    </LedgerPanel>
  )
}

const AUDIENCES = ['developers', 'product', 'marketing', 'public']
const AI_PROVIDERS = ['anthropic', 'openai', 'ollama']
const OUTPUT_PLUGINS = ['slack', 'notion', 'discord', 'linear', 'email']
const INTEGRATION_SECRET: Record<string, string> = {
  slack: 'SLACK_BOT_TOKEN',
  notion: 'NOTION_TOKEN',
  discord: 'DISCORD_WEBHOOK_URL',
  linear: 'LINEAR_API_KEY',
  email: 'SMTP_PASSWORD',
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<SettingsTab>(() => tabFromHash())

  const { data, isLoading } = useQuery({
    queryKey: ['team-config'],
    queryFn: () => teamApi.getConfig().then(r => r.data),
  })

  const [form, setForm] = useState<TeamConfigUpdate | null>(null)

  const [syncedFrom, setSyncedFrom] = useState<typeof data>(undefined)
  if (data && data !== syncedFrom) {
    setSyncedFrom(data)
    setForm(configViewToUpdate(data))
  }

  useEffect(() => {
    function onHashChange() {
      setTab(tabFromHash())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function selectTab(next: string) {
    if (!isSettingsTab(next)) return
    setTab(next)
    window.history.replaceState(null, '', `#${next}`)
  }

  const save = useMutation({
    mutationFn: (payload: TeamConfigUpdate) => teamApi.updateConfig(payload),
    onSuccess: () => {
      toast.success('Settings saved.')
      qc.invalidateQueries({ queryKey: ['team-config'] })
    },
    onError: () => toast.error("Couldn't save settings. Try again."),
  })

  if (isLoading || !form) {
    return <div className="p-8 text-muted-foreground text-sm">Loading…</div>
  }

  function setIntegrationSecret(plugin: string, value: string) {
    const envVar = INTEGRATION_SECRET[plugin]
    setForm(f =>
      f ? { ...f, integrations: { ...f.integrations, [plugin]: { [envVar]: value } } } : f,
    )
  }

  function addRouting() {
    setForm(f =>
      f
        ? {
            ...f,
            routing: [
              ...f.routing,
              { audience: AUDIENCES[0], plugin: OUTPUT_PLUGINS[0], config: {} },
            ],
          }
        : f,
    )
  }

  function updateRouting(i: number, patch: Partial<RoutingEntry>) {
    setForm(f => {
      if (!f) return f
      const routing = f.routing.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
      return { ...f, routing }
    })
  }

  function removeRouting(i: number) {
    setForm(f => (f ? { ...f, routing: f.routing.filter((_, idx) => idx !== i) } : f))
  }

  function setSourceField(provider: string, field: 'token' | 'base_url', value: string) {
    setForm(f =>
      f
        ? {
            ...f,
            sources: {
              ...f.sources,
              [provider]: { ...(f.sources?.[provider] ?? { token: '', base_url: '' }), [field]: value },
            },
          }
        : f,
    )
  }

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Connect git, choose your AI writer, and set up delivery."
      />

      <Tabs value={tab} onValueChange={selectTab} className="gap-6">
        <TabsList variant="line" className="w-full justify-start border-b border-border/70 pb-px">
          {TABS.map(t => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="font-mono text-[0.6875rem] font-bold uppercase tracking-[0.14em] px-3 pb-2.5"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="ai" className="mt-0">
          <Section
            eyebrow="Generation"
            title="AI writer"
            description="The model that turns commits into drafts."
          >
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={form.ai.provider}
                onValueChange={v => setForm({ ...form, ai: { ...form.ai, provider: v } })}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select provider…" />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map(p => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Model</Label>
              <Input
                placeholder="e.g. gpt-4o"
                value={form.ai.model}
                onChange={e => setForm({ ...form, ai: { ...form.ai, model: e.target.value } })}
              />
            </div>

            {form.ai.provider === 'anthropic' || form.ai.provider === 'openai' ? (
              <KeyField
                guideId={form.ai.provider as KeyGuideId}
                value={form.ai.api_key}
                saved={data?.ai.api_key_set}
                onChange={v => setForm({ ...form, ai: { ...form.ai, api_key: v } })}
              />
            ) : (
              <div className="space-y-2">
                <Label>API key</Label>
                <Input
                  type="password"
                  placeholder={
                    data?.ai.api_key_set ? 'Saved — leave blank to keep' : 'Optional for local models'
                  }
                  value={form.ai.api_key}
                  onChange={e => setForm({ ...form, ai: { ...form.ai, api_key: e.target.value } })}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input
                placeholder="Optional — for Ollama or compatible endpoints"
                value={form.ai.base_url}
                onChange={e => setForm({ ...form, ai: { ...form.ai, base_url: e.target.value } })}
              />
            </div>

            <div className="space-y-2">
              <Label>Depth</Label>
              <Select
                value={form.ai.depth || 'standard'}
                onValueChange={v => setForm({ ...form, ai: { ...form.ai, depth: v } })}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="deep">Deep</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="delivery" className="mt-0">
          <Section
            eyebrow="Channels"
            title="Delivery"
            description="Where approved stories go after you sign off."
          >
            <div className="space-y-4">
              <p className="eyebrow">Credentials</p>
              {OUTPUT_PLUGINS.map(plugin => (
                <KeyField
                  key={plugin}
                  guideId={plugin as KeyGuideId}
                  value={form.integrations?.[plugin]?.[INTEGRATION_SECRET[plugin]] ?? ''}
                  saved={Boolean(data?.integrations?.[plugin]?.[INTEGRATION_SECRET[plugin]])}
                  onChange={v => setIntegrationSecret(plugin, v)}
                />
              ))}
            </div>

            <div className="space-y-3 border-t border-border/70 pt-5">
              <p className="eyebrow">Routes</p>
              {form.routing.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No routes yet. Add one to send a draft to Slack, email, or another channel.
                </p>
              )}
              {form.routing.map((r, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap">
                  <Select value={r.audience} onValueChange={v => updateRouting(i, { audience: v })}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUDIENCES.map(a => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <span className="font-mono text-muted-foreground text-sm">→</span>

                  <Select value={r.plugin} onValueChange={v => updateRouting(i, { plugin: v })}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OUTPUT_PLUGINS.map(p => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    className="flex-1 min-w-40 font-mono text-xs"
                    placeholder='{"channel":"#updates"}'
                    defaultValue={JSON.stringify(r.config ?? {})}
                    onBlur={e => {
                      try {
                        updateRouting(i, { config: JSON.parse(e.target.value || '{}') })
                      } catch {
                        toast.error('Route options must be valid JSON.')
                      }
                    }}
                  />

                  <Button variant="ghost" size="sm" onClick={() => removeRouting(i)}>
                    Remove
                  </Button>
                </div>
              ))}

              <button
                type="button"
                className="font-mono text-xs uppercase tracking-[0.1em] text-primary hover:underline"
                onClick={addRouting}
              >
                + Add route
              </button>
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="sources" className="mt-0">
          <Section
            eyebrow="Repositories"
            title="Git access"
            description="Tokens are encrypted at rest. Leave blank to keep an existing token."
          >
            {(['github', 'gitlab', 'bitbucket'] as const).map(p => {
              const connected = data?.sources?.[p]?.token_set
              return (
                <div key={p} className="space-y-3 border-t border-border/70 pt-5 first:border-t-0 first:pt-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono text-sm font-bold capitalize">{p}</h3>
                    {connected && (
                      <span className="inline-flex items-center gap-1 font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-emerald-700">
                        <span className="size-1.5 rounded-full bg-current" />
                        Connected
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    <KeyField
                      guideId={p}
                      label="Personal access token"
                      value={form.sources?.[p]?.token ?? ''}
                      saved={connected}
                      onChange={v => setSourceField(p, 'token', v)}
                    />
                    {(p === 'github' || p === 'gitlab') && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Base URL (optional)</Label>
                        <Input
                          placeholder={
                            p === 'github'
                              ? 'https://github.example.com — GitHub Enterprise'
                              : 'https://gitlab.example.com — self-hosted GitLab'
                          }
                          value={form.sources?.[p]?.base_url ?? ''}
                          onChange={e => setSourceField(p, 'base_url', e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </Section>
        </TabsContent>

        <TabsContent value="privacy" className="mt-0">
          <Section
            eyebrow="Safeguards"
            title="Privacy"
            description="Control what leaves your infrastructure when a story runs."
          >
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={form.privacy.scrub_secrets}
                onChange={e =>
                  setForm({ ...form, privacy: { ...form.privacy, scrub_secrets: e.target.checked } })
                }
              />
              <span>
                Scrub secrets from diffs
                <span className="block text-muted-foreground text-xs mt-0.5">
                  Redact tokens and keys before any diff is read.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={form.privacy.local_only}
                onChange={e =>
                  setForm({ ...form, privacy: { ...form.privacy, local_only: e.target.checked } })
                }
              />
              <span>
                Local-only mode
                <span className="block text-muted-foreground text-xs mt-0.5">
                  Never send code context to an external AI provider.
                </span>
              </span>
            </label>
          </Section>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-0 flex justify-end border-t border-border/70 bg-background/90 py-4 backdrop-blur-sm">
        <Button disabled={save.isPending} onClick={() => save.mutate(form)}>
          {save.isPending ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </div>
  )
}

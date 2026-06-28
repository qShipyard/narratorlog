'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { teamApi, TeamConfigUpdate, RoutingEntry } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/page-header'

const SECTIONS = [
  { id: 'ai', label: 'AI provider' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'sources', label: 'Git sources' },
  { id: 'privacy', label: 'Privacy' },
]

function Section({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-8 rounded-xl border bg-card p-6 space-y-5">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="font-display text-lg font-semibold mt-1">{title}</h2>
        {description && (
          <p className="text-muted-foreground text-sm mt-1">{description}</p>
        )}
      </div>
      {children}
    </section>
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
  const { data, isLoading } = useQuery({
    queryKey: ['team-config'],
    queryFn: () => teamApi.getConfig().then((r) => r.data),
  })

  const [form, setForm] = useState<TeamConfigUpdate | null>(null)

  const [syncedFrom, setSyncedFrom] = useState<typeof data>(undefined)
  if (data && data !== syncedFrom) {
    setSyncedFrom(data)
    const sourceSeed: Record<string, { token: string; base_url: string }> = {}
    for (const p of ['github', 'gitlab', 'bitbucket']) {
      sourceSeed[p] = { token: '', base_url: data.sources?.[p]?.base_url ?? '' }
    }
    setForm({
      ai: { ...data.ai, api_key: '' },
      privacy: data.privacy,
      integrations: {},
      routing: data.routing ?? [],
      sources: sourceSeed,
    })
  }

  const save = useMutation({
    mutationFn: (payload: TeamConfigUpdate) => teamApi.updateConfig(payload),
    onSuccess: () => {
      toast.success('Settings saved.')
      qc.invalidateQueries({ queryKey: ['team-config'] })
    },
    onError: () => toast.error('Failed to save settings.'),
  })

  if (isLoading || !form) {
    return <div className="p-8 text-muted-foreground text-sm">Loading…</div>
  }

  function setIntegrationSecret(plugin: string, value: string) {
    const envVar = INTEGRATION_SECRET[plugin]
    setForm((f) =>
      f ? { ...f, integrations: { ...f.integrations, [plugin]: { [envVar]: value } } } : f,
    )
  }

  function addRouting() {
    setForm((f) =>
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
    setForm((f) => {
      if (!f) return f
      const routing = f.routing.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
      return { ...f, routing }
    })
  }

  function removeRouting(i: number) {
    setForm((f) => (f ? { ...f, routing: f.routing.filter((_, idx) => idx !== i) } : f))
  }

  function setSourceField(provider: string, field: 'token' | 'base_url', value: string) {
    setForm((f) =>
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
    <div className="p-8">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Tell narratorlog where to read from, how to write, and where to deliver."
      />

      <div className="mt-8 grid lg:grid-cols-[170px_minmax(0,1fr)] gap-10 max-w-4xl">
        <nav className="hidden lg:block">
          <ul className="sticky top-8 space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block rounded-md px-3 py-1.5 font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-6 min-w-0">
          <Section
            id="ai"
            eyebrow="Generation"
            title="AI provider"
            description="The model that turns commits into prose."
          >
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={form.ai.provider}
                onValueChange={(v) => setForm({ ...form, ai: { ...form.ai, provider: v } })}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select provider…" />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map((p) => (
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
                placeholder="e.g. claude-3-5-sonnet-20241022"
                value={form.ai.model}
                onChange={(e) => setForm({ ...form, ai: { ...form.ai, model: e.target.value } })}
              />
            </div>

            <div className="space-y-2">
              <Label>API key</Label>
              <Input
                type="password"
                placeholder={
                  data?.ai.api_key_set ? '•••••••• (saved — leave blank to keep)' : 'API key'
                }
                value={form.ai.api_key}
                onChange={(e) => setForm({ ...form, ai: { ...form.ai, api_key: e.target.value } })}
              />
            </div>

            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input
                placeholder="Optional — for Ollama or compatible endpoints"
                value={form.ai.base_url}
                onChange={(e) => setForm({ ...form, ai: { ...form.ai, base_url: e.target.value } })}
              />
            </div>

            <div className="space-y-2">
              <Label>Depth</Label>
              <Select
                value={form.ai.depth || 'standard'}
                onValueChange={(v) => setForm({ ...form, ai: { ...form.ai, depth: v } })}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">standard</SelectItem>
                  <SelectItem value="deep">deep</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Section>

          <Section
            id="delivery"
            eyebrow="Channels"
            title="Delivery"
            description="Where approved changelogs are published, and who reads each one."
          >
            <div className="space-y-3">
              <p className="eyebrow">Credentials</p>
              {OUTPUT_PLUGINS.map((plugin) => (
                <div key={plugin} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 font-mono text-xs capitalize">{plugin}</span>
                  <Input
                    type="password"
                    placeholder={
                      data?.integrations?.[plugin]?.[INTEGRATION_SECRET[plugin]]
                        ? '•••••••• (saved)'
                        : INTEGRATION_SECRET[plugin]
                    }
                    onChange={(e) => setIntegrationSecret(plugin, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-3 border-t pt-5">
              <p className="eyebrow">Routing</p>
              {form.routing.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No routes yet. Add one to send an audience’s draft to a channel.
                </p>
              )}
              {form.routing.map((r, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap">
                  <Select
                    value={r.audience}
                    onValueChange={(v) => updateRouting(i, { audience: v })}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUDIENCES.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <span className="font-mono text-muted-foreground text-sm">→</span>

                  <Select
                    value={r.plugin}
                    onValueChange={(v) => updateRouting(i, { plugin: v })}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OUTPUT_PLUGINS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    className="flex-1 min-w-40 font-mono text-xs"
                    placeholder='{"channel":"#marketing"}'
                    defaultValue={JSON.stringify(r.config ?? {})}
                    onBlur={(e) => {
                      try {
                        updateRouting(i, { config: JSON.parse(e.target.value || '{}') })
                      } catch {
                        toast.error('Destination must be valid JSON.')
                      }
                    }}
                  />

                  <Button variant="ghost" size="sm" onClick={() => removeRouting(i)}>
                    Remove
                  </Button>
                </div>
              ))}

              <button
                className="font-mono text-xs uppercase tracking-[0.1em] text-primary hover:underline"
                onClick={addRouting}
              >
                + Add route
              </button>
            </div>
          </Section>

          <Section
            id="sources"
            eyebrow="Repositories"
            title="Git sources"
            description="Personal access tokens, encrypted at rest. Leave blank to keep an existing token."
          >
            {(['github', 'gitlab', 'bitbucket'] as const).map((p) => {
              const connected = data?.sources?.[p]?.token_set
              return (
                <div key={p} className="space-y-3 border-t pt-5 first:border-t-0 first:pt-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono text-sm font-bold capitalize">{p}</h3>
                    {connected && (
                      <span className="inline-flex items-center gap-1 font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-400">
                        <span className="size-1.5 rounded-full bg-current" />
                        Connected
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Personal access token</Label>
                      <Input
                        type="password"
                        placeholder={
                          connected
                            ? '•••••••• (saved — leave blank to keep)'
                            : 'Personal access token'
                        }
                        value={form.sources?.[p]?.token ?? ''}
                        onChange={(e) => setSourceField(p, 'token', e.target.value)}
                      />
                    </div>
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
                          onChange={(e) => setSourceField(p, 'base_url', e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </Section>

          <Section
            id="privacy"
            eyebrow="Safeguards"
            title="Privacy"
            description="What leaves your infrastructure when a scan runs."
          >
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={form.privacy.scrub_secrets}
                onChange={(e) =>
                  setForm({ ...form, privacy: { ...form.privacy, scrub_secrets: e.target.checked } })
                }
              />
              <span>
                Scrub secrets from diffs
                <span className="block text-muted-foreground text-xs">
                  Redact tokens and keys before any diff is read.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={form.privacy.local_only}
                onChange={(e) =>
                  setForm({ ...form, privacy: { ...form.privacy, local_only: e.target.checked } })
                }
              />
              <span>
                Local-only
                <span className="block text-muted-foreground text-xs">
                  Never send code context to an external AI provider.
                </span>
              </span>
            </label>
          </Section>

          <div className="sticky bottom-0 -mx-1 flex justify-end border-t bg-background/80 px-1 py-4 backdrop-blur">
            <Button disabled={save.isPending} onClick={() => save.mutate(form)}>
              {save.isPending ? 'Saving…' : 'Save settings'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

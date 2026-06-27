'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { teamApi, TeamConfigUpdate, RoutingEntry } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

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
    setForm({
      ai: { ...data.ai, api_key: '' },
      privacy: data.privacy,
      integrations: {},
      routing: data.routing ?? [],
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

  return (
    <div className="p-8 space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          AI provider, delivery channels, and privacy.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="font-medium">AI provider</h2>

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
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="font-medium">Delivery</h2>

        <div className="space-y-3">
          <p className="text-muted-foreground text-xs">
            Credentials — leave blank to keep existing.
          </p>
          {OUTPUT_PLUGINS.map((plugin) => (
            <div key={plugin} className="flex items-center gap-3">
              <span className="w-20 text-sm capitalize shrink-0">{plugin}</span>
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

        <div className="space-y-3 pt-2">
          <p className="text-muted-foreground text-xs">Routing — audience → channel.</p>
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
                className="flex-1 min-w-40"
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

              <button
                className="text-sm text-destructive hover:underline shrink-0"
                onClick={() => removeRouting(i)}
              >
                Remove
              </button>
            </div>
          ))}

          <button className="text-sm text-muted-foreground hover:text-foreground underline" onClick={addRouting}>
            + Add route
          </button>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="font-medium">Privacy</h2>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.privacy.scrub_secrets}
            onChange={(e) =>
              setForm({ ...form, privacy: { ...form.privacy, scrub_secrets: e.target.checked } })
            }
          />
          Scrub secrets from diffs
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.privacy.local_only}
            onChange={(e) =>
              setForm({ ...form, privacy: { ...form.privacy, local_only: e.target.checked } })
            }
          />
          Local-only (do not send code context to external AI)
        </label>
      </section>

      <Button disabled={save.isPending} onClick={() => save.mutate(form)}>
        {save.isPending ? 'Saving…' : 'Save settings'}
      </Button>
    </div>
  )
}

'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { KeyField, KeyGuideId } from '@/components/key-field'
import { AI_PROVIDERS, DEFAULT_AI_MODELS } from '@/lib/team-config-constants'
import { TeamConfigUpdate } from '@/lib/api'

type AiFields = TeamConfigUpdate['ai']

export function AiConfigFields({
  value,
  apiKeySet,
  onChange,
  showDepth = false,
}: {
  value: AiFields
  apiKeySet?: boolean
  onChange: (ai: AiFields) => void
  showDepth?: boolean
}) {
  function setProvider(provider: string) {
    const model = value.model || DEFAULT_AI_MODELS[provider] || ''
    onChange({ ...value, provider, model: model || DEFAULT_AI_MODELS[provider] || '' })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Provider</Label>
        <Select value={value.provider || 'anthropic'} onValueChange={setProvider}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select provider…" />
          </SelectTrigger>
          <SelectContent>
            {AI_PROVIDERS.map(p => (
              <SelectItem key={p} value={p}>
                {p === 'ollama' ? 'Ollama — local, nothing leaves your machine' : p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Model</Label>
        <Input
          placeholder={DEFAULT_AI_MODELS[value.provider] ?? 'Model name'}
          value={value.model}
          onChange={e => onChange({ ...value, model: e.target.value })}
        />
      </div>

      {value.provider === 'anthropic' || value.provider === 'openai' ? (
        <KeyField
          guideId={value.provider as KeyGuideId}
          value={value.api_key}
          saved={apiKeySet}
          onChange={v => onChange({ ...value, api_key: v })}
        />
      ) : (
        <div className="space-y-2">
          <Label>API key</Label>
          <Input
            type="password"
            placeholder={
              apiKeySet ? '•••••••• (saved — leave blank to keep)' : 'Optional for local models'
            }
            value={value.api_key}
            onChange={e => onChange({ ...value, api_key: e.target.value })}
          />
        </div>
      )}

      {(value.provider === 'ollama' || value.base_url) && (
        <div className="space-y-2">
          <Label>Base URL</Label>
          <Input
            placeholder="http://localhost:11434"
            value={value.base_url}
            onChange={e => onChange({ ...value, base_url: e.target.value })}
          />
        </div>
      )}

      {showDepth && (
        <div className="space-y-2">
          <Label>Depth</Label>
          <Select
            value={value.depth || 'standard'}
            onValueChange={v => onChange({ ...value, depth: v })}
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
      )}
    </div>
  )
}

export function aiConfigValid(ai: AiFields, apiKeySet?: boolean): boolean {
  if (!ai.provider || !ai.model?.trim()) return false
  if (apiKeySet) return true
  if (ai.provider === 'ollama') return true
  return ai.api_key.trim().length > 0
}

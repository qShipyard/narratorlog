'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, ArrowUpRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { duration, ease } from '@/lib/motion'

export type KeyGuideId =
  | 'github'
  | 'gitlab'
  | 'bitbucket'
  | 'anthropic'
  | 'openai'
  | 'slack'
  | 'notion'
  | 'discord'
  | 'linear'
  | 'email'

type Guide = {
  label: string
  link?: { href: string; label: string }
  steps: string[]
  note?: string
}

export const KEY_GUIDES: Record<KeyGuideId, Guide> = {
  github: {
    label: 'GitHub personal access token',
    link: {
      href: 'https://github.com/settings/tokens/new?scopes=repo&description=narratorlog',
      label: 'Open GitHub token settings',
    },
    steps: [
      'The link opens a new classic token, pre-named for narratorlog.',
      'Leave the repo scope ticked — that is read access to your code and commits.',
      'Generate, copy the ghp_… token, and paste it here.',
    ],
    note: 'For GitHub Enterprise, set the base URL below to your server.',
  },
  gitlab: {
    label: 'GitLab personal access token',
    link: {
      href: 'https://gitlab.com/-/user_settings/personal_access_tokens?name=narratorlog&scopes=read_api,read_repository',
      label: 'Open GitLab token settings',
    },
    steps: [
      'The link pre-fills the name and the scopes you need.',
      'Confirm read_api and read_repository are ticked.',
      'Create the token, copy the glpat-… value, and paste it here.',
    ],
    note: 'For self-hosted GitLab, set the base URL below.',
  },
  bitbucket: {
    label: 'Bitbucket app password',
    link: {
      href: 'https://bitbucket.org/account/settings/app-passwords/',
      label: 'Open Bitbucket app passwords',
    },
    steps: [
      'Select Create app password and label it narratorlog.',
      'Under Repositories, tick Read.',
      'Create it, copy the password, and paste it here.',
    ],
  },
  anthropic: {
    label: 'Anthropic API key',
    link: {
      href: 'https://console.anthropic.com/settings/keys',
      label: 'Open Anthropic console',
    },
    steps: [
      'Select Create Key and give it a name.',
      'Copy the sk-ant-… key — it is shown only once.',
      'Paste it here.',
    ],
  },
  openai: {
    label: 'OpenAI API key',
    link: {
      href: 'https://platform.openai.com/api-keys',
      label: 'Open OpenAI API keys',
    },
    steps: [
      'Select Create new secret key.',
      'Copy the sk-… key — it is shown only once.',
      'Paste it here.',
    ],
  },
  slack: {
    label: 'Slack bot token',
    link: {
      href: 'https://api.slack.com/apps',
      label: 'Open Slack apps',
    },
    steps: [
      'Create an app, then open OAuth & Permissions.',
      'Add the chat:write bot scope and install the app to your workspace.',
      'Copy the Bot User OAuth Token (xoxb-…) and paste it here.',
    ],
  },
  notion: {
    label: 'Notion integration token',
    link: {
      href: 'https://www.notion.so/my-integrations',
      label: 'Open Notion integrations',
    },
    steps: [
      'Create a new internal integration.',
      'Copy its Internal Integration Token (ntn_…) and paste it here.',
      'Share the destination page with the integration so it can post.',
    ],
  },
  discord: {
    label: 'Discord webhook URL',
    steps: [
      'In your target channel, open Settings → Integrations → Webhooks.',
      'Create a webhook and select Copy Webhook URL.',
      'Paste the full URL here.',
    ],
  },
  linear: {
    label: 'Linear API key',
    link: {
      href: 'https://linear.app/settings/api',
      label: 'Open Linear API settings',
    },
    steps: [
      'Under Personal API keys, select Create key.',
      'Copy the lin_api_… key and paste it here.',
    ],
  },
  email: {
    label: 'SMTP password',
    steps: [
      'Use the password (or app password) for your SMTP account.',
      'Most providers require an app password when 2FA is on.',
      'Paste it here.',
    ],
  },
}

export function KeyField({
  guideId,
  label,
  value,
  onChange,
  saved,
  placeholder,
  id,
  className,
}: {
  guideId: KeyGuideId
  label?: string
  value: string
  onChange: (value: string) => void
  saved?: boolean
  placeholder?: string
  id?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const guide = KEY_GUIDES[guideId]
  const fieldId = id ?? `key-${guideId}`

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={fieldId}>{label ?? guide.label}</Label>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-primary hover:underline"
        >
          <ChevronRight
            className={cn('h-3 w-3 transition-transform', open && 'rotate-90')}
          />
          How to get this
        </button>
      </div>

      <Input
        id={fieldId}
        type="password"
        placeholder={
          saved ? '•••••••• (saved — leave blank to keep)' : placeholder ?? guide.label
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: duration.base, ease }}
            className="overflow-hidden"
          >
            <div className="mt-1 rounded-lg border bg-muted/40 p-4 space-y-3">
              <ol className="space-y-2">
                {guide.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-foreground/90">
                    <span className="mt-px font-mono text-[0.7rem] font-bold text-signal-foreground bg-signal/20 rounded size-5 flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
              {guide.note && (
                <p className="text-xs text-muted-foreground border-t pt-3">{guide.note}</p>
              )}
              {guide.link && (
                <a
                  href={guide.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-[0.1em] text-primary hover:underline"
                >
                  {guide.link.label}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

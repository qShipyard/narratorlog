export const AUDIENCES = ['developers', 'product', 'marketing', 'public'] as const
export const AI_PROVIDERS = ['anthropic', 'openai', 'ollama'] as const
export const OUTPUT_PLUGINS = ['slack', 'notion', 'discord', 'linear', 'email'] as const
export const GIT_PROVIDERS = ['github', 'gitlab', 'bitbucket'] as const

export const INTEGRATION_SECRET: Record<string, string> = {
  slack: 'SLACK_BOT_TOKEN',
  notion: 'NOTION_TOKEN',
  discord: 'DISCORD_WEBHOOK_URL',
  linear: 'LINEAR_API_KEY',
  email: 'SMTP_PASSWORD',
}

export const DEFAULT_AI_MODELS: Record<string, string> = {
  anthropic: 'claude-3-5-sonnet-20241022',
  openai: 'gpt-4o',
  ollama: 'llama3.2',
}

export type GitProvider = (typeof GIT_PROVIDERS)[number]
export type AiProvider = (typeof AI_PROVIDERS)[number]

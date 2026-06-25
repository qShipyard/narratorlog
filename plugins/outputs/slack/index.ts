import { OutputPlugin, DeliverRequest, DeliverResponse, getFinalContent, runOutputPlugin } from '@narratorlog/sdk'

interface SlackConfig {
  channel: string
  mention?: string
  bot_token_env?: string    // env var name holding the Slack bot token (default: SLACK_BOT_TOKEN)
}

class SlackOutputPlugin implements OutputPlugin {
  async deliver(request: DeliverRequest): Promise<DeliverResponse> {
    const config = request.config as SlackConfig
    const content = getFinalContent(request)

    const tokenEnv = config.bot_token_env ?? 'SLACK_BOT_TOKEN'
    const token = process.env[tokenEnv]

    if (!token) {
      return { success: false, error: `${tokenEnv} environment variable not set` }
    }

    const text = config.mention ? `${config.mention}\n\n${content}` : content

    try {
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: config.channel,
          text,
          mrkdwn: true,
        }),
      })

      const data = await response.json() as { ok: boolean; error?: string; channel?: string; ts?: string }

      if (!data.ok) {
        return { success: false, error: `Slack API error: ${data.error}` }
      }

      const ts = data.ts?.replace('.', '') ?? ''
      return {
        success: true,
        reference: `https://slack.com/archives/${data.channel}/p${ts}`,
        message: `Posted to ${config.channel}`,
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }
}

runOutputPlugin(new SlackOutputPlugin())

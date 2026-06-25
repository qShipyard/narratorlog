import { OutputPlugin, DeliverRequest, DeliverResponse, getFinalContent, runOutputPlugin } from '@narratorlog/sdk'
import { writeFile, readFile } from 'fs/promises'
import { existsSync } from 'fs'

interface MarkdownConfig {
  path: string
  prepend?: boolean     // prepend to existing file (default: true)
  open_pr?: boolean     // open a GitHub PR after writing (default: false)
}

function formatDateRange(from: string, to: string): string {
  const f = new Date(from).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const t = new Date(to).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  return `${f} – ${t}`
}

class MarkdownOutputPlugin implements OutputPlugin {
  async deliver(request: DeliverRequest): Promise<DeliverResponse> {
    const config = request.config as MarkdownConfig
    const content = getFinalContent(request)

    const dateRange = formatDateRange(request.scan.scan_from, request.scan.scan_to)
    const entry = `# ${request.scan.repository} — ${dateRange}\n\n${content}\n\n---\n\n`

    try {
      if (config.prepend !== false && existsSync(config.path)) {
        const existing = await readFile(config.path, 'utf-8')
        await writeFile(config.path, entry + existing, 'utf-8')
      } else {
        await writeFile(config.path, entry, 'utf-8')
      }

      // TODO: open_pr support — commit file and open GitHub PR

      return {
        success: true,
        reference: config.path,
        message: `Written to ${config.path}`,
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }
}

runOutputPlugin(new MarkdownOutputPlugin())

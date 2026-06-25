import {
  SourceRequest, SourceResponse,
  SummarizeRequest, SummarizeResponse,
  GenerateRequest, GenerateResponse,
  DeliverRequest, DeliverResponse,
} from './types'

// ─── Plugin Interfaces ────────────────────────────────────────────────────────

export interface SourcePlugin {
  fetch(request: SourceRequest): Promise<SourceResponse>
}

export interface AIProviderPlugin {
  summarize(request: SummarizeRequest): Promise<SummarizeResponse>
  generate(request: GenerateRequest): Promise<GenerateResponse>
}

export interface OutputPlugin {
  deliver(request: DeliverRequest): Promise<DeliverResponse>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns edited_content if present, otherwise content.
 * Always use this in output plugins — never access content directly.
 */
export function getFinalContent(request: DeliverRequest): string {
  return request.edited_content ?? request.content
}

// ─── Runtime Handlers ─────────────────────────────────────────────────────────

async function readStdin(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    process.stdin.on('data', chunk => chunks.push(chunk))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks)))
    process.stdin.on('error', reject)
  })
}

function writeStdout(data: unknown): void {
  process.stdout.write(JSON.stringify(data))
}

/**
 * Wires a SourcePlugin to stdin/stdout.
 * Call this at the bottom of your source plugin's index.ts.
 */
export async function runSourcePlugin(plugin: SourcePlugin): Promise<void> {
  try {
    const input = await readStdin()
    const request: SourceRequest = JSON.parse(input.toString())
    const response = await plugin.fetch(request)
    writeStdout(response)
  } catch (error) {
    writeStdout({ commits: [], error: String(error) } satisfies SourceResponse)
    process.exit(1)
  }
}

/**
 * Wires an AIProviderPlugin to stdin/stdout.
 * Call this at the bottom of your AI provider plugin's index.ts.
 */
export async function runAIPlugin(plugin: AIProviderPlugin): Promise<void> {
  try {
    const input = await readStdin()
    const request: SummarizeRequest | GenerateRequest = JSON.parse(input.toString())

    if (request.action === 'summarize') {
      const response = await plugin.summarize(request as SummarizeRequest)
      writeStdout(response)
    } else if (request.action === 'generate') {
      const response = await plugin.generate(request as GenerateRequest)
      writeStdout(response)
    } else {
      writeStdout({ error: `Unknown action` })
      process.exit(1)
    }
  } catch (error) {
    writeStdout({ error: String(error) })
    process.exit(1)
  }
}

/**
 * Wires an OutputPlugin to stdin/stdout.
 * Call this at the bottom of your output plugin's index.ts.
 */
export async function runOutputPlugin(plugin: OutputPlugin): Promise<void> {
  try {
    const input = await readStdin()
    const request: DeliverRequest = JSON.parse(input.toString())
    const response = await plugin.deliver(request)
    writeStdout(response)
    if (!response.success) process.exit(1)
  } catch (error) {
    writeStdout({ success: false, error: String(error) } satisfies DeliverResponse)
    process.exit(1)
  }
}

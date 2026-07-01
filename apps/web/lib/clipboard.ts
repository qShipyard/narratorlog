import { AudienceDraft } from '@/lib/api'

export function draftText(draft: AudienceDraft): string {
  return (draft.edited_content ?? draft.content).trim()
}

export function allDraftsText(drafts: AudienceDraft[]): string {
  return drafts
    .map(d => `## ${d.audience_id}\n\n${draftText(d)}`)
    .join('\n\n---\n\n')
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

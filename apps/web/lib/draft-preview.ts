import { AudienceDraft } from '@/lib/api'

const PREVIEW_LENGTH = 120

export function draftPreviewText(drafts: AudienceDraft[]): string | undefined {
  const draft =
    drafts.find(d => d.audience_id === 'developers') ??
    drafts.find(d => d.status !== 'rejected') ??
    drafts[0]

  if (!draft) return undefined

  const text = (draft.edited_content ?? draft.content).trim()
  if (!text) return undefined

  const plain = text.replace(/^#+\s+/gm, '').replace(/\*\*/g, '').replace(/\n+/g, ' ').trim()
  if (plain.length <= PREVIEW_LENGTH) return plain
  return `${plain.slice(0, PREVIEW_LENGTH).trim()}…`
}

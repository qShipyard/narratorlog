'use client'

import { Button } from '@/components/ui/button'
import { Copy } from 'lucide-react'
import { copyToClipboard } from '@/lib/clipboard'
import { toast } from 'sonner'

export function CopyDraftButton({
  text,
  label = 'Copy',
  size = 'sm',
}: {
  text: string
  label?: string
  size?: 'sm' | 'default'
}) {
  async function handleCopy() {
    const ok = await copyToClipboard(text)
    if (ok) toast.success('Copied to clipboard.')
    else toast.error("Couldn't copy. Try selecting the text manually.")
  }

  return (
    <Button variant="ghost" size={size} onClick={handleCopy} disabled={!text.trim()}>
      <Copy className="h-3.5 w-3.5 mr-1" />
      {label}
    </Button>
  )
}

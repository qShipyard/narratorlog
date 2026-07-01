import { Fragment } from 'react'

// A focused renderer for the markdown subset narratorlog actually emits
// (headings, bold, bullet lists, paragraphs). Kept dependency-free so the
// narration's typography — display headings over a serif body — is exact.

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

export function NarrationProse({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let para: string[] = []
  let list: string[] = []
  let key = 0

  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p key={key++} className="text-foreground/90">
          {inline(para.join(' '))}
        </p>,
      )
      para = []
    }
  }
  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={key++} className="list-disc pl-5 space-y-1.5 text-foreground/90 marker:text-signal">
          {list.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>,
      )
      list = []
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)

    if (heading) {
      flushPara(); flushList()
      const level = heading[1].length
      const text = heading[2]
      const cls =
        level === 1 ? 'font-display text-xl font-semibold tracking-tight mt-1'
        : level === 2 ? 'eyebrow !text-muted-foreground pt-2'
        : 'font-display text-sm font-semibold'
      blocks.push(<div key={key++} className={cls}>{inline(text)}</div>)
    } else if (bullet) {
      flushPara()
      list.push(bullet[1])
    } else if (line === '') {
      flushPara(); flushList()
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara(); flushList()

  return (
    <article className="font-serif text-[0.95rem] leading-[1.7] space-y-4">
      {blocks}
    </article>
  )
}

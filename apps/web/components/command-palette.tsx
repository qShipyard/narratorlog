'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  LayoutDashboard, ScanLine, GitBranch, Users, Settings,
  Plus, KeyRound, Search, CornerDownLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export const COMMAND_PALETTE_EVENT = 'narratorlog:command-palette'

export function openCommandPalette() {
  window.dispatchEvent(new Event(COMMAND_PALETTE_EVENT))
}

type AppRouter = ReturnType<typeof useRouter>

type Command = {
  id: string
  label: string
  group: string
  icon: React.ComponentType<{ className?: string }>
  perform: (router: AppRouter) => void
}

const COMMANDS: Command[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'Go to', icon: LayoutDashboard, perform: r => r.push('/dashboard') },
  { id: 'scans', label: 'Scans', group: 'Go to', icon: ScanLine, perform: r => r.push('/scans') },
  { id: 'repositories', label: 'Repositories', group: 'Go to', icon: GitBranch, perform: r => r.push('/repositories') },
  { id: 'team', label: 'Team', group: 'Go to', icon: Users, perform: r => r.push('/team') },
  { id: 'settings', label: 'Settings', group: 'Go to', icon: Settings, perform: r => r.push('/settings') },
  { id: 'connect', label: 'Connect a repository', group: 'Actions', icon: Plus, perform: r => r.push('/repositories') },
  { id: 'run-scan', label: 'Run a scan', group: 'Actions', icon: ScanLine, perform: r => r.push('/scans') },
  { id: 'ai-key', label: 'Add an AI key', group: 'Actions', icon: KeyRound, perform: r => r.push('/settings#ai') },
]

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setQuery('')
        setActive(0)
        setOpen(o => !o)
      }
    }
    function onOpen() {
      setQuery('')
      setActive(0)
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener(COMMAND_PALETTE_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(COMMAND_PALETTE_EVENT, onOpen)
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? COMMANDS.filter(c => c.label.toLowerCase().includes(q)) : COMMANDS
  }, [query])

  const safeActive = Math.max(0, Math.min(active, filtered.length - 1))

  function run(cmd?: Command) {
    if (!cmd) return
    setOpen(false)
    cmd.perform(router)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(filtered[safeActive])
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) { setQuery(''); setActive(0) }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-[12vh] translate-y-0 sm:max-w-xl p-0 gap-0 overflow-hidden"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>

        <div className="flex items-center gap-2.5 border-b px-4 h-12">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0) }}
            onKeyDown={onKeyDown}
            placeholder="Search or jump to…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <kbd className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.1em] text-muted-foreground border rounded px-1.5 py-0.5">
            esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nothing matches “{query}”.
            </p>
          ) : (
            filtered.map((cmd, i) => {
              const Icon = cmd.icon
              const showHeader = i === 0 || filtered[i - 1].group !== cmd.group
              return (
                <Fragment key={cmd.id}>
                  {showHeader && (
                    <p className="eyebrow px-4 pt-3 pb-1.5">{cmd.group}</p>
                  )}
                  <button
                    onMouseMove={() => setActive(i)}
                    onClick={() => run(cmd)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2 text-sm text-left',
                      i === safeActive ? 'bg-accent text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-foreground">{cmd.label}</span>
                    {i === safeActive && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </Fragment>
              )
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t px-4 py-2 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span className="ml-auto">⌘K toggle</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

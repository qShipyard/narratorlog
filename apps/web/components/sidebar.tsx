'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { LayoutDashboard, GitBranch, ScanLine, Settings, LogOut, Users, Search } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { SignalMark } from '@/components/signal-mark'
import { openCommandPalette } from '@/components/command-palette'
import { cn } from '@/lib/utils'
import { authApi, User } from '@/lib/api'
import { useRouter } from 'next/navigation'

import { copy } from '@/lib/copy'

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/scans', label: copy.stories, icon: ScanLine },
  { href: '/repositories', label: 'Repositories', icon: GitBranch },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ user }: { user: User }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await authApi.logout()
    router.push('/login')
  }

  return (
    <aside className="w-60 border-r border-sidebar-border bg-sidebar flex flex-col h-full shrink-0">
      <div className="px-5 h-16 flex items-center border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <SignalMark />
          <span className="leading-none">
            <span className="block font-display text-[0.95rem] font-bold tracking-tight">
              narratorlog
            </span>
            <span className="block font-mono text-[0.5rem] uppercase tracking-[0.2em] text-muted-foreground mt-0.5">
              by qShipyard
            </span>
          </span>
        </Link>
      </div>

      <div className="px-3 pt-4">
        <button
          onClick={openCommandPalette}
          className="w-full flex items-center gap-2.5 rounded-md border border-border/80 bg-card/60 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors shadow-[0_1px_0_oklch(1_0_0/0.5)_inset]"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.1em] border rounded px-1.5 py-0.5">
            ⌘K
          </kbd>
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(item => {
          const Icon = item.icon
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute left-0 top-[calc(50%-8px)] h-4 w-[3px] rounded-full bg-signal"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
              <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-foreground' : 'text-muted-foreground')} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar className="h-7 w-7">
            <AvatarImage src={user.avatar_url} />
            <AvatarFallback className="text-[0.65rem] font-mono">
              {user.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">{user.role}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleLogout}>
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  )
}
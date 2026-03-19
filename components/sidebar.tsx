'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Bookmark, History, Settings, User } from 'lucide-react'
import { ScrapeStatus } from './scrape-status'

const navItems = [
  { href: '/dashboard', label: 'Feed', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/saved', label: 'Saved', icon: Bookmark },
  { href: '/dashboard/history', label: 'History', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings, exact: true },
  { href: '/settings/account', label: 'Account', icon: User },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="w-56 shrink-0 hidden md:flex flex-col gap-4 pt-6">
        <nav className="space-y-1">
          {navItems.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                  active
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            )
          })}
        </nav>
        <ScrapeStatus />
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background flex items-center justify-around h-14">
        {navItems.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-1 text-xs transition-colors',
                active
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Bookmark, History, Settings, Lightbulb, Radar } from 'lucide-react'

// Radar sits second because targeting is what the product does, not a preference —
// it decides what ends up in the feed. Settings keeps the things you set once and
// forget, and is dropped from the mobile bar (where it would be the sixth item in a
// 375px-wide row) since the avatar menu already reaches it.
const navItems = [
  { href: '/dashboard', label: 'Feed', mobileLabel: 'Feed', icon: LayoutDashboard, exact: true, mobile: true },
  { href: '/dashboard/radar', label: 'Radar', mobileLabel: 'Radar', icon: Radar, mobile: true },
  { href: '/dashboard/saved', label: 'Saved', mobileLabel: 'Saved', icon: Bookmark, mobile: true },
  { href: '/dashboard/content-ideas', label: 'Content Ideas', mobileLabel: 'Ideas', icon: Lightbulb, mobile: true },
  { href: '/dashboard/history', label: 'History', mobileLabel: 'History', icon: History, mobile: true },
  { href: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: Settings, exact: true, mobile: false },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="w-56 shrink-0 hidden md:block pt-6">
        <nav className="space-y-1">
          {navItems.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                  active
                    ? 'bg-brand-foreground text-brand-accent font-semibold'
                    : 'text-brand-text-muted hover:text-brand-text hover:bg-brand-surface'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background flex items-center justify-around h-14">
        {navItems
          .filter((item) => item.mobile)
          .map(({ href, label, mobileLabel, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-1 text-xs whitespace-nowrap transition-colors',
                  active ? 'text-brand-accent font-semibold' : 'text-brand-text-muted'
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{mobileLabel}</span>
              </Link>
            )
          })}
      </nav>
    </>
  )
}

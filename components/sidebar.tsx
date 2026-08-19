'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Bookmark, Settings, Radar } from 'lucide-react'

// Radar sits second because targeting is what the product does, not a preference —
// it decides what ends up in Leads. Settings keeps the things you set once and
// forget, and is dropped from the mobile bar (where it would be the fourth item in
// a 375px-wide row) — reachable from desktop nav, just not the mobile tab bar.
//
// History and Content Ideas used to be sibling nav destinations. History is now a
// status filter inside Leads (see post-feed.tsx) instead of a separate page — reply
// history isn't a different kind of thing, it's the same leads with a different
// status. Content Ideas is reachable from a link on the Leads page instead of
// living in the corridor a user has to learn before seeing a single lead.
const navItems = [
  { href: '/dashboard', label: 'Leads', mobileLabel: 'Leads', icon: LayoutDashboard, exact: true, mobile: true },
  { href: '/dashboard/radar', label: 'Radar', mobileLabel: 'Radar', icon: Radar, mobile: true },
  { href: '/dashboard/saved', label: 'Saved', mobileLabel: 'Saved', icon: Bookmark, mobile: true },
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

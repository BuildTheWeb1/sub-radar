'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
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
  { href: '/dashboard', label: 'Leads', mobileLabel: 'Leads', icon: LayoutDashboard, mobile: true },
  { href: '/dashboard/radar', label: 'Radar', mobileLabel: 'Radar', icon: Radar, mobile: true },
  { href: '/dashboard/saved', label: 'Saved', mobileLabel: 'Saved', icon: Bookmark, mobile: true },
  { href: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: Settings, mobile: false },
]

/**
 * Longest-prefix match rather than a per-item exact/startsWith split — a page
 * that isn't itself a nav destination (e.g. /dashboard/content-ideas, only
 * reachable via a link on Leads; /settings/account, a settings sub-page) still
 * resolves to the nav item that owns that part of the tree, instead of
 * matching nothing. Returns null only when truly nothing in `items` prefixes
 * the path — e.g. the mobile bar has no Settings entry, so /settings/account
 * correctly resolves to null there and no mobile tab lights up.
 */
function resolveActiveHref(pathname: string, items: { href: string }[]): string | null {
  let best: string | null = null
  for (const { href } of items) {
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      if (best === null || href.length > best.length) best = href
    }
  }
  return best
}

/**
 * Shared sliding-indicator behavior for both nav rails: measures the active
 * link's box on every route change and translates a single absolutely
 * positioned pill onto it, instead of a new pill appearing under whichever
 * link happens to be active. That continuity is the point — it's what tells
 * you where you came from as much as where you are now. The first measurement
 * after mount skips the transition so the pill doesn't slide in from the
 * corner on page load; every measurement after a real route change animates.
 * Also re-measures (without animating) on resize, since the desktop rail and
 * mobile bar swap via a CSS breakpoint rather than unmounting — a window
 * resize across that breakpoint, or a plain width change, would otherwise
 * leave a stale offset in place until the next route change.
 */
function useSlidingIndicator(activeHref: string | null, axis: 'y' | 'x') {
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map())
  const hasPositioned = useRef(false)
  const [rect, setRect] = useState<{ offset: number; size: number } | null>(null)
  const [animate, setAnimate] = useState(false)

  const measure = useCallback(
    (shouldAnimate: boolean) => {
      const el = activeHref ? itemRefs.current.get(activeHref) : undefined
      if (!el) {
        setRect(null)
        return
      }
      const offset = axis === 'y' ? el.offsetTop : el.offsetLeft
      const size = axis === 'y' ? el.offsetHeight : el.offsetWidth
      setAnimate(shouldAnimate)
      setRect({ offset, size })
    },
    [activeHref, axis]
  )

  useLayoutEffect(() => {
    measure(hasPositioned.current)
    hasPositioned.current = true
  }, [measure])

  useLayoutEffect(() => {
    function onResize() {
      measure(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measure])

  function register(href: string) {
    return (el: HTMLElement | null) => {
      if (el) itemRefs.current.set(href, el)
      else itemRefs.current.delete(href)
    }
  }

  return { rect, animate, register }
}

export function Sidebar() {
  const pathname = usePathname()
  const activeHref = resolveActiveHref(pathname, navItems)
  const mobileItems = navItems.filter((item) => item.mobile)
  const mobileActiveHref = resolveActiveHref(pathname, mobileItems)

  const desktop = useSlidingIndicator(activeHref, 'y')
  const mobile = useSlidingIndicator(mobileActiveHref, 'x')

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="w-56 shrink-0 hidden md:block pt-6">
        <nav className="relative space-y-1">
          {desktop.rect && (
            <div
              className={cn(
                'absolute inset-x-0 rounded-md bg-brand-foreground',
                desktop.animate && 'transition-[transform,height] ease-out-quint'
              )}
              style={{ transform: `translateY(${desktop.rect.offset}px)`, height: desktop.rect.size }}
              aria-hidden
            />
          )}
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === activeHref
            return (
              <Link
                key={href}
                ref={desktop.register(href)}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                  active
                    ? 'text-brand-accent font-semibold'
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
        {mobile.rect && (
          <div
            className={cn(
              'absolute left-0 bottom-1.5 h-1 rounded-full bg-brand-accent',
              mobile.animate && 'transition-[transform,width] ease-out-quint'
            )}
            style={{
              transform: `translateX(${mobile.rect.offset + mobile.rect.size / 2 - 14}px)`,
              width: 28,
            }}
            aria-hidden
          />
        )}
        {mobileItems.map(({ href, label, mobileLabel, icon: Icon }) => {
          const active = href === mobileActiveHref
          return (
            <Link
              key={href}
              ref={mobile.register(href)}
              href={href}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center gap-0.5 py-1 text-xs whitespace-nowrap transition-colors',
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

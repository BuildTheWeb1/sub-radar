'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { LogOut, Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function UserAvatar() {
  const { data: session, status } = useSession()
  const router = useRouter()

  if (status !== 'authenticated') return null

  const name = session.user?.name
  const email = session.user?.email ?? ''

  let initials: string
  if (name) {
    initials = name
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  } else {
    initials = email.slice(0, 2).toUpperCase()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="w-7 h-7 rounded-full bg-brand-surface-border text-brand-accent text-xs font-bold flex items-center justify-center hover:bg-brand-surface-border-hover transition-colors cursor-pointer"
        aria-label={name ?? email}
        title={name ?? email}
      >
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex flex-col gap-0.5">
              {name && <span className="font-semibold text-brand-text-strong text-sm">{name}</span>}
              <span className="text-xs text-brand-text-muted truncate">{email}</span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => router.push('/settings/account')}
          >
            <Settings className="h-3.5 w-3.5" />
            Account settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="flex items-center gap-2 text-brand-accent focus:text-brand-accent cursor-pointer"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

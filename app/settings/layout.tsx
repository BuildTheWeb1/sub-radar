import { Sidebar } from '@/components/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { UserAvatar } from '@/components/user-avatar'
import { BrandMark } from '@/components/brand-mark'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 h-12 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrandMark size="sm" />
          <span className="font-bold text-brand-text-strong tracking-tight text-sm">SubRadar</span>
        </div>
        <UserAvatar />
      </header>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 flex gap-8">
        <Sidebar />
        <main className="flex-1 min-w-0 py-6 pb-20 md:pb-6">{children}</main>
      </div>
      <Toaster />
    </div>
  )
}

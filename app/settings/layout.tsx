import { Sidebar } from '@/components/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { UserAvatar } from '@/components/user-avatar'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 h-12 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-[#ea580c] rounded-[5px] flex items-center justify-center">
            <div className="w-[7px] h-[7px] rounded-full bg-white opacity-90" />
          </div>
          <span className="font-bold text-[#1c0a00] tracking-tight text-sm">SubRadar</span>
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

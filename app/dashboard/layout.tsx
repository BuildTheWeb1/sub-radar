import { Sidebar } from '@/components/sidebar'
import { Toaster } from '@/components/ui/sonner'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 h-12 flex items-center">
        <span className="font-semibold text-sm tracking-tight">SubRadar</span>
      </header>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 flex gap-8">
        <Sidebar />
        <main className="flex-1 min-w-0 py-6 pb-20 md:pb-6">{children}</main>
      </div>
      <Toaster />
    </div>
  )
}

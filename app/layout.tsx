import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { NextAuthSessionProvider } from '@/components/session-provider'
import { Toaster } from '@/components/ui/sonner'

const plusJakartaSans = Plus_Jakarta_Sans({ variable: '--font-plus-jakarta-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SubRadar',
  description: 'Reddit monitoring for indie makers',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plusJakartaSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
        {/* Mounted once at the root: /onboarding and /login had no Toaster of their
            own, so every toast raised there was silently dropped. */}
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}

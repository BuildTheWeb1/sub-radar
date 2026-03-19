'use client'

import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">SubRadar</h1>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
        >
          Sign in with Google
        </Button>
      </div>
    </div>
  )
}

import { NextAuthOptions, getServerSession } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        try {
          // Persist the user to Supabase so they're visible in the dashboard
          await supabaseAdmin.from('users').upsert(
            {
              id: account.providerAccountId,
              email: user.email,
              name: user.name,
              image: user.image,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          )
        } catch (err) {
          // Don't block sign-in if DB write fails
          console.error('[auth] Failed to upsert user:', err)
        }
      }
      return true
    },
    async jwt({ token, user, account }) {
      if (user && account) {
        // account.providerAccountId is the stable Google sub ID — more reliable than user.id
        token.userId = account.providerAccountId ?? user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string
      }
      return session
    },
  },
}

/**
 * Verify the caller is authenticated and return the session user ID.
 * Returns a NextResponse 401 if not signed in.
 */
export async function requireUserId(): Promise<string | NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return session.user.id
}

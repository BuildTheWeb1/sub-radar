import { NextAuthOptions, getServerSession } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

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
          // Persist the user to the database so they're visible in the dashboard
          const id = account.providerAccountId
          const email = user.email
          const name = user.name
          const image = user.image
          await sql`
            INSERT INTO users (id, email, name, image, last_seen_at)
            VALUES (${id}, ${email}, ${name}, ${image}, now())
            ON CONFLICT (id) DO UPDATE SET
              email = EXCLUDED.email,
              name = EXCLUDED.name,
              image = EXCLUDED.image,
              last_seen_at = now()
          `
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

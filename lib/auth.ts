import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const adminEmail = process.env.ADMIN_EMAIL
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH

        console.log('[auth] email match:', credentials.email, '===', adminEmail, ':', credentials.email === adminEmail)
        console.log('[auth] hash first10:', adminPasswordHash?.slice(0, 10))

        if (!adminEmail || !adminPasswordHash) return null

        if (credentials.email !== adminEmail) return null

        const valid = await bcrypt.compare(credentials.password, adminPasswordHash)
        console.log('[auth] bcrypt valid:', valid)
        if (!valid) return null

        return {
          id: process.env.DEFAULT_USER_ID || 'default',
          email: adminEmail,
          name: 'Admin',
        }
      },
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
      // For Google sign-in, restrict to admin email only
      if (account?.provider === 'google') {
        return user.email === process.env.ADMIN_EMAIL
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) token.userId = user.id ?? process.env.DEFAULT_USER_ID
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.userId as string) ?? process.env.DEFAULT_USER_ID
      }
      return session
    },
  },
}

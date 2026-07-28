import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export const runtime = 'nodejs'

// Lightweight healthcheck. Returns fast; only touches the DB with
// a trivial query so a bad connection is reflected without adding latency.
export async function GET() {
  try {
    await sql`select 1`
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[health] DB check failed:', err)
    return NextResponse.json({ ok: false }, { status: 503 })
  }
}

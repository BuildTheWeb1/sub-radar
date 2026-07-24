import 'server-only'
import { neon } from '@neondatabase/serverless'

// Neon HTTP tagged-template query function.
// Usage: const rows = await sql`SELECT ...` — returns an array of row objects;
// interpolated ${value} become bound (parameterized) values.
//
// Type-specific notes:
// - text[] columns: pass a JS array directly, e.g. ${arr}::text[]
// - jsonb columns: pass ${JSON.stringify(obj)}::jsonb
// - counts: SELECT count(*)::int AS count (count(*) is bigint by default)
export const sql = neon(process.env.DATABASE_URL!)

import { sql } from '@/lib/db'

export interface DeductCreditsResult {
  ok: boolean
  /** Balance after the deduction, or the current balance when a deduction is rejected. */
  balance: number
}

/**
 * Atomically deduct `amount` credits from a user's balance and record the spend
 * in credit_ledger, or do nothing if the balance is insufficient.
 *
 * The ledger insert is attempted first, guarded two ways:
 *  - a `WHERE EXISTS (... credit_balance >= amount)` clause on the INSERT's
 *    source SELECT, so an insufficient-balance attempt with a *new* ref_id
 *    never creates a ledger row in the first place (an earlier version of
 *    this function skipped this guard and inserted a phantom ledger row for
 *    every insufficient-balance attempt, regardless of ref_id — caught by the
 *    smoke test against the real dev DB, not by type-checking).
 *  - `ON CONFLICT (ref_id) WHERE reason = 'scan_cycle' DO NOTHING`, backed by
 *    credit_ledger_scan_cycle_ref_id_idx, so a retried attempt with the same
 *    ref_id is a no-op instead of a double charge.
 * The balance UPDATE only runs when that insert actually added a new row.
 * This makes a call idempotent under retry for 'scan_cycle' charges
 * specifically: callers pass a stable per-attempt key (the charging step's
 * stepId — see getStepMetadata() in lib/workflows/scrape-cycle.ts) as ref_id.
 *
 * Written as a single statement (CTEs feeding one another) rather than
 * `sql.transaction([...])` so the balance deduction is conditional on the
 * ledger insert actually happening — Neon's HTTP driver runs every statement in
 * a `transaction()` call unconditionally either way.
 */
export async function deductCredits(
  userId: string,
  amount: number,
  reason: string,
  refId?: string
): Promise<DeductCreditsResult> {
  const rows = (await sql`
    WITH ins AS (
      INSERT INTO credit_ledger (user_id, delta, reason, ref_id)
      SELECT ${userId}, ${-amount}, ${reason}, ${refId ?? null}
      WHERE EXISTS (
        SELECT 1 FROM users WHERE id = ${userId} AND credit_balance >= ${amount}
      )
      ON CONFLICT (ref_id) WHERE reason = 'scan_cycle' DO NOTHING
      RETURNING id
    ), deducted AS (
      UPDATE users
      SET credit_balance = credit_balance - ${amount}
      WHERE id = ${userId} AND credit_balance >= ${amount} AND EXISTS (SELECT 1 FROM ins)
      RETURNING credit_balance
    )
    SELECT credit_balance FROM deducted
  `) as { credit_balance: number }[]

  if (rows.length > 0) {
    return { ok: true, balance: rows[0].credit_balance }
  }

  // No new deduction happened — either the balance was insufficient, or (for
  // scan_cycle charges only) this ref_id was already charged by an earlier
  // attempt of the same step. A retried step must report success in the
  // latter case, not "insufficient credits" — that would wrongly pause a
  // campaign that already paid for this cycle.
  if (reason === 'scan_cycle' && refId) {
    const existing = (await sql`
      SELECT id FROM credit_ledger WHERE ref_id = ${refId} AND reason = 'scan_cycle' LIMIT 1
    `) as { id: string }[]
    if (existing.length > 0) {
      const current = (await sql`
        SELECT credit_balance FROM users WHERE id = ${userId}
      `) as { credit_balance: number }[]
      return { ok: true, balance: current[0]?.credit_balance ?? 0 }
    }
  }

  const current = (await sql`
    SELECT credit_balance FROM users WHERE id = ${userId}
  `) as { credit_balance: number }[]

  return { ok: false, balance: current[0]?.credit_balance ?? 0 }
}

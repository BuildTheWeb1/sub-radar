import { sql } from '@/lib/db'

export interface DeductCreditsResult {
  ok: boolean
  /** Balance after the deduction, or the current balance when a deduction is rejected. */
  balance: number
}

/**
 * Current credit balance for a user. Read-only counterpart to deductCredits —
 * exists so the UI has something to show a balance from at all. Before this,
 * credit_balance was written and checked server-side but never sent to the
 * client, so a user could only discover it existed by hitting a 402.
 */
export async function getCreditBalance(userId: string): Promise<number> {
  const rows = (await sql`
    SELECT credit_balance FROM users WHERE id = ${userId}
  `) as { credit_balance: number }[]
  return rows[0]?.credit_balance ?? 0
}

/**
 * Atomically add `amount` credits to a user's balance and record it in
 * credit_ledger — the purchase-side counterpart to deductCredits. `reason` is
 * always 'purchase' (not a parameter, unlike deductCredits — the ON CONFLICT
 * clause below is hardcoded to match, so a caller passing anything else
 * would silently fall outside credit_ledger_purchase_ref_id_idx and lose
 * idempotency). Guarded by that index, so a Stripe webhook redelivered for
 * the same Checkout Session is a no-op instead of granting credits twice for
 * one payment. Callers pass the Checkout Session id as refId.
 */
export async function addCredits(
  userId: string,
  amount: number,
  refId: string
): Promise<DeductCreditsResult> {
  const rows = (await sql`
    WITH ins AS (
      INSERT INTO credit_ledger (user_id, delta, reason, ref_id)
      VALUES (${userId}, ${amount}, 'purchase', ${refId})
      ON CONFLICT (ref_id) WHERE reason = 'purchase' DO NOTHING
      RETURNING id
    ), credited AS (
      UPDATE users
      SET credit_balance = credit_balance + ${amount}
      WHERE id = ${userId} AND EXISTS (SELECT 1 FROM ins)
      RETURNING credit_balance
    )
    SELECT credit_balance FROM credited
  `) as { credit_balance: number }[]

  if (rows.length > 0) {
    return { ok: true, balance: rows[0].credit_balance }
  }

  // No new credit was applied. Disambiguate why, the same way deductCredits
  // does for scan_cycle: if this ref_id is already in the ledger, an earlier
  // delivery of the same webhook event already credited it — report success
  // so Stripe stops retrying. Otherwise the INSERT went through but the
  // UPDATE matched no user row (credit_ledger has no FK to users, so this is
  // reachable — e.g. the account was deleted between charge and webhook) —
  // that must NOT look like success, or a paid-for purchase silently
  // vanishes with no alert and no retry.
  const existing = (await sql`
    SELECT id FROM credit_ledger WHERE ref_id = ${refId} AND reason = 'purchase' LIMIT 1
  `) as { id: string }[]
  if (existing.length > 0) {
    const current = (await sql`
      SELECT credit_balance FROM users WHERE id = ${userId}
    `) as { credit_balance: number }[]
    return { ok: true, balance: current[0]?.credit_balance ?? 0 }
  }

  throw new Error(`addCredits: user ${userId} not found for refId ${refId}`)
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

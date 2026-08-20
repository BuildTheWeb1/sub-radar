'use client'

import { toast } from 'sonner'
import { pluralize } from '@/lib/utils'

// Every credit-gated action (scan trigger, suggestions, content ideas, reply
// ideas) hits the same 402 shape — { error, need, have } — so the copy is
// generated in one place rather than reworded per call site. `have` is a
// fresh read taken *after* the failed deduction, not the balance at the
// moment the request was made, so a caller that raced a refund (e.g. two
// reply-idea requests where the loser's balance check lands after the
// winner's refund) can see have >= need even though its own deduction was
// rejected — that's a transient conflict, not an actual shortfall, and must
// not tell the user to buy credits they already have.
export function insufficientCreditsCopy(need: number, have: number) {
  const shortfall = need - have
  if (shortfall <= 0) {
    return {
      title: 'Could not charge credits',
      description: 'Try again in a moment.',
      showBuyCta: false,
    }
  }
  return {
    title: 'Not enough credits',
    description: `Need ${pluralize(shortfall, 'more credit')} — you have ${have}.`,
    showBuyCta: true,
  }
}

const BUY_CREDITS_URL = '/settings/account#buy-credits'

// Shown in addition to whatever inline error state that call site already
// renders, not instead of it: the toast is what tells a user who isn't
// staring at the page right now that something needs them, the inline copy
// is what's still there once they look. `title` lets a caller fold in
// context the generic copy doesn't carry (radar/page.tsx's auto-triggered
// scan, where the user also needs to know the scan itself didn't start).
export function showInsufficientCreditsToast(need: number, have: number, opts?: { title?: string }) {
  const { title, description, showBuyCta } = insufficientCreditsCopy(need, have)
  toast.error(opts?.title ?? title, {
    description,
    action: showBuyCta
      ? {
          label: 'Buy credits',
          onClick: () => {
            window.location.href = BUY_CREDITS_URL
          },
        }
      : undefined,
  })
}

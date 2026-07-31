import { cn } from '@/lib/utils'
import { SubredditGuideline } from '@/lib/types'
import { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion } from 'lucide-react'

export type BanRisk = SubredditGuideline['risk']

interface BanRiskBadgeProps {
  risk: BanRisk
  className?: string
}

// Same pill shape and weight as the relevance-score badge (post-card.tsx) — one status-signal
// grammar for the card, with `strict` tied to the app's own accent red rather than stock Tailwind red.
const RISK_CONFIG: Record<BanRisk, { label: string; className: string; Icon: typeof ShieldCheck }> = {
  green: {
    label: 'Safe',
    className: 'bg-green-100 text-green-800',
    Icon: ShieldCheck,
  },
  caution: {
    label: 'Caution',
    className: 'bg-amber-100 text-amber-800',
    Icon: ShieldAlert,
  },
  strict: {
    label: 'Strict',
    className: 'bg-red-100 text-brand-accent-strong',
    Icon: ShieldX,
  },
  unknown: {
    label: 'Unknown',
    className: 'bg-gray-100 text-gray-600',
    Icon: ShieldQuestion,
  },
}

export function BanRiskBadge({ risk, className }: BanRiskBadgeProps) {
  const config = RISK_CONFIG[risk] ?? RISK_CONFIG.unknown
  const { Icon } = config

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full',
        config.className,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  )
}

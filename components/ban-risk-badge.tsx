import { cn } from '@/lib/utils'
import { SubredditGuideline } from '@/lib/types'
import { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

export type BanRisk = SubredditGuideline['risk']

interface BanRiskBadgeProps {
  risk: BanRisk
  className?: string
}

// Same pill shape and weight as the relevance-score badge (post-card.tsx) — one status-signal
// grammar for the card, with `strict` tied to the app's own accent red rather than stock Tailwind red.
//
// `label` alone ("Safe", "Strict"...) reads as an unscoped trust signal out of
// context — this badge appears standalone in target-list.tsx and
// subreddit-suggester.tsx with no adjacent copy to anchor it. `description`
// exists so the tooltip below can say what it's actually rating.
const RISK_CONFIG: Record<
  BanRisk,
  { label: string; description: string; className: string; Icon: typeof ShieldCheck }
> = {
  green: {
    label: 'Safe',
    description: "Low ban risk — this subreddit's rules allow self-promotion.",
    className: 'bg-green-100 text-green-800',
    Icon: ShieldCheck,
  },
  caution: {
    label: 'Caution',
    description: 'Some ban risk — self-promotion is limited here. Read the rules before posting.',
    className: 'bg-amber-100 text-amber-800',
    Icon: ShieldAlert,
  },
  strict: {
    label: 'Strict',
    description: "High ban risk — this subreddit doesn't allow self-promotion or links.",
    className: 'bg-red-100 text-brand-accent-strong',
    Icon: ShieldX,
  },
  unknown: {
    label: 'Unknown',
    description: "Ban risk hasn't been checked for this subreddit yet.",
    className: 'bg-gray-100 text-gray-600',
    Icon: ShieldQuestion,
  },
}

export function BanRiskBadge({ risk, className }: BanRiskBadgeProps) {
  const config = RISK_CONFIG[risk] ?? RISK_CONFIG.unknown
  const { Icon } = config

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              'inline-flex items-center gap-1 shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full',
              config.className,
              className
            )}
          />
        }
      >
        <Icon className="h-3 w-3" />
        {config.label}
      </TooltipTrigger>
      <TooltipContent>{config.description}</TooltipContent>
    </Tooltip>
  )
}

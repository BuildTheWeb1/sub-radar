import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { SubredditGuideline } from '@/lib/types'

export type BanRisk = SubredditGuideline['risk']

interface BanRiskBadgeProps {
  risk: BanRisk
  className?: string
}

const RISK_CONFIG: Record<BanRisk, { label: string; className: string }> = {
  green: {
    label: 'Safe',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  caution: {
    label: 'Caution',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  strict: {
    label: 'Strict',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  unknown: {
    label: 'Unknown',
    className: 'bg-gray-100 text-gray-700 border-gray-200',
  },
}

export function BanRiskBadge({ risk, className }: BanRiskBadgeProps) {
  const config = RISK_CONFIG[risk] ?? RISK_CONFIG.unknown

  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  )
}

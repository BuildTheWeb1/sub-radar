import { cn } from '@/lib/utils'

const SIZES = {
  sm: { box: 'w-5 h-5', dot: 'w-[7px] h-[7px]', radius: 'rounded-[5px]' },
  md: { box: 'w-7 h-7', dot: 'w-[9px] h-[9px]', radius: 'rounded-[6px]' },
  lg: { box: 'w-12 h-12', dot: 'w-4 h-4', radius: 'rounded-xl' },
} as const

interface BrandMarkProps {
  size?: keyof typeof SIZES
  className?: string
}

export function BrandMark({ size = 'sm', className }: BrandMarkProps) {
  const { box, dot, radius } = SIZES[size]
  return (
    <div className={cn(box, radius, 'bg-brand flex items-center justify-center', className)}>
      <div className={cn(dot, 'rounded-full bg-white opacity-90')} />
    </div>
  )
}

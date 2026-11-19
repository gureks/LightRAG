import * as React from 'react'
import { Chip as HeroChip } from '@heroui/react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'chip inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow-xs',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground shadow-xs',
        outline: 'border-border text-foreground bg-transparent'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof badgeVariants> {}

function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  const heroColor =
    variant === 'destructive' ? 'danger' : variant === 'default' ? 'accent' : 'default'
  const heroVariant =
    variant === 'outline' ? 'tertiary' : variant === 'secondary' ? 'secondary' : 'primary'

  return (
    <HeroChip
      size="sm"
      color={heroColor}
      variant={heroVariant}
      className={cn(badgeVariants({ variant }), className)}
    >
      <span {...props}>{children}</span>
    </HeroChip>
  )
}

export default Badge

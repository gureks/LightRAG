import * as React from 'react'
import { Chip as HeroChip } from '@heroui/react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'chip inline-flex items-center border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'chip--primary chip--accent border-transparent bg-accent text-accent-foreground',
        secondary: 'chip--secondary chip--default border-transparent bg-default text-foreground',
        destructive: 'chip--primary chip--danger border-transparent bg-danger text-danger-foreground',
        outline: 'chip--tertiary border-border text-foreground bg-transparent'
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
      <span className="chip__label text-inherit" {...props}>
        {children}
      </span>
    </HeroChip>
  )
}

export default Badge

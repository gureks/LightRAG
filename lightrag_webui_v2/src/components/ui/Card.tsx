import * as React from 'react'
import { Card as HeroCard } from '@heroui/react'
import { cn } from '@/lib/utils'

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <HeroCard
      variant="default"
      className={cn('card bg-card text-card-foreground rounded-xl border border-border shadow-sm', className)}
    >
      <div ref={ref} className="contents" {...props}>
        {children}
      </div>
    </HeroCard>
  )
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <HeroCard.Header className={cn('card__header flex flex-col space-y-1.5 p-6', className)}>
      <div ref={ref} className="contents" {...props} />
    </HeroCard.Header>
  )
)
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('card__title leading-none font-semibold tracking-tight text-foreground', className)}
      {...props}
    />
  )
)
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('card__description text-muted-foreground text-sm', className)} {...props} />
  )
)
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <HeroCard.Content className={cn('card__content p-6 pt-0', className)}>
      <div ref={ref} className="contents" {...props} />
    </HeroCard.Content>
  )
)
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <HeroCard.Footer className={cn('card__footer flex items-center p-6 pt-0', className)}>
      <div ref={ref} className="contents" {...props} />
    </HeroCard.Footer>
  )
)
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }

import * as React from 'react'
import { Alert as HeroAlert } from '@heroui/react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const alertVariants = cva(
  'alert relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7',
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground border-border',
        destructive:
          'border-destructive/50 text-destructive [&>svg]:text-destructive'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant = 'default', children, ...props }, ref) => (
  <HeroAlert
    status={variant === 'destructive' ? 'danger' : 'default'}
    className={cn(alertVariants({ variant }), className)}
  >
    <div ref={ref} role="alert" className="w-full" {...props}>
      {children}
    </div>
  </HeroAlert>
))
Alert.displayName = 'Alert'

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <HeroAlert.Title className={cn('alert__title mb-1 leading-none font-medium tracking-tight', className)}>
      <span ref={ref} {...props} />
    </HeroAlert.Title>
  )
)
AlertTitle.displayName = 'AlertTitle'

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <HeroAlert.Description className={cn('alert__description text-sm [&_p]:leading-relaxed', className)}>
    <div ref={ref} {...props} />
  </HeroAlert.Description>
))
AlertDescription.displayName = 'AlertDescription'

export { Alert, AlertTitle, AlertDescription }

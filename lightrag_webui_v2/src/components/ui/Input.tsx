import * as React from 'react'
import { Input as HeroInput } from '@heroui/react'
import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <HeroInput
        ref={ref}
        type={type}
        variant="secondary"
        className={cn(
          'input border-border bg-background text-foreground placeholder:text-muted-foreground flex h-9 rounded-md border px-3 py-1 text-base shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export default Input

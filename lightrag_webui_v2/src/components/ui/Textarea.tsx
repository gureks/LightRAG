import * as React from 'react'
import { TextArea as HeroTextArea } from '@heroui/react'
import { cn } from '@/lib/utils'

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <HeroTextArea
        ref={ref}
        variant="secondary"
        className={cn(
          'textarea border-border bg-background text-foreground placeholder:text-muted-foreground flex min-h-[60px] w-full rounded-md border px-3 py-2 text-base shadow-xs transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none',
          className
        )}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

export default Textarea

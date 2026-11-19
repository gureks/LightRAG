import * as React from 'react'
import { ProgressBar as HeroProgressBar } from '@heroui/react'
import { cn } from '@/lib/utils'

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number | null
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, ...props }, ref) => (
    <div ref={ref} {...props}>
      <HeroProgressBar
        aria-label={props['aria-label'] || 'Progress'}
        value={value ?? 0}
        color="accent"
        className={cn('progress-bar w-full', className)}
      >
        <HeroProgressBar.Track className="progress-bar__track bg-secondary relative h-4 w-full overflow-hidden rounded-full">
          <HeroProgressBar.Fill className="progress-bar__fill bg-primary h-full transition-all" />
        </HeroProgressBar.Track>
      </HeroProgressBar>
    </div>
  )
)
Progress.displayName = 'Progress'

export default Progress

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { Button as HeroButton } from '@heroui/react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'

// eslint-disable-next-line react-refresh/only-export-components
export const buttonVariants = cva(
  'button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'button--primary bg-primary text-primary-foreground hover:opacity-90',
        destructive: 'button--danger bg-destructive text-destructive-foreground hover:opacity-90',
        outline: 'button--outline border border-border bg-background hover:bg-secondary hover:text-secondary-foreground',
        secondary: 'button--secondary bg-secondary text-secondary-foreground hover:opacity-80',
        ghost: 'button--ghost hover:bg-secondary hover:text-secondary-foreground',
        link: 'button--tertiary text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'button--md h-10 px-4 py-2',
        sm: 'button--sm h-9 rounded-md px-3',
        lg: 'button--lg h-11 rounded-md px-8',
        icon: 'button--icon-only size-8 p-0'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

type HeroVariant = 'primary' | 'secondary' | 'tertiary' | 'outline' | 'ghost' | 'danger'
type HeroSize = 'sm' | 'md' | 'lg'

function mapHeroVariant(variant?: VariantProps<typeof buttonVariants>['variant']): HeroVariant {
  switch (variant) {
    case 'destructive':
      return 'danger'
    case 'outline':
      return 'outline'
    case 'secondary':
      return 'secondary'
    case 'ghost':
      return 'ghost'
    case 'link':
      return 'tertiary'
    case 'default':
    default:
      return 'primary'
  }
}

function mapHeroSize(size?: VariantProps<typeof buttonVariants>['size']): HeroSize {
  switch (size) {
    case 'sm':
    case 'icon':
      return 'sm'
    case 'lg':
      return 'lg'
    case 'default':
    default:
      return 'md'
  }
}

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
  return (value) => {
    for (const r of refs) {
      if (typeof r === 'function') {
        r(value)
      } else if (r != null) {
        ;(r as React.MutableRefObject<T | null>).current = value
      }
    }
  }
}

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean
  side?: 'top' | 'right' | 'bottom' | 'left'
  tooltip?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', tooltip, size = 'default', side = 'right', asChild = false, disabled, onClick, type = 'button', ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size, className }), 'cursor-pointer')

    const renderControl = (extraProps?: Record<string, unknown>) => {
      if (asChild) {
        return (
          <Slot
            className={classes}
            ref={ref}
            onClick={onClick}
            {...props}
            {...extraProps}
          />
        )
      }

      return (
        <HeroButton
          ref={ref}
          type={type}
          variant={mapHeroVariant(variant)}
          size={mapHeroSize(size)}
          isIconOnly={size === 'icon'}
          isDisabled={disabled}
          className={classes}
          render={(domProps) => {
            const domRef = (domProps as { ref?: React.Ref<HTMLButtonElement> }).ref
            return (
              <button
                {...domProps}
                {...props}
                {...extraProps}
                ref={mergeRefs(domRef, ref)}
                type={type}
                disabled={disabled}
                onClick={onClick}
                className={classes}
              />
            )
          }}
        >
          {props.children}
        </HeroButton>
      )
    }

    if (!tooltip) {
      return renderControl()
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {renderControl()}
          </TooltipTrigger>
          <TooltipContent side={side}>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
)
Button.displayName = 'Button'

export type ButtonVariantType = Exclude<
  NonNullable<Parameters<typeof buttonVariants>[0]>['variant'],
  undefined
>

export default Button

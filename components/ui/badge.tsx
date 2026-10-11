import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const badgeVariants = cva(
  'ui-badge inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium leading-5 [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary-soft text-info-foreground',
        secondary: 'bg-secondary-soft text-secondary',
        neutral: 'bg-muted text-muted-foreground',
        outline: 'border border-border text-muted-foreground',
        success: 'bg-success-soft text-success-foreground',
        warning: 'bg-warning-soft text-warning-foreground',
        danger: 'bg-danger-soft text-danger-foreground'
      }
    },
    defaultVariants: { variant: 'default' }
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): React.JSX.Element {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

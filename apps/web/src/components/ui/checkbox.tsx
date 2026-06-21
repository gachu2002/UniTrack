import * as React from 'react'
import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

export type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className, ...props }, ref) => {
  return (
    <span className="relative inline-flex size-4 items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        className={cn('peer size-4 appearance-none rounded-md border border-input bg-background outline-none transition checked:border-primary checked:bg-primary focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50', className)}
        {...props}
      />
      <Check className="pointer-events-none absolute size-3 text-primary-foreground opacity-0 peer-checked:opacity-100" />
    </span>
  )
})

Checkbox.displayName = 'Checkbox'

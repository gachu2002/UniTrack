import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm shadow-primary/10 hover:bg-primary/90',
        secondary: 'border border-secondary/20 bg-secondary/10 text-secondary hover:bg-secondary/15',
        edit: 'border border-violet-200 bg-violet-50/80 text-violet-800 shadow-sm shadow-violet-950/5 hover:border-violet-300 hover:bg-violet-100 hover:text-violet-900',
        ghost: 'hover:bg-accent/65 hover:text-accent-foreground',
        outline: 'border border-border bg-card text-ink hover:border-primary/30 hover:bg-accent',
        destructive: 'bg-destructive text-destructive-foreground shadow-none hover:bg-destructive/95',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3',
        lg: 'h-11 px-6',
        icon: 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

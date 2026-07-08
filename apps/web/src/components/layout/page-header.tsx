import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface PageHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  back?: ReactNode
  badges?: ReactNode
  meta?: ReactNode
  className?: string
}

export function PageHeader({ eyebrow, title, description, action, back, badges, meta, className }: PageHeaderProps) {
  return (
    <header className={cn('border-b border-border/80 pb-4', className)}>
      {back ? <div className="mb-2">{back}</div> : null}
      <div aria-hidden="true" className="mb-3 h-1 w-16 rounded-full bg-gradient-to-r from-primary via-secondary to-cyan-300" />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p> : null}
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="max-w-5xl break-words font-heading text-3xl font-semibold tracking-tight text-ink md:text-4xl">{title}</h1>
            {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
          </div>
          {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
          {meta ? <div className="mt-3 flex flex-wrap gap-2">{meta}</div> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">{action}</div> : null}
      </div>
    </header>
  )
}

export function PageHeaderPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card/80 px-2.5 py-1 text-xs font-semibold text-muted-foreground shadow-sm">
      {children}
    </span>
  )
}

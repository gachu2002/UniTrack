import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface LedgerSectionProps {
  title: string
  eyebrow?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  id?: string
}

export function LedgerSection({ title, eyebrow, description, action, children, className, bodyClassName, id }: LedgerSectionProps) {
  return (
    <section id={id} className={cn('overflow-hidden rounded-[1.4rem] bg-white/80 shadow-sm ring-1 ring-slate-200/75 backdrop-blur', className)}>
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {eyebrow ? <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p> : null}
          <h2 className="font-heading text-xl font-semibold tracking-tight text-ink">{title}</h2>
          {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn('px-5 pb-5', bodyClassName)}>{children}</div>
    </section>
  )
}

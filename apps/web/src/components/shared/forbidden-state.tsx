import { ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'

interface ForbiddenStateProps {
  title?: string
  message?: string
  onRetry?: () => void
  action?: ReactNode
}

export function ForbiddenState({
  title = 'Access unavailable',
  message = 'This project is restricted, missing, or temporarily unavailable.',
  onRetry,
  action,
}: ForbiddenStateProps) {
  return (
    <section className="grid min-h-[320px] place-items-center rounded-2xl border border-border bg-card p-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid size-12 place-items-center rounded-md border border-primary/20 bg-primary/10 text-primary">
          <ShieldAlert className="size-6" />
        </div>
        <p className="mt-5 text-sm font-medium text-muted-foreground">Restricted project</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          {onRetry ? <Button variant="outline" onClick={onRetry}>Try again</Button> : null}
          {action || (
            <Button asChild>
              <Link to="/dashboard">Return dashboard</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}

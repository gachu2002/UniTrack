import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  className?: string
}

export function Dialog({ open, onOpenChange, title, description, children, className }: DialogProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false)
      }
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onOpenChange, open])

  if (!open || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center px-3 py-4 sm:px-6 sm:py-8">
      <button className="absolute inset-0 bg-slate-950/45" type="button" aria-label="Close dialog" onClick={() => onOpenChange(false)} />
      <section className={cn('relative z-10 flex max-h-[92svh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-panel', className)} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/70 px-5 py-5 sm:px-6 lg:px-8">
          <div>
            <h2 id="dialog-title" className="font-heading text-2xl font-semibold tracking-tight text-ink">{title}</h2>
            {description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" type="button" aria-label="Close dialog" onClick={() => onOpenChange(false)}>
            <X className="size-5" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 sm:px-6 lg:px-8">{children}</div>
      </section>
    </div>,
    document.body,
  )
}

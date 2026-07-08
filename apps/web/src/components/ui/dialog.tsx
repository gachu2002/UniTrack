import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
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

const openDialogIds: string[] = []
let bodyOverflowBeforeDialogs: string | undefined

export function Dialog({ open, onOpenChange, title, description, children, className }: DialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onOpenChangeRef = useRef(onOpenChange)
  const titleId = useId()
  const descriptionId = useId()
  const dialogId = useId()

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange
  }, [onOpenChange])

  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog(dialogId)) {
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        onOpenChangeRef.current(false)
        return
      }
      if (event.key !== 'Tab') {
        return
      }

      const dialog = dialogRef.current
      if (!dialog) {
        return
      }
      const focusable = getFocusableElements(dialog)
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (!active || !dialog.contains(active)) {
        event.preventDefault()
        first.focus()
        return
      }
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
        return
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    registerDialog(dialogId)
    document.addEventListener('keydown', onKeyDown)
    const focusTimer = window.setTimeout(() => {
      if (!isTopDialog(dialogId)) {
        return
      }
      const dialog = dialogRef.current
      if (!dialog) {
        return
      }
      const focusable = getFocusableElements(dialog)
      const preferred = focusable.find((element) => element.getAttribute('aria-label') !== 'Close dialog') || focusable[0]
      if (preferred) {
        preferred.focus()
      } else {
        dialog.focus()
      }
    }, 0)

    return () => {
      window.clearTimeout(focusTimer)
      unregisterDialog(dialogId)
      document.removeEventListener('keydown', onKeyDown)
      const previous = previousFocusRef.current
      if (previous && document.contains(previous)) {
        previous.focus()
      }
    }
  }, [dialogId, open])

  if (!open || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center px-3 py-4 sm:px-6 sm:py-8">
      <div className="absolute inset-0 bg-slate-950/45" aria-hidden="true" onMouseDown={() => { if (isTopDialog(dialogId)) onOpenChange(false) }} />
      <section ref={dialogRef} className={cn('relative z-10 flex max-h-[92svh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-panel', className)} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1}>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/70 px-5 py-5 sm:px-6 lg:px-8">
          <div>
            <h2 id={titleId} className="font-heading text-2xl font-semibold tracking-tight text-ink">{title}</h2>
            {description ? <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
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

function registerDialog(dialogId: string) {
  const existingIndex = openDialogIds.indexOf(dialogId)
  if (existingIndex >= 0) {
    return
  }
  if (openDialogIds.length === 0) {
    bodyOverflowBeforeDialogs = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  openDialogIds.push(dialogId)
}

function unregisterDialog(dialogId: string) {
  const index = openDialogIds.indexOf(dialogId)
  if (index >= 0) {
    openDialogIds.splice(index, 1)
  }
  if (openDialogIds.length === 0) {
    document.body.style.overflow = bodyOverflowBeforeDialogs || ''
    bodyOverflowBeforeDialogs = undefined
  }
}

function isTopDialog(dialogId: string) {
  return openDialogIds[openDialogIds.length - 1] === dialogId
}

function getFocusableElements(container: HTMLElement) {
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[role="combobox"]:not([aria-disabled="true"])',
    '[tabindex]:not([tabindex="-1"])',
  ]
  return Array.from(container.querySelectorAll<HTMLElement>(selectors.join(','))).filter((element) => {
    if (element.hasAttribute('disabled') || element.getAttribute('aria-hidden') === 'true') {
      return false
    }
    const style = window.getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden'
  })
}

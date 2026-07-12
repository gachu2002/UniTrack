import type { ReactNode } from 'react'

import { OceanMark } from '@/components/shared/ocean-lines'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  title: string
  message: string
  action?: ReactNode
  compact?: boolean
}

export function EmptyState({ title, message, action, compact = false }: EmptyStateProps) {
  return (
    <Empty className={cn(compact && 'min-h-0 gap-3 p-4')}>
      <EmptyHeader className={cn(compact && 'gap-1.5')}>
        <EmptyMedia variant="icon" className={cn('border border-primary/10 bg-primary/5 text-primary', compact && 'mb-1 size-8')}>
          <OceanMark className={compact ? 'size-5' : 'size-7'} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent className={cn(compact && 'mt-2 gap-2')}>{action}</EmptyContent> : null}
    </Empty>
  )
}

import * as React from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { SortState } from '@/lib/sort'

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-auto bg-card">
      <table className={cn('w-full caption-bottom border-collapse text-sm', className)} {...props} />
    </div>
  )
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-muted/55 [&_tr]:border-b [&_tr]:border-border', className)} {...props} />
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

export function TableFooter({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tfoot className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)} {...props} />
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-border transition-colors hover:bg-accent/55 data-[state=selected]:bg-muted', className)} {...props} />
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('h-11 px-4 text-left align-middle text-xs font-semibold text-muted-foreground', className)} {...props} />
}

interface SortableTableHeadProps<TKey extends string> extends Omit<React.ThHTMLAttributes<HTMLTableCellElement>, 'children' | 'onClick'> {
  sortKey: TKey
  sort?: SortState<TKey> | null
  onSort: (key: TKey) => void
  children: React.ReactNode
  align?: 'left' | 'right'
}

export function SortableTableHead<TKey extends string>({ sortKey, sort, onSort, children, align = 'left', className, ...props }: SortableTableHeadProps<TKey>) {
  const active = sort?.key === sortKey
  const Icon = active ? sort.direction === 'asc' ? ArrowUp : ArrowDown : ChevronsUpDown
  const ariaSort = active ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'
  return (
    <TableHead className={className} aria-sort={ariaSort} {...props}>
      <button type="button" className={cn('inline-flex w-full items-center gap-1.5 rounded-sm py-1 text-xs font-semibold transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30', align === 'right' ? 'justify-end' : 'justify-start')} onClick={() => onSort(sortKey)}>
        <span>{children}</span>
        <Icon className={cn('size-3.5 shrink-0', active ? 'text-primary' : 'text-muted-foreground/70')} />
      </button>
    </TableHead>
  )
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-3 align-middle', className)} {...props} />
}

export function TableCaption({ className, ...props }: React.HTMLAttributes<HTMLTableCaptionElement>) {
  return <caption className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
}

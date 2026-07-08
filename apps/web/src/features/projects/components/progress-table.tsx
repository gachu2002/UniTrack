import { ArrowUpRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/shared/empty-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { SortableTableHead, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDateTime } from '@/lib/format'
import { dateSortValue, sortItems, toggleSort, type SortState } from '@/lib/sort'
import type { ProgressUpdate } from '@/types/api'

type ProgressUpdateSortKey = 'update' | 'assignment' | 'submittedBy' | 'status' | 'submitted'

interface ProgressUpdateTableProps {
  updates?: ProgressUpdate[] | null
  emptyTitle: string
  emptyMessage: string
  showDescription?: boolean
  showSubmittedBy?: boolean
  showTaskColumn?: boolean
}

export function ProgressUpdateTable({ updates, emptyTitle, emptyMessage, showDescription = false, showSubmittedBy = true, showTaskColumn = true }: ProgressUpdateTableProps) {
  const items = updates ?? []
  const [sort, setSort] = useState<SortState<ProgressUpdateSortKey> | null>(null)
  const sortedItems = sortItems(items, sort, {
    update: (update) => update.title || update.taskTitle,
    assignment: (update) => update.taskTitle,
    submittedBy: (update) => update.submittedByName,
    status: (update) => update.reviewStatus,
    submitted: (update) => dateSortValue(update.createdAt),
  })
  const onSort = (key: ProgressUpdateSortKey) => setSort((current) => toggleSort(current, key))

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />
  }

  return (
    <div className="overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead sortKey="update" sort={sort} onSort={onSort}>Update</SortableTableHead>
            {showTaskColumn ? <SortableTableHead sortKey="assignment" sort={sort} onSort={onSort}>Assignment</SortableTableHead> : null}
            {showSubmittedBy ? <SortableTableHead sortKey="submittedBy" sort={sort} onSort={onSort}>Submitted by</SortableTableHead> : null}
            <SortableTableHead sortKey="status" sort={sort} onSort={onSort}>Status</SortableTableHead>
            <SortableTableHead sortKey="submitted" sort={sort} onSort={onSort} className="hidden lg:table-cell">Submitted</SortableTableHead>
            <TableHead className="w-20 text-right">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedItems.map((update) => (
            <TableRow key={update.id}>
              <TableCell>
                <Link className="font-heading font-semibold text-ink underline-offset-4 hover:underline" to={`/workspace/projects/${update.projectId}/tasks/${update.taskId}#progress-${update.id}`}>
                  {update.title || update.taskTitle}
                </Link>
                {!showTaskColumn ? <p className="mt-1 text-xs text-muted-foreground">{update.projectName} · {update.taskTitle}</p> : null}
                {showDescription ? <p className="mt-1 line-clamp-2 max-w-xl text-xs leading-5 text-muted-foreground">{update.description}</p> : null}
              </TableCell>
              {showTaskColumn ? <TableCell className="text-muted-foreground">{update.taskTitle}</TableCell> : null}
              {showSubmittedBy ? <TableCell className="text-muted-foreground">{update.submittedByName}</TableCell> : null}
              <TableCell><StatusBadge value={update.reviewStatus} /></TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">{formatDateTime(update.createdAt)}</TableCell>
              <TableCell className="text-right">
                <Link className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline" to={`/workspace/projects/${update.projectId}/tasks/${update.taskId}#progress-${update.id}`} aria-label="Open submission">
                  <span>Open</span>
                  <ArrowUpRight className="size-4" />
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

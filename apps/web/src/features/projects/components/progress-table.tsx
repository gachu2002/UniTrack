import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/shared/empty-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDateTime } from '@/lib/format'
import type { ProgressUpdate } from '@/types/api'

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

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />
  }

  return (
    <div className="overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Update</TableHead>
            {showTaskColumn ? <TableHead>Assignment</TableHead> : null}
            {showSubmittedBy ? <TableHead>Submitted by</TableHead> : null}
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Submitted</TableHead>
            <TableHead className="w-20 text-right">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((update) => (
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

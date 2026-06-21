import { ArrowUpRight, CalendarClock } from 'lucide-react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/shared/empty-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getAssignmentState } from '@/features/tasks/assignment-state'
import { formatDate } from '@/lib/format'
import type { Task } from '@/types/api'

interface TaskTableProps {
  tasks?: Task[] | null
  emptyTitle: string
  emptyMessage: string
  showProject?: boolean
  showAssignees?: boolean
  showAttention?: boolean
}

export function TaskTable({ tasks, emptyTitle, emptyMessage, showProject = false, showAssignees = true, showAttention = false }: TaskTableProps) {
  const items = tasks ?? []

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />
  }

  return (
    <div className="overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Assignment</TableHead>
            {showProject ? <TableHead className="hidden md:table-cell">Project</TableHead> : null}
            <TableHead className="hidden xl:table-cell">Milestone</TableHead>
            <TableHead>Due</TableHead>
            {showAssignees ? <TableHead className="hidden lg:table-cell">Assignees</TableHead> : null}
            <TableHead>State</TableHead>
            <TableHead>Priority</TableHead>
            {showAttention ? <TableHead>Attention</TableHead> : null}
            <TableHead className="w-20 text-right">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((task) => {
            const assignmentState = getAssignmentState(task)
            return (
            <TableRow key={task.id} className={assignmentState.key === 'overdue' ? 'bg-red-50/70 hover:bg-red-50' : undefined}>
              <TableCell>
                <Link className="font-heading font-semibold text-ink underline-offset-4 hover:underline" to={`/workspace/projects/${task.projectId}/tasks/${task.id}`}>
                  {task.title}
                </Link>
                {showProject ? <p className="mt-1 text-xs font-medium text-muted-foreground md:hidden">{task.projectName}</p> : null}
                {showAssignees ? <p className="mt-1 text-xs text-muted-foreground lg:hidden">{assigneeText(task)}</p> : null}
              </TableCell>
              {showProject ? (
                <TableCell className="hidden max-w-52 truncate text-muted-foreground md:table-cell">
                  <Link className="underline-offset-4 hover:text-primary hover:underline" to={`/workspace/projects/${task.projectId}`}>{task.projectName}</Link>
                </TableCell>
              ) : null}
              <TableCell className="hidden max-w-48 truncate text-muted-foreground xl:table-cell">{task.milestoneTitle || 'Missing milestone'}</TableCell>
              <TableCell className={assignmentState.key === 'overdue' ? 'text-destructive' : 'text-muted-foreground'}>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-4" />
                  {formatDate(task.deadline)}
                </span>
              </TableCell>
              {showAssignees ? <TableCell className="hidden max-w-64 truncate text-muted-foreground lg:table-cell">{assigneeText(task)}</TableCell> : null}
              <TableCell><StatusBadge value={assignmentState.key} tone={assignmentState.tone} /></TableCell>
              <TableCell><StatusBadge value={task.priority} /></TableCell>
              {showAttention ? <TableCell>{task.pendingReviewCount > 0 ? <StatusBadge value="pending_review" /> : task.isOverdue ? <StatusBadge value="overdue" tone="red" /> : <span className="text-xs text-muted-foreground">None</span>}</TableCell> : null}
              <TableCell className="text-right">
                <Link className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline" to={`/workspace/projects/${task.projectId}/tasks/${task.id}`} aria-label={`Open assignment ${task.title}`}>
                  <span>Open</span>
                  <ArrowUpRight className="size-4" />
                </Link>
              </TableCell>
            </TableRow>
          )})}
        </TableBody>
      </Table>
    </div>
  )
}

function assigneeText(task: Task) {
  return task.assignees.length > 0 ? task.assignees.map((assignee) => assignee.fullName).join(', ') : 'No assignee'
}

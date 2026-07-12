import { ArrowUpRight, CalendarClock } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/shared/empty-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { SortableTableHead, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PersonLink } from '@/features/activity/components/person-link'
import { getAssignmentState } from '@/features/tasks/assignment-state'
import { formatDate } from '@/lib/format'
import { dateSortValue, sortItems, toggleSort, type SortState } from '@/lib/sort'
import type { Task } from '@/types/api'

type TaskSortKey = 'assignment' | 'project' | 'checkpoint' | 'due' | 'assignees' | 'state' | 'priority' | 'attention'

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
  const [sort, setSort] = useState<SortState<TaskSortKey> | null>(null)
  const sortedItems = sortItems(items, sort, {
    assignment: (task) => task.title,
    project: (task) => task.projectName,
    checkpoint: (task) => task.milestoneTitle || '',
    due: (task) => dateSortValue(task.deadline),
    assignees: (task) => assigneeText(task),
    state: (task) => getAssignmentState(task).label,
    priority: (task) => priorityRank(task.priority),
    attention: (task) => attentionRank(task),
  })
  const onSort = (key: TaskSortKey) => setSort((current) => toggleSort(current, key))

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />
  }

  return (
    <div className="overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead sortKey="assignment" sort={sort} onSort={onSort}>Assignment</SortableTableHead>
            {showProject ? <SortableTableHead sortKey="project" sort={sort} onSort={onSort} className="hidden md:table-cell">Project</SortableTableHead> : null}
            <SortableTableHead sortKey="checkpoint" sort={sort} onSort={onSort} className="hidden xl:table-cell">Checkpoint</SortableTableHead>
            <SortableTableHead sortKey="due" sort={sort} onSort={onSort}>Due</SortableTableHead>
            {showAssignees ? <SortableTableHead sortKey="assignees" sort={sort} onSort={onSort} className="hidden lg:table-cell">Assignees</SortableTableHead> : null}
            <SortableTableHead sortKey="state" sort={sort} onSort={onSort}>State</SortableTableHead>
            <SortableTableHead sortKey="priority" sort={sort} onSort={onSort}>Priority</SortableTableHead>
            {showAttention ? <SortableTableHead sortKey="attention" sort={sort} onSort={onSort}>Attention</SortableTableHead> : null}
            <TableHead className="w-20 text-right">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedItems.map((task) => {
            const assignmentState = getAssignmentState(task)
            return (
            <TableRow key={task.id} className={assignmentState.key === 'overdue' ? 'bg-red-50/70 hover:bg-red-50' : undefined}>
              <TableCell>
                <Link className="font-heading font-semibold text-ink underline-offset-4 hover:underline" to={`/workspace/projects/${task.projectId}/tasks/${task.id}`}>
                  {task.title}
                </Link>
                {showProject ? <p className="mt-1 text-xs font-medium text-muted-foreground md:hidden">{task.projectName}</p> : null}
                {showAssignees ? <p className="mt-1 text-xs text-muted-foreground lg:hidden"><AssigneeLinks task={task} /></p> : null}
              </TableCell>
              {showProject ? (
                <TableCell className="hidden max-w-52 truncate text-muted-foreground md:table-cell">
                  <Link className="underline-offset-4 hover:text-primary hover:underline" to={`/workspace/projects/${task.projectId}`}>{task.projectName}</Link>
                </TableCell>
              ) : null}
              <TableCell className="hidden max-w-48 truncate text-muted-foreground xl:table-cell">{task.milestoneTitle || 'Missing checkpoint'}</TableCell>
              <TableCell className={assignmentState.key === 'overdue' ? 'text-destructive' : 'text-muted-foreground'}>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-4" />
                  {formatDate(task.deadline)}
                </span>
              </TableCell>
               {showAssignees ? <TableCell className="hidden max-w-64 truncate text-muted-foreground lg:table-cell"><AssigneeLinks task={task} /></TableCell> : null}
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

function AssigneeLinks({ task }: { task: Task }) {
  if (!task.assignees.length) return 'No assignee'
  return task.assignees.map((assignee, index) => <span key={assignee.id}>{index > 0 ? ', ' : null}<PersonLink id={assignee.id} name={assignee.fullName} role="student" /></span>)
}

function priorityRank(priority: Task['priority']) {
  return { high: 0, medium: 1, low: 2 }[priority]
}

function attentionRank(task: Task) {
  if (task.pendingReviewCount > 0) {
    return 0
  }
  if (task.isOverdue) {
    return 1
  }
  return 2
}

import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowUpRight, CalendarClock, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/layout/page-header'
import { ErrorState } from '@/components/shared/error-state'
import { LoadingState } from '@/components/shared/loading-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getDashboard } from '@/features/dashboard/api'
import { getLastApprovedLabel, getProjectAttentionReason, projectNeedsAttention } from '@/features/projects/attention'
import { formatDate, formatDateTime } from '@/lib/format'
import { pageItems } from '@/lib/pagination'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import type { Dashboard, ProgressUpdate, Project, Task } from '@/types/api'

const DASHBOARD_PAGE_SIZE = 4

export function DashboardPage() {
  const dashboardQuery = useQuery({ queryKey: queryKeys.dashboard, queryFn: getDashboard })

  if (dashboardQuery.isLoading) {
    return <LoadingState label="Loading dashboard" />
  }
  if (dashboardQuery.isError) {
    return <ErrorState message="The dashboard could not be loaded." onRetry={() => void dashboardQuery.refetch()} />
  }
  if (!dashboardQuery.data) {
    return <ErrorState message="The dashboard returned no data." onRetry={() => void dashboardQuery.refetch()} />
  }

  const dashboard = dashboardQuery.data
  const isStudent = dashboard.role === 'student'
  const isAdmin = dashboard.role === 'admin'
  const title = isStudent ? 'Do next' : 'Review work'
  const description = isStudent
    ? 'Start with the first open assignment, then check submitted work below.'
    : 'Clear pending submissions first, then follow up on overdue assignments and stale projects.'
  const attentionProjects = dashboard.projects.filter(projectNeedsAttention)
  const followUpProjects = attentionProjects.filter((project) => project.pendingReviewCount === 0)
  const pendingReviewUpdates = sortOldestFirst(dashboard.progressUpdates.filter((update) => update.reviewStatus === 'pending_review'))

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isStudent ? 'Student dashboard' : isAdmin ? 'Admin dashboard' : 'Teacher dashboard'}
        title={title}
        description={description}
      />

      {isStudent ? (
        <StudentDashboard dashboard={dashboard} />
      ) : (
        <ManagerDashboard dashboard={dashboard} isAdmin={isAdmin} pendingReviewUpdates={pendingReviewUpdates} followUpProjects={followUpProjects} />
      )}
    </div>
  )
}

function ManagerDashboard({ dashboard, isAdmin, pendingReviewUpdates, followUpProjects }: { dashboard: Dashboard; isAdmin: boolean; pendingReviewUpdates: ProgressUpdate[]; followUpProjects: Project[] }) {
  return (
    <section className="space-y-6">
      <DashboardSection id="reviews" title="Pending reviews" description="Oldest submissions are first." countLabel={`${pendingReviewUpdates.length} waiting`}>
        <PaginatedDashboardList items={pendingReviewUpdates} pageSize={DASHBOARD_PAGE_SIZE} itemLabel="submissions">
          {(updates) => <ReviewTable updates={updates} />}
        </PaginatedDashboardList>
      </DashboardSection>

      <DashboardSection id="overdue" title="Overdue assignments" description="Past-due work in active projects." countLabel={`${dashboard.tasks.length} overdue`}>
        <PaginatedDashboardList items={dashboard.tasks} pageSize={DASHBOARD_PAGE_SIZE} itemLabel="assignments">
          {(tasks) => <OverdueAssignmentTable tasks={tasks} />}
        </PaginatedDashboardList>
      </DashboardSection>

      <DashboardSection id="work" title="Project follow-ups" description="Projects with stale or missing approved progress." countLabel={`${followUpProjects.length} projects`}>
        <PaginatedDashboardList items={followUpProjects} pageSize={DASHBOARD_PAGE_SIZE} itemLabel="projects">
          {(projects) => <ProjectFollowUpTable projects={projects} showSupervisor={isAdmin} />}
        </PaginatedDashboardList>
      </DashboardSection>
    </section>
  )
}

function StudentDashboard({ dashboard }: { dashboard: Dashboard }) {
  const tasks = sortStudentTasks(dashboard.tasks)
  return (
    <section className="space-y-6">
      <DashboardSection id="work" title="Open assignments" description="Work is ordered by revision, overdue status, then nearest due date." countLabel={`${tasks.length} open`}>
        <PaginatedDashboardList items={tasks} pageSize={DASHBOARD_PAGE_SIZE} itemLabel="assignments">
          {(visibleTasks) => <StudentWorkTable tasks={visibleTasks} />}
        </PaginatedDashboardList>
      </DashboardSection>

      <DashboardSection title="Recent submissions" description="Submitted work and teacher review status." countLabel={`${dashboard.progressUpdates.length} submissions`}>
        <PaginatedDashboardList items={dashboard.progressUpdates} pageSize={DASHBOARD_PAGE_SIZE} itemLabel="submissions">
          {(updates) => <SubmissionTable updates={updates} />}
        </PaginatedDashboardList>
      </DashboardSection>
    </section>
  )
}

function DashboardSection({ id, title, description, countLabel, children }: { id?: string; title: string; description: string; countLabel: string; children: ReactNode }) {
  return (
    <section id={id} className="space-y-2.5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-tight text-ink">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="text-sm font-medium text-muted-foreground">{countLabel}</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card/90 shadow-sm">
        {children}
      </div>
    </section>
  )
}

function ReviewTable({ updates }: { updates: ProgressUpdate[] }) {
  if (updates.length === 0) {
    return <DashboardEmpty title="No pending reviews" message="Student submissions waiting for review will appear here." />
  }

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[52rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Submission</TableHead>
            <TableHead className="w-44">Student</TableHead>
            <TableHead className="w-64">Project</TableHead>
            <TableHead className="w-44">Submitted</TableHead>
            <TableHead className="w-24 text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {updates.map((update) => {
            const reviewHref = `/workspace/projects/${update.projectId}/tasks/${update.taskId}#assignment-workflow`
            return (
              <TableRow key={update.id}>
                <TableCell className="min-w-72">
                  <Link className="font-heading font-semibold text-ink underline-offset-4 hover:text-primary hover:underline" to={reviewHref}>
                    {update.title || update.taskTitle}
                  </Link>
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{update.description}</p>
                  {update.blockers ? <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-red-700"><AlertTriangle className="size-3.5" /> {update.blockers}</p> : null}
                </TableCell>
                <TableCell className="text-muted-foreground">{update.submittedByName}</TableCell>
                <TableCell className="text-muted-foreground">
                  <Link className="block truncate underline-offset-4 hover:text-primary hover:underline" to={`/workspace/projects/${update.projectId}`}>{update.projectName}</Link>
                  <p className="mt-1 truncate text-xs">{update.taskTitle}</p>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><Clock className="size-4" /> {formatDateTime(update.createdAt)}</span>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm">
                    <Link to={reviewHref}>Review <ArrowUpRight className="size-4" /></Link>
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function OverdueAssignmentTable({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return <DashboardEmpty title="No overdue assignments" message="Assignments that need follow-up will appear here." />
  }

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[48rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Assignment</TableHead>
            <TableHead className="w-64">Project</TableHead>
            <TableHead className="w-36">Due</TableHead>
            <TableHead className="w-64">Assignees</TableHead>
            <TableHead className="w-20 text-right">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => (
            <TableRow key={task.id}>
              <TableCell className="min-w-72">
                <Link className="font-heading font-semibold text-ink underline-offset-4 hover:text-primary hover:underline" to={`/workspace/projects/${task.projectId}/tasks/${task.id}`}>
                  {task.title}
                </Link>
                <p className="mt-1 truncate text-xs text-muted-foreground">{task.milestoneTitle || 'Missing checkpoint'}</p>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <Link className="block truncate underline-offset-4 hover:text-primary hover:underline" to={`/workspace/projects/${task.projectId}`}>{task.projectName}</Link>
              </TableCell>
              <TableCell className="whitespace-nowrap font-semibold text-destructive">
                <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-4" /> {formatDate(task.deadline)}</span>
              </TableCell>
              <TableCell className="max-w-64 truncate text-muted-foreground">{assigneeText(task)}</TableCell>
              <TableCell className="text-right">
                <OpenLink to={`/workspace/projects/${task.projectId}/tasks/${task.id}`} label={`Open assignment ${task.title}`} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function ProjectFollowUpTable({ projects, showSupervisor }: { projects: Project[]; showSupervisor: boolean }) {
  if (projects.length === 0) {
    return <DashboardEmpty title="No project follow-ups" message="Projects with stale or missing progress will appear here after review work is clear." />
  }

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[48rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            <TableHead className="w-56">{showSupervisor ? 'Supervisor' : 'Topic'}</TableHead>
            <TableHead className="w-40">Reason</TableHead>
            <TableHead className="w-40">Last approved</TableHead>
            <TableHead className="w-20 text-right">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <TableRow key={project.id}>
              <TableCell className="min-w-72">
                <Link className="font-heading font-semibold text-ink underline-offset-4 hover:text-primary hover:underline" to={`/workspace/projects/${project.id}`}>
                  {project.name}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">{project.memberCount} members · {project.taskCount} assignments</p>
              </TableCell>
              <TableCell className="text-muted-foreground">{showSupervisor ? project.supervisorName : project.topic || 'No topic set'}</TableCell>
              <TableCell><span className="text-sm font-semibold text-destructive">{getProjectAttentionReason(project)}</span></TableCell>
              <TableCell className="text-muted-foreground">{getLastApprovedLabel(project)}</TableCell>
              <TableCell className="text-right">
                <OpenLink to={`/workspace/projects/${project.id}`} label={`Open ${project.name}`} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function StudentWorkTable({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return <DashboardEmpty title="No open assignments" message="Nothing needs action right now. Submitted or completed work appears below or in your projects." />
  }

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[48rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Assignment</TableHead>
            <TableHead className="w-64">Project</TableHead>
            <TableHead className="w-36">Due</TableHead>
            <TableHead className="w-36">Status</TableHead>
            <TableHead className="w-20 text-right">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            const badge = studentWorkBadge(task)
            return (
              <TableRow key={task.id}>
                <TableCell className="min-w-72">
                  <Link className="font-heading font-semibold text-ink underline-offset-4 hover:text-primary hover:underline" to={`/workspace/projects/${task.projectId}/tasks/${task.id}`}>
                    {task.title}
                  </Link>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{task.milestoneTitle || 'Missing checkpoint'}</p>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <Link className="block truncate underline-offset-4 hover:text-primary hover:underline" to={`/workspace/projects/${task.projectId}`}>{task.projectName}</Link>
                </TableCell>
                <TableCell className={cn('whitespace-nowrap', task.isOverdue ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                  <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-4" /> {formatDate(task.deadline)}</span>
                </TableCell>
                <TableCell><StatusBadge value={badge.value} tone={badge.tone} /></TableCell>
                <TableCell className="text-right">
                  <OpenLink to={`/workspace/projects/${task.projectId}/tasks/${task.id}`} label={`Open assignment ${task.title}`} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function SubmissionTable({ updates }: { updates: ProgressUpdate[] }) {
  if (updates.length === 0) {
    return <DashboardEmpty title="No submissions yet" message="Work you submit for assignments will appear here." />
  }

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[48rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Submission</TableHead>
            <TableHead className="w-64">Project</TableHead>
            <TableHead className="w-36">Status</TableHead>
            <TableHead className="w-44">Submitted</TableHead>
            <TableHead className="w-20 text-right">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {updates.map((update) => (
            <TableRow key={update.id}>
              <TableCell className="min-w-72">
                <Link className="font-heading font-semibold text-ink underline-offset-4 hover:text-primary hover:underline" to={`/workspace/projects/${update.projectId}/tasks/${update.taskId}#progress-${update.id}`}>
                  {update.title || update.taskTitle}
                </Link>
                {update.blockers ? <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-red-700"><AlertTriangle className="size-3.5" /> {update.blockers}</p> : null}
              </TableCell>
              <TableCell className="text-muted-foreground">
                <Link className="block truncate underline-offset-4 hover:text-primary hover:underline" to={`/workspace/projects/${update.projectId}`}>{update.projectName}</Link>
                <p className="mt-1 truncate text-xs">{update.taskTitle}</p>
              </TableCell>
              <TableCell><StatusBadge value={update.reviewStatus} /></TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Clock className="size-4" /> {formatDateTime(update.createdAt)}</span>
              </TableCell>
              <TableCell className="text-right">
                <OpenLink to={`/workspace/projects/${update.projectId}/tasks/${update.taskId}#progress-${update.id}`} label="Open submission" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function OpenLink({ to, label }: { to: string; label: string }) {
  return (
    <Link className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline" to={to} aria-label={label}>
      Open
      <ArrowUpRight className="size-4" />
    </Link>
  )
}

function DashboardEmpty({ title, message }: { title: string; message: string }) {
  return (
    <div className="p-4">
      <div className="rounded-xl border border-dashed border-border bg-paper/60 px-5 py-6 text-center">
        <p className="font-heading text-lg font-semibold text-ink">{title}</p>
        <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}

function PaginatedDashboardList<T>({ items, pageSize, itemLabel, children }: { items: T[]; pageSize: number; itemLabel: string; children: (items: T[]) => ReactNode }) {
  const [page, setPage] = useState(1)
  const { currentPage, items: visibleItems } = pageItems(items, page, pageSize)

  return (
    <>
      {children(visibleItems)}
      {items.length > pageSize ? <DashboardPager page={currentPage} pageSize={pageSize} totalItems={items.length} itemLabel={itemLabel} onPageChange={setPage} /> : null}
    </>
  )
}

function DashboardPager({ page, pageSize, totalItems, itemLabel, onPageChange }: { page: number; pageSize: number; totalItems: number; itemLabel: string; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const startItem = (page - 1) * pageSize + 1
  const endItem = Math.min(startItem + pageSize - 1, totalItems)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-paper/35 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-medium">{startItem}-{endItem} of {totalItems} {itemLabel}</span>
      <div className="flex items-center gap-1">
        <button type="button" className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 font-semibold transition hover:bg-muted hover:text-ink disabled:pointer-events-none disabled:opacity-40" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>
          <ChevronLeft className="size-4" />
          Previous
        </button>
        <button type="button" className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 font-semibold transition hover:bg-muted hover:text-ink disabled:pointer-events-none disabled:opacity-40" disabled={page >= totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}>
          Next
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  )
}

function studentWorkBadge(task: Task): { value: string; tone: 'amber' | 'red' | 'blue' | 'slate' } {
  if (isNeedsRevision(task)) {
    return { value: 'needs_revision', tone: 'amber' }
  }
  if (task.isOverdue) {
    return { value: 'overdue', tone: 'red' }
  }
  if (task.officialProgressState === 'in_progress' || task.status === 'in_progress') {
    return { value: 'in_progress', tone: 'blue' }
  }
  return { value: 'next_up', tone: 'slate' }
}

function sortStudentTasks(tasks: Task[]) {
  return [...tasks].sort((left, right) => {
    const rankDiff = studentTaskRank(left) - studentTaskRank(right)
    if (rankDiff !== 0) {
      return rankDiff
    }
    return deadlineTime(left) - deadlineTime(right)
  })
}

function studentTaskRank(task: Task) {
  if (isNeedsRevision(task)) {
    return 0
  }
  if (task.isOverdue) {
    return 1
  }
  return 2
}

function deadlineTime(task: Task) {
  return task.deadline ? new Date(task.deadline).getTime() : Number.POSITIVE_INFINITY
}

function isNeedsRevision(task: Task) {
  return task.status === 'needs_changes' || task.officialProgressState === 'needs_changes'
}

function assigneeText(task: Task) {
  return task.assignees.length > 0 ? task.assignees.map((assignee) => assignee.fullName).join(', ') : 'No assignee'
}

function sortOldestFirst(updates: ProgressUpdate[]) {
  return [...updates].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

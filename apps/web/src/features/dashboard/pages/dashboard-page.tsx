import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowUpRight, CalendarClock, ChevronLeft, ChevronRight, Clock, Search, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/layout/page-header'
import { ErrorState } from '@/components/shared/error-state'
import { LoadingState } from '@/components/shared/loading-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SortableTableHead, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PersonLink } from '@/features/activity/components/person-link'
import { getDashboard } from '@/features/dashboard/api'
import { getLastApprovedLabel, getProjectAttentionReason, projectNeedsAttention } from '@/features/projects/attention'
import { getAssignmentState, isAssignmentNeedsRevision } from '@/features/tasks/assignment-state'
import { formatDate, formatDateTime } from '@/lib/format'
import { pageItems } from '@/lib/pagination'
import { queryKeys } from '@/lib/query-keys'
import { dateSortValue, sortItems, toggleSort, type SortState } from '@/lib/sort'
import { cn } from '@/lib/utils'
import type { ProgressUpdate, Project, Task } from '@/types/api'

const DASHBOARD_PAGE_SIZE = 4
type ReviewSortKey = 'submission' | 'student' | 'project' | 'submitted'
type OverdueSortKey = 'assignment' | 'project' | 'due' | 'assignees'
type ProjectFollowUpSortKey = 'project' | 'context' | 'reason' | 'lastApproved'
type StudentWorkSortKey = 'assignment' | 'project' | 'due' | 'status'
type SubmissionSortKey = 'submission' | 'project' | 'status' | 'submitted'

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
  const allFollowUpProjects = attentionProjects.filter((project) => project.pendingReviewCount === 0)
  const allPendingReviewUpdates = sortOldestFirst(dashboard.progressUpdates.filter((update) => update.reviewStatus === 'pending_review'))

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isStudent ? 'Student dashboard' : isAdmin ? 'Admin dashboard' : 'Teacher dashboard'}
        title={title}
        description={description}
      />

      {isStudent ? (
        <StudentDashboard tasks={dashboard.tasks} progressUpdates={dashboard.progressUpdates} />
      ) : (
        <ManagerDashboard isAdmin={isAdmin} pendingReviewUpdates={allPendingReviewUpdates} overdueTasks={dashboard.tasks} followUpProjects={allFollowUpProjects} />
      )}
    </div>
  )
}

function DashboardSectionSearch({ value, onChange, label, placeholder }: { value: string; onChange: (value: string) => void; label: string; placeholder: string }) {
  return (
    <label className="relative block w-full">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="h-9 rounded-full bg-white pl-9 pr-10 text-sm" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {value.trim() ? <button type="button" className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-ink" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => onChange('')}><X className="size-3.5" /></button> : null}
    </label>
  )
}

function ManagerDashboard({ isAdmin, pendingReviewUpdates, overdueTasks, followUpProjects }: { isAdmin: boolean; pendingReviewUpdates: ProgressUpdate[]; overdueTasks: Task[]; followUpProjects: Project[] }) {
  const [reviewSearch, setReviewSearch] = useState('')
  const [overdueSearch, setOverdueSearch] = useState('')
  const [projectSearch, setProjectSearch] = useState('')
  const [reviewSort, setReviewSort] = useState<SortState<ReviewSortKey> | null>(null)
  const [overdueSort, setOverdueSort] = useState<SortState<OverdueSortKey> | null>(null)
  const [projectSort, setProjectSort] = useState<SortState<ProjectFollowUpSortKey> | null>(null)
  const reviewQuery = normalizeSearch(reviewSearch)
  const overdueQuery = normalizeSearch(overdueSearch)
  const projectQuery = normalizeSearch(projectSearch)
  const filteredReviews = filterProgressUpdates(pendingReviewUpdates, reviewQuery)
  const filteredOverdueTasks = filterTasks(overdueTasks, overdueQuery)
  const filteredFollowUpProjects = filterProjects(followUpProjects, projectQuery)
  const sortedReviews = sortItems(filteredReviews, reviewSort, {
    submission: (update) => update.title || update.taskTitle,
    student: (update) => update.submittedByName,
    project: (update) => `${update.projectName} ${update.taskTitle}`,
    submitted: (update) => dateSortValue(update.createdAt),
  })
  const sortedOverdueTasks = sortItems(filteredOverdueTasks, overdueSort, {
    assignment: (task) => task.title,
    project: (task) => task.projectName,
    due: (task) => dateSortValue(task.deadline),
    assignees: (task) => assigneeText(task),
  })
  const sortedFollowUpProjects = sortItems(filteredFollowUpProjects, projectSort, {
    project: (project) => project.name,
    context: (project) => isAdmin ? project.supervisorName : project.topic || '',
    reason: (project) => getProjectAttentionReason(project),
    lastApproved: (project) => dateSortValue(project.lastApprovedUpdateAt),
  })
  const onReviewSort = (key: ReviewSortKey) => setReviewSort((current) => toggleSort(current, key))
  const onOverdueSort = (key: OverdueSortKey) => setOverdueSort((current) => toggleSort(current, key))
  const onProjectSort = (key: ProjectFollowUpSortKey) => setProjectSort((current) => toggleSort(current, key))

  return (
    <section className="space-y-6">
      <DashboardSection id="reviews" title="Pending reviews" description="Oldest submissions are first." countLabel={dashboardCountLabel(filteredReviews.length, pendingReviewUpdates.length, 'waiting', Boolean(reviewQuery))} search={{ value: reviewSearch, onChange: setReviewSearch, label: 'Search pending reviews', placeholder: 'Search reviews' }}>
        <PaginatedDashboardList key={dashboardListKey(reviewQuery, reviewSort)} items={sortedReviews} pageSize={DASHBOARD_PAGE_SIZE} itemLabel="submissions">
          {(updates) => <ReviewTable updates={updates} isFiltered={Boolean(reviewQuery)} sort={reviewSort} onSort={onReviewSort} />}
        </PaginatedDashboardList>
      </DashboardSection>

      <DashboardSection id="overdue" title="Overdue assignments" description="Past-due work in active projects." countLabel={dashboardCountLabel(filteredOverdueTasks.length, overdueTasks.length, 'overdue', Boolean(overdueQuery))} search={{ value: overdueSearch, onChange: setOverdueSearch, label: 'Search overdue assignments', placeholder: 'Search overdue work' }}>
        <PaginatedDashboardList key={dashboardListKey(overdueQuery, overdueSort)} items={sortedOverdueTasks} pageSize={DASHBOARD_PAGE_SIZE} itemLabel="assignments">
          {(tasks) => <OverdueAssignmentTable tasks={tasks} isFiltered={Boolean(overdueQuery)} sort={overdueSort} onSort={onOverdueSort} />}
        </PaginatedDashboardList>
      </DashboardSection>

      <DashboardSection id="work" title="Project follow-ups" description="Projects with stale or missing approved progress." countLabel={dashboardCountLabel(filteredFollowUpProjects.length, followUpProjects.length, 'projects', Boolean(projectQuery))} search={{ value: projectSearch, onChange: setProjectSearch, label: 'Search project follow-ups', placeholder: 'Search projects' }}>
        <PaginatedDashboardList key={dashboardListKey(projectQuery, projectSort)} items={sortedFollowUpProjects} pageSize={DASHBOARD_PAGE_SIZE} itemLabel="projects">
          {(projects) => <ProjectFollowUpTable projects={projects} showSupervisor={isAdmin} isFiltered={Boolean(projectQuery)} sort={projectSort} onSort={onProjectSort} />}
        </PaginatedDashboardList>
      </DashboardSection>
    </section>
  )
}

function StudentDashboard({ tasks, progressUpdates }: { tasks: Task[]; progressUpdates: ProgressUpdate[] }) {
  const [assignmentSearch, setAssignmentSearch] = useState('')
  const [submissionSearch, setSubmissionSearch] = useState('')
  const [assignmentSort, setAssignmentSort] = useState<SortState<StudentWorkSortKey> | null>(null)
  const [submissionSort, setSubmissionSort] = useState<SortState<SubmissionSortKey> | null>(null)
  const assignmentQuery = normalizeSearch(assignmentSearch)
  const submissionQuery = normalizeSearch(submissionSearch)
  const sortedTasks = sortStudentTasks(tasks)
  const filteredTasks = filterTasks(sortedTasks, assignmentQuery)
  const filteredSubmissions = filterProgressUpdates(progressUpdates, submissionQuery)
  const sortedFilteredTasks = sortItems(filteredTasks, assignmentSort, {
    assignment: (task) => task.title,
    project: (task) => task.projectName,
    due: (task) => dateSortValue(task.deadline),
    status: (task) => studentWorkBadge(task).value,
  })
  const sortedFilteredSubmissions = sortItems(filteredSubmissions, submissionSort, {
    submission: (update) => update.title || update.taskTitle,
    project: (update) => `${update.projectName} ${update.taskTitle}`,
    status: (update) => update.reviewStatus,
    submitted: (update) => dateSortValue(update.createdAt),
  })
  const onAssignmentSort = (key: StudentWorkSortKey) => setAssignmentSort((current) => toggleSort(current, key))
  const onSubmissionSort = (key: SubmissionSortKey) => setSubmissionSort((current) => toggleSort(current, key))

  return (
    <section className="space-y-6">
      <DashboardSection id="work" title="Open assignments" description="Work is ordered by revision, overdue status, then nearest due date." countLabel={dashboardCountLabel(filteredTasks.length, sortedTasks.length, 'open', Boolean(assignmentQuery))} search={{ value: assignmentSearch, onChange: setAssignmentSearch, label: 'Search open assignments', placeholder: 'Search assignments' }}>
        <PaginatedDashboardList key={dashboardListKey(assignmentQuery, assignmentSort)} items={sortedFilteredTasks} pageSize={DASHBOARD_PAGE_SIZE} itemLabel="assignments">
          {(visibleTasks) => <StudentWorkTable tasks={visibleTasks} isFiltered={Boolean(assignmentQuery)} sort={assignmentSort} onSort={onAssignmentSort} />}
        </PaginatedDashboardList>
      </DashboardSection>

      <DashboardSection title="Recent submissions" description="Submitted work and teacher review status." countLabel={dashboardCountLabel(filteredSubmissions.length, progressUpdates.length, 'submissions', Boolean(submissionQuery))} search={{ value: submissionSearch, onChange: setSubmissionSearch, label: 'Search recent submissions', placeholder: 'Search submissions' }}>
        <PaginatedDashboardList key={dashboardListKey(submissionQuery, submissionSort)} items={sortedFilteredSubmissions} pageSize={DASHBOARD_PAGE_SIZE} itemLabel="submissions">
          {(updates) => <SubmissionTable updates={updates} isFiltered={Boolean(submissionQuery)} sort={submissionSort} onSort={onSubmissionSort} />}
        </PaginatedDashboardList>
      </DashboardSection>
    </section>
  )
}

function dashboardCountLabel(count: number, total: number, label: string, isFiltered: boolean) {
  return isFiltered ? `${count} of ${total} ${label}` : `${count} ${label}`
}

function dashboardListKey<TKey extends string>(query: string, sort: SortState<TKey> | null) {
  return `${query}:${sort?.key || 'default'}:${sort?.direction || 'none'}`
}

function DashboardSection({ id, title, description, countLabel, search, children }: { id?: string; title: string; description: string; countLabel: string; search?: { value: string; onChange: (value: string) => void; label: string; placeholder: string }; children: ReactNode }) {
  return (
    <section id={id} className="space-y-2.5">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,24rem)] lg:items-end">
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-tight text-ink">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[auto_minmax(14rem,1fr)] sm:items-center lg:grid-cols-1 lg:justify-items-end">
          <span className="text-sm font-medium text-muted-foreground">{countLabel}</span>
          {search ? <DashboardSectionSearch value={search.value} onChange={search.onChange} label={search.label} placeholder={search.placeholder} /> : null}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card/90 shadow-sm">
        {children}
      </div>
    </section>
  )
}

function ReviewTable({ updates, isFiltered, sort, onSort }: { updates: ProgressUpdate[]; isFiltered: boolean; sort: SortState<ReviewSortKey> | null; onSort: (key: ReviewSortKey) => void }) {
  if (updates.length === 0) {
    return <DashboardEmpty title={isFiltered ? 'No matching reviews' : 'No pending reviews'} message={isFiltered ? 'Try another search term or clear this table search.' : 'Student submissions waiting for review will appear here.'} />
  }

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[52rem]">
        <TableHeader>
          <TableRow>
            <SortableTableHead sortKey="submission" sort={sort} onSort={onSort}>Submission</SortableTableHead>
            <SortableTableHead sortKey="student" sort={sort} onSort={onSort} className="w-44">Student</SortableTableHead>
            <SortableTableHead sortKey="project" sort={sort} onSort={onSort} className="w-64">Project</SortableTableHead>
            <SortableTableHead sortKey="submitted" sort={sort} onSort={onSort} className="w-44">Submitted</SortableTableHead>
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
                  {update.blockers ? <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-red-700"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> <span>Blocker: {update.blockers}</span></p> : null}
                </TableCell>
                <TableCell className="text-muted-foreground"><PersonLink id={update.submittedBy} name={update.submittedByName} role="student" /></TableCell>
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

function OverdueAssignmentTable({ tasks, isFiltered, sort, onSort }: { tasks: Task[]; isFiltered: boolean; sort: SortState<OverdueSortKey> | null; onSort: (key: OverdueSortKey) => void }) {
  if (tasks.length === 0) {
    return <DashboardEmpty title={isFiltered ? 'No matching overdue assignments' : 'No overdue assignments'} message={isFiltered ? 'Try another search term or clear this table search.' : 'Assignments that need follow-up will appear here.'} />
  }

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[56rem]">
        <TableHeader>
          <TableRow>
            <SortableTableHead sortKey="assignment" sort={sort} onSort={onSort}>Assignment</SortableTableHead>
            <SortableTableHead sortKey="project" sort={sort} onSort={onSort} className="w-64">Project</SortableTableHead>
            <TableHead className="w-48">Supervisor</TableHead>
            <SortableTableHead sortKey="due" sort={sort} onSort={onSort} className="w-36">Due</SortableTableHead>
            <SortableTableHead sortKey="assignees" sort={sort} onSort={onSort} className="w-64">Assignees</SortableTableHead>
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
              <TableCell className="text-muted-foreground"><PersonLink id={task.supervisorId} name={task.supervisorName} role="teacher" /></TableCell>
              <TableCell className="whitespace-nowrap font-semibold text-destructive">
                <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-4" /> {formatDate(task.deadline)}</span>
              </TableCell>
              <TableCell className="max-w-64 truncate text-muted-foreground"><AssigneeLinks task={task} /></TableCell>
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

function ProjectFollowUpTable({ projects, showSupervisor, isFiltered, sort, onSort }: { projects: Project[]; showSupervisor: boolean; isFiltered: boolean; sort: SortState<ProjectFollowUpSortKey> | null; onSort: (key: ProjectFollowUpSortKey) => void }) {
  if (projects.length === 0) {
    return <DashboardEmpty title={isFiltered ? 'No matching project follow-ups' : 'No project follow-ups'} message={isFiltered ? 'Try another search term or clear this table search.' : 'Projects with stale or missing progress will appear here after review work is clear.'} />
  }

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[56rem]">
        <TableHeader>
          <TableRow>
            <SortableTableHead sortKey="project" sort={sort} onSort={onSort}>Project</SortableTableHead>
            <SortableTableHead sortKey="context" sort={sort} onSort={onSort} className="w-56">{showSupervisor ? 'Supervisor' : 'Topic'}</SortableTableHead>
            <SortableTableHead sortKey="reason" sort={sort} onSort={onSort} className="w-40">Reason</SortableTableHead>
            <SortableTableHead sortKey="lastApproved" sort={sort} onSort={onSort} className="w-40">Last approved</SortableTableHead>
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
              <TableCell className="text-muted-foreground">{showSupervisor ? <PersonLink id={project.supervisorId} name={project.supervisorName} role="teacher" /> : project.topic || 'No topic set'}</TableCell>
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

function AssigneeLinks({ task }: { task: Task }) {
  if (!task.assignees.length) return 'No assignee'
  return task.assignees.map((assignee, index) => <span key={assignee.id}>{index > 0 ? ', ' : null}<PersonLink id={assignee.id} name={assignee.fullName} role="student" /></span>)
}

function StudentWorkTable({ tasks, isFiltered, sort, onSort }: { tasks: Task[]; isFiltered: boolean; sort: SortState<StudentWorkSortKey> | null; onSort: (key: StudentWorkSortKey) => void }) {
  if (tasks.length === 0) {
    return <DashboardEmpty title={isFiltered ? 'No matching assignments' : 'No open assignments'} message={isFiltered ? 'Try another search term or clear this table search.' : 'Nothing needs action right now. Submitted or completed work appears below or in your projects.'} />
  }

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[56rem]">
        <TableHeader>
          <TableRow>
            <SortableTableHead sortKey="assignment" sort={sort} onSort={onSort}>Assignment</SortableTableHead>
            <SortableTableHead sortKey="project" sort={sort} onSort={onSort} className="w-64">Project</SortableTableHead>
            <TableHead className="w-48">Supervisor</TableHead>
            <SortableTableHead sortKey="due" sort={sort} onSort={onSort} className="w-36">Due</SortableTableHead>
            <SortableTableHead sortKey="status" sort={sort} onSort={onSort} className="w-36">Status</SortableTableHead>
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
                <TableCell className="text-muted-foreground"><PersonLink id={task.supervisorId} name={task.supervisorName} role="teacher" /></TableCell>
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

function SubmissionTable({ updates, isFiltered, sort, onSort }: { updates: ProgressUpdate[]; isFiltered: boolean; sort: SortState<SubmissionSortKey> | null; onSort: (key: SubmissionSortKey) => void }) {
  if (updates.length === 0) {
    return <DashboardEmpty title={isFiltered ? 'No matching submissions' : 'No submissions yet'} message={isFiltered ? 'Try another search term or clear this table search.' : 'Work you submit for assignments will appear here.'} />
  }

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[56rem]">
        <TableHeader>
          <TableRow>
            <SortableTableHead sortKey="submission" sort={sort} onSort={onSort}>Submission</SortableTableHead>
            <SortableTableHead sortKey="project" sort={sort} onSort={onSort} className="w-64">Project</SortableTableHead>
            <TableHead className="w-48">Supervisor</TableHead>
            <SortableTableHead sortKey="status" sort={sort} onSort={onSort} className="w-36">Status</SortableTableHead>
            <SortableTableHead sortKey="submitted" sort={sort} onSort={onSort} className="w-44">Submitted</SortableTableHead>
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
                {update.blockers ? <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-red-700"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> <span>Blocker: {update.blockers}</span></p> : null}
              </TableCell>
              <TableCell className="text-muted-foreground">
                <Link className="block truncate underline-offset-4 hover:text-primary hover:underline" to={`/workspace/projects/${update.projectId}`}>{update.projectName}</Link>
                <p className="mt-1 truncate text-xs">{update.taskTitle}</p>
              </TableCell>
              <TableCell className="text-muted-foreground">{update.supervisorId && update.supervisorName ? <PersonLink id={update.supervisorId} name={update.supervisorName} role="teacher" /> : 'Not available'}</TableCell>
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
  const assignmentState = getAssignmentState(task)
  if (assignmentState.key === 'needs_revision') {
    return { value: 'needs_revision', tone: 'amber' }
  }
  if (assignmentState.key === 'overdue') {
    return { value: 'overdue', tone: 'red' }
  }
  if (assignmentState.key === 'in_progress') {
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
  if (isAssignmentNeedsRevision(task)) {
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

function filterProgressUpdates(updates: ProgressUpdate[], query: string) {
  if (!query) {
    return updates
  }
  return updates.filter((update) => matchesSearch(query, [
    update.title,
    update.description,
    update.blockers,
    update.reviewStatus,
    update.projectName,
    update.taskTitle,
    update.submittedByName,
    update.latestReview?.reviewComment,
    update.latestReview?.reviewedByName,
  ]))
}

function filterTasks(tasks: Task[], query: string) {
  if (!query) {
    return tasks
  }
  return tasks.filter((task) => matchesSearch(query, [
    task.title,
    task.description,
    task.projectName,
    task.milestoneTitle,
    task.status,
    task.priority,
    task.officialProgressState,
    task.deadline,
    ...task.assignees.flatMap((assignee) => [assignee.fullName, assignee.email]),
  ]))
}

function filterProjects(projects: Project[], query: string) {
  if (!query) {
    return projects
  }
  return projects.filter((project) => matchesSearch(query, [
    project.name,
    project.description,
    project.topic,
    project.classTitle,
    project.supervisorName,
    project.status,
    project.officialProgressState,
    project.progressSummary,
    getProjectAttentionReason(project),
    getLastApprovedLabel(project),
  ]))
}

function matchesSearch(query: string, values: Array<string | undefined>) {
  return values.some((value) => normalizeSearch(value).includes(query))
}

function normalizeSearch(value?: string) {
  return value?.trim().toLowerCase() || ''
}

function assigneeText(task: Task) {
  return task.assignees.length > 0 ? task.assignees.map((assignee) => assignee.fullName).join(', ') : 'No assignee'
}

function sortOldestFirst(updates: ProgressUpdate[]) {
  return [...updates].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

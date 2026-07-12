import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ClipboardCheck, Search, Send, Timer } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { PageHeader } from '@/components/layout/page-header'
import { ErrorState } from '@/components/shared/error-state'
import { LoadingState } from '@/components/shared/loading-state'
import { PaginationControls } from '@/components/shared/pagination-controls'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getStudentWork, getTeacherWork } from '@/features/activity/api'
import { PersonLink } from '@/features/activity/components/person-link'
import { ProjectTable } from '@/features/projects/components/project-table'
import { formatDate, formatDateTime } from '@/lib/format'
import { pageItems } from '@/lib/pagination'
import { queryKeys } from '@/lib/query-keys'
import type { ProgressUpdate, Project, Task } from '@/types/api'

const TABLE_PAGE_SIZE = 8

export function StudentWorkPage() {
  const [params] = useSearchParams()
  const teacherId = params.get('teacherId') || undefined
  if (teacherId) return <TeacherWorkPage teacherId={teacherId} />
  return <StudentWorkContent studentId={params.get('studentId') || undefined} />
}

function StudentWorkContent({ studentId }: { studentId?: string }) {
  const [showHistory, setShowHistory] = useState(false)
  const [assignmentSearch, setAssignmentSearch] = useState('')
  const [submissionSearch, setSubmissionSearch] = useState('')
  const [assignmentPage, setAssignmentPage] = useState(1)
  const [submissionPage, setSubmissionPage] = useState(1)
  const workQuery = useQuery({ queryKey: queryKeys.studentWork(studentId), queryFn: () => getStudentWork(studentId) })

  if (workQuery.isLoading) return <LoadingState label="Loading work" />
  if (workQuery.isError || !workQuery.data) return <ErrorState message="Work history could not be loaded." onRetry={() => void workQuery.refetch()} />

  const work = workQuery.data
  const tasks = showHistory ? work.historyTasks : work.activeTasks
  const filteredTasks = filterTasks(tasks, assignmentSearch)
  const filteredUpdates = filterUpdates(work.progressUpdates, submissionSearch)
  const visibleTasks = pageItems(filteredTasks, assignmentPage, TABLE_PAGE_SIZE)
  const visibleUpdates = pageItems(filteredUpdates, submissionPage, TABLE_PAGE_SIZE)
  const isOwnWork = !studentId
  const pendingReviews = work.progressUpdates.filter((update) => update.reviewStatus === 'pending_review').length

  function changeAssignmentView(history: boolean) {
    setShowHistory(history)
    setAssignmentPage(1)
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={isOwnWork ? 'My work' : 'Student progress'}
        title={isOwnWork ? 'My work' : work.student.fullName}
        description={isOwnWork ? 'Keep active assignments and your complete submission history in one place.' : `Read-only supervision view for ${work.student.email}.`}
        back={!isOwnWork ? <Button asChild variant="ghost" className="-ml-2 h-9 px-2 text-muted-foreground hover:bg-accent hover:text-primary"><Link to="/workspace"><ArrowLeft className="size-4" /> Back to workspace</Link></Button> : undefined}
      />

      {!isOwnWork ? <section className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
        <WorkMetric icon={<ClipboardCheck className="size-4" />} label="Active assignments" value={work.activeTasks.length} detail="Across supervised projects" />
        <WorkMetric icon={<Send className="size-4" />} label="Submissions" value={work.progressUpdates.length} detail={pendingReviews ? `${pendingReviews} awaiting review` : 'No reviews awaiting'} />
        <WorkMetric icon={<Timer className="size-4" />} label="Overdue work" value={work.activeTasks.filter((task) => task.isOverdue).length} detail="Active assignment status" />
      </section> : null}

      <CurrentWorkSection projects={work.currentProjects} role="Member" />

      <WorkSection
        title="Assignments"
        description={showHistory ? 'All assigned work, including completed and archived projects.' : 'Assignments in active projects.'}
        countLabel={tableCountLabel(filteredTasks.length, tasks.length, 'assignments', assignmentSearch)}
        search={{ value: assignmentSearch, onChange: (value) => { setAssignmentSearch(value); setAssignmentPage(1) }, label: 'Search assignments', placeholder: 'Search assignments or projects' }}
        action={<div className="flex rounded-lg border border-border bg-card p-1"><Button size="sm" variant={showHistory ? 'ghost' : 'secondary'} onClick={() => changeAssignmentView(false)}>Active work</Button><Button size="sm" variant={showHistory ? 'secondary' : 'ghost'} onClick={() => changeAssignmentView(true)}>All history</Button></div>}
      >
        <AssignmentTable tasks={visibleTasks.items} />
        <PaginationControls page={visibleTasks.currentPage} pageSize={TABLE_PAGE_SIZE} totalItems={filteredTasks.length} itemLabel="assignments" onPageChange={setAssignmentPage} />
      </WorkSection>

      <WorkSection
        title="Submission history"
        description="Submitted work and the latest review decision or comment."
        countLabel={tableCountLabel(filteredUpdates.length, work.progressUpdates.length, 'submissions', submissionSearch)}
        search={{ value: submissionSearch, onChange: (value) => { setSubmissionSearch(value); setSubmissionPage(1) }, label: 'Search submissions', placeholder: 'Search submissions or assignments' }}
      >
        <SubmissionTable updates={visibleUpdates.items} />
        <PaginationControls page={visibleUpdates.currentPage} pageSize={TABLE_PAGE_SIZE} totalItems={filteredUpdates.length} itemLabel="submissions" onPageChange={setSubmissionPage} />
      </WorkSection>
    </div>
  )
}

function TeacherWorkPage({ teacherId }: { teacherId: string }) {
  const teacherQuery = useQuery({ queryKey: queryKeys.teacherWork(teacherId), queryFn: () => getTeacherWork(teacherId) })
  if (teacherQuery.isLoading) return <LoadingState label="Loading supervisor" />
  if (teacherQuery.isError || !teacherQuery.data) return <ErrorState message="Supervisor details could not be loaded." onRetry={() => void teacherQuery.refetch()} />

  const { teacher, projects } = teacherQuery.data
  const activeProjects = projects.filter((project) => project.status === 'active')
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Project supervisor"
        title={teacher.fullName}
        description={`${teacher.email} · ${teacher.role === 'admin' ? 'Administrator and supervisor' : 'Teacher and supervisor'}`}
        back={<Button asChild variant="ghost" className="-ml-2 h-9 px-2 text-muted-foreground hover:bg-accent hover:text-primary"><Link to="/workspace"><ArrowLeft className="size-4" /> Back to workspace</Link></Button>}
      />
      <section className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
        <WorkMetric icon={<ClipboardCheck className="size-4" />} label="Shared projects" value={projects.length} detail="Projects you can access" />
        <WorkMetric icon={<Timer className="size-4" />} label="Active projects" value={activeProjects.length} detail="Currently in progress" />
        <WorkMetric icon={<Send className="size-4" />} label="Assignments" value={projects.reduce((total, project) => total + project.taskCount, 0)} detail="Across visible projects" />
      </section>
      <CurrentWorkSection projects={activeProjects} role="Supervisor" />
      <section className="space-y-3">
        <div><h2 className="font-heading text-xl font-semibold tracking-tight text-ink">Projects</h2><p className="mt-0.5 text-sm text-muted-foreground">Projects supervised by {teacher.fullName} that you are permitted to view.</p></div>
        <div className="overflow-hidden rounded-xl border border-border bg-card/90 shadow-sm"><ProjectTable projects={projects} emptyTitle="No accessible projects" emptyMessage="There are no projects to show for this supervisor." showSupervisor={false} /></div>
      </section>
    </div>
  )
}

function CurrentWorkSection({ projects, role }: { projects: Project[]; role: 'Member' | 'Supervisor' }) {
  return (
    <section className="space-y-3">
      <div><h2 className="font-heading text-xl font-semibold tracking-tight text-ink">Current work</h2><p className="mt-0.5 text-sm text-muted-foreground">Active projects where this person is currently a {role.toLowerCase()}.</p></div>
      {projects.length ? <div className="grid gap-3 md:grid-cols-2">{projects.map((project) => <article key={project.id} className="rounded-xl border border-border bg-card p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link className="block truncate font-heading text-lg font-semibold text-ink underline-offset-4 hover:text-primary hover:underline" to={`/workspace/projects/${project.id}`}>{project.name}</Link><p className="mt-1 text-sm text-muted-foreground">{project.classTitle || 'Standalone project'}</p></div><StatusBadge value={project.status} /></div><div className="mt-4 grid gap-2 text-sm"><p className="text-muted-foreground">{projectTimeline(project)}</p><p className="text-muted-foreground">{role}: <span className="font-semibold text-ink">{role}</span></p>{role === 'Member' ? <p className="text-muted-foreground">Supervisor: <PersonLink id={project.supervisorId} name={project.supervisorName} role="teacher" /></p> : null}</div></article>)}</div> : <div className="rounded-xl border border-dashed border-border bg-paper/60 px-4 py-5 text-sm text-muted-foreground">No active projects right now.</div>}
    </section>
  )
}

function WorkMetric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: number; detail: string }) {
  return <div className="bg-card px-4 py-4"><div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><span className="text-primary">{icon}</span>{label}</div><p className="mt-2 font-heading text-2xl font-semibold tracking-tight text-ink">{value}</p><p className="mt-0.5 text-xs text-muted-foreground">{detail}</p></div>
}

function WorkSection({ title, description, countLabel, search, action, children }: { title: string; description: string; countLabel: string; search: { value: string; onChange: (value: string) => void; label: string; placeholder: string }; action?: ReactNode; children: ReactNode }) {
  return <section className="space-y-3"><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,25rem)] lg:items-end"><div><h2 className="font-heading text-xl font-semibold tracking-tight text-ink">{title}</h2><p className="mt-0.5 text-sm text-muted-foreground">{description}</p></div><div className="grid gap-2 sm:grid-cols-[auto_minmax(13rem,1fr)] sm:items-center lg:grid-cols-1 lg:justify-items-end"><div className="flex items-center gap-3"><span className="text-sm font-medium text-muted-foreground">{countLabel}</span>{action}</div><label className="relative w-full"><span className="sr-only">{search.label}</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-10 rounded-full bg-card pl-9 shadow-sm" value={search.value} onChange={(event) => search.onChange(event.target.value)} placeholder={search.placeholder} /></label></div></div><div className="overflow-hidden rounded-xl border border-border bg-card/90 shadow-sm">{children}</div></section>
}

function AssignmentTable({ tasks }: { tasks: Task[] }) {
  if (!tasks.length) return <EmptyTable message="No assignments match this view." />
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Assignment</TableHead><TableHead>Project</TableHead><TableHead>Supervisor</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{tasks.map((task) => <TableRow key={task.id}><TableCell><Link className="font-medium text-primary hover:underline" to={`/workspace/projects/${task.projectId}/tasks/${task.id}`}>{task.title}</Link></TableCell><TableCell>{task.projectName}</TableCell><TableCell><PersonLink id={task.supervisorId} name={task.supervisorName} role="teacher" /></TableCell><TableCell>{formatDate(task.deadline)}</TableCell><TableCell><StatusBadge value={task.isOverdue ? 'overdue' : task.status} /></TableCell></TableRow>)}</TableBody></Table></div>
}

function SubmissionTable({ updates }: { updates: ProgressUpdate[] }) {
  if (!updates.length) return <EmptyTable message="No submissions match this view." />
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Submission</TableHead><TableHead>Assignment</TableHead><TableHead>Supervisor</TableHead><TableHead>Review</TableHead><TableHead>Submitted</TableHead></TableRow></TableHeader><TableBody>{updates.map((update) => <TableRow key={update.id}><TableCell><p className="font-medium">{update.title || 'Progress update'}</p>{update.latestReview?.reviewComment ? <p className="mt-1 max-w-md text-xs text-muted-foreground">{update.latestReview.reviewComment}</p> : null}</TableCell><TableCell><Link className="text-primary hover:underline" to={`/workspace/projects/${update.projectId}/tasks/${update.taskId}`}>{update.projectName}: {update.taskTitle}</Link></TableCell><TableCell>{update.supervisorId && update.supervisorName ? <PersonLink id={update.supervisorId} name={update.supervisorName} role="teacher" /> : 'Not available'}</TableCell><TableCell><StatusBadge value={update.reviewStatus} /></TableCell><TableCell>{formatDateTime(update.createdAt)}</TableCell></TableRow>)}</TableBody></Table></div>
}

function EmptyTable({ message }: { message: string }) { return <div className="px-4 py-10 text-center text-sm text-muted-foreground">{message}</div> }

function projectTimeline(project: Project) {
  if (project.startDate && project.endDate) return `${formatDate(project.startDate)} - ${formatDate(project.endDate)}`
  if (project.startDate) return `Started ${formatDate(project.startDate)}`
  if (project.endDate) return `Ends ${formatDate(project.endDate)}`
  return 'Timeline not set'
}

function filterTasks(tasks: Task[], query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return tasks
  return tasks.filter((task) => `${task.title} ${task.projectName} ${task.status}`.toLowerCase().includes(normalized))
}

function filterUpdates(updates: ProgressUpdate[], query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return updates
  return updates.filter((update) => `${update.title || ''} ${update.taskTitle} ${update.projectName} ${update.reviewStatus} ${update.latestReview?.reviewComment || ''}`.toLowerCase().includes(normalized))
}

function tableCountLabel(count: number, total: number, label: string, query: string) {
  return query.trim() ? `${count} of ${total} ${label}` : `${count} ${label}`
}

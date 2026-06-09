import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CalendarClock, CheckCircle2, ClipboardList, Pencil, Send, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { ErrorState } from '@/components/shared/error-state'
import { ForbiddenState } from '@/components/shared/forbidden-state'
import { LoadingState } from '@/components/shared/loading-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { getProject, getProjectMembers, getProjectMilestones, getProjectResourceLinks } from '@/features/projects/api'
import { ResourceLinkDialog, ResourceLinkShelf, type ResourceLinkTarget } from '@/features/resources/components/resource-link-drawer'
import { resourcesForTarget } from '@/features/resources/utils'
import { getProjectFiles } from '@/features/files/api'
import { getAssignmentState, type AssignmentState } from '@/features/tasks/assignment-state'
import { getTask } from '@/features/tasks/api'
import { ProgressTimeline } from '@/features/tasks/components/progress-timeline'
import { EditTaskForm, SubmitProgressForm } from '@/features/tasks/components/task-forms'
import { formatDate, titleize } from '@/lib/format'
import { canReviewProgress, projectAcceptsPlanChanges, projectAcceptsReviews, projectAcceptsStudentSubmissions, projectAcceptsSupportChanges } from '@/lib/permissions'
import { queryKeys } from '@/lib/query-keys'
import { useAuthStore } from '@/stores/auth-store'
import type { Project, ResourceLink, Task } from '@/types/api'

export function TaskDetailPage() {
  const { projectId, taskId } = useParams()
  const resolvedProjectId = projectId || ''
  const resolvedTaskId = taskId || ''
  const [editOpen, setEditOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [resourceTarget, setResourceTarget] = useState<ResourceLinkTarget | null>(null)
  const user = useAuthStore((state) => state.user)
  const taskQuery = useQuery({
    queryKey: queryKeys.task(resolvedProjectId, resolvedTaskId),
    queryFn: () => getTask(resolvedProjectId, resolvedTaskId),
    enabled: resolvedProjectId.length > 0 && resolvedTaskId.length > 0,
  })
  const projectQuery = useQuery({ queryKey: queryKeys.project(resolvedProjectId), queryFn: () => getProject(resolvedProjectId), enabled: resolvedProjectId.length > 0 })
  const membersQuery = useQuery({ queryKey: queryKeys.projectMembers(resolvedProjectId), queryFn: () => getProjectMembers(resolvedProjectId), enabled: resolvedProjectId.length > 0 })
  const milestonesQuery = useQuery({ queryKey: queryKeys.projectMilestones(resolvedProjectId), queryFn: () => getProjectMilestones(resolvedProjectId), enabled: resolvedProjectId.length > 0 })
  const resourcesQuery = useQuery({ queryKey: queryKeys.projectResourceLinks(resolvedProjectId), queryFn: () => getProjectResourceLinks(resolvedProjectId), enabled: resolvedProjectId.length > 0 })
  const filesQuery = useQuery({ queryKey: queryKeys.projectFiles(resolvedProjectId), queryFn: () => getProjectFiles(resolvedProjectId), enabled: resolvedProjectId.length > 0 })

  if (!projectId || !taskId) {
    return <Navigate to="/dashboard" replace />
  }
  if (taskQuery.isLoading) {
    return <LoadingState label="Loading assignment" />
  }
  if (taskQuery.isError) {
    return <ForbiddenState message="This assignment is restricted, missing, or temporarily unavailable." onRetry={() => void taskQuery.refetch()} />
  }
  if (!taskQuery.data) {
    return <ErrorState message="The assignment returned no data." onRetry={() => void taskQuery.refetch()} />
  }

  const detail = taskQuery.data
  const project = projectQuery.data
  const canReviewUser = canReviewProgress(user)
  const canReview = canReviewUser && projectAcceptsReviews(project)
  const canEditAssignment = canReviewUser && projectAcceptsPlanChanges(project)
  const canManageResources = projectAcceptsSupportChanges(project)
  const canManageEvidence = canReviewUser && projectAcceptsSupportChanges(project)
  const canUploadEvidence = projectAcceptsStudentSubmissions(project)
  const isAssignedStudent = user?.role === 'student' && detail.task.assignees.some((assignee) => assignee.id === user.id)
  const assignmentState = getAssignmentState(detail.task)
  const canSubmitProgress = isAssignedStudent && projectAcceptsStudentSubmissions(project) && assignmentState.key !== 'complete' && assignmentState.key !== 'waiting_review'
  const resources = resourcesQuery.data || []
  const files = filesQuery.data || []
  const taskResources = resourcesForTarget(resources, 'task', detail.task.id)

  return (
    <div className="space-y-7">
      <Dialog open={editOpen} onOpenChange={setEditOpen} title="Edit assignment" description="Update assignment details, due date, milestone, and assigned students." className="max-w-4xl">
        <EditTaskForm projectId={resolvedProjectId} task={detail.task} members={membersQuery.data || []} milestones={milestonesQuery.data || []} onUpdated={() => setEditOpen(false)} />
      </Dialog>
      <Dialog open={progressOpen} onOpenChange={setProgressOpen} title="Submit work" description="Share completed work, evidence, or blockers for this assignment.">
        <SubmitProgressForm projectId={resolvedProjectId} taskId={resolvedTaskId} onSubmitted={() => setProgressOpen(false)} />
      </Dialog>
      <ResourceLinkDialog projectId={resolvedProjectId} target={resourceTarget} resources={resources} canCreate={canManageResources} canManageAll={canReviewUser && canManageResources} onClose={() => setResourceTarget(null)} />

      <AssignmentHeader
        task={detail.task}
        project={project}
        projectId={resolvedProjectId}
        canReview={canReview}
        canEditAssignment={canEditAssignment}
        canSubmitProgress={canSubmitProgress}
        onEdit={() => setEditOpen(true)}
        onSubmitProgress={() => setProgressOpen(true)}
      />

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <main className="min-w-0">
          <AssignmentBrief task={detail.task} />
        </main>

        <AssignmentAside
          task={detail.task}
          resources={taskResources}
          canManageResources={canManageResources}
          onManageResources={() => setResourceTarget({ type: 'task', id: detail.task.id, label: detail.task.title, eyebrow: 'Assignment resources' })}
        />
      </div>

      <ProgressTimeline projectId={resolvedProjectId} updates={detail.progressUpdates} canReview={canReview} canUploadEvidence={canUploadEvidence} canManageEvidence={canManageEvidence} currentUserId={user?.id} uploadedFiles={files} resourceLinks={resources} />
    </div>
  )
}

function TaskProjectLifecycleNotice({ project }: { project: Project }) {
  if (project.status === 'active') {
    return null
  }
  const message = {
    on_hold: 'This project is on hold. Assignment details remain readable, but student submissions are paused.',
    completed: 'This project is completed. Pending submissions can still be reviewed, but new work is closed.',
    archived: 'This project is archived. Assignment records are read-only until the project is reactivated.',
  }[project.status]
  return <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm font-medium text-amber-950"><StatusBadge value={project.status} tone="amber" /> <span className="ml-2">{message}</span></p>
}

function AssignmentHeader({ task, project, projectId, canReview, canEditAssignment, canSubmitProgress, onEdit, onSubmitProgress }: { task: Task; project?: Project; projectId: string; canReview: boolean; canEditAssignment: boolean; canSubmitProgress: boolean; onEdit: () => void; onSubmitProgress: () => void }) {
  const assignmentState = getAssignmentState(task)
  return (
    <section className="border-b border-border pb-5">
      <Button asChild variant="ghost" className="-ml-2 h-9 px-2 text-muted-foreground hover:bg-accent hover:text-primary">
        <Link to={`/workspace/projects/${projectId}`}><ArrowLeft className="size-4" /> Back to project</Link>
      </Button>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Assignment{project ? ` · ${project.name}` : ''}</p>
          <h1 className="max-w-5xl font-heading text-3xl font-semibold tracking-tight text-ink md:text-5xl">{task.title}</h1>
          {task.pendingReviewCount > 0 ? <div className="flex flex-wrap gap-2"><StatusBadge value="pending_review" tone="amber" /></div> : null}
          <AssignmentMetaLine task={task} state={assignmentState} />
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{assignmentState.description}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
          {canSubmitProgress ? <Button type="button" size="sm" onClick={onSubmitProgress}><Send className="size-4" /> Submit work</Button> : null}
          {canReview && task.pendingReviewCount > 0 ? <Button asChild size="sm"><a href="#progress-timeline"><CheckCircle2 className="size-4" /> Review submission</a></Button> : null}
          {canEditAssignment ? <Button type="button" variant="edit" size="sm" onClick={onEdit}><Pencil className="size-4" /> Edit assignment</Button> : null}
        </div>
      </div>

      {project ? <TaskProjectLifecycleNotice project={project} /> : null}
    </section>
  )
}

function AssignmentMetaLine({ task, state }: { task: Task; state: AssignmentState }) {
  const dotClass = {
    blue: 'bg-primary',
    teal: 'bg-secondary',
    amber: 'bg-amber-500',
    red: 'bg-destructive',
    slate: 'bg-slate-400',
  }[state.tone]
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-2 font-semibold text-ink"><span className={`size-2 rounded-full ${dotClass}`} />{state.label}</span>
      <span>Priority <span className="font-semibold text-ink">{titleize(task.priority)}</span></span>
      <span>{task.progressUpdateCount} submission{task.progressUpdateCount === 1 ? '' : 's'}</span>
    </p>
  )
}

function AssignmentBrief({ task }: { task: Task }) {
  return (
    <section className="border-b border-border pb-6">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Instructions</p>
      {task.description ? <p className="mt-3 max-w-4xl text-sm leading-7 text-muted-foreground">{task.description}</p> : <p className="mt-3 text-sm italic text-muted-foreground">No assignment instructions have been added yet.</p>}
    </section>
  )
}

function AssignmentAside({ task, resources, canManageResources, onManageResources }: { task: Task; resources: ResourceLink[]; canManageResources: boolean; onManageResources: () => void }) {
  return (
    <aside className="space-y-6 xl:sticky xl:top-6">
      <section className="border-b border-border pb-5">
        <h2 className="font-heading text-xl font-semibold tracking-tight text-ink">Details</h2>
        <dl className="mt-4 divide-y divide-border">
          <FactRow icon={<CalendarClock className="size-4" />} label="Due date" value={deadlineText(task)} />
          <FactRow icon={<ClipboardList className="size-4" />} label="Checkpoint" value={task.milestoneTitle || 'Missing milestone'} />
          <FactRow icon={<Users className="size-4" />} label="Assigned to" value={assigneeText(task)} />
        </dl>
      </section>

      {(resources.length > 0 || canManageResources) ? (
        <section className="border-b border-border pb-5">
          <ResourceLinkShelf title="Resources" resources={resources} canCreate={canManageResources} onManage={canManageResources ? onManageResources : undefined} compact />
        </section>
      ) : null}
    </aside>
  )
}

function FactRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="grid gap-1 py-3 first:pt-0 last:pb-0">
      <dt className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{icon}{label}</dt>
      <dd className="text-sm font-medium leading-6 text-ink">{value}</dd>
    </div>
  )
}

function assigneeText(task: Task) {
  return task.assignees.length > 0 ? task.assignees.map((assignee) => assignee.fullName).join(', ') : 'No assigned students'
}

function deadlineText(task: Task) {
  return task.deadline ? formatDate(task.deadline) : 'No deadline'
}

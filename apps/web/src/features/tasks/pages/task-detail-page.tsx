import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, ClipboardList, Clock, ExternalLink, MessageSquareWarning, Pencil, Send } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { PageHeader } from '@/components/layout/page-header'
import { ErrorState } from '@/components/shared/error-state'
import { ForbiddenState } from '@/components/shared/forbidden-state'
import { LoadingState } from '@/components/shared/loading-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { getProject, getProjectMembers, getProjectMilestones, getProjectResourceLinks } from '@/features/projects/api'
import { ResourceLinkButton, ResourceLinkDialog, ResourceLinkShelf, type ResourceLinkTarget } from '@/features/resources/components/resource-link-drawer'
import { resourcesForTarget } from '@/features/resources/utils'
import { getProjectFiles } from '@/features/files/api'
import { EvidenceFilePanel } from '@/features/files/components/evidence-file-panel'
import { filesForTarget } from '@/features/files/utils'
import { getAssignmentState, type AssignmentState } from '@/features/tasks/assignment-state'
import { getTask } from '@/features/tasks/api'
import { ProgressTimeline } from '@/features/tasks/components/progress-timeline'
import { AdjustTaskStatusForm, EditTaskForm, ReviewProgressForm, SubmitProgressForm } from '@/features/tasks/components/task-forms'
import { formatDate, formatDateTime, titleize } from '@/lib/format'
import { isForbiddenError } from '@/lib/axios'
import { canManageProject, canReviewProgress, projectAcceptsPlanChanges, projectAcceptsReviews, projectAcceptsStudentSubmissions, projectAcceptsSupportChanges } from '@/lib/permissions'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import type { ProgressUpdate, Project, ResourceLink, Task, UploadedFile } from '@/types/api'

export function TaskDetailPage() {
  const { projectId, taskId } = useParams()
  const resolvedProjectId = projectId || ''
  const resolvedTaskId = taskId || ''
  const [editOpen, setEditOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
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
    if (isForbiddenError(taskQuery.error)) {
      return <ForbiddenState message="This assignment is restricted or missing." onRetry={() => void taskQuery.refetch()} />
    }
    return <ErrorState message="The assignment could not be loaded." onRetry={() => void taskQuery.refetch()} />
  }
  if (!taskQuery.data) {
    return <ErrorState message="The assignment returned no data." onRetry={() => void taskQuery.refetch()} />
  }

  const detail = taskQuery.data
  const project = projectQuery.data
  const canReviewUser = canReviewProgress(user)
  const canManageProjectSupport = canManageProject(user, project)
  const evidenceDataReady = filesQuery.isSuccess
  const canReview = canReviewUser && projectAcceptsReviews(project)
  const canEditAssignment = canReviewUser && projectAcceptsPlanChanges(project)
  const canAdjustStatus = canManageProjectSupport && projectAcceptsPlanChanges(project)
  const canManageResources = projectAcceptsSupportChanges(project) && resourcesQuery.isSuccess && (project?.status === 'active' || canManageProjectSupport)
  const canManageEvidence = evidenceDataReady && canManageProjectSupport && projectAcceptsSupportChanges(project)
  const canDeleteOwnEvidence = evidenceDataReady && project?.status === 'active'
  const canUploadEvidence = evidenceDataReady && projectAcceptsStudentSubmissions(project)
  const isAssignedStudent = user?.role === 'student' && detail.task.assignees.some((assignee) => assignee.id === user.id)
  const assignmentState = getAssignmentState(detail.task)
  const canSubmitProgress = isAssignedStudent && projectAcceptsStudentSubmissions(project) && assignmentState.key !== 'complete' && assignmentState.key !== 'waiting_review'
  const resources = resourcesQuery.data || []
  const files = filesQuery.data || []
  const supportDataNotice = resourcesQuery.isLoading || filesQuery.isLoading
    ? 'Evidence and resource records are still loading.'
    : resourcesQuery.isError || filesQuery.isError
      ? 'Evidence or resource records could not be loaded.'
      : undefined
  const reviewDisabledReason = resourcesQuery.isLoading || filesQuery.isLoading
    ? 'Evidence and resource records are still loading. Wait before saving a review.'
    : resourcesQuery.isError || filesQuery.isError
      ? 'Evidence or resource records could not be loaded. Retry before saving a review.'
      : undefined
  const supportDataIsError = resourcesQuery.isError || filesQuery.isError
  const retrySupportData = () => {
    void resourcesQuery.refetch()
    void filesQuery.refetch()
  }
  const projectDataNotice = projectQuery.isLoading
    ? 'Project lifecycle data is still loading.'
    : projectQuery.isError
      ? 'Project lifecycle data could not be loaded, so submission and review actions are paused.'
      : undefined
  const editDisabledReason = canEditAssignment && (!membersQuery.isSuccess || !milestonesQuery.isSuccess)
    ? membersQuery.isError || milestonesQuery.isError
      ? 'Assignment members or checkpoints could not be loaded.'
      : 'Assignment members and checkpoints are still loading.'
    : undefined
  const taskResources = resourcesForTarget(resources, 'task', detail.task.id)
  const pendingReviewUpdate = detail.progressUpdates.find((update) => update.reviewStatus === 'pending_review')
  const historyUpdates = pendingReviewUpdate ? detail.progressUpdates.filter((update) => update.id !== pendingReviewUpdate.id) : detail.progressUpdates
  const statusAdjustmentDisabledReason = pendingReviewUpdate ? 'Review the pending submission before adjusting status.' : undefined
  const resourceTargetUpdate = resourceTarget?.type === 'progress_update' ? detail.progressUpdates.find((update) => update.id === resourceTarget.id) : undefined
  const resourceTargetWritable = !resourceTarget || resourceTarget.type !== 'progress_update' || resourceTargetUpdate?.reviewStatus === 'pending_review'
  const resourceTargetReadOnlyMessage = resourceTarget?.type === 'progress_update' && resourceTargetUpdate && resourceTargetUpdate.reviewStatus !== 'pending_review'
    ? 'This submission has already been reviewed, so its resource links are read-only.'
    : undefined

  return (
    <div className="space-y-7">
      <Dialog open={editOpen} onOpenChange={setEditOpen} title="Edit assignment" description="Adjust the brief, checkpoint, due date, or assignees.">
        {membersQuery.isSuccess && milestonesQuery.isSuccess ? (
          <EditTaskForm projectId={resolvedProjectId} task={detail.task} members={membersQuery.data} milestones={milestonesQuery.data} onUpdated={() => setEditOpen(false)} />
        ) : (
          <EditAssignmentDataState isError={membersQuery.isError || milestonesQuery.isError} onRetry={() => { void membersQuery.refetch(); void milestonesQuery.refetch() }} />
        )}
      </Dialog>
      <Dialog open={statusOpen} onOpenChange={setStatusOpen} title="Adjust assignment status" description="Use this when work was checked outside UniTrack. Submission, review, and evidence history stays unchanged.">
        <AdjustTaskStatusForm projectId={resolvedProjectId} task={detail.task} disabledReason={statusAdjustmentDisabledReason} onAdjusted={() => setStatusOpen(false)} />
      </Dialog>
      <Dialog open={progressOpen} onOpenChange={setProgressOpen} title="Submit work" description="Share completed work or blockers. Evidence files can be attached after the submission appears below.">
        <SubmitProgressForm projectId={resolvedProjectId} taskId={resolvedTaskId} onSubmitted={() => setProgressOpen(false)} />
      </Dialog>
      <ResourceLinkDialog key={resourceDialogKey(resourceTarget)} projectId={resolvedProjectId} target={resourceTarget} resources={resources} canCreate={canManageResources && resourceTargetWritable} canManageAll={canReviewUser && canManageResources && resourceTargetWritable} readOnlyMessage={resourceTargetReadOnlyMessage} onClose={() => setResourceTarget(null)} />

      <AssignmentHeader
        task={detail.task}
        project={project}
        projectId={resolvedProjectId}
        canReview={canReview}
        canEditAssignment={canEditAssignment}
        canAdjustStatus={canAdjustStatus}
        editDisabledReason={editDisabledReason}
        statusAdjustmentDisabledReason={statusAdjustmentDisabledReason}
        canSubmitProgress={canSubmitProgress}
        onEdit={() => setEditOpen(true)}
        onAdjustStatus={() => setStatusOpen(true)}
        onSubmitProgress={() => setProgressOpen(true)}
      />

      {projectDataNotice ? <SupportDataNotice message={projectDataNotice} isError={projectQuery.isError} onRetry={() => void projectQuery.refetch()} retryLabel="Retry project data" /> : null}

      {canReview && pendingReviewUpdate ? (
        <TeacherReviewDesk
          projectId={resolvedProjectId}
          task={detail.task}
          project={project}
          update={pendingReviewUpdate}
          historyUpdates={historyUpdates}
          uploadedFiles={files}
          resourceLinks={resources}
          currentUserId={user?.id}
          canUploadEvidence={canUploadEvidence}
          canManageEvidence={canManageEvidence}
          canDeleteOwnEvidence={canDeleteOwnEvidence}
          taskResources={taskResources}
          canManageResources={canManageResources}
          supportDataNotice={supportDataNotice}
          reviewDisabledReason={reviewDisabledReason}
          supportDataIsError={supportDataIsError}
          onRetrySupportData={retrySupportData}
          onManageSubmissionResources={(update) => setResourceTarget({ type: 'progress_update', id: update.id, label: update.title || 'Submission resources', eyebrow: 'Submission resources' })}
          onManageResources={() => setResourceTarget({ type: 'task', id: detail.task.id, label: detail.task.title, eyebrow: 'Assignment resources' })}
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
          <div className="min-w-0 space-y-6">
            <AssignmentWorkflowPanel projectId={resolvedProjectId} task={detail.task} project={project} updates={detail.progressUpdates} state={assignmentState} canReview={canReview} isAssignedStudent={isAssignedStudent} canSubmitProgress={canSubmitProgress} onSubmitProgress={() => setProgressOpen(true)} />
            {supportDataNotice ? <SupportDataNotice message={supportDataNotice} isError={supportDataIsError} onRetry={retrySupportData} /> : null}
            <ProgressTimeline projectId={resolvedProjectId} updates={detail.progressUpdates} canReview={canReview} canUploadEvidence={canUploadEvidence} canManageEvidence={canManageEvidence} canDeleteOwnEvidence={canDeleteOwnEvidence} currentUserId={user?.id} uploadedFiles={files} resourceLinks={resources} canManageResources={canManageResources} onManageResources={(update) => setResourceTarget({ type: 'progress_update', id: update.id, label: update.title || 'Submission resources', eyebrow: 'Submission resources' })} showReviewForms={false} title="Submission history" description="" compact />
          </div>

          <AssignmentAside
            task={detail.task}
            project={project}
            resources={taskResources}
            canManageResources={canManageResources}
            onManageResources={() => setResourceTarget({ type: 'task', id: detail.task.id, label: detail.task.title, eyebrow: 'Assignment resources' })}
          />
        </div>
      )}
    </div>
  )
}

function TeacherReviewDesk({ projectId, task, project, update, historyUpdates, uploadedFiles, resourceLinks, currentUserId, canUploadEvidence, canManageEvidence, canDeleteOwnEvidence, taskResources, canManageResources, supportDataNotice, reviewDisabledReason, supportDataIsError, onRetrySupportData, onManageSubmissionResources, onManageResources }: { projectId: string; task: Task; project?: Project; update: ProgressUpdate; historyUpdates: ProgressUpdate[]; uploadedFiles: UploadedFile[]; resourceLinks: ResourceLink[]; currentUserId?: string; canUploadEvidence: boolean; canManageEvidence: boolean; canDeleteOwnEvidence: boolean; taskResources: ResourceLink[]; canManageResources: boolean; supportDataNotice?: string; reviewDisabledReason?: string; supportDataIsError: boolean; onRetrySupportData: () => void; onManageSubmissionResources: (update: ProgressUpdate) => void; onManageResources: () => void }) {
  const updateFiles = filesForTarget(uploadedFiles, 'progress_update', update.id)
  const updateResources = resourcesForTarget(resourceLinks, 'progress_update', update.id)
  const canUploadToUpdate = canUploadEvidence && (canManageEvidence || update.submittedBy === currentUserId)
  const showEvidence = canUploadToUpdate || updateFiles.length > 0

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
      <div className="min-w-0 space-y-5">
        <section className="rounded-xl border border-border bg-white/90 p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Current submission</p>
              <h2 className="mt-1 break-words font-heading text-2xl font-semibold tracking-tight text-ink">{update.title || 'Submission'}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{task.title} · Submitted by {update.submittedByName} · {formatDateTime(update.createdAt)}</p>
            </div>
            <StatusBadge value={update.reviewStatus} />
          </div>
          <ReviewContextLine task={task} project={project} />
          <p className="mt-4 max-w-4xl break-words text-sm leading-7 text-muted-foreground">{update.description}</p>
          {update.blockers ? <p className="mt-3 inline-flex items-start gap-2 break-words rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900"><MessageSquareWarning className="mt-0.5 size-4 shrink-0" /> {update.blockers}</p> : null}
          {(updateResources.length > 0 || canManageResources) ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {updateResources.length > 0 ? <SubmissionResourceLinks resources={updateResources} /> : null}
              {canManageResources ? <ResourceLinkButton count={updateResources.length} onClick={() => onManageSubmissionResources(update)} ariaLabel={`Manage resources for submission ${update.title || update.id}`} /> : null}
            </div>
          ) : null}
          {showEvidence ? <EvidenceFilePanel projectId={projectId} targetType="progress_update" targetId={update.id} files={updateFiles} canUpload={canUploadToUpdate} canManage={canManageEvidence} canDeleteOwn={canDeleteOwnEvidence} currentUserId={currentUserId} description="Attach or inspect files that support this submission." compact /> : null}
        </section>
        {supportDataNotice ? <SupportDataNotice message={supportDataNotice} isError={supportDataIsError} onRetry={onRetrySupportData} /> : null}

        <ProgressTimeline projectId={projectId} updates={historyUpdates} canReview={false} canUploadEvidence={canUploadEvidence} canManageEvidence={canManageEvidence} canDeleteOwnEvidence={canDeleteOwnEvidence} currentUserId={currentUserId} uploadedFiles={uploadedFiles} resourceLinks={resourceLinks} canManageResources={canManageResources} onManageResources={onManageSubmissionResources} showReviewForms={false} title="Earlier history" description="Previous submissions and decisions." emptyTitle="No earlier history" emptyMessage="This is the only submission for this assignment." compact />
      </div>

      <aside id="assignment-workflow" className="scroll-mt-24 rounded-xl border border-primary/20 bg-white p-4 shadow-sm xl:sticky xl:top-6 xl:max-h-[calc(100svh-3rem)] xl:overflow-y-auto">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Decision</p>
        <h2 className="mt-1 font-heading text-xl font-semibold tracking-tight text-ink">Review outcome</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Choose the next state and add guidance when the student needs another pass.</p>
        <div className="mt-4">
          <ReviewProgressForm projectId={projectId} update={update} compact disabledReason={reviewDisabledReason} />
        </div>
        <div className="mt-4"><AssignmentInstructions task={task} /></div>
        {(taskResources.length > 0 || canManageResources) ? <div className="mt-4"><AssignmentResourcesPanel resources={taskResources} canManageResources={canManageResources} onManageResources={onManageResources} /></div> : null}
      </aside>
    </div>
  )
}

function EditAssignmentDataState({ isError, onRetry }: { isError: boolean; onRetry: () => void }) {
  return (
    <div className="space-y-3 pb-5 text-sm text-muted-foreground">
      <p className="rounded-xl border border-dashed border-border bg-paper/70 px-4 py-3">
        {isError ? 'Assignment members or checkpoints could not be loaded, so editing is paused to protect existing assignees.' : 'Loading assignment members and checkpoints before editing.'}
      </p>
      {isError ? <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry edit data</Button> : null}
    </div>
  )
}

function SupportDataNotice({ message, isError, onRetry, retryLabel = 'Retry support data' }: { message: string; isError: boolean; onRetry: () => void; retryLabel?: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-medium">{message}</p>
        {isError ? <Button type="button" variant="outline" size="sm" onClick={onRetry}>{retryLabel}</Button> : null}
      </div>
    </div>
  )
}

function ReviewContextLine({ task, project }: { task: Task; project?: Project }) {
  return (
    <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
      {project ? <span>Project: <span className="text-ink">{project.name}</span></span> : null}
      <span>Due: <span className="text-ink">{deadlineText(task)}</span></span>
      <span>Checkpoint: <span className="text-ink">{task.milestoneTitle || 'Missing checkpoint'}</span></span>
      <span>Assigned: <span className="text-ink">{assigneeText(task)}</span></span>
    </p>
  )
}

function AssignmentResourcesPanel({ resources, canManageResources, onManageResources }: { resources: ResourceLink[]; canManageResources: boolean; onManageResources: () => void }) {
  return (
    <section className="rounded-xl border border-border bg-card/90 px-4 py-3 shadow-sm">
      <ResourceLinkShelf title="Assignment resources" resources={resources} canCreate={canManageResources} onManage={canManageResources ? onManageResources : undefined} compact />
    </section>
  )
}

function SubmissionResourceLinks({ resources }: { resources: ResourceLink[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {resources.map((resource) => (
        <a key={resource.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary underline-offset-4 hover:underline" href={resource.url} target="_blank" rel="noreferrer">
          <span className="truncate">{resource.title}</span>
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
      ))}
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

function AssignmentWorkflowPanel({ projectId, task, project, updates, state, canReview, isAssignedStudent, canSubmitProgress, onSubmitProgress }: { projectId: string; task: Task; project?: Project; updates: ProgressUpdate[]; state: AssignmentState; canReview: boolean; isAssignedStudent: boolean; canSubmitProgress: boolean; onSubmitProgress: () => void }) {
  const pendingUpdate = updates.find((update) => update.reviewStatus === 'pending_review')
  const revisionUpdate = latestRevisionUpdate(updates)

  if (canReview && pendingUpdate) {
    return (
      <AssignmentWorkflowShell eyebrow="Teacher workflow" title="Review the latest submission" description="The decision form is pinned here so review work is the first visible action." tone="amber" badge={<StatusBadge value="pending_review" tone="amber" />}>
        <WorkflowSubmissionCard update={pendingUpdate} />
        <ReviewProgressForm projectId={projectId} update={pendingUpdate} />
      </AssignmentWorkflowShell>
    )
  }

  if (isAssignedStudent && state.key === 'needs_revision') {
    return (
      <AssignmentWorkflowShell eyebrow="Student workflow" title={canSubmitProgress ? 'Revise and resubmit' : 'Revision recorded'} description={canSubmitProgress ? 'Teacher guidance is the next required step before this assignment can move forward.' : 'Teacher guidance is preserved below, but this project is not accepting new submissions.'} tone={canSubmitProgress ? 'amber' : 'slate'} badge={<StatusBadge value={state.key} tone={state.tone} />}>
        {revisionUpdate ? <WorkflowReviewNote update={revisionUpdate} /> : null}
        {canSubmitProgress ? <Button type="button" onClick={onSubmitProgress}><Send className="size-4" /> Submit revision</Button> : <ReadOnlyWorkflowNote project={project} />}
      </AssignmentWorkflowShell>
    )
  }

  if (isAssignedStudent && state.key === 'waiting_review') {
    return (
      <AssignmentWorkflowShell eyebrow="Student workflow" title="Waiting for teacher review" description="No duplicate submission is needed while the latest work is under review." tone="amber" badge={<StatusBadge value={state.key} tone={state.tone} />}>
        <Button asChild variant="outline"><a href="#progress-timeline"><Clock className="size-4" /> View submission timeline</a></Button>
      </AssignmentWorkflowShell>
    )
  }

  if (isAssignedStudent && canSubmitProgress) {
    return (
      <AssignmentWorkflowShell eyebrow="Student workflow" title={task.isOverdue ? 'Submit overdue work' : 'Submit work when ready'} description={task.isOverdue ? 'The deadline has passed. Submit evidence or explain blockers so the supervisor can respond.' : 'Submit progress when your assigned work is ready for teacher review.'} tone={task.isOverdue ? 'red' : 'blue'} badge={<StatusBadge value={state.key} tone={state.tone} />}>
        <Button type="button" onClick={onSubmitProgress}><Send className="size-4" /> Submit work</Button>
      </AssignmentWorkflowShell>
    )
  }

  if (state.key === 'complete') {
    return (
      <AssignmentWorkflowShell eyebrow="Assignment state" title="Assignment complete" description="The latest teacher decision closed this assignment. Its submission history remains available below." tone="teal" badge={<StatusBadge value={state.key} tone={state.tone} />} />
    )
  }

  return (
    <AssignmentWorkflowShell
      eyebrow={canReview ? 'Teacher workflow' : 'Assignment state'}
      title={canReview ? 'No submission to review' : 'Assignment is view-only'}
      description={canReview ? 'No student work is waiting for a decision.' : readOnlyAssignmentDescription(project, isAssignedStudent)}
      tone="slate"
      badge={<StatusBadge value={state.key} tone={state.tone} />}
    />
  )
}

function AssignmentWorkflowShell({ eyebrow, title, description, tone, badge, children }: { eyebrow: string; title: string; description: string; tone: AssignmentState['tone']; badge: ReactNode; children?: ReactNode }) {
  return (
    <section id="assignment-workflow" className={cn('scroll-mt-24 rounded-xl border p-4 shadow-sm', workflowToneClasses(tone))}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-75">{eyebrow}</p>
          <h2 className="mt-1 font-heading text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm leading-6 opacity-80">{description}</p>
        </div>
        <div className="shrink-0">{badge}</div>
      </div>
      {children ? <div className="mt-3 space-y-3">{children}</div> : null}
    </section>
  )
}

function readOnlyAssignmentDescription(project: Project | undefined, isAssignedStudent: boolean) {
  if (!isAssignedStudent) {
    return 'You can view this assignment and its history. Only assigned students can submit work.'
  }
  if (project && project.status !== 'active') {
    return `This project is ${titleize(project.status)}, so new submissions are paused.`
  }
  return 'This assignment is not accepting another submission right now.'
}

function WorkflowSubmissionCard({ update }: { update: ProgressUpdate }) {
  return (
    <article className="rounded-xl border border-border bg-white/85 px-4 py-3 text-sm text-ink shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-words font-heading text-base font-semibold tracking-tight">{update.title || 'Submission'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Submitted by {update.submittedByName} · {formatDateTime(update.createdAt)}</p>
        </div>
        <StatusBadge value={update.reviewStatus} />
      </div>
      <p className="mt-3 break-words leading-6 text-muted-foreground">{update.description}</p>
      {update.blockers ? <p className="mt-3 break-words rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">Blockers: {update.blockers}</p> : null}
    </article>
  )
}

function WorkflowReviewNote({ update }: { update: ProgressUpdate }) {
  const review = update.latestReview
  return (
    <article className="rounded-xl border border-amber-200 bg-white/85 px-4 py-3 text-sm text-amber-950 shadow-sm">
      <p className="font-semibold">Latest teacher guidance</p>
      {review?.reviewComment ? <p className="mt-2 break-words leading-6">{review.reviewComment}</p> : <p className="mt-2 leading-6 text-muted-foreground">Open the submission timeline below for the full review context.</p>}
      {review ? <p className="mt-2 text-xs text-amber-800">Reviewed by {review.reviewedByName} · {formatDateTime(review.reviewedAt)}</p> : null}
    </article>
  )
}

function ReadOnlyWorkflowNote({ project }: { project?: Project }) {
  return <p className="rounded-xl border border-dashed border-border bg-white/70 px-4 py-3 text-sm text-muted-foreground">{project ? `This project is ${titleize(project.status)}, so new student submissions are paused.` : 'New student submissions are currently paused.'}</p>
}

function latestRevisionUpdate(updates: ProgressUpdate[]) {
  return updates.find((update) => update.reviewStatus === 'needs_changes' || update.reviewStatus === 'rejected' || update.latestReview?.reviewStatus === 'needs_changes' || update.latestReview?.reviewStatus === 'rejected')
}

function workflowToneClasses(tone: AssignmentState['tone']) {
  switch (tone) {
    case 'blue':
      return 'border-primary/20 bg-primary/5 text-primary'
    case 'teal':
      return 'border-teal-200 bg-teal-50 text-teal-900'
    case 'amber':
      return 'border-amber-200 bg-amber-50 text-amber-950'
    case 'red':
      return 'border-red-200 bg-red-50 text-red-950'
    default:
      return 'border-border bg-card text-ink'
  }
}

function resourceDialogKey(target: ResourceLinkTarget | null) {
  return target ? `${target.type}:${target.id}` : 'resource-dialog-closed'
}

function AssignmentHeader({ task, project, projectId, canReview, canEditAssignment, canAdjustStatus, editDisabledReason, statusAdjustmentDisabledReason, canSubmitProgress, onEdit, onAdjustStatus, onSubmitProgress }: { task: Task; project?: Project; projectId: string; canReview: boolean; canEditAssignment: boolean; canAdjustStatus: boolean; editDisabledReason?: string; statusAdjustmentDisabledReason?: string; canSubmitProgress: boolean; onEdit: () => void; onAdjustStatus: () => void; onSubmitProgress: () => void }) {
  return (
    <div className="space-y-3">
      <PageHeader
        back={<Button asChild variant="ghost" className="-ml-2 h-9 px-2 text-muted-foreground hover:bg-accent hover:text-primary"><Link to={`/workspace/projects/${projectId}`}><ArrowLeft className="size-4" /> Back to project</Link></Button>}
        eyebrow={project ? <>Assignment / {project.name}</> : 'Assignment'}
        title={task.title}
        badges={task.pendingReviewCount > 0 ? <StatusBadge value="pending_review" tone="amber" /> : null}
        action={<>{canSubmitProgress ? <Button type="button" size="sm" onClick={onSubmitProgress}><Send className="size-4" /> Submit work</Button> : null}{canReview && task.pendingReviewCount > 0 ? <Button asChild size="sm"><a href="#assignment-workflow"><CheckCircle2 className="size-4" /> Review submission</a></Button> : null}{canAdjustStatus ? <Button type="button" variant="outline" size="sm" disabled={Boolean(statusAdjustmentDisabledReason)} title={statusAdjustmentDisabledReason} onClick={onAdjustStatus}><ClipboardList className="size-4" /> Adjust status</Button> : null}{canEditAssignment ? <Button type="button" variant="edit" size="sm" disabled={Boolean(editDisabledReason)} title={editDisabledReason} onClick={onEdit}><Pencil className="size-4" /> Edit assignment</Button> : null}</>}
      />
      {project ? <TaskProjectLifecycleNotice project={project} /> : null}
    </div>
  )
}

function AssignmentInstructions({ task }: { task: Task }) {
  return (
    <section className="rounded-xl border border-border bg-card/90 px-4 py-3 shadow-sm">
      <h2 className="font-heading text-base font-semibold tracking-tight text-ink">Instructions</h2>
      <p className="mt-2 max-w-4xl break-words text-sm leading-6 text-muted-foreground">{task.description || 'No instructions were provided for this assignment.'}</p>
    </section>
  )
}

function AssignmentAside({ task, project, resources, canManageResources, onManageResources }: { task: Task; project?: Project; resources: ResourceLink[]; canManageResources: boolean; onManageResources: () => void }) {
  const assignmentState = getAssignmentState(task)

  return (
    <aside className="space-y-4 xl:sticky xl:top-6">
      <section className="rounded-xl border border-border bg-card/90 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold tracking-tight text-ink">Details</h2>
          <StatusBadge value={assignmentState.key} tone={assignmentState.tone} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          <CompactFact label="Priority" value={titleize(task.priority)} />
          <CompactFact label="Submissions" value={`${task.progressUpdateCount} submission${task.progressUpdateCount === 1 ? '' : 's'}`} />
          <CompactFact label="Due date" value={deadlineText(task)} />
          <CompactFact label="Checkpoint" value={task.milestoneTitle || 'Missing checkpoint'} />
          {project ? <CompactFact className="col-span-2" label="Project" value={project.name} /> : null}
          <CompactFact className="col-span-2" label="Assigned to" value={assigneeText(task)} />
        </dl>
      </section>

      <AssignmentInstructions task={task} />

      {(resources.length > 0 || canManageResources) ? <AssignmentResourcesPanel resources={resources} canManageResources={canManageResources} onManageResources={onManageResources} /> : null}
    </aside>
  )
}

function CompactFact({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium leading-5 text-ink">{value}</dd>
    </div>
  )
}

function assigneeText(task: Task) {
  return task.assignees.length > 0 ? task.assignees.map((assignee) => assignee.fullName).join(', ') : 'No assigned students'
}

function deadlineText(task: Task) {
  return task.deadline ? formatDate(task.deadline) : 'No deadline'
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowRight, ArrowUp, CalendarDays, ChevronDown, ClipboardCheck, FolderKanban, Link2, MoreHorizontal, Pencil, Plus, Search, Star, Trash2, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { PageHeader, PageHeaderPill } from '@/components/layout/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { ForbiddenState } from '@/components/shared/forbidden-state'
import { LoadingState } from '@/components/shared/loading-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { createMilestone, deleteMilestone, getProject, getProjectMembers, getProjectMilestones, getProjectResourceLinks, getProjectTasks, removeProjectMember, reorderMilestones, updateMilestone, updateProjectMember } from '@/features/projects/api'
import { getProjectWorkSignal, type ProjectWorkSignal } from '@/features/projects/attention'
import { AddProjectMemberForm, EditProjectForm } from '@/features/projects/components/project-forms'
import { PersonLink } from '@/features/activity/components/person-link'
import { ResourceLinkButton, ResourceLinkDialog, ResourceLinkShelf, type ResourceLinkTarget } from '@/features/resources/components/resource-link-drawer'
import { resourcesForTarget } from '@/features/resources/utils'
import { getAssignmentState, isAssignmentNeedsRevision } from '@/features/tasks/assignment-state'
import { CreateTaskForm } from '@/features/tasks/components/task-forms'
import { getErrorMessage, isForbiddenError } from '@/lib/axios'
import { formatDate } from '@/lib/format'
import { canManageProject, projectAcceptsNewAssignments, projectAcceptsPlanChanges, projectAcceptsSupportChanges, projectAcceptsTeamChanges } from '@/lib/permissions'
import { invalidateProjectData, refreshProjectDataOnStaleError } from '@/lib/query-invalidation'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import type { Project, ProjectMember, ProjectMilestone, ResourceLink, Task, User } from '@/types/api'

export function ProjectDetailPage() {
  const { projectId } = useParams()
  const resolvedProjectId = projectId || ''
  const [editOpen, setEditOpen] = useState(false)
  const [taskCreateOpen, setTaskCreateOpen] = useState(false)
  const [taskCreateMilestoneId, setTaskCreateMilestoneId] = useState('')
  const [createMilestoneOpen, setCreateMilestoneOpen] = useState(false)
  const user = useAuthStore((state) => state.user)

  const projectQuery = useQuery({ queryKey: queryKeys.project(resolvedProjectId), queryFn: () => getProject(resolvedProjectId), enabled: resolvedProjectId.length > 0 })
  const canManage = canManageProject(user, projectQuery.data)
  const canLoadProjectRelations = resolvedProjectId.length > 0 && projectQuery.isSuccess
  const tasksQuery = useQuery({ queryKey: queryKeys.projectTasks(resolvedProjectId), queryFn: () => getProjectTasks(resolvedProjectId), enabled: canLoadProjectRelations })
  const milestonesQuery = useQuery({ queryKey: queryKeys.projectMilestones(resolvedProjectId), queryFn: () => getProjectMilestones(resolvedProjectId), enabled: canLoadProjectRelations })
  const membersQuery = useQuery({ queryKey: queryKeys.projectMembers(resolvedProjectId), queryFn: () => getProjectMembers(resolvedProjectId), enabled: canLoadProjectRelations })
  const resourcesQuery = useQuery({ queryKey: queryKeys.projectResourceLinks(resolvedProjectId), queryFn: () => getProjectResourceLinks(resolvedProjectId), enabled: canLoadProjectRelations })

  if (!projectId) {
    return <Navigate to="/dashboard" replace />
  }
  if (projectQuery.isLoading) {
    return <LoadingState label="Loading project" />
  }
  if (projectQuery.isError) {
    if (isForbiddenError(projectQuery.error)) {
      return <ForbiddenState message="This project is restricted or missing." onRetry={() => void projectQuery.refetch()} />
    }
    return <ErrorState message="The project could not be loaded." onRetry={() => void projectQuery.refetch()} />
  }
  if (!projectQuery.data) {
    return <ErrorState message="The project returned no data." onRetry={() => void projectQuery.refetch()} />
  }

  const project = projectQuery.data
  const tasks = tasksQuery.data || []
  const milestones = milestonesQuery.data || []
  const members = membersQuery.data || []
  const resources = resourcesQuery.data || []
  const canPlan = canManage && projectAcceptsPlanChanges(project)
  const canCreateAssignments = canManage && projectAcceptsNewAssignments(project)
  const assignmentMembersReady = membersQuery.isSuccess
  const assignmentMembersError = membersQuery.isError
  const assignmentPlanReady = membersQuery.isSuccess && milestonesQuery.isSuccess
  const assignmentPlanError = membersQuery.isError || milestonesQuery.isError
  const assignmentCreateDisabledReason = canCreateAssignments && !assignmentPlanReady
    ? assignmentPlanError
      ? 'Student list or checkpoints could not be loaded.'
      : 'Student list and checkpoints are still loading.'
    : undefined
  const canManageResources = projectAcceptsSupportChanges(project) && resourcesQuery.isSuccess && (project.status === 'active' || canManage)
  const canManageTeam = canManage && projectAcceptsTeamChanges(project)
  const openTaskCreate = (milestoneId = '') => {
    if (!assignmentPlanReady) {
      toast.error(assignmentPlanError ? 'Student list or checkpoints could not be loaded.' : 'Student list and checkpoints are still loading.')
      return
    }
    setTaskCreateMilestoneId(milestoneId)
    setTaskCreateOpen(true)
  }

  return (
    <div className="mx-auto w-full max-w-[100rem] space-y-6">
      <ProjectCommandHeader
        project={project}
        canManage={canManage}
        canPlan={canPlan}
        canCreateAssignments={canCreateAssignments}
        assignmentCreateDisabledReason={assignmentCreateDisabledReason}
        onEdit={() => setEditOpen(true)}
        onCreateMilestone={() => setCreateMilestoneOpen(true)}
        onCreateTask={() => openTaskCreate('')}
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen} title="Edit project" description="Update project metadata, timeline, and lifecycle state." className="max-w-4xl">
        <EditProjectForm project={project} onCancel={() => setEditOpen(false)} onUpdated={() => setEditOpen(false)} />
      </Dialog>
      <Dialog open={taskCreateOpen} onOpenChange={setTaskCreateOpen} title="New assignment" description="Create teacher-owned work inside this checkpoint and assign current students." className="max-w-4xl">
        <CreateTaskForm projectId={resolvedProjectId} members={members} milestones={milestones} milestoneId={taskCreateMilestoneId} onCreated={() => setTaskCreateOpen(false)} />
      </Dialog>
      <Dialog open={createMilestoneOpen} onOpenChange={setCreateMilestoneOpen} title="New checkpoint" description="Add a planning checkpoint before creating assignments for students.">
        <InlineMilestoneForm projectId={resolvedProjectId} mode="dialog" onSaved={() => setCreateMilestoneOpen(false)} onCancel={() => setCreateMilestoneOpen(false)} />
      </Dialog>
      <div className="min-w-0">
        {tasksQuery.isError || milestonesQuery.isError ? <ErrorState message="Project map could not be loaded." onRetry={() => { void tasksQuery.refetch(); void milestonesQuery.refetch() }} /> : <ProjectPlanTree project={project} user={user} tasks={tasks} milestones={milestones} members={members} resources={resources} resourcesUnavailable={resourcesQuery.isError} canManage={canManage} canPlan={canPlan} canCreateAssignments={canCreateAssignments} assignmentMembersReady={assignmentMembersReady} assignmentMembersError={assignmentMembersError} canManageResources={canManageResources} canManageTeam={canManageTeam} isTeamLoading={membersQuery.isLoading} isTeamError={membersQuery.isError} onTeamRetry={() => { void membersQuery.refetch() }} onCreateMilestone={() => setCreateMilestoneOpen(true)} onRetryResources={() => { void resourcesQuery.refetch() }} isLoading={tasksQuery.isLoading || milestonesQuery.isLoading} onCreateTask={openTaskCreate} />}
      </div>
    </div>
  )
}

type Tone = 'slate' | 'blue' | 'teal' | 'amber' | 'red'
type AssignmentFilter = 'all' | 'review' | 'overdue' | 'revision' | 'mine'

const CHECKPOINT_TASK_INITIAL_COUNT = 12
const TEAM_MEMBER_VISIBLE_COUNT = 60

interface ProjectCommandHeaderProps {
  project: Project
  canManage: boolean
  canPlan: boolean
  canCreateAssignments: boolean
  assignmentCreateDisabledReason?: string
  onEdit: () => void
  onCreateMilestone: () => void
  onCreateTask: () => void
}

function ProjectCommandHeader({ project, canManage, canPlan, canCreateAssignments, assignmentCreateDisabledReason, onEdit, onCreateMilestone, onCreateTask }: ProjectCommandHeaderProps) {
  const summary = project.topic || project.description || ''
  const primaryAction = projectPrimaryAction(project, canPlan, canCreateAssignments)
  const badges = projectHeaderBadges(project)

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow={<><Link className="underline-offset-4 hover:text-primary hover:underline" to="/workspace">Workspace</Link> / Project</>}
        title={project.name}
        description={summary || 'Assignments, submissions, resources, and project team activity in one supervision space.'}
        badges={badges}
        meta={<ProjectHeaderMeta project={project} />}
        action={<><ProjectPrimaryActionButton action={primaryAction} assignmentCreateDisabledReason={assignmentCreateDisabledReason} onCreateMilestone={onCreateMilestone} onCreateTask={onCreateTask} />{canManage ? <Button type="button" variant="edit" size="sm" onClick={onEdit}><Pencil className="size-4" /> Edit project</Button> : null}</>}
      />
      <ProjectLifecycleNotice project={project} />
    </div>
  )
}

function ProjectHeaderMeta({ project }: { project: Project }) {
  return (
    <>
      <PageHeaderPill><FolderKanban className="size-3.5 text-primary" /> {project.classTitle || 'Standalone project'}</PageHeaderPill>
      <PageHeaderPill><CalendarDays className="size-3.5 text-primary" /> {projectTimelineLabel(project)}</PageHeaderPill>
      <PageHeaderPill><Users className="size-3.5 text-primary" /> {project.memberCount} student{project.memberCount === 1 ? '' : 's'}</PageHeaderPill>
    </>
  )
}

function projectHeaderBadges(project: Project) {
  const signal = getProjectWorkSignal(project)
  const lifecycleBadge = project.status === 'active' ? null : <StatusBadge value={project.status} />

  if (!lifecycleBadge && !signal) {
    return null
  }

  return (
    <>
      {lifecycleBadge}
      {signal ? <ProjectSignalBadge signal={signal} /> : null}
    </>
  )
}

function ProjectSignalBadge({ signal }: { signal: ProjectWorkSignal }) {
  return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold', signal.tone === 'red' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700')}>{signal.label}</span>
}

function projectPrimaryAction(project: Project, canPlan: boolean, canCreateAssignments: boolean) {
  if (canPlan && project.milestoneCount === 0) {
    return { kind: 'create-checkpoint' as const, label: 'Create checkpoint' }
  }
  if (canCreateAssignments && project.milestoneCount > 0) {
    return { kind: 'create-assignment' as const, label: 'Add assignment' }
  }
  return null
}

function ProjectPrimaryActionButton({ action, assignmentCreateDisabledReason, onCreateMilestone, onCreateTask }: { action: ReturnType<typeof projectPrimaryAction>; assignmentCreateDisabledReason?: string; onCreateMilestone: () => void; onCreateTask: () => void }) {
  if (!action) {
    return null
  }
  if (action.kind === 'create-checkpoint') {
    return <Button type="button" size="sm" onClick={onCreateMilestone}><Plus className="size-4" /> {action.label}</Button>
  }
  if (action.kind === 'create-assignment') {
    return <Button type="button" size="sm" disabled={Boolean(assignmentCreateDisabledReason)} title={assignmentCreateDisabledReason} onClick={onCreateTask}><Plus className="size-4" /> {action.label}</Button>
  }
}

function ProjectLifecycleNotice({ project }: { project: Project }) {
  if (project.status === 'active') {
    return null
  }
  const message = {
    on_hold: 'On hold project · students cannot submit work and new assignments are paused.',
    completed: 'Completed project · new work and team changes are closed; pending submissions can still be reviewed.',
    archived: 'Archived project · read-only until a manager reactivates it.',
  }[project.status]
  return (
    <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm font-medium text-amber-950">
      {message}
    </section>
  )
}

function projectTimelineLabel(project: Project) {
  if (project.startDate && project.endDate) {
    return `${formatDate(project.startDate)} - ${formatDate(project.endDate)}`
  }
  if (project.startDate) {
    return `Starts ${formatDate(project.startDate)}`
  }
  if (project.endDate) {
    return `Due ${formatDate(project.endDate)}`
  }
  return 'Timeline not set'
}

function currentCheckpointId(milestones: ProjectMilestone[]) {
  return milestones.find((milestone) => milestone.state !== 'completed' && milestone.state !== 'empty')?.id
    || milestones.find((milestone) => milestone.state !== 'completed')?.id
}

interface ProjectPlanTreeProps {
  project: Project
  user?: User | null
  tasks: Task[]
  milestones: ProjectMilestone[]
  members: ProjectMember[]
  resources: ResourceLink[]
  resourcesUnavailable: boolean
  canManage: boolean
  canPlan: boolean
  canCreateAssignments: boolean
  assignmentMembersReady: boolean
  assignmentMembersError: boolean
  canManageResources: boolean
  canManageTeam: boolean
  isTeamLoading: boolean
  isTeamError: boolean
  onTeamRetry: () => void
  onCreateMilestone: () => void
  onRetryResources: () => void
  isLoading: boolean
  onCreateTask: (milestoneId: string) => void
}

function ProjectPlanTree({ project, user, tasks, milestones, members, resources, resourcesUnavailable, canManage, canPlan, canCreateAssignments, assignmentMembersReady, assignmentMembersError, canManageResources, canManageTeam, isTeamLoading, isTeamError, onTeamRetry, onCreateMilestone, onRetryResources, isLoading, onCreateTask }: ProjectPlanTreeProps) {
  const queryClient = useQueryClient()
  const [resourceTarget, setResourceTarget] = useState<ResourceLinkTarget | null>(null)
  const [deleteMilestoneTarget, setDeleteMilestoneTarget] = useState<ProjectMilestone | null>(null)
  const [editMilestoneTarget, setEditMilestoneTarget] = useState<ProjectMilestone | null>(null)
  const [selectedFilter, setSelectedFilter] = useState<AssignmentFilter | null>(null)
  const [search, setSearch] = useState('')
  const deleteMilestoneMutation = useMutation({
    mutationFn: deleteMilestone,
    onSuccess: (_data, variables) => {
      toast.success('Checkpoint deleted')
      setDeleteMilestoneTarget(null)
      invalidateProjectData(queryClient, variables.projectId)
      if (resourceTarget?.type === 'milestone' && resourceTarget.id === variables.milestoneId) {
        setResourceTarget(null)
      }
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      refreshProjectDataOnStaleError(queryClient, project.id, error)
    },
  })
  const moveMilestoneMutation = useMutation({
    mutationFn: async ({ milestoneId, direction }: { milestoneId: string; direction: 'up' | 'down' }) => {
      const currentIndex = milestones.findIndex((milestone) => milestone.id === milestoneId)
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= milestones.length) {
        return
      }

      const milestoneIds = moveMilestoneIDs(milestones, currentIndex, targetIndex)
      if (!milestoneIds) {
        return
      }
      await reorderMilestones({ projectId: project.id, milestoneIds })
    },
    onSuccess: () => {
      toast.success('Checkpoint order updated')
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMilestones(project.id) })
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      refreshProjectDataOnStaleError(queryClient, project.id, error)
    },
  })
  const tasksByMilestone = new Map<string, Task[]>(milestones.map((milestone) => [milestone.id, []]))
  for (const task of tasks) {
    if (!task.milestoneId) {
      continue
    }
    const group = tasksByMilestone.get(task.milestoneId)
    if (group) {
      group.push(task)
    }
  }
  const currentMilestoneId = currentCheckpointId(milestones)
  const filterOptions = assignmentFilterOptions(tasks, user)
  const requestedFilter = selectedFilter ?? 'all'
  const filter = filterOptions.some((option) => option.key === requestedFilter) ? requestedFilter : 'all'
  const filteredTasks = tasksForAssignmentFilter(filter, tasks, user)
  const visibleTasks = filterTasks(filteredTasks, search)
  const groups = checkpointTaskGroups(milestones, tasksByMilestone, visibleTasks, filter, search)
  const emptyPlanCopy = workPlanEmptyCopy(project, canPlan)

  if (isLoading) {
    return <LoadingState label="Loading project plan" />
  }

  return (
    <section className="space-y-5">
      <ResourceLinkDialog key={resourceDialogKey(resourceTarget)} projectId={project.id} target={resourceTarget} resources={resources} canCreate={canManageResources} canManageAll={canManage && canManageResources} onClose={() => setResourceTarget(null)} />
      <ConfirmDialog
        open={Boolean(deleteMilestoneTarget)}
        title="Delete checkpoint?"
        description={deleteMilestoneTarget ? `Delete "${deleteMilestoneTarget.title}" from this Work Plan.` : ''}
        confirmLabel="Delete checkpoint"
        isPending={deleteMilestoneMutation.isPending}
        onOpenChange={(open) => { if (!open) setDeleteMilestoneTarget(null) }}
        onConfirm={() => {
          if (deleteMilestoneTarget) {
            deleteMilestoneMutation.mutate({ projectId: project.id, milestoneId: deleteMilestoneTarget.id })
          }
        }}
      />
      <Dialog open={Boolean(editMilestoneTarget)} onOpenChange={(open) => { if (!open) setEditMilestoneTarget(null) }} title="Edit checkpoint" description="Update the checkpoint title, target date, and planning guidance.">
        {editMilestoneTarget ? <InlineMilestoneForm key={editMilestoneTarget.id} projectId={project.id} milestone={editMilestoneTarget} mode="dialog" onSaved={() => setEditMilestoneTarget(null)} onCancel={() => setEditMilestoneTarget(null)} /> : null}
      </Dialog>

      {resourcesUnavailable ? <ResourceLoadWarning onRetry={onRetryResources} /> : null}

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <section id="work-board" className="min-w-0 scroll-mt-24 space-y-4">
          <div className="flex flex-col gap-4 border-b border-border/80 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Project sequence</p>
              <h2 className="mt-1 font-heading text-2xl font-semibold tracking-tight text-ink">Work Plan</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">The checkpoint sequence for assignments, due dates, reviews, and shared resources.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:justify-end">
              <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground"><ClipboardCheck className="size-3.5 text-primary" /> {milestones.length} checkpoint{milestones.length === 1 ? '' : 's'} · {tasks.length} assignment{tasks.length === 1 ? '' : 's'}</span>
              {canPlan ? <Button type="button" size="sm" className="shrink-0" onClick={onCreateMilestone}><Plus className="size-4" /> New checkpoint</Button> : null}
            </div>
          </div>

          {milestones.length > 0 ? (
            <>
              <div className="flex flex-col gap-3 rounded-xl bg-paper/80 px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
                <label className="relative block w-full lg:max-w-xs">
                  <span className="sr-only">Search assignments</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="h-9 rounded-full border-border/70 bg-white/70 pl-9 text-sm shadow-none" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assignments" />
                </label>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {filterOptions.map((option) => (
                    <button key={option.key} type="button" aria-pressed={filter === option.key} className={cn('border-b-2 py-1 text-xs font-semibold transition', filter === option.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-ink')} onClick={() => setSelectedFilter(option.key)}>
                      {option.label}{option.count > 0 ? <span className="ml-1 text-[0.7rem] opacity-70">{option.count}</span> : null}
                    </button>
                  ))}
                </div>
              </div>

              {groups.length > 0 ? (
                <div className="space-y-4">
                  {groups.map(({ milestone, tasks: groupTasks, index }) => (
                    <CheckpointSection
                      key={milestone.id}
                      milestone={milestone}
                      index={index}
                      tasks={groupTasks}
                      showEmpty={filter === 'all' && search.trim() === ''}
                      isCurrent={milestone.id === currentMilestoneId}
                      milestoneResources={resourcesForTarget(resources, 'milestone', milestone.id)}
                      taskResources={(task) => resourcesForTarget(resources, 'task', task.id)}
                      canPlan={canPlan}
                      canCreateAssignment={canCreateAssignments}
                      assignmentMembersReady={assignmentMembersReady}
                      assignmentMembersError={assignmentMembersError}
                      canManageResources={canManageResources}
                      canMoveUp={index > 0}
                      canMoveDown={index < milestones.length - 1}
                      isMoving={moveMilestoneMutation.isPending}
                      isDeleting={deleteMilestoneMutation.isPending && deleteMilestoneMutation.variables?.milestoneId === milestone.id}
                      onCreateTask={() => onCreateTask(milestone.id)}
                      onEdit={() => setEditMilestoneTarget(milestone)}
                      onResourcesMilestone={() => setResourceTarget({ type: 'milestone', id: milestone.id, label: milestone.title, eyebrow: 'Checkpoint resources' })}
                      onResourcesTask={(task) => setResourceTarget({ type: 'task', id: task.id, label: task.title, eyebrow: 'Assignment resources' })}
                      onMoveUp={() => moveMilestoneMutation.mutate({ milestoneId: milestone.id, direction: 'up' })}
                      onMoveDown={() => moveMilestoneMutation.mutate({ milestoneId: milestone.id, direction: 'down' })}
                      onDelete={() => setDeleteMilestoneTarget(milestone)}
                    />
                  ))}
                </div>
              ) : <div className="py-8"><EmptyState title="No assignments match" message="Clear the search or switch filters." /></div>}
            </>
          ) : (
            <div className="py-8">
              <EmptyState title={emptyPlanCopy.title} message={emptyPlanCopy.message} />
              {canPlan ? <div className="mt-4 flex justify-center"><Button type="button" onClick={onCreateMilestone}><Plus className="size-4" /> Create checkpoint</Button></div> : null}
            </div>
          )}
        </section>

        <ProjectSideRail project={project} members={members} resources={resourcesForTarget(resources, 'project', project.id)} canManageResources={canManageResources} canManageTeam={canManageTeam} isTeamLoading={isTeamLoading} isTeamError={isTeamError} onTeamRetry={onTeamRetry} onManageResources={() => setResourceTarget({ type: 'project', id: project.id, label: project.name, eyebrow: 'Project resources' })} />
      </div>
    </section>
  )
}

function workPlanEmptyCopy(project: Project, canPlan: boolean) {
  if (canPlan) {
    return { title: 'No checkpoints yet', message: 'Create the first checkpoint to turn this project into an actionable work sequence.' }
  }
  if (project.status === 'archived') {
    return { title: 'Work plan is read-only', message: 'This archived project has no checkpoints yet. Reactivate it before planning new work.' }
  }
  if (project.status === 'completed') {
    return { title: 'No checkpoints recorded', message: 'This completed project is closed to new planning; existing project details remain available.' }
  }
  if (project.status === 'on_hold') {
    return { title: 'No checkpoints recorded', message: 'This project is on hold. The Work Plan is readable, but only a project manager can maintain checkpoints.' }
  }
  return { title: 'No checkpoints yet', message: 'A project manager has not added checkpoints yet.' }
}

function ResourceLoadWarning({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
      <span>Reference links could not be loaded. The Work Plan is still available.</span>
      <Button type="button" variant="outline" size="sm" className="border-amber-300 bg-white/80 text-amber-950 hover:bg-amber-100" onClick={onRetry}>Retry links</Button>
    </section>
  )
}

function checkpointAccentClasses(tone: Tone) {
  switch (tone) {
    case 'blue':
      return 'bg-primary'
    case 'teal':
      return 'bg-secondary'
    case 'amber':
      return 'bg-amber-500'
    case 'red':
      return 'bg-destructive'
    default:
      return 'bg-slate-300'
  }
}

function ProjectSideRail({ project, members, resources, canManageResources, canManageTeam, isTeamLoading, isTeamError, onTeamRetry, onManageResources }: { project: Project; members: ProjectMember[]; resources: ResourceLink[]; canManageResources: boolean; canManageTeam: boolean; isTeamLoading: boolean; isTeamError: boolean; onTeamRetry: () => void; onManageResources: () => void }) {
  const assignmentProgress = progressCopy(project.completedTaskCount, project.taskCount, 'assignment')
  const checkpointProgress = progressCopy(project.completedMilestoneCount, project.milestoneCount, 'checkpoint')
  return (
    <aside className="space-y-4 xl:sticky xl:top-6">
      <section className="overflow-hidden rounded-2xl border border-primary/15 bg-white/90 shadow-panel">
        <div className="h-1 bg-primary" />
        <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Snapshot</p>
            <h2 className="mt-1 font-heading text-xl font-semibold tracking-tight text-ink">{assignmentProgress}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{checkpointProgress}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-heading text-2xl font-semibold tracking-tight text-ink">{project.plannedProgressPercent}%</p>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">planned</p>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${clampPercent(project.plannedProgressPercent)}%` }} />
        </div>
        <div className="mt-4 grid gap-2">
          <ProjectRailLine label="Timeline" value={projectTimelineLabel(project)} />
          <ProjectRailLine label="Folder" value={project.classTitle || 'Standalone'} />
          <ProjectRailLine label="Last approved" value={project.lastApprovedUpdateAt ? formatDate(project.lastApprovedUpdateAt) : 'None'} />
        </div>
        {project.progressSummary ? <p className="mt-4 border-t border-border/60 pt-4 text-sm leading-6 text-muted-foreground">{project.progressSummary}</p> : null}
        </div>
      </section>

      <ProjectTeamRailCard project={project} members={members} canManage={canManageTeam} isLoading={isTeamLoading} isError={isTeamError} onRetry={onTeamRetry} />

      {resources.length > 0 || canManageResources ? (
        <ResourceLinkShelf title="Project resources" resources={resources} canCreate={canManageResources} onManage={canManageResources ? onManageResources : undefined} />
      ) : (
        <section className="rounded-2xl border border-border/70 bg-white/85 p-4 shadow-sm sm:p-5">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground"><Link2 className="size-3.5" /> References</p>
          <h2 className="mt-1 font-heading text-lg font-semibold tracking-tight text-ink">Project resources</h2>
          <p className="mt-3 text-sm text-muted-foreground">No shared links yet.</p>
        </section>
      )}
    </aside>
  )
}

function ProjectTeamRailCard({ project, members, canManage, isLoading, isError, onRetry }: { project: Project; members: ProjectMember[]; canManage: boolean; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  const leader = members.find((member) => member.memberRole === 'leader')
  const displayedMemberCount = isLoading || isError ? project.memberCount : members.length
  const inactiveMemberCount = members.filter((member) => member.status !== 'active').length
  const studentLabel = `${displayedMemberCount} student${displayedMemberCount === 1 ? '' : 's'}`
  const teamNote = isError ? 'Team data could not be loaded.' : isLoading ? 'Loading student access.' : inactiveMemberCount > 0 ? `${inactiveMemberCount} inactive.` : ''

  return (
    <section className="rounded-2xl border border-border/70 bg-white/85 p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><Users className="size-4" /></span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Team</p>
            <h2 className="font-heading text-lg font-semibold tracking-tight text-ink">{studentLabel}</h2>
          </div>
        </div>
        <ProjectTeamPopover project={project} members={members} canManage={canManage} isLoading={isLoading} isError={isError} onRetry={onRetry} />
      </div>
      <div className="mt-4 grid gap-3">
        <ProjectPersonLine label="Supervisor" name={project.supervisorName} personId={project.supervisorId} role="teacher" />
        <ProjectPersonLine label="Leader" name={leader?.fullName || 'Not set'} personId={leader?.id} role="student" muted={!leader} />
      </div>
      {teamNote ? <div className="mt-4 flex flex-col gap-2 text-sm leading-6 text-muted-foreground">
        <span>{teamNote}</span>
        {isError ? <Button type="button" variant="outline" size="sm" className="self-start bg-white" onClick={onRetry}>Retry team</Button> : null}
      </div> : null}
    </section>
  )
}

function progressCopy(completed: number, total: number, noun: string) {
  if (total === 0) {
    return `No ${noun}s yet`
  }
  return `${completed}/${total} ${noun}${total === 1 ? '' : 's'} complete`
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(100, value))
}

function ProjectRailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="min-w-0 max-w-[12rem] text-right text-sm font-semibold leading-5 text-ink" title={value}>{value}</p>
    </div>
  )
}

function ProjectPersonLine({ label, name, personId, role, muted = false }: { label: string; name: string; personId?: string; role: 'student' | 'teacher'; muted?: boolean }) {
  const fallback = name.trim() ? name : 'Not set'
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-full font-heading text-sm font-semibold', muted ? 'bg-slate-100 text-muted-foreground' : 'bg-primary/10 text-primary')}>{muted ? '-' : initials(fallback)}</span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        {personId ? <PersonLink id={personId} name={fallback} role={role} className={cn('block truncate text-sm font-semibold leading-5', muted ? 'text-muted-foreground' : 'text-ink')} /> : <p className={cn('truncate text-sm font-semibold leading-5', muted ? 'text-muted-foreground' : 'text-ink')} title={fallback}>{fallback}</p>}
      </div>
    </div>
  )
}

function InlineMilestoneForm({ projectId, milestone, mode = 'inline', onSaved, onCancel }: { projectId: string; milestone?: ProjectMilestone; mode?: 'inline' | 'dialog'; onSaved: () => void; onCancel: () => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(milestone?.title || '')
  const [targetDate, setTargetDate] = useState(milestone?.targetDate || '')
  const [description, setDescription] = useState(milestone?.description || '')
  const mutation = useMutation({
    mutationFn: () => {
      const trimmedDescription = description.trim()
      if (milestone) {
        return updateMilestone({ projectId, milestoneId: milestone.id, title: title.trim(), targetDate, description: trimmedDescription })
      }
      return createMilestone({ projectId, title: title.trim(), targetDate: targetDate || undefined, description: trimmedDescription || undefined })
    },
    onSuccess: () => {
      toast.success(milestone ? 'Checkpoint updated' : 'Checkpoint created')
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMilestones(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      queryClient.invalidateQueries({ queryKey: queryKeys.classes })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      onSaved()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      refreshProjectDataOnStaleError(queryClient, projectId, error)
    },
  })

  return (
    <form className={mode === 'inline' ? 'border-l border-primary/30 py-2 pl-4' : 'space-y-4 pb-5'} onSubmit={(event) => {
      event.preventDefault()
      if (!title.trim()) {
        toast.error('Checkpoint title is required')
        return
      }
      mutation.mutate()
    }}>
      <div className="grid gap-3 lg:grid-cols-[1fr_13rem]">
        <label className="space-y-1 text-sm font-medium text-ink">Checkpoint title<Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Prototype review" /></label>
        <label className="space-y-1 text-sm font-medium text-ink">Target date<DatePicker value={targetDate} onValueChange={setTargetDate} /></label>
      </div>
      <label className="mt-3 block space-y-1 text-sm font-medium text-ink">Guidance<Textarea className="min-h-20" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What should be ready at this checkpoint?" /></label>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={mutation.isPending}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : milestone ? 'Save checkpoint' : 'Create checkpoint'}</Button>
      </div>
    </form>
  )
}

function CheckpointSection({ milestone, index, tasks, showEmpty, isCurrent, milestoneResources, taskResources, canPlan, canCreateAssignment, assignmentMembersReady, assignmentMembersError, canManageResources, canMoveUp, canMoveDown, isMoving, isDeleting, onCreateTask, onEdit, onResourcesMilestone, onResourcesTask, onMoveUp, onMoveDown, onDelete }: { milestone: ProjectMilestone; index: number; tasks: Task[]; showEmpty: boolean; isCurrent: boolean; milestoneResources: ResourceLink[]; taskResources: (task: Task) => ResourceLink[]; canPlan: boolean; canCreateAssignment: boolean; assignmentMembersReady: boolean; assignmentMembersError: boolean; canManageResources: boolean; canMoveUp: boolean; canMoveDown: boolean; isMoving: boolean; isDeleting: boolean; onCreateTask: () => void; onEdit: () => void; onResourcesMilestone: () => void; onResourcesTask: (task: Task) => void; onMoveUp: () => void; onMoveDown: () => void; onDelete: () => void }) {
  const [showAll, setShowAll] = useState(false)
  const tone = statusTone(milestone.state)
  const shownTasks = showAll ? tasks : tasks.slice(0, CHECKPOINT_TASK_INITIAL_COUNT)

  return (
    <section id={`checkpoint-${milestone.id}`} className={cn('relative overflow-hidden rounded-2xl border bg-white/90 p-4 shadow-sm transition hover:shadow-panel sm:p-5', isCurrent ? 'border-primary/30 ring-1 ring-primary/10' : 'border-border/70')}>
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', checkpointAccentClasses(tone))} />
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3 sm:gap-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-border/70 bg-paper text-center shadow-sm">
            <span className="font-heading text-base font-semibold tabular-nums text-ink">{String(index + 1).padStart(2, '0')}</span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={milestone.state} tone={tone} />
              {isCurrent ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Current</span> : null}
            </div>
            <h3 className="mt-2 break-words font-heading text-xl font-semibold tracking-tight text-ink">{milestone.title}</h3>
            {milestone.description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{milestone.description}</p> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {!canPlan && (milestoneResources.length > 0 || canManageResources) ? <ResourceLinkButton count={milestoneResources.length} onClick={onResourcesMilestone} ariaLabel={`${canManageResources ? 'Manage' : 'View'} resources for ${milestone.title}`} /> : null}
          {canCreateAssignment ? <Button type="button" variant="secondary" size="sm" disabled={!assignmentMembersReady} title={!assignmentMembersReady ? assignmentMembersError ? 'Student list could not be loaded.' : 'Student list is still loading.' : undefined} onClick={onCreateTask}><Plus className="size-4" /> {assignmentMembersReady ? 'Add assignment' : assignmentMembersError ? 'Students unavailable' : 'Loading students...'}</Button> : null}
          {canPlan ? <CheckpointActionsPopover milestone={milestone} resourceCount={milestoneResources.length} canManageResources={canManageResources} canMoveUp={canMoveUp} canMoveDown={canMoveDown} isMoving={isMoving} isDeleting={isDeleting} onEdit={onEdit} onResources={onResourcesMilestone} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete} /> : null}
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <dl className="flex flex-wrap gap-2">
          <CheckpointMetric label="assignments" value={milestone.taskCount} />
          <CheckpointMetric label="done" value={milestone.completedTaskCount} tone={milestone.completedTaskCount > 0 ? 'teal' : 'slate'} />
          {milestone.pendingReviewCount > 0 ? <CheckpointMetric label="waiting review" value={milestone.pendingReviewCount} tone="amber" /> : null}
          {milestone.overdueTaskCount > 0 ? <CheckpointMetric label="overdue" value={milestone.overdueTaskCount} tone="red" /> : null}
        </dl>
        <p className="shrink-0 text-xs font-semibold text-muted-foreground">{milestoneDateLabel(milestone)}</p>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all duration-700 ease-out" style={{ width: `${milestone.completionPercent}%` }} />
      </div>
      {shownTasks.length > 0 ? <div className="mt-4 grid gap-2">{shownTasks.map((task) => <TaskLedgerRow key={task.id} task={task} resources={taskResources(task)} canManageResources={canManageResources} onResources={() => onResourcesTask(task)} />)}</div> : null}
      {tasks.length > CHECKPOINT_TASK_INITIAL_COUNT ? (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Showing {shownTasks.length} of {tasks.length} assignments.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show fewer' : 'Show all'}</Button>
        </div>
      ) : null}
      {tasks.length === 0 && showEmpty ? <p className="mt-4 rounded-xl border border-dashed border-border/70 px-4 py-3 text-sm text-muted-foreground">No assignments in this checkpoint yet.</p> : null}
    </section>
  )
}

function CheckpointMetric({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'teal' | 'amber' | 'red' }) {
  const toneClass = {
    slate: 'bg-slate-100 text-slate-700',
    teal: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-800',
    red: 'bg-red-50 text-red-700',
  }[tone]
  return (
    <div className={cn('inline-flex items-baseline gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium', toneClass)}>
      <dt>{label}</dt>
      <dd className="order-first font-bold tabular-nums">{value}</dd>
    </div>
  )
}

function CheckpointActionsPopover({ milestone, resourceCount, canManageResources, canMoveUp, canMoveDown, isMoving, isDeleting, onEdit, onResources, onMoveUp, onMoveDown, onDelete }: { milestone: ProjectMilestone; resourceCount: number; canManageResources: boolean; canMoveUp: boolean; canMoveDown: boolean; isMoving: boolean; isDeleting: boolean; onEdit: () => void; onResources: () => void; onMoveUp: () => void; onMoveDown: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const canDelete = milestone.taskCount === 0
  const canOpenResources = canManageResources || resourceCount > 0
  const closeAfter = (action: () => void) => {
    action()
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="bg-white" aria-label={`Open checkpoint actions for ${milestone.title}`}>
          <MoreHorizontal className="size-4" /> Actions
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-64 rounded-2xl border-border bg-card p-2 shadow-xl shadow-slate-950/10">
        <div className="px-2 pb-2 pt-1">
          <p className="truncate text-sm font-semibold text-ink">{milestone.title}</p>
          <p className="text-xs text-muted-foreground">Checkpoint actions save immediately.</p>
        </div>
        <div className="grid gap-1 border-t border-border pt-2">
          <CheckpointActionButton icon={<Pencil className="size-4" />} label="Edit checkpoint" onClick={() => closeAfter(onEdit)} />
          <CheckpointActionButton icon={<ArrowUp className="size-4" />} label="Move up" disabled={!canMoveUp || isMoving} onClick={() => closeAfter(onMoveUp)} />
          <CheckpointActionButton icon={<ArrowDown className="size-4" />} label="Move down" disabled={!canMoveDown || isMoving} onClick={() => closeAfter(onMoveDown)} />
          <CheckpointActionButton icon={<Link2 className="size-4" />} label={canManageResources ? 'Manage resources' : 'View resources'} disabled={!canOpenResources} onClick={() => closeAfter(onResources)} />
          <CheckpointActionButton icon={<Trash2 className="size-4" />} label="Delete checkpoint" description={canDelete ? undefined : 'Remove assignments first.'} destructive disabled={!canDelete || isDeleting} onClick={() => closeAfter(onDelete)} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function CheckpointActionButton({ icon, label, description, destructive, disabled, onClick }: { icon: ReactNode; label: string; description?: string; destructive?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50', destructive ? 'text-destructive hover:bg-red-50' : 'text-ink hover:bg-accent')} disabled={disabled} onClick={onClick}>
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {description ? <span className="block text-xs font-medium text-muted-foreground">{description}</span> : null}
      </span>
    </button>
  )
}

function checkpointTaskGroups(milestones: ProjectMilestone[], tasksByMilestone: Map<string, Task[]>, visibleTasks: Task[], filter: AssignmentFilter, search: string) {
  const visibleTaskIds = new Set(visibleTasks.map((task) => task.id))
  const showEmptyCheckpoints = filter === 'all' && search.trim() === ''
  return milestones
    .map((milestone, index) => ({
      milestone,
      index,
      tasks: (tasksByMilestone.get(milestone.id) || []).filter((task) => visibleTaskIds.has(task.id)),
    }))
    .filter((group) => showEmptyCheckpoints || group.tasks.length > 0)
}

function moveMilestoneIDs(milestones: ProjectMilestone[], currentIndex: number, targetIndex: number) {
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= milestones.length) {
    return null
  }
  const reordered = milestones.map((milestone) => milestone.id)
  const [moved] = reordered.splice(currentIndex, 1)
  if (!moved) {
    return null
  }
  reordered.splice(targetIndex, 0, moved)
  return reordered
}

function resourceDialogKey(target: ResourceLinkTarget | null) {
  return target ? `${target.type}:${target.id}` : 'resource-dialog-closed'
}

function assignmentFilterOptions(allTasks: Task[], user?: User | null) {
  if (user?.role === 'student') {
    return [
      { key: 'all' as const, label: 'All assignments', count: tasksForAssignmentFilter('all', allTasks, user).length },
      { key: 'mine' as const, label: 'Mine', count: tasksForAssignmentFilter('mine', allTasks, user).length },
      { key: 'review' as const, label: 'Waiting review', count: tasksForAssignmentFilter('review', allTasks, user).length },
      { key: 'overdue' as const, label: 'Overdue', count: tasksForAssignmentFilter('overdue', allTasks, user).length },
      { key: 'revision' as const, label: 'Needs revision', count: tasksForAssignmentFilter('revision', allTasks, user).length },
    ]
  }

  return [
    { key: 'all' as const, label: 'All', count: tasksForAssignmentFilter('all', allTasks, user).length },
    { key: 'review' as const, label: 'Needs review', count: tasksForAssignmentFilter('review', allTasks, user).length },
    { key: 'overdue' as const, label: 'Overdue', count: tasksForAssignmentFilter('overdue', allTasks, user).length },
    { key: 'revision' as const, label: 'Needs revision', count: tasksForAssignmentFilter('revision', allTasks, user).length },
  ]
}

function tasksForAssignmentFilter(filter: AssignmentFilter, allTasks: Task[], user?: User | null) {
  const studentScoped = user?.role === 'student'
  switch (filter) {
    case 'review':
      return allTasks.filter((task) => task.pendingReviewCount > 0 && (!studentScoped || isTaskMine(task, user)))
    case 'overdue':
      return allTasks.filter((task) => task.isOverdue && (!studentScoped || isTaskMine(task, user)))
    case 'revision':
      return allTasks.filter((task) => isAssignmentNeedsRevision(task) && (!studentScoped || isTaskMine(task, user)))
    case 'mine':
      return allTasks.filter((task) => isTaskMine(task, user))
    case 'all':
      return allTasks
  }
}

function isTaskMine(task: Task, user?: User | null) {
  return Boolean(user && task.assignees.some((assignee) => assignee.id === user.id))
}

function filterTasks(tasks: Task[], search: string) {
  const query = search.trim().toLowerCase()
  if (!query) {
    return tasks
  }
  return tasks.filter((task) => [task.title, task.description, task.priority, task.status, task.officialProgressState, task.deadline, task.assignees.map((assignee) => `${assignee.fullName} ${assignee.email}`).join(' ')].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)))
}

function TaskLedgerRow({ task, resources, canManageResources, onResources }: { task: Task; resources: ResourceLink[]; canManageResources: boolean; onResources: () => void }) {
  const assignmentState = getAssignmentState(task)
  const assigneeLabel = assignmentAssigneeLabel(task.assignees)
  const assigneeTitle = assignmentAssigneeTitle(task.assignees)
  return (
    <article className="rounded-xl border border-border/70 bg-white px-3 py-3 transition hover:border-primary/30 hover:bg-paper/70 sm:px-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge value={assignmentState.key} tone={assignmentState.tone} />
            <Link className="min-w-0 truncate font-heading text-base font-semibold tracking-tight text-ink underline-offset-4 hover:text-primary hover:underline" to={`/workspace/projects/${task.projectId}/tasks/${task.id}`}>{task.title}</Link>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{assignmentState.description}</p>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
            <span>{taskDeadlineLabel(task)}</span>
            <span title={assigneeTitle}>{assigneeLabel}</span>
            <span>{task.progressUpdateCount} submission{task.progressUpdateCount === 1 ? '' : 's'}</span>
            {task.pendingReviewCount > 0 ? <span className="text-amber-700">{task.pendingReviewCount} waiting review</span> : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
          {resources.length > 0 || canManageResources ? <ResourceLinkButton count={resources.length} onClick={onResources} ariaLabel={`${canManageResources ? 'Manage' : 'View'} resources for ${task.title}`} /> : null}
          <Button asChild variant="outline" size="sm"><Link to={`/workspace/projects/${task.projectId}/tasks/${task.id}`}>Open <ArrowRight className="size-4" /></Link></Button>
        </div>
      </div>
    </article>
  )
}

function assignmentAssigneeLabel(assignees: User[]) {
  if (assignees.length === 0) {
    return 'No assignees'
  }
  if (assignees.length <= 2) {
    return assignees.map((assignee) => assignee.fullName).join(', ')
  }
  return `${assignees.slice(0, 2).map((assignee) => assignee.fullName).join(', ')} +${assignees.length - 2} more`
}

function assignmentAssigneeTitle(assignees: User[]) {
  return assignees.length > 0 ? assignees.map((assignee) => assignee.fullName).join(', ') : undefined
}

function milestoneDateLabel(milestone: ProjectMilestone) {
  return milestone.targetDate ? `Target ${formatDate(milestone.targetDate)}` : 'No target date'
}

function taskDeadlineLabel(task: Task) {
  if (!task.deadline) {
    return 'No deadline'
  }
  return task.isOverdue ? `Overdue ${formatDate(task.deadline)}` : `Due ${formatDate(task.deadline)}`
}

function statusTone(status: string): Tone {
  switch (status) {
    case 'completed':
      return 'teal'
    case 'in_progress':
      return 'blue'
    case 'needs_changes':
      return 'amber'
    case 'rejected':
      return 'red'
    default:
      return 'slate'
  }
}

function ProjectTeamPopover({ project, members, canManage, isLoading, isError, onRetry }: { project: Project; members: ProjectMember[]; canManage: boolean; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  const queryClient = useQueryClient()
  const [memberSearch, setMemberSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [removeMemberTarget, setRemoveMemberTarget] = useState<ProjectMember | null>(null)
  const removeMutation = useMutation({
    mutationFn: removeProjectMember,
    onSuccess: (_data, variables) => {
      toast.success('Member removed')
      setRemoveMemberTarget(null)
      queryClient.setQueryData<ProjectMember[]>(queryKeys.projectMembers(project.id), (current) => current ? current.filter((member) => member.id !== variables.memberId) : current)
      queryClient.setQueryData<Project>(queryKeys.project(project.id), (current) => current ? { ...current, memberCount: Math.max(0, current.memberCount - 1) } : current)
      invalidateProjectData(queryClient, project.id)
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      refreshProjectDataOnStaleError(queryClient, project.id, error)
    },
  })
  const roleMutation = useMutation({
    mutationFn: updateProjectMember,
    onSuccess: (member) => {
      toast.success(member.memberRole === 'leader' ? `${member.fullName} is now a leader` : `${member.fullName} is now a member`)
      queryClient.setQueryData<ProjectMember[]>(queryKeys.projectMembers(project.id), (current) => updateMemberRoleCache(current, member))
      invalidateProjectData(queryClient, project.id)
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      refreshProjectDataOnStaleError(queryClient, project.id, error)
    },
  })
  const sortedMembers = sortProjectMembers(members)
  const visibleMembers = filterProjectMembers(sortedMembers, memberSearch)
  const shownMembers = visibleMembers.slice(0, TEAM_MEMBER_VISIBLE_COUNT)
  const leaderCount = members.filter((member) => member.memberRole === 'leader').length
  const leaderLabel = leaderCount > 0 ? 'Leader set' : 'No leader'
  const inactiveMemberCount = members.filter((member) => member.status !== 'active').length
  const showSearch = members.length >= 8 || memberSearch.trim().length > 0
  const displayedMemberCount = isLoading || isError ? project.memberCount : members.length
  const memberCountCopy = inactiveMemberCount > 0 ? `${members.length} student${members.length === 1 ? '' : 's'} (${inactiveMemberCount} inactive)` : `${members.length} student${members.length === 1 ? '' : 's'}`
  const isTeamMutationPending = roleMutation.isPending || removeMutation.isPending
  const emptyTeamCopy = teamEmptyCopy(project, canManage)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-transparent px-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25" aria-label={`Open project team, ${displayedMemberCount} student${displayedMemberCount === 1 ? '' : 's'}`} title="Project team">
          <Users className="size-4" />
          <span>{canManage ? 'Manage' : 'View'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border-border bg-card p-0 shadow-xl shadow-slate-950/10">
        <section aria-label="Project team">
          <header className="flex items-center justify-between gap-3 border-b border-border bg-white px-4 py-3">
            <div className="min-w-0 transition-opacity duration-200">
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-lg font-semibold tracking-tight text-ink">Team</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-muted-foreground">{displayedMemberCount}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{leaderLabel} · direct student access</p>
            </div>
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-slate-50 text-muted-foreground"><Users className="size-4" /></span>
          </header>

          <div>
            <div className="max-h-[min(34rem,calc(100vh-8rem))] space-y-4 overflow-y-auto px-4 pb-4 pt-3">
              {isError ? <ErrorState message="Team data could not be loaded." onRetry={onRetry} /> : null}
              {!isError && isLoading ? <LoadingState label="Loading team" /> : null}
              {!isError && !isLoading ? (
                <>
                  <section className="rounded-xl border border-border bg-paper/70 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 font-heading text-sm font-semibold text-primary">{initials(project.supervisorName)}</span>
                      <div className="min-w-0">
                        <PersonLink id={project.supervisorId} name={project.supervisorName} role="teacher" className="block truncate text-sm font-semibold text-ink" />
                        <p className="text-xs font-medium text-muted-foreground">Supervisor</p>
                      </div>
                    </div>
                  </section>

                  {canManage ? (
                    <section className="rounded-xl border border-border bg-white">
                      <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left" aria-expanded={addOpen} onClick={() => setAddOpen((value) => !value)}>
                        <span>
                          <span className="block text-sm font-semibold text-ink">Add student</span>
                          <span className="block text-xs text-muted-foreground">Use an existing active student account.</span>
                        </span>
                        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', addOpen ? 'rotate-180' : '')} />
                      </button>
                      <div className={cn('overflow-hidden transition-all duration-300 ease-out', addOpen ? 'max-h-80 border-t border-border opacity-100' : 'max-h-0 opacity-0')}>
                        {addOpen ? (
                          <div className="p-3">
                            <AddProjectMemberForm projectId={project.id} onAdded={() => setAddOpen(false)} />
                          </div>
                        ) : null}
                      </div>
                    </section>
                  ) : null}

                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-heading text-base font-semibold tracking-tight text-ink">Students</h3>
                        <p className="text-xs text-muted-foreground">{memberCountCopy}</p>
                      </div>
                    </div>
                    {showSearch ? (
                      <label className="relative block">
                        <span className="sr-only">Search team members</span>
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input className="h-9 rounded-full bg-white pl-9 text-sm" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search members" />
                      </label>
                    ) : null}
                    {members.length > 0 ? (
                      <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-border bg-white">
                        {visibleMembers.length > 0 ? shownMembers.map((member) => (
                          <ProjectMemberRow
                            key={member.id}
                            member={member}
                            canManage={canManage}
                            actionsDisabled={isTeamMutationPending}
                            onToggleRole={() => roleMutation.mutate({ projectId: project.id, memberId: member.id, memberRole: member.memberRole === 'leader' ? 'member' : 'leader' })}
                            onRemove={() => setRemoveMemberTarget(member)}
                          />
                        )) : <p className="px-3 py-3 text-sm text-muted-foreground">No matching members.</p>}
                        {visibleMembers.length > TEAM_MEMBER_VISIBLE_COUNT ? <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Showing {TEAM_MEMBER_VISIBLE_COUNT} of {visibleMembers.length}. Search by name, email, or role to narrow the team.</p> : null}
                      </div>
                    ) : <EmptyState title={emptyTeamCopy.title} message={emptyTeamCopy.message} />}
                  </section>
                </>
              ) : null}
            </div>
          </div>
        </section>
      </PopoverContent>
      <ConfirmDialog
        open={Boolean(removeMemberTarget)}
        title="Remove student?"
        description={removeMemberTarget ? `Remove ${removeMemberTarget.fullName} from this project. They will be unassigned from project assignments.` : ''}
        confirmLabel="Remove student"
        isPending={removeMutation.isPending}
        onOpenChange={(open) => { if (!open) setRemoveMemberTarget(null) }}
        onConfirm={() => {
          if (removeMemberTarget) {
            removeMutation.mutate({ projectId: project.id, memberId: removeMemberTarget.id })
          }
        }}
      />
    </Popover>
  )
}

function teamEmptyCopy(project: Project, canManage: boolean) {
  if (canManage) {
    return { title: 'No students yet', message: 'Add existing students to give them access to this project.' }
  }
  if (project.status === 'archived') {
    return { title: 'No students recorded', message: 'This archived project is read-only until a manager reactivates it.' }
  }
  if (project.status === 'completed') {
    return { title: 'No students recorded', message: 'Team changes are closed for this completed project.' }
  }
  if (project.status === 'on_hold') {
    return { title: 'No students recorded', message: 'This project is on hold. Only a project manager can add students.' }
  }
  return { title: 'No students recorded', message: 'A project manager has not added students yet.' }
}

function ProjectMemberRow({ member, canManage, actionsDisabled, onToggleRole, onRemove }: { member: ProjectMember; canManage: boolean; actionsDisabled: boolean; onToggleRole: () => void; onRemove: () => void }) {
  const roleAction = member.memberRole === 'leader' ? 'Clear project leader' : 'Make project leader'

  return (
    <article className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary/10 font-heading text-xs font-semibold text-secondary">{initials(member.fullName)}</span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <PersonLink id={member.id} name={member.fullName} role="student" className="block truncate text-sm font-semibold text-ink" />
            {member.memberRole === 'leader' ? <StatusBadge value="leader" tone="teal" /> : null}
            {member.status !== 'active' ? <StatusBadge value={member.status} tone="red" /> : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
          <p className="text-xs text-muted-foreground">Joined {formatDate(member.joinedAt)}</p>
        </div>
      </div>
      {canManage ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`${roleAction}: ${member.fullName}`} aria-pressed={member.memberRole === 'leader'} title={roleAction} disabled={actionsDisabled} onClick={onToggleRole}>
            <Star className={cn('size-4', member.memberRole === 'leader' ? 'fill-primary text-primary' : 'text-muted-foreground')} />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label={`Remove ${member.fullName} from project`} title="Remove from project" disabled={actionsDisabled} onClick={onRemove}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ) : null}
    </article>
  )
}

function updateMemberRoleCache(members: ProjectMember[] | undefined, updated: ProjectMember) {
  if (!members) {
    return members
  }
  return members.map((member) => {
    if (member.id === updated.id) {
      return updated
    }
    if (updated.memberRole === 'leader' && member.memberRole === 'leader') {
      return { ...member, memberRole: 'member' as const }
    }
    return member
  })
}

function sortProjectMembers(members: ProjectMember[]) {
  return [...members].sort((left, right) => {
    if (left.memberRole !== right.memberRole) {
      return left.memberRole === 'leader' ? -1 : 1
    }
    return left.fullName.localeCompare(right.fullName)
  })
}

function filterProjectMembers(members: ProjectMember[], search: string) {
  const query = search.trim().toLowerCase()
  if (!query) {
    return members
  }
  return members.filter((member) => `${member.fullName} ${member.email} ${member.memberRole} ${member.status}`.toLowerCase().includes(query))
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'
}

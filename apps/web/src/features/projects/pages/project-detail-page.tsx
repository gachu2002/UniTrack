import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ChevronDown, Link2, Pencil, Plus, Search, Star, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

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
import { createMilestone, deleteMilestone, getProject, getProjectMembers, getProjectMilestones, getProjectResourceLinks, getProjectTasks, removeProjectMember, updateMilestone, updateProjectMember } from '@/features/projects/api'
import { AddProjectMemberForm, EditProjectForm } from '@/features/projects/components/project-forms'
import { ResourceChip, ResourceLinkButton, ResourceLinkDialog, type ResourceLinkTarget } from '@/features/resources/components/resource-link-drawer'
import { resourcesForTarget } from '@/features/resources/utils'
import { getAssignmentState } from '@/features/tasks/assignment-state'
import { CreateTaskForm } from '@/features/tasks/components/task-forms'
import { getErrorMessage } from '@/lib/axios'
import { formatDate, titleize } from '@/lib/format'
import { canManageProject, projectAcceptsNewAssignments, projectAcceptsPlanChanges, projectAcceptsSupportChanges, projectAcceptsTeamChanges } from '@/lib/permissions'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import type { Project, ProjectMember, ProjectMilestone, ResourceLink, Task } from '@/types/api'

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
    return <ForbiddenState message="This project is restricted, missing, or temporarily unavailable." onRetry={() => void projectQuery.refetch()} />
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
  const canManageResources = projectAcceptsSupportChanges(project)
  const canManageTeam = canManage && projectAcceptsTeamChanges(project)
  const openTaskCreate = (milestoneId = '') => {
    setTaskCreateMilestoneId(milestoneId)
    setTaskCreateOpen(true)
  }

  return (
    <div className="space-y-6">
      <ProjectCommandHeader
        project={project}
        canManage={canManage}
        members={members}
        canManageTeam={canManageTeam}
        isTeamLoading={membersQuery.isLoading}
        isTeamError={membersQuery.isError}
        onTeamRetry={() => { void membersQuery.refetch() }}
        onEdit={() => setEditOpen(true)}
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen} title="Edit project" description="Update project metadata, timeline, and lifecycle state." className="max-w-4xl">
        <EditProjectForm project={project} onCancel={() => setEditOpen(false)} onUpdated={() => setEditOpen(false)} />
      </Dialog>
      <Dialog open={taskCreateOpen} onOpenChange={setTaskCreateOpen} title="New assignment" description="Create teacher-owned work inside this checkpoint and assign current students." className="max-w-4xl">
        <CreateTaskForm projectId={resolvedProjectId} members={members} milestones={milestones} milestoneId={taskCreateMilestoneId} onCreated={() => setTaskCreateOpen(false)} />
      </Dialog>
      <main className="min-w-0">
        {tasksQuery.isError || milestonesQuery.isError || resourcesQuery.isError ? <ErrorState message="Project map could not be loaded." onRetry={() => { void tasksQuery.refetch(); void milestonesQuery.refetch(); void resourcesQuery.refetch() }} /> : <ProjectPlanTree project={project} tasks={tasks} milestones={milestones} resources={resources} canManage={canManage} canPlan={canPlan} canCreateAssignments={canCreateAssignments} canManageResources={canManageResources} createMilestoneOpen={createMilestoneOpen} onCreateMilestoneOpenChange={setCreateMilestoneOpen} isLoading={tasksQuery.isLoading || milestonesQuery.isLoading || resourcesQuery.isLoading} onCreateTask={openTaskCreate} />}
      </main>
    </div>
  )
}

type Tone = 'slate' | 'blue' | 'teal' | 'amber' | 'red'

const SELECTED_TASK_INITIAL_COUNT = 30
const TEAM_MEMBER_VISIBLE_COUNT = 60

interface ProjectCommandHeaderProps {
  project: Project
  canManage: boolean
  members: ProjectMember[]
  canManageTeam: boolean
  isTeamLoading: boolean
  isTeamError: boolean
  onTeamRetry: () => void
  onEdit: () => void
}

function ProjectCommandHeader({ project, canManage, members, canManageTeam, isTeamLoading, isTeamError, onTeamRetry, onEdit }: ProjectCommandHeaderProps) {
  const summary = project.topic || project.description || ''

  return (
    <section className="border-b border-border pb-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground"><Link className="underline-offset-4 hover:text-primary hover:underline" to="/workspace">Workspace</Link> / Project</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge value={project.status} />
            <StatusBadge value={project.officialProgressState} />
            {project.pendingReviewCount > 0 ? <StatusBadge value="pending_review" tone="amber" /> : null}
          </div>
          <h1 className="mt-3 max-w-4xl font-heading text-3xl font-semibold tracking-tight text-ink md:text-4xl">{project.name}</h1>
          {summary ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{summary}</p> : null}
          <ProjectLifecycleNotice project={project} />
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
          {canManage ? <Button type="button" variant="edit" size="sm" onClick={onEdit}><Pencil className="size-4" /> Edit project</Button> : null}
          <ProjectTeamPopover project={project} members={members} canManage={canManageTeam} isLoading={isTeamLoading} isError={isTeamError} onRetry={onTeamRetry} />
        </div>
      </div>
      <ProjectFactStrip project={project} />
    </section>
  )
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

function ProjectFactStrip({ project }: { project: Project }) {
  const facts = [
    { label: 'Plan', value: `${project.plannedProgressPercent}% planned` },
    { label: 'Team', value: `${project.memberCount} member${project.memberCount === 1 ? '' : 's'}` },
    { label: 'Assignments', value: `${project.taskCount} assignment${project.taskCount === 1 ? '' : 's'}` },
    { label: 'Timeline', value: projectTimelineLabel(project) },
    { label: 'Supervisor', value: project.supervisorName },
    project.classTitle ? { label: 'Folder', value: project.classTitle } : null,
    project.pendingReviewCount > 0 ? { label: 'Review queue', value: `${project.pendingReviewCount} pending` } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item))

  return (
    <dl className="mt-5 grid gap-x-5 gap-y-3 rounded-2xl border border-border bg-paper/60 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {facts.map((fact) => (
        <div key={fact.label} className="min-w-0">
          <dt className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">{fact.label}</dt>
          <dd className="mt-1 truncate text-sm font-semibold text-ink">{fact.value}</dd>
        </div>
      ))}
    </dl>
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
  tasks: Task[]
  milestones: ProjectMilestone[]
  resources: ResourceLink[]
  canManage: boolean
  canPlan: boolean
  canCreateAssignments: boolean
  canManageResources: boolean
  createMilestoneOpen: boolean
  onCreateMilestoneOpenChange: (open: boolean) => void
  isLoading: boolean
  onCreateTask: (milestoneId: string) => void
}

function ProjectPlanTree({ project, tasks, milestones, resources, canManage, canPlan, canCreateAssignments, canManageResources, createMilestoneOpen, onCreateMilestoneOpenChange, isLoading, onCreateTask }: ProjectPlanTreeProps) {
  const queryClient = useQueryClient()
  const [resourceTarget, setResourceTarget] = useState<ResourceLinkTarget | null>(null)
  const [selectedMilestoneId, setSelectedMilestoneId] = useState('')
  const [deleteMilestoneTarget, setDeleteMilestoneTarget] = useState<ProjectMilestone | null>(null)
  const deleteMilestoneMutation = useMutation({
    mutationFn: deleteMilestone,
    onSuccess: (_data, variables) => {
      toast.success('Checkpoint deleted')
      setDeleteMilestoneTarget(null)
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMilestones(variables.projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(variables.projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projectResourceLinks(variables.projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      queryClient.invalidateQueries({ queryKey: queryKeys.classes })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      if (resourceTarget?.type === 'milestone' && resourceTarget.id === variables.milestoneId) {
        setResourceTarget(null)
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const moveMilestoneMutation = useMutation({
    mutationFn: async ({ milestoneId, direction }: { milestoneId: string; direction: 'up' | 'down' }) => {
      const currentIndex = milestones.findIndex((milestone) => milestone.id === milestoneId)
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= milestones.length) {
        return
      }

      const current = milestones[currentIndex]
      const target = milestones[targetIndex]
      await Promise.all([
        updateMilestone({ projectId: project.id, milestoneId: current.id, sortOrder: target.sortOrder }),
        updateMilestone({ projectId: project.id, milestoneId: target.id, sortOrder: current.sortOrder }),
      ])
    },
    onSuccess: () => {
      toast.success('Checkpoint order updated')
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMilestones(project.id) })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
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
  const defaultMilestoneId = currentMilestoneId || milestones[0]?.id || ''
  const selectedMilestone = milestones.find((milestone) => milestone.id === selectedMilestoneId) || milestones.find((milestone) => milestone.id === defaultMilestoneId)
  const selectedTasks = selectedMilestone ? tasksByMilestone.get(selectedMilestone.id) || [] : []

  if (isLoading) {
    return <LoadingState label="Loading project plan" />
  }

  return (
    <section className="space-y-5">
      <ResourceLinkDialog projectId={project.id} target={resourceTarget} resources={resources} canCreate={canManageResources} canManageAll={canManage && canManageResources} onClose={() => setResourceTarget(null)} />
      <ConfirmDialog
        open={Boolean(deleteMilestoneTarget)}
        title="Delete checkpoint?"
        description={deleteMilestoneTarget ? `Delete "${deleteMilestoneTarget.title}". This only works when the checkpoint has no assignments.` : ''}
        confirmLabel="Delete checkpoint"
        isPending={deleteMilestoneMutation.isPending}
        onOpenChange={(open) => { if (!open) setDeleteMilestoneTarget(null) }}
        onConfirm={() => {
          if (deleteMilestoneTarget) {
            deleteMilestoneMutation.mutate({ projectId: project.id, milestoneId: deleteMilestoneTarget.id })
          }
        }}
      />

      <ProjectResourcesOverview
        project={project}
        milestones={milestones}
        tasks={tasks}
        resources={resources}
        canManageResources={canManageResources}
        onManageProject={() => setResourceTarget({ type: 'project', id: project.id, label: project.name, eyebrow: 'Project resources' })}
        onManageMilestone={(milestone) => setResourceTarget({ type: 'milestone', id: milestone.id, label: milestone.title, eyebrow: 'Checkpoint resources' })}
        onManageTask={(task) => setResourceTarget({ type: 'task', id: task.id, label: task.title, eyebrow: 'Assignment resources' })}
      />

      <section id="work-board" className="overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink">Work plan</h2>
              <p className="mt-1 text-sm text-muted-foreground">{milestones.length} checkpoint{milestones.length === 1 ? '' : 's'} · {tasks.length} assignment{tasks.length === 1 ? '' : 's'}</p>
            </div>
            {canPlan ? <Button type="button" variant={createMilestoneOpen ? 'outline' : 'default'} size="sm" className="shrink-0" onClick={() => onCreateMilestoneOpenChange(!createMilestoneOpen)}><Plus className="size-4" /> {createMilestoneOpen ? 'Cancel checkpoint' : 'New checkpoint'}</Button> : null}
          </div>
        </div>

        {createMilestoneOpen ? (
          <div className="border-b border-border bg-slate-50/70 p-4 sm:p-5">
            <InlineMilestoneForm projectId={project.id} onSaved={() => onCreateMilestoneOpenChange(false)} onCancel={() => onCreateMilestoneOpenChange(false)} />
          </div>
        ) : null}

        <div>
          {milestones.length > 0 ? (
            <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)]">
              <div className="border-b border-border lg:border-b-0 lg:border-r">
                <div className="border-b border-border bg-paper/70 px-4 py-3 sm:px-5">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Milestones</p>
                </div>
                {milestones.map((milestone, index) => (
                  <MilestoneLedgerSection
                    key={milestone.id}
                    milestone={milestone}
                    index={index}
                    isCurrent={milestone.id === currentMilestoneId}
                    isSelected={milestone.id === selectedMilestone?.id}
                    resources={resourcesForTarget(resources, 'milestone', milestone.id)}
                    canPlan={canPlan}
                    canManageResources={canManageResources}
                    onSelect={() => setSelectedMilestoneId(milestone.id)}
                    onResources={() => setResourceTarget({ type: 'milestone', id: milestone.id, label: milestone.title, eyebrow: 'Checkpoint resources' })}
                    onMoveUp={() => moveMilestoneMutation.mutate({ milestoneId: milestone.id, direction: 'up' })}
                    onMoveDown={() => moveMilestoneMutation.mutate({ milestoneId: milestone.id, direction: 'down' })}
                    onDelete={() => setDeleteMilestoneTarget(milestone)}
                    canMoveUp={index > 0}
                    canMoveDown={index < milestones.length - 1}
                    isMoving={moveMilestoneMutation.isPending}
                    isDeleting={deleteMilestoneMutation.isPending && deleteMilestoneMutation.variables?.milestoneId === milestone.id}
                  />
                ))}
              </div>

              <MilestoneTasksPanel
                milestone={selectedMilestone}
                tasks={selectedTasks}
                taskResources={(task) => resourcesForTarget(resources, 'task', task.id)}
                canCreateAssignment={canCreateAssignments}
                canManageResources={canManageResources}
                onCreateTask={() => {
                  if (selectedMilestone) {
                    onCreateTask(selectedMilestone.id)
                  }
                }}
                onResourcesTask={(task) => setResourceTarget({ type: 'task', id: task.id, label: task.title, eyebrow: 'Assignment resources' })}
              />
            </div>
          ) : null}

          {milestones.length === 0 ? (
            <div className="py-8">
              <EmptyState title="No checkpoints yet" message="Create the first checkpoint to turn this project into an actionable work sequence." />
              {canPlan ? <div className="mt-4 flex justify-center"><Button type="button" onClick={() => onCreateMilestoneOpenChange(true)}><Plus className="size-4" /> Create checkpoint</Button></div> : null}
            </div>
          ) : null}
        </div>
      </section>
    </section>
  )
}

function ProjectResourcesOverview({ project, milestones, tasks, resources, canManageResources, onManageProject, onManageMilestone, onManageTask }: { project: Project; milestones: ProjectMilestone[]; tasks: Task[]; resources: ResourceLink[]; canManageResources: boolean; onManageProject: () => void; onManageMilestone: (milestone: ProjectMilestone) => void; onManageTask: (task: Task) => void }) {
  const projectResources = resourcesForTarget(resources, 'project', project.id)
  const milestoneTargets = milestones.map((milestone) => ({ milestone, resources: resourcesForTarget(resources, 'milestone', milestone.id) })).filter((target) => canManageResources || target.resources.length > 0)
  const taskTargets = tasks.map((task) => ({ task, resources: resourcesForTarget(resources, 'task', task.id) })).filter((target) => target.resources.length > 0)
  const totalResources = resources.length

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground"><Link2 className="size-3.5" /> Resources</p>
            <h2 className="mt-1 font-heading text-2xl font-semibold tracking-tight text-ink">Project references</h2>
            <p className="mt-1 text-sm text-muted-foreground">{totalResources} resource link{totalResources === 1 ? '' : 's'} across this project.</p>
          </div>
          {canManageResources ? <Button type="button" variant="outline" size="sm" onClick={onManageProject}><Plus className="size-4" /> Project resource</Button> : null}
        </div>
      </div>

      <div className="grid divide-y divide-border lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:divide-x lg:divide-y-0">
        <section className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-heading text-lg font-semibold tracking-tight text-ink">Project-level links</h3>
              <p className="text-sm text-muted-foreground">Shared references for the whole project.</p>
            </div>
            {projectResources.length > 0 || canManageResources ? <Button type="button" variant="ghost" size="sm" onClick={onManageProject}>{projectResources.length > 0 ? 'Manage' : 'Add'}</Button> : null}
          </div>
          {projectResources.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {projectResources.map((resource) => <ResourceChip key={resource.id} resource={resource} />)}
            </div>
          ) : <p className="mt-3 text-sm text-muted-foreground">No shared project links yet.</p>}
        </section>

        <section className="p-4 sm:p-5">
          <h3 className="font-heading text-lg font-semibold tracking-tight text-ink">Checkpoint and assignment links</h3>
          <p className="text-sm text-muted-foreground">Manage links where they belong without hunting through the plan.</p>
          <div className="mt-3 max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-white">
            {milestoneTargets.map(({ milestone, resources: milestoneResources }) => (
              <ResourceTargetRow key={milestone.id} label={milestone.title} eyebrow="Checkpoint" count={milestoneResources.length} onManage={() => onManageMilestone(milestone)} />
            ))}
            {taskTargets.map(({ task, resources: taskResources }) => (
              <ResourceTargetRow key={task.id} label={task.title} eyebrow="Assignment" count={taskResources.length} onManage={() => onManageTask(task)} />
            ))}
            {milestoneTargets.length === 0 && taskTargets.length === 0 ? <p className="px-3 py-3 text-sm text-muted-foreground">No checkpoint or assignment links yet.</p> : null}
          </div>
        </section>
      </div>
    </section>
  )
}

function ResourceTargetRow({ label, eyebrow, count, onManage }: { label: string; eyebrow: string; count: number; onManage: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p>
        <p className="truncate text-sm font-semibold text-ink">{label}</p>
      </div>
      <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={onManage}>{count > 0 ? `${count} link${count === 1 ? '' : 's'}` : 'Add'}</Button>
    </div>
  )
}

function InlineMilestoneForm({ projectId, milestone, onSaved, onCancel }: { projectId: string; milestone?: ProjectMilestone; onSaved: () => void; onCancel: () => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(milestone?.title || '')
  const [targetDate, setTargetDate] = useState(milestone?.targetDate || '')
  const [description, setDescription] = useState(milestone?.description || '')
  const mutation = useMutation({
    mutationFn: () => milestone
      ? updateMilestone({ projectId, milestoneId: milestone.id, title: title.trim(), targetDate: targetDate || undefined, description: description.trim() || undefined })
      : createMilestone({ projectId, title: title.trim(), targetDate: targetDate || undefined, description: description.trim() || undefined }),
    onSuccess: () => {
      toast.success(milestone ? 'Checkpoint updated' : 'Checkpoint created')
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMilestones(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      queryClient.invalidateQueries({ queryKey: queryKeys.classes })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      onSaved()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <form className="border-l border-primary/30 py-2 pl-4" onSubmit={(event) => {
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

function MilestoneLedgerSection({ milestone, index, isCurrent, isSelected, resources, canPlan, canManageResources, canMoveUp, canMoveDown, isMoving, isDeleting, onSelect, onResources, onMoveUp, onMoveDown, onDelete }: { milestone: ProjectMilestone; index: number; isCurrent: boolean; isSelected: boolean; resources: ResourceLink[]; canPlan: boolean; canManageResources: boolean; canMoveUp: boolean; canMoveDown: boolean; isMoving: boolean; isDeleting: boolean; onSelect: () => void; onResources: () => void; onMoveUp: () => void; onMoveDown: () => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false)
  const tone = statusTone(milestone.state)
  if (editing) {
    return (
      <section className="border-b border-border bg-violet-50/40 px-4 py-4 last:border-b-0 sm:px-5">
        <InlineMilestoneForm projectId={milestone.projectId} milestone={milestone} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </section>
    )
  }

  return (
    <section id={`checkpoint-${milestone.id}`} className={cn('border-b border-border px-4 py-4 transition-colors last:border-b-0 sm:px-5', isSelected ? 'bg-primary/[0.045]' : isCurrent ? 'bg-primary/[0.02]' : 'hover:bg-slate-50/70')}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <button type="button" className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25" aria-pressed={isSelected} onClick={onSelect}>
          <div className="flex min-w-0 gap-3">
            <span className={cn('mt-0.5 w-9 shrink-0 font-heading text-xl font-semibold tabular-nums', isSelected ? 'text-primary' : 'text-muted-foreground')}>{String(index + 1).padStart(2, '0')}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                <StatusDot tone={tone} small />
                <span>{titleize(milestone.state)}</span>
                {isCurrent ? <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">Current</span> : null}
                {isSelected ? <span className="rounded-full bg-ink px-2 py-0.5 font-semibold text-white">Selected</span> : null}
                <span>{milestoneDateLabel(milestone)}</span>
              </div>
              <h3 className="mt-1 font-heading text-xl font-semibold tracking-tight text-ink">{milestone.title}</h3>
              {milestone.description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{milestone.description}</p> : null}
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
                <span>{milestone.taskCount} assignment{milestone.taskCount === 1 ? '' : 's'}</span>
                <span>{milestone.completedTaskCount} done</span>
                {milestone.pendingReviewCount > 0 ? <span className="text-amber-700">{milestone.pendingReviewCount} waiting review</span> : null}
                {milestone.overdueTaskCount > 0 ? <span className="text-red-700">{milestone.overdueTaskCount} overdue</span> : null}
              </div>
            </div>
          </div>
        </button>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {resources.length > 0 || canManageResources ? <ResourceLinkButton count={resources.length} onClick={onResources} /> : null}
          {canPlan ? <Button type="button" variant="ghost" size="icon" className="size-8" disabled={!canMoveUp || isMoving} onClick={onMoveUp} aria-label={`Move ${milestone.title} up`}><ArrowUp className="size-4" /></Button> : null}
          {canPlan ? <Button type="button" variant="ghost" size="icon" className="size-8" disabled={!canMoveDown || isMoving} onClick={onMoveDown} aria-label={`Move ${milestone.title} down`}><ArrowDown className="size-4" /></Button> : null}
          {canPlan ? <Button type="button" variant="edit" size="icon" className="size-8" onClick={() => setEditing(true)} aria-label={`Edit ${milestone.title}`}><Pencil className="size-4" /></Button> : null}
          {canPlan ? <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" disabled={isDeleting} onClick={onDelete} aria-label={`Delete ${milestone.title}`}><Trash2 className="size-4" /></Button> : null}
        </div>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-primary transition-all duration-700 ease-out" style={{ width: `${milestone.completionPercent}%` }} />
      </div>
    </section>
  )
}

function MilestoneTasksPanel({ milestone, tasks, taskResources, canCreateAssignment, canManageResources, onCreateTask, onResourcesTask }: { milestone?: ProjectMilestone; tasks: Task[]; taskResources: (task: Task) => ResourceLink[]; canCreateAssignment: boolean; canManageResources: boolean; onCreateTask: () => void; onResourcesTask: (task: Task) => void }) {
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)

  if (!milestone) {
    return null
  }

  const visibleTasks = filterTasks(tasks, search)
  const shownTasks = showAll ? visibleTasks : visibleTasks.slice(0, SELECTED_TASK_INITIAL_COUNT)

  return (
    <aside className="bg-white lg:sticky lg:top-6 lg:self-start">
      <header className="border-b border-border px-4 py-4 sm:px-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Selected checkpoint</p>
        <h3 className="mt-1 font-heading text-xl font-semibold tracking-tight text-ink">{milestone.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{tasks.length} assignment{tasks.length === 1 ? '' : 's'} here</p>
        {canCreateAssignment ? <Button type="button" variant="secondary" size="sm" className="mt-3 w-full sm:w-auto" onClick={onCreateTask}><Plus className="size-4" /> Add assignment</Button> : null}
      </header>

      <div className="px-4 py-4 sm:px-5">
        {tasks.length >= 12 ? (
          <label className="relative mb-3 block">
            <span className="sr-only">Search selected checkpoint assignments</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 rounded-full bg-white pl-9 text-sm" value={search} onChange={(event) => { setSearch(event.target.value); setShowAll(false) }} placeholder="Search assignments" />
          </label>
        ) : null}
        {shownTasks.length > 0 ? <div className="divide-y divide-border border-y border-border">{shownTasks.map((task) => <TaskLedgerRow key={task.id} task={task} resources={taskResources(task)} canManageResources={canManageResources} onResources={() => onResourcesTask(task)} />)}</div> : null}
        {tasks.length > 0 && visibleTasks.length === 0 ? <div className="border-y border-dashed border-border px-4 py-7 text-center"><p className="font-heading text-base font-semibold text-ink">No matching assignments</p><p className="mt-1 text-sm text-muted-foreground">Try another title, assignee, state, or deadline.</p></div> : null}
        {tasks.length === 0 ? (
          <div className="border-y border-dashed border-border px-4 py-7 text-center">
            <p className="font-heading text-base font-semibold text-ink">No assignments yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add the first task for this checkpoint.</p>
          </div>
        ) : null}
        {visibleTasks.length > SELECTED_TASK_INITIAL_COUNT ? (
          <div className="mt-3 flex flex-col gap-2 border border-dashed border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>Showing {shownTasks.length} of {visibleTasks.length} assignments.</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show fewer' : 'Show all'}</Button>
          </div>
        ) : null}
      </div>
    </aside>
  )
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
  const assigneeLabel = task.assignees.length > 0 ? task.assignees.map((assignee) => assignee.fullName).join(', ') : 'No assignees'
  return (
    <article className="py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={assignmentState.key} tone={assignmentState.tone} />
            <span className="text-xs text-muted-foreground">{taskDeadlineLabel(task)}</span>
            {task.pendingReviewCount > 0 ? <span className="text-xs font-semibold text-amber-700">{task.pendingReviewCount} waiting review</span> : null}
          </div>
          <Link className="mt-2 block font-heading text-base font-semibold tracking-tight text-ink underline-offset-4 hover:text-primary hover:underline" to={`/workspace/projects/${task.projectId}/tasks/${task.id}`}>{task.title}</Link>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{assigneeLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">{task.progressUpdateCount} submission{task.progressUpdateCount === 1 ? '' : 's'}</p>
        </div>
        {resources.length > 0 || canManageResources ? <div className="shrink-0 sm:pt-1"><ResourceLinkButton count={resources.length} onClick={onResources} /></div> : null}
      </div>
    </article>
  )
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

function StatusDot({ tone, small }: { tone: Tone; small?: boolean }) {
  const color = {
    slate: 'bg-slate-400 ring-slate-200',
    blue: 'bg-primary ring-blue-100',
    teal: 'bg-secondary ring-teal-100',
    amber: 'bg-amber-500 ring-amber-100',
    red: 'bg-destructive ring-red-100',
  }[tone]
  return <span className={small ? `block size-2.5 rounded-full ring-4 ${color}` : `mt-1 block size-3 rounded-full ring-4 ${color}`} />
}

function ProjectTeamPopover({ project, members, canManage, isLoading, isError, onRetry }: { project: Project; members: ProjectMember[]; canManage: boolean; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  const queryClient = useQueryClient()
  const [memberSearch, setMemberSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [removeMemberTarget, setRemoveMemberTarget] = useState<ProjectMember | null>(null)
  const removeMutation = useMutation({
    mutationFn: removeProjectMember,
    onSuccess: () => {
      toast.success('Member removed')
      setRemoveMemberTarget(null)
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(project.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(project.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.project(project.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      queryClient.invalidateQueries({ queryKey: queryKeys.classes })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const roleMutation = useMutation({
    mutationFn: updateProjectMember,
    onSuccess: (member) => {
      toast.success(member.memberRole === 'leader' ? `${member.fullName} is now a leader` : `${member.fullName} is now a member`)
      queryClient.setQueryData<ProjectMember[]>(queryKeys.projectMembers(project.id), (current) => updateMemberRoleCache(current, member))
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(project.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.project(project.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      queryClient.invalidateQueries({ queryKey: queryKeys.classes })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const sortedMembers = sortProjectMembers(members)
  const visibleMembers = filterProjectMembers(sortedMembers, memberSearch)
  const shownMembers = visibleMembers.slice(0, TEAM_MEMBER_VISIBLE_COUNT)
  const leaderCount = members.filter((member) => member.memberRole === 'leader').length
  const leaderLabel = leaderCount > 0 ? 'Leader set' : 'No leader'
  const showSearch = members.length >= 8 || memberSearch.trim().length > 0
  const teamCountLabel = members.length > 99 ? '99+' : String(members.length)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-transparent px-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25" aria-label={`Open project team, ${members.length} student${members.length === 1 ? '' : 's'}`} title="Project team">
          <Users className="size-4" />
          <span>Team</span>
          <span className="text-xs font-bold text-ink">{teamCountLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border-border bg-card p-0 shadow-xl shadow-slate-950/10">
        <section aria-label="Project team">
          <header className="flex items-center justify-between gap-3 border-b border-border bg-white px-4 py-3">
            <div className="min-w-0 transition-opacity duration-200">
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-lg font-semibold tracking-tight text-ink">Team</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-muted-foreground">{members.length}</span>
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
                        <p className="truncate text-sm font-semibold text-ink">{project.supervisorName}</p>
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
                            <AddProjectMemberForm projectId={project.id} />
                          </div>
                        ) : null}
                      </div>
                    </section>
                  ) : null}

                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-heading text-base font-semibold tracking-tight text-ink">Students</h3>
                        <p className="text-xs text-muted-foreground">{members.length} active member{members.length === 1 ? '' : 's'}</p>
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
                            isSavingRole={roleMutation.isPending}
                            isRemoving={removeMutation.isPending && removeMutation.variables?.memberId === member.id}
                            onToggleRole={() => roleMutation.mutate({ projectId: project.id, memberId: member.id, memberRole: member.memberRole === 'leader' ? 'member' : 'leader' })}
                            onRemove={() => setRemoveMemberTarget(member)}
                          />
                        )) : <p className="px-3 py-3 text-sm text-muted-foreground">No matching members.</p>}
                        {visibleMembers.length > TEAM_MEMBER_VISIBLE_COUNT ? <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Showing {TEAM_MEMBER_VISIBLE_COUNT} of {visibleMembers.length}. Search by name, email, or role to narrow the team.</p> : null}
                      </div>
                    ) : <EmptyState title="No students yet" message="Add existing students to give them access to this project." />}
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
        description={removeMemberTarget ? `Remove ${removeMemberTarget.fullName} from this project. Their assignments in this project will also be removed.` : ''}
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

function ProjectMemberRow({ member, canManage, isSavingRole, isRemoving, onToggleRole, onRemove }: { member: ProjectMember; canManage: boolean; isSavingRole: boolean; isRemoving: boolean; onToggleRole: () => void; onRemove: () => void }) {
  const roleAction = member.memberRole === 'leader' ? 'Clear project leader' : 'Make project leader'

  return (
    <article className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary/10 font-heading text-xs font-semibold text-secondary">{initials(member.fullName)}</span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold text-ink">{member.fullName}</p>
            {member.memberRole === 'leader' ? <StatusBadge value="leader" tone="teal" /> : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
          <p className="text-xs text-muted-foreground">Joined {formatDate(member.joinedAt)}</p>
        </div>
      </div>
      {canManage ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`${roleAction}: ${member.fullName}`} title={roleAction} disabled={isSavingRole} onClick={onToggleRole}>
            <Star className={cn('size-4', member.memberRole === 'leader' ? 'fill-primary text-primary' : 'text-muted-foreground')} />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label={`Remove ${member.fullName} from project`} title="Remove from project" disabled={isRemoving} onClick={onRemove}>
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
  return members.filter((member) => `${member.fullName} ${member.email} ${member.memberRole}`.toLowerCase().includes(query))
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'
}

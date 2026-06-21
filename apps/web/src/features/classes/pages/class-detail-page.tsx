import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowUpRight, Plus, Search, X } from 'lucide-react'
import { useDeferredValue, useId, useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { ForbiddenState } from '@/components/shared/forbidden-state'
import { LoadingState } from '@/components/shared/loading-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field as BaseField, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getClass, linkClassProject, updateClass } from '@/features/classes/api'
import { getProjects, updateProject } from '@/features/projects/api'
import { projectNeedsAttention } from '@/features/projects/attention'
import { CreateProjectDialog } from '@/features/projects/components/create-project-dialog'
import { ProjectCard } from '@/features/projects/components/project-card'
import { getErrorMessage, isForbiddenError } from '@/lib/axios'
import { projectAcceptsMetadataChanges } from '@/lib/permissions'
import { refreshClassDataOnStaleError, refreshProjectDataOnStaleError } from '@/lib/query-invalidation'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import type { ClassFolder, ClassFolderColor, Project } from '@/types/api'

const classEditSchema = z.object({
  title: z.string().trim().min(1, 'Folder name is required.'),
  color: z.enum(['blue', 'teal', 'amber', 'rose', 'violet', 'slate']),
  description: z.string().optional(),
  status: z.enum(['active', 'archived']),
})

const FOLDER_PROJECT_INITIAL_COUNT = 36

type ClassEditValues = z.infer<typeof classEditSchema>

export function ClassDetailPage() {
  const { classId } = useParams()
  const resolvedClassId = classId || ''
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [editOpen, setEditOpen] = useState(false)
  const [candidateSearch, setCandidateSearch] = useState('')
  const deferredCandidateSearch = useDeferredValue(candidateSearch)
  const candidateQuery = deferredCandidateSearch.trim()
  const classQuery = useQuery({ queryKey: queryKeys.class(resolvedClassId), queryFn: () => getClass(resolvedClassId), enabled: resolvedClassId.length > 0 })
  const projectsQuery = useQuery({
    queryKey: [...queryKeys.classProjectCandidates(resolvedClassId), candidateQuery],
    queryFn: () => getProjects({ limit: 25, unassigned: true, search: candidateQuery || undefined, excludeArchived: true }),
    placeholderData: (previousData) => previousData,
    enabled: resolvedClassId.length > 0 && classQuery.data?.classFolder.status === 'active',
  })
  const linkMutation = useMutation({
    mutationFn: linkClassProject,
    onSuccess: (_detail, variables) => {
      toast.success('Project added to folder')
      queryClient.invalidateQueries({ queryKey: queryKeys.class(resolvedClassId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.classes })
      queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.classProjectCandidates(resolvedClassId) })
    },
    onError: (error, variables) => {
      toast.error(getErrorMessage(error))
      refreshClassDataOnStaleError(queryClient, resolvedClassId, error)
      refreshProjectDataOnStaleError(queryClient, variables.projectId, error)
    },
  })
  const unlinkMutation = useMutation({
    mutationFn: updateProject,
    onSuccess: (project, variables) => {
      toast.success('Project removed from folder')
      queryClient.invalidateQueries({ queryKey: queryKeys.class(resolvedClassId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.classes })
      queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.classProjectCandidates(resolvedClassId) })
      if (project.classId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.class(project.classId) })
      }
    },
    onError: (error, variables) => {
      toast.error(getErrorMessage(error))
      refreshClassDataOnStaleError(queryClient, resolvedClassId, error)
      refreshProjectDataOnStaleError(queryClient, variables.projectId, error)
    },
  })

  if (!classId) {
    return <Navigate to="/workspace" replace />
  }
  if (classQuery.isLoading) {
    return <LoadingState label="Loading folder" />
  }
  if (classQuery.isError && isForbiddenError(classQuery.error)) {
    return <ForbiddenState eyebrow="Workspace folders" title="Folder is restricted" message="You can only open folders you manage." />
  }
  if (classQuery.isError || !classQuery.data) {
    return <ErrorState message="Folder could not be loaded." onRetry={() => void classQuery.refetch()} />
  }

  const item = classQuery.data.classFolder
  const linkedIds = new Set(classQuery.data.projects.map((project) => project.id))
  const folderProjects = sortProjectsByAttention(classQuery.data.projects)
  const availableProjects = sortProjectsByAttention((projectsQuery.data || []).filter((project) => !linkedIds.has(project.id) && !project.classId && project.supervisorId === item.ownerTeacherId && project.status !== 'archived'))
  const candidateResultsAreStale = candidateSearch.trim() !== candidateQuery || projectsQuery.isPlaceholderData
  const unlinkingProjectId = unlinkMutation.isPending ? unlinkMutation.variables?.projectId : undefined
  const canCreateProjectInClass = user?.id === item.ownerTeacherId
  const folderAcceptsProjects = item.status === 'active'
  const palette = folderPalette(item.color)

  return (
    <div className="relative isolate">
      <div className={cn('pointer-events-none fixed inset-y-0 left-0 right-0 z-0 lg:left-64', palette.wash)} aria-hidden="true" />
      <div className={cn('pointer-events-none fixed left-0 right-0 top-0 z-0 h-72 lg:left-64', palette.glow)} aria-hidden="true" />
      <div className="relative z-10 space-y-6">
        <Dialog open={editOpen} onOpenChange={setEditOpen} title="Edit folder" description="Change the folder label, color, and status.">
          <EditClassForm item={item} onUpdated={() => setEditOpen(false)} />
        </Dialog>

        <header className="space-y-4 border-b border-black/5 pb-5">
          <Button asChild variant="ghost" className="-ml-2 h-9 px-2 text-muted-foreground hover:bg-accent hover:text-primary">
            <Link to="/workspace"><ArrowLeft className="size-4" /> Back to workspace</Link>
          </Button>

          <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-4xl font-semibold tracking-tight text-ink md:text-5xl">{item.title}</h1>
                {item.status !== 'active' ? <StatusBadge value={item.status} /> : null}
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{item.description || 'Drop related projects here to keep the workspace easy to scan.'}</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span className="font-semibold text-ink">{item.projectCount} project{item.projectCount === 1 ? '' : 's'}</span>
                <span>Owner: {item.ownerTeacherName}</span>
                {item.pendingReviewCount > 0 ? <span className="font-semibold text-destructive">{item.pendingReviewCount} review{item.pendingReviewCount === 1 ? '' : 's'}</span> : null}
                {item.overdueTaskCount > 0 ? <span className="font-semibold text-destructive">{item.overdueTaskCount} overdue</span> : null}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
              <Button type="button" variant="edit" onClick={() => setEditOpen(true)}>Edit folder</Button>
              {canCreateProjectInClass && folderAcceptsProjects ? <CreateProjectDialog classId={resolvedClassId} onCreated={(project) => navigate(`/workspace/projects/${project.id}`)} /> : null}
            </div>
          </section>
        </header>

        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight text-ink">Projects in this folder</h2>
              <p className="mt-1 text-sm text-muted-foreground">Open a project for assignments, submissions, resources, and members, or remove it from this folder.</p>
            </div>
            {folderAcceptsProjects ? (
              <AttachProjectControl
                projects={availableProjects}
                search={candidateSearch}
                onSearchChange={setCandidateSearch}
                isLoading={projectsQuery.isLoading}
                isRefreshing={projectsQuery.isFetching && Boolean(projectsQuery.data)}
                isStaleResults={candidateResultsAreStale}
                isError={projectsQuery.isError}
                isSubmitting={linkMutation.isPending}
                onRetry={() => void projectsQuery.refetch()}
                onSubmit={(projectId) => linkMutation.mutate({ classId: resolvedClassId, projectId })}
              />
            ) : <p className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">Reactivate this folder before adding projects.</p>}
          </div>
          <ProjectGroupCards projects={folderProjects} unlinkingProjectId={unlinkingProjectId} onUnlink={(project) => unlinkMutation.mutate({ projectId: project.id, classId: '' })} />
        </section>
      </div>
    </div>
  )
}

function EditClassForm({ item, onUpdated }: { item: ClassFolder; onUpdated: () => void }) {
  const queryClient = useQueryClient()
  const formId = useId()
  const form = useForm<ClassEditValues>({
    resolver: zodResolver(classEditSchema),
    defaultValues: {
      title: item.title,
      color: item.color,
      description: item.description || '',
      status: item.status,
    },
  })
  const status = useWatch({ control: form.control, name: 'status' })
  const color = useWatch({ control: form.control, name: 'color' })
  const titleId = `${formId}-title`
  const statusId = `${formId}-status`
  const descriptionId = `${formId}-description`
  const mutation = useMutation({
    mutationFn: updateClass,
    onSuccess: (updated) => {
      toast.success('Folder updated')
      invalidateClassWorkspaceQueries(queryClient, updated.id)
      onUpdated()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      refreshClassDataOnStaleError(queryClient, item.id, error)
    },
  })

  return (
    <form className="space-y-4 pb-5" onSubmit={form.handleSubmit((values) => mutation.mutate({ classId: item.id, ...cleanClassEditValues(values) }))}>
      <Field id={titleId} label="Folder name" error={form.formState.errors.title?.message}>
        <Input id={titleId} {...form.register('title')} />
      </Field>
      <div className="grid gap-4 md:grid-cols-[1fr_14rem]">
        <ColorPicker value={color} onChange={(value) => form.setValue('color', value, { shouldDirty: true, shouldValidate: true })} />
        <Field id={statusId} label="Status">
          <Select value={status} onValueChange={(value) => form.setValue('status', value as ClassEditValues['status'], { shouldDirty: true, shouldValidate: true })}>
            <SelectTrigger id={statusId}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field id={descriptionId} label="Description">
        <Textarea id={descriptionId} {...form.register('description')} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save folder'}</Button>
      </div>
    </form>
  )
}

function AttachProjectControl({ projects, search, onSearchChange, isLoading, isRefreshing, isStaleResults, isError, isSubmitting, onRetry, onSubmit }: { projects: Project[]; search: string; onSearchChange: (value: string) => void; isLoading: boolean; isRefreshing: boolean; isStaleResults: boolean; isError: boolean; isSubmitting: boolean; onRetry: () => void; onSubmit: (projectId: string) => void }) {
  const listId = useId()
  const hasQuery = search.trim().length > 0
  const visibleProjects = hasQuery && !isStaleResults ? filterProjectCandidates(projects, search).slice(0, 6) : []
  const disabled = isLoading || isSubmitting
  const placeholder = isLoading ? 'Loading projects' : 'Search standalone projects'

  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input role="combobox" aria-autocomplete="list" aria-expanded={hasQuery && !isError} aria-controls={listId} aria-label="Search standalone projects" className="h-9 rounded-full bg-white pl-9 pr-9 text-sm shadow-sm" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={placeholder} disabled={disabled || isError} />
      {isError ? (
        <Button type="button" variant="ghost" size="sm" className="absolute right-1 top-1/2 h-7 -translate-y-1/2 rounded-full px-3 text-xs" onClick={onRetry}>Retry</Button>
      ) : null}
      {hasQuery && !isError ? (
        <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-7 -translate-y-1/2 rounded-full text-muted-foreground" aria-label="Clear project search" onClick={() => onSearchChange('')}>
          <X className="size-3.5" />
        </Button>
      ) : null}
      {!isError && hasQuery ? (
        <div id={listId} role="listbox" aria-label="Standalone project matches" className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-20 overflow-hidden rounded-xl border border-border bg-white shadow-panel">
          {isRefreshing || isStaleResults ? <p className="border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">Searching...</p> : null}
          {!isStaleResults && visibleProjects.length > 0 ? (
            visibleProjects.map((project) => <ProjectCandidateOption key={project.id} project={project} isSubmitting={isSubmitting} onSubmit={() => { onSubmit(project.id); onSearchChange('') }} />)
          ) : !isStaleResults ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No matching standalone projects.</p>
          ) : null}
          {!isStaleResults && projects.length > visibleProjects.length ? <p className="border-t border-border px-3 py-2 text-xs font-medium text-muted-foreground">Showing best matches. Keep typing to narrow.</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function ProjectCandidateOption({ project, isSubmitting, onSubmit }: { project: Project; isSubmitting: boolean; onSubmit: () => void }) {
  return (
    <button type="button" role="option" aria-selected="false" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-ink transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50" title={`Add ${project.name}`} disabled={isSubmitting} onMouseDown={(event) => event.preventDefault()} onClick={onSubmit}>
      <Plus className="size-3.5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate">{project.name}</span>
      <span className="text-xs font-medium text-muted-foreground">Add</span>
    </button>
  )
}

function ProjectGroupCards({ projects, unlinkingProjectId, onUnlink }: { projects: Project[]; unlinkingProjectId?: string; onUnlink: (project: Project) => void }) {
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const visibleProjects = filterProjectCandidates(projects, search)
  const shownProjects = showAll ? visibleProjects : visibleProjects.slice(0, FOLDER_PROJECT_INITIAL_COUNT)

  if (projects.length === 0) {
    return <EmptyState title="This folder is empty" message="Create a project here or move an existing project into this folder." />
  }

  return (
    <div className="space-y-4">
      {projects.length >= 12 ? (
        <label className="relative block max-w-md">
          <span className="sr-only">Search folder projects</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="rounded-full bg-white pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setShowAll(false) }} placeholder="Search projects in this folder" />
        </label>
      ) : null}
      {visibleProjects.length === 0 ? <EmptyState title="No matching projects" message="Try another project name, topic, supervisor, or status." /> : null}
      {visibleProjects.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {shownProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              actions={(
                <>
                  <Button asChild variant="secondary" size="sm" className="bg-white/90 shadow-sm" title="Open project">
                    <Link to={`/workspace/projects/${project.id}`} aria-label={`Open ${project.name}`}>
                      Open
                      <ArrowUpRight className="size-4" />
                    </Link>
                  </Button>
                  {projectAcceptsMetadataChanges(project) ? (
                    <Button type="button" variant="outline" size="icon" className="size-8 bg-white/90 shadow-sm" title="Remove from folder" aria-label={`Remove ${project.name} from folder`} disabled={unlinkingProjectId === project.id} onClick={() => onUnlink(project)}>
                      <X className="size-4" />
                    </Button>
                  ) : null}
                </>
              )}
            />
          ))}
        </div>
      ) : null}
      {visibleProjects.length > FOLDER_PROJECT_INITIAL_COUNT ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border bg-white/70 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Showing {shownProjects.length} of {visibleProjects.length} projects.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show fewer' : 'Show all'}</Button>
        </div>
      ) : null}
    </div>
  )
}

function Field({ id, label, error, children }: { id?: string; label: string; error?: string; children: ReactNode }) {
  return <BaseField><FieldLabel htmlFor={id}>{label}</FieldLabel>{children}<FieldError message={error} /></BaseField>
}

function invalidateClassWorkspaceQueries(queryClient: ReturnType<typeof useQueryClient>, classId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.classes })
  queryClient.invalidateQueries({ queryKey: queryKeys.class(classId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.projects })
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
  queryClient.invalidateQueries({ queryKey: queryKeys.classProjectCandidates(classId) })
}

function cleanClassEditValues(values: ClassEditValues) {
  return {
    title: values.title.trim(),
    color: values.color,
    description: values.description?.trim() || '',
    status: values.status,
  }
}

function filterProjectCandidates(projects: Project[], search: string) {
  const query = search.trim().toLowerCase()
  if (!query) {
    return projects
  }
  return projects.filter((project) => [project.name, project.topic, project.description, project.classTitle, project.supervisorName].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)))
}

function sortProjectsByAttention(projects: Project[]) {
  return [...projects].sort((a, b) => projectAttentionScore(b) - projectAttentionScore(a) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

function projectAttentionScore(project: Project) {
  return project.pendingReviewCount * 10 + project.overdueTaskCount * 5 + (projectNeedsAttention(project) ? 1 : 0)
}

function ColorPicker({ value, onChange }: { value: ClassFolderColor; onChange: (value: ClassFolderColor) => void }) {
  const labelId = useId()
  return (
    <BaseField>
      <FieldLabel id={labelId}>Folder color</FieldLabel>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby={labelId}>
        {folderColors.map((color) => {
          const palette = folderPalette(color)
          return (
            <button key={color} type="button" role="radio" aria-checked={value === color} className={cn('rounded-xl border px-3 py-2 text-left text-xs font-bold capitalize transition', palette.swatch, value === color ? 'ring-2 ring-primary ring-offset-2' : 'opacity-80 hover:opacity-100')} onClick={() => onChange(color)}>
              {color}
            </button>
          )
        })}
      </div>
    </BaseField>
  )
}

const folderColors: ClassFolderColor[] = ['blue', 'teal', 'amber', 'rose', 'violet', 'slate']

function folderPalette(color: ClassFolderColor) {
  switch (color) {
    case 'teal':
      return { wash: 'bg-gradient-to-br from-teal-50/55 via-transparent to-emerald-50/50', glow: 'bg-gradient-to-b from-teal-100/45 to-transparent', swatch: 'border-teal-200 bg-teal-100 text-teal-800' }
    case 'amber':
      return { wash: 'bg-gradient-to-br from-amber-50/55 via-transparent to-orange-50/50', glow: 'bg-gradient-to-b from-amber-100/45 to-transparent', swatch: 'border-amber-200 bg-amber-100 text-amber-800' }
    case 'rose':
      return { wash: 'bg-gradient-to-br from-rose-50/55 via-transparent to-pink-50/50', glow: 'bg-gradient-to-b from-rose-100/45 to-transparent', swatch: 'border-rose-200 bg-rose-100 text-rose-800' }
    case 'violet':
      return { wash: 'bg-gradient-to-br from-violet-50/55 via-transparent to-indigo-50/50', glow: 'bg-gradient-to-b from-violet-100/45 to-transparent', swatch: 'border-violet-200 bg-violet-100 text-violet-800' }
    case 'slate':
      return { wash: 'bg-gradient-to-br from-slate-100/60 via-transparent to-slate-50/55', glow: 'bg-gradient-to-b from-slate-200/40 to-transparent', swatch: 'border-slate-300 bg-slate-200 text-slate-800' }
    case 'blue':
    default:
      return { wash: 'bg-gradient-to-br from-blue-50/55 via-transparent to-cyan-50/50', glow: 'bg-gradient-to-b from-blue-100/45 to-transparent', swatch: 'border-blue-200 bg-blue-100 text-blue-800' }
  }
}

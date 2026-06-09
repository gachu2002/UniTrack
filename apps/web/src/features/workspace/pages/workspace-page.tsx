import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Pencil, Plus, RotateCcw, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { LoadingState } from '@/components/shared/loading-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field as BaseField, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createClass, getClasses, updateClass } from '@/features/classes/api'
import { getProjects } from '@/features/projects/api'
import { projectNeedsAttention } from '@/features/projects/attention'
import { CreateProjectDialog } from '@/features/projects/components/create-project-dialog'
import { ProjectCardGrid } from '@/features/projects/components/project-card'
import { getErrorMessage } from '@/lib/axios'
import { canCreateProjects } from '@/lib/permissions'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import type { ClassFolderColor, CourseSection, Project } from '@/types/api'

const classSchema = z.object({
  title: z.string().trim().min(1, 'Folder name is required.'),
  color: z.enum(['blue', 'teal', 'amber', 'rose', 'violet', 'slate']),
  description: z.string().optional(),
  status: z.enum(['active', 'archived']),
})

type ClassValues = z.infer<typeof classSchema>

const FOLDER_SHELF_INITIAL_COUNT = 24

export function WorkspacePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [classOpen, setClassOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [projectSearch, setProjectSearch] = useState('')
  const projectsQuery = useQuery({ queryKey: queryKeys.projects, queryFn: () => getProjects({ limit: 200 }) })
  const classesQuery = useQuery({ queryKey: queryKeys.classes, queryFn: getClasses, enabled: user?.role === 'teacher' || user?.role === 'admin' })
  const canCreate = canCreateProjects(user)

  if (projectsQuery.isLoading || classesQuery.isLoading) {
    return <LoadingState label="Loading workspace" />
  }
  if (projectsQuery.isError) {
    return <ErrorState message="Workspace could not be loaded." onRetry={() => void projectsQuery.refetch()} />
  }
  if (classesQuery.isError) {
    return <ErrorState message="Folders could not be loaded." onRetry={() => void classesQuery.refetch()} />
  }

  const projects = projectsQuery.data || []
  const classes = canCreate ? classesQuery.data || [] : []
  const unassignedProjects = sortByAttention(projects.filter((project) => !project.classId))
  const visibleStandaloneProjects = filterProjects(canCreate ? unassignedProjects : sortByAttention(projects), projectSearch)
  const visibleClasses = filterClasses(classes, search)
  const activeClasses = sortClasses(visibleClasses.filter((item) => item.status === 'active'))
  const archivedClasses = sortClasses(visibleClasses.filter((item) => item.status === 'archived'))
  const hasFolderSearch = search.trim().length > 0

  return (
    <div className="space-y-8">
      <Dialog open={classOpen} onOpenChange={setClassOpen} title="New folder" description="Create a colored folder for related projects.">
        <ClassForm
          onCreated={(item) => {
            setClassOpen(false)
            queryClient.invalidateQueries({ queryKey: queryKeys.classes })
            navigate(`/workspace/classes/${item.id}`)
          }}
        />
      </Dialog>

      <section className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-ink md:text-5xl">Workspace</h1>
        </div>
        {canCreate ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setClassOpen(true)}>
              <Plus className="size-4" /> New folder
            </Button>
            <CreateProjectDialog onCreated={(project) => navigate(`/workspace/projects/${project.id}`)} />
          </div>
        ) : null}
      </section>

      {canCreate ? (
        <section className="space-y-5 rounded-[1.65rem] border border-border bg-card/70 p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink">Project folders</h2>
              <p className="mt-1 text-sm text-muted-foreground">Active folders stay in front. Archived folders are kept below for reference.</p>
            </div>
            <div className="flex flex-col gap-3 md:items-end">
              <label className="relative block w-full md:w-80">
                <span className="sr-only">Search folders</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="rounded-full bg-white pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search folders" />
              </label>
            </div>
          </div>

          {classes.length === 0 ? <EmptyState title="No folders yet" message="Create a folder when projects need grouping." /> : null}
          {classes.length > 0 ? (
            <div className="space-y-6">
              <FolderShelf title="Active folders" count={activeClasses.length} description="Current project folders for daily supervision." items={activeClasses} emptyTitle={hasFolderSearch ? 'No active matches' : 'No active folders'} emptyMessage={hasFolderSearch ? 'Try another search term or review archived folders below.' : 'Reactivate an archived folder or create a new one.'} />
              {(archivedClasses.length > 0 || hasFolderSearch) ? <FolderShelf title="Archived folders" count={archivedClasses.length} description="Older folders kept out of the daily workspace." items={archivedClasses} emptyTitle={hasFolderSearch ? 'No archived matches' : 'No archived folders'} emptyMessage={hasFolderSearch ? 'Try another search term or clear the search.' : 'Archived folders will appear here after you archive one.'} muted /> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-4 rounded-[1.65rem] border border-border bg-paper/70 p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink">{canCreate ? 'Standalone projects' : 'Projects'}</h2>
            {canCreate ? <p className="mt-1 text-sm text-muted-foreground">Projects that are not inside a folder yet.</p> : null}
          </div>
          <label className="relative block w-full md:w-80">
            <span className="sr-only">Search projects</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="rounded-full bg-white pl-9" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search projects" />
          </label>
        </div>
        {projects.length >= 200 ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Showing up to 200 projects. Use search or folders to narrow the list.</p> : null}
        <ProjectCardGrid projects={visibleStandaloneProjects} showContext emptyTitle={projectSearch.trim() ? 'No matching projects' : canCreate ? 'No standalone projects' : 'No projects yet'} emptyMessage={projectSearch.trim() ? 'Try another project name, topic, supervisor, or folder.' : canCreate ? 'Every project is already inside a folder, or no projects exist yet.' : 'Projects appear after a teacher adds your account.'} />
      </section>
    </div>
  )
}

function FolderShelf({ title, count, description, items, emptyTitle, emptyMessage, muted = false }: { title: string; count: number; description: string; items: CourseSection[]; emptyTitle: string; emptyMessage: string; muted?: boolean }) {
  const [showAll, setShowAll] = useState(false)
  const visibleItems = showAll ? items : items.slice(0, FOLDER_SHELF_INITIAL_COUNT)

  return (
    <section className={cn('space-y-4', muted ? 'pt-2' : '')}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-xl font-semibold tracking-tight text-ink">{title}</h3>
            <span className="rounded-full border border-border bg-paper px-2.5 py-1 text-xs font-bold text-muted-foreground">{count}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className={cn('hidden h-px flex-1 sm:block', muted ? 'bg-slate-200' : 'bg-primary/15')} />
      </div>
      {items.length === 0 ? <EmptyState title={emptyTitle} message={emptyMessage} /> : <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{visibleItems.map((item) => <ClassFolderCard key={item.id} item={item} />)}</div>}
      {items.length > FOLDER_SHELF_INITIAL_COUNT ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border bg-white/70 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Showing {visibleItems.length} of {items.length} folders.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show fewer' : 'Show all'}</Button>
        </div>
      ) : null}
    </section>
  )
}

function ClassFolderCard({ item }: { item: CourseSection }) {
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const hasAttention = item.pendingReviewCount > 0 || item.overdueTaskCount > 0
  const isArchived = item.status === 'archived'
  const palette = folderPalette(item.color)
  const statusMutation = useMutation({
    mutationFn: updateClass,
    onSuccess: (updated) => {
      toast.success(updated.status === 'archived' ? 'Folder archived' : 'Folder reactivated')
      invalidateClassWorkspaceQueries(queryClient, updated.id)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <article className={cn('group relative pt-3', isArchived ? 'opacity-75' : '')}>
      <Dialog open={editOpen} onOpenChange={setEditOpen} title="Edit folder" description="Update the folder label, color, notes, and lifecycle state.">
        <ClassEditForm item={item} onUpdated={() => setEditOpen(false)} />
      </Dialog>
      <div className={cn('absolute left-0 top-0 h-7 w-28 rounded-t-md rounded-br-sm border border-black/5 shadow-sm transition duration-200 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-focus-within:-translate-y-0.5', palette.tab)} />
      <div className={cn('relative min-h-48 overflow-hidden rounded-[1.35rem] rounded-tl-[0.9rem] border shadow-sm ring-1 ring-transparent transition duration-200 group-hover:shadow-panel group-hover:ring-primary/15 group-focus-within:ring-primary/20', palette.card)}>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.86),transparent_48%)]" />
        <div className="relative flex min-h-48 flex-col justify-between gap-5 p-5">
          <Link to={`/workspace/classes/${item.id}`} className="min-w-0 rounded-lg pr-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="line-clamp-1 font-heading text-xl font-semibold tracking-tight text-ink transition-colors group-hover:text-primary group-focus-within:text-primary">{item.title}</h3>
                {isArchived ? <StatusBadge value="archived" /> : null}
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">{item.description || 'Folder for related projects'}</p>
            </div>
          </Link>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-white/85 px-2.5 py-1 font-semibold text-ink shadow-sm ring-1 ring-white/80">{item.projectCount} project{item.projectCount === 1 ? '' : 's'}</span>
            {item.pendingReviewCount > 0 ? <span className="rounded-full bg-amber-200 px-2.5 py-1 font-semibold text-amber-950 shadow-sm ring-1 ring-amber-300/50">{item.pendingReviewCount} review</span> : null}
            {item.overdueTaskCount > 0 ? <span className="rounded-full bg-red-100 px-2.5 py-1 font-semibold text-red-700 shadow-sm ring-1 ring-red-200">{item.overdueTaskCount} overdue</span> : null}
            {!hasAttention ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-200/70">steady</span> : null}
          </div>

          <div className="absolute right-4 top-4 flex shrink-0 items-start gap-1.5">
            <Button type="button" variant="edit" size="icon" className="size-8" aria-label="Edit folder" title="Edit folder" onClick={() => setEditOpen(true)}><Pencil className="size-3.5" /></Button>
            <Button type="button" variant={isArchived ? 'secondary' : 'ghost'} size="icon" className="size-8 bg-white/70 shadow-sm" aria-label={isArchived ? 'Reactivate folder' : 'Archive folder'} title={isArchived ? 'Reactivate folder' : 'Archive folder'} disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ classId: item.id, status: isArchived ? 'active' : 'archived' })}>
              {isArchived ? <RotateCcw className="size-3.5" /> : <Archive className="size-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </article>
  )
}

function ClassForm({ onCreated }: { onCreated: (item: CourseSection) => void }) {
  const form = useForm<ClassValues>({ resolver: zodResolver(classSchema), defaultValues: { title: '', color: 'blue', description: '', status: 'active' } })
  const status = useWatch({ control: form.control, name: 'status' })
  const color = useWatch({ control: form.control, name: 'color' })
  const mutation = useMutation({
    mutationFn: createClass,
    onSuccess: (item) => {
      toast.success('Folder created')
      onCreated(item)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <form className="space-y-4 pb-5" onSubmit={form.handleSubmit((values) => mutation.mutate(cleanClassValues(values)))}>
      <Field label="Folder name" error={form.formState.errors.title?.message}><Input placeholder="Capstone projects" {...form.register('title')} /></Field>
      <div className="grid gap-4 md:grid-cols-[1fr_14rem]">
        <ColorPicker value={color} onChange={(value) => form.setValue('color', value, { shouldDirty: true, shouldValidate: true })} />
        <Field label="Status">
          <Select value={status} onValueChange={(value) => form.setValue('status', value as ClassValues['status'], { shouldDirty: true, shouldValidate: true })}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Description"><Textarea placeholder="Optional notes for this folder." {...form.register('description')} /></Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Creating...' : 'Create folder'}</Button>
      </div>
    </form>
  )
}

function ClassEditForm({ item, onUpdated }: { item: CourseSection; onUpdated: () => void }) {
  const queryClient = useQueryClient()
  const form = useForm<ClassValues>({ resolver: zodResolver(classSchema), defaultValues: { title: item.title, color: item.color, description: item.description || '', status: item.status } })
  const status = useWatch({ control: form.control, name: 'status' })
  const color = useWatch({ control: form.control, name: 'color' })
  const mutation = useMutation({
    mutationFn: updateClass,
    onSuccess: (updated) => {
      toast.success('Folder updated')
      invalidateClassWorkspaceQueries(queryClient, updated.id)
      onUpdated()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <form className="space-y-4 pb-5" onSubmit={form.handleSubmit((values) => mutation.mutate({ classId: item.id, ...cleanClassValues(values) }))}>
      <Field label="Folder name" error={form.formState.errors.title?.message}><Input placeholder="Capstone projects" {...form.register('title')} /></Field>
      <div className="grid gap-4 md:grid-cols-[1fr_14rem]">
        <ColorPicker value={color} onChange={(value) => form.setValue('color', value, { shouldDirty: true, shouldValidate: true })} />
        <Field label="Status">
          <Select value={status} onValueChange={(value) => form.setValue('status', value as ClassValues['status'], { shouldDirty: true, shouldValidate: true })}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Description"><Textarea placeholder="Optional notes for this folder." {...form.register('description')} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={onUpdated}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save folder'}</Button>
      </div>
    </form>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <BaseField><FieldLabel>{label}</FieldLabel>{children}<FieldError message={error} /></BaseField>
}

function filterClasses(classes: CourseSection[], search: string) {
  const query = search.trim().toLowerCase()
  if (!query) {
    return classes
  }
  return classes.filter((item) => [item.title, item.description, item.ownerTeacherName, item.color].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)))
}

function filterProjects(projects: Project[], search: string) {
  const query = search.trim().toLowerCase()
  if (!query) {
    return projects
  }
  return projects.filter((project) => [project.name, project.topic, project.description, project.classTitle, project.supervisorName, project.status, project.officialProgressState].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)))
}

function cleanClassValues(values: ClassValues) {
  return {
    title: values.title.trim(),
    color: values.color,
    description: values.description?.trim() || undefined,
    status: values.status,
  }
}

function invalidateClassWorkspaceQueries(queryClient: ReturnType<typeof useQueryClient>, classId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.classes })
  queryClient.invalidateQueries({ queryKey: queryKeys.class(classId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.projects })
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
}

function sortClasses(classes: CourseSection[]) {
  return [...classes].sort(compareClasses)
}

function compareClasses(a: CourseSection, b: CourseSection) {
  return attentionScoreForClass(b) - attentionScoreForClass(a) || a.title.localeCompare(b.title)
}

function sortByAttention(projects: Project[]) {
  return [...projects].sort((a, b) => attentionScore([b]) - attentionScore([a]) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

function attentionScore(projects: Project[]) {
  return projects.reduce((score, project) => score + project.pendingReviewCount * 10 + project.overdueTaskCount * 5 + (projectNeedsAttention(project) ? 1 : 0), 0)
}

function attentionScoreForClass(item: CourseSection) {
  return item.pendingReviewCount * 10 + item.overdueTaskCount * 5
}

function ColorPicker({ value, onChange }: { value: ClassFolderColor; onChange: (value: ClassFolderColor) => void }) {
  return (
    <BaseField>
      <FieldLabel>Folder color</FieldLabel>
      <div className="grid grid-cols-3 gap-2">
        {folderColors.map((color) => {
          const palette = folderPalette(color)
          return (
            <button key={color} type="button" className={cn('rounded-xl border px-3 py-2 text-left text-xs font-bold capitalize transition', palette.swatch, value === color ? 'ring-2 ring-primary ring-offset-2' : 'opacity-80 hover:opacity-100')} onClick={() => onChange(color)}>
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
      return { card: 'border-teal-200 bg-gradient-to-br from-teal-50 via-white to-emerald-50', tab: 'bg-teal-200', folderFront: 'bg-gradient-to-br from-teal-300 via-teal-200 to-emerald-200', pill: 'bg-teal-100 text-teal-800', swatch: 'border-teal-200 bg-teal-100 text-teal-800' }
    case 'amber':
      return { card: 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50', tab: 'bg-amber-200', folderFront: 'bg-gradient-to-br from-amber-300 via-amber-200 to-orange-200', pill: 'bg-amber-100 text-amber-800', swatch: 'border-amber-200 bg-amber-100 text-amber-800' }
    case 'rose':
      return { card: 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-pink-50', tab: 'bg-rose-200', folderFront: 'bg-gradient-to-br from-rose-300 via-rose-200 to-pink-200', pill: 'bg-rose-100 text-rose-800', swatch: 'border-rose-200 bg-rose-100 text-rose-800' }
    case 'violet':
      return { card: 'border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50', tab: 'bg-violet-200', folderFront: 'bg-gradient-to-br from-violet-300 via-violet-200 to-indigo-200', pill: 'bg-violet-100 text-violet-800', swatch: 'border-violet-200 bg-violet-100 text-violet-800' }
    case 'slate':
      return { card: 'border-slate-200 bg-gradient-to-br from-slate-100 via-white to-slate-50', tab: 'bg-slate-300', folderFront: 'bg-gradient-to-br from-slate-400 via-slate-300 to-slate-200', pill: 'bg-slate-200 text-slate-800', swatch: 'border-slate-300 bg-slate-200 text-slate-800' }
    case 'blue':
    default:
      return { card: 'border-blue-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50', tab: 'bg-blue-200', folderFront: 'bg-gradient-to-br from-blue-300 via-blue-200 to-cyan-200', pill: 'bg-blue-100 text-blue-800', swatch: 'border-blue-200 bg-blue-100 text-blue-800' }
  }
}

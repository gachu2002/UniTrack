import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Pencil, Plus, RotateCcw, Search } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useDeferredValue, useId, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { LoadingState } from '@/components/shared/loading-state'
import { PaginationControls } from '@/components/shared/pagination-controls'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field as BaseField, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getAdminUsers } from '@/features/admin/api'
import { createClass, getClassesPage, updateClass } from '@/features/classes/api'
import { getProjectsPage } from '@/features/projects/api'
import { projectNeedsAttention } from '@/features/projects/attention'
import { CreateProjectDialog } from '@/features/projects/components/create-project-dialog'
import { ProjectCardGrid } from '@/features/projects/components/project-card'
import { getErrorMessage } from '@/lib/axios'
import { canCreateProjects } from '@/lib/permissions'
import { refreshClassDataOnStaleError, refreshWorkspaceDataOnStaleError } from '@/lib/query-invalidation'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import type { ClassFolder, ClassFolderColor, Project, User } from '@/types/api'

const classSchema = z.object({
  title: z.string().trim().min(1, 'Folder name is required.'),
  color: z.enum(['blue', 'teal', 'amber', 'rose', 'violet', 'slate']),
  description: z.string().optional(),
  status: z.enum(['active', 'archived']),
  ownerTeacherId: z.string().optional(),
})

type ClassValues = z.infer<typeof classSchema>

const FOLDER_PAGE_SIZE = 8
const PROJECT_PAGE_SIZE = 8

export function WorkspacePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [classOpen, setClassOpen] = useState(false)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const folderSearchQuery = deferredSearch.trim()
  const [activeFolderPage, setActiveFolderPage] = useState(1)
  const [archivedFolderPage, setArchivedFolderPage] = useState(1)
  const [projectSearch, setProjectSearch] = useState('')
  const deferredProjectSearch = useDeferredValue(projectSearch)
  const projectSearchQuery = deferredProjectSearch.trim()
  const [projectPage, setProjectPage] = useState(1)
  const canCreate = canCreateProjects(user)
  const activeClassesQuery = useQuery({
    queryKey: [...queryKeys.classes, 'active', { page: activeFolderPage, search: folderSearchQuery }],
    queryFn: () => getClassesPage({ limit: FOLDER_PAGE_SIZE, page: activeFolderPage, status: 'active', search: folderSearchQuery || undefined }),
    placeholderData: (previousData) => previousData,
    enabled: canCreate,
  })
  const archivedClassesQuery = useQuery({
    queryKey: [...queryKeys.classes, 'archived', { page: archivedFolderPage, search: folderSearchQuery }],
    queryFn: () => getClassesPage({ limit: FOLDER_PAGE_SIZE, page: archivedFolderPage, status: 'archived', search: folderSearchQuery || undefined }),
    placeholderData: (previousData) => previousData,
    enabled: canCreate,
  })
  const projectsQuery = useQuery({
    queryKey: [...queryKeys.projects, canCreate ? 'standalone' : 'all', { page: projectPage, search: projectSearchQuery }],
    queryFn: () => getProjectsPage({ limit: PROJECT_PAGE_SIZE, page: projectPage, unassigned: canCreate ? true : undefined, search: projectSearchQuery || undefined }),
    placeholderData: (previousData) => previousData,
  })
  const foldersLoading = canCreate && (activeClassesQuery.isLoading || archivedClassesQuery.isLoading)
  const foldersError = canCreate && (activeClassesQuery.isError || archivedClassesQuery.isError)

  if (projectsQuery.isLoading || foldersLoading) {
    return <LoadingState label="Loading workspace" />
  }
  if (projectsQuery.isError) {
    return <ErrorState message="Workspace could not be loaded." onRetry={() => void projectsQuery.refetch()} />
  }
  if (foldersError) {
    return <ErrorState message="Folders could not be loaded." onRetry={() => { void activeClassesQuery.refetch(); void archivedClassesQuery.refetch() }} />
  }

  const projectsPage = projectsQuery.data
  const projects = projectsPage?.items || []
  const totalProjects = projectsPage?.total || 0
  const activeClassesPage = activeClassesQuery.data
  const archivedClassesPage = archivedClassesQuery.data
  const activeClasses = activeClassesPage?.items || []
  const archivedClasses = archivedClassesPage?.items || []
  const activeFolderTotal = activeClassesPage?.total || 0
  const archivedFolderTotal = archivedClassesPage?.total || 0
  const totalFolders = activeFolderTotal + archivedFolderTotal
  const visibleStandaloneProjects = sortByAttention(projects)
  const hasFolderSearch = folderSearchQuery.length > 0
  const currentActiveFolderPage = Math.min(activeClassesPage?.page || activeFolderPage, Math.max(1, Math.ceil(activeFolderTotal / FOLDER_PAGE_SIZE)))
  const currentArchivedFolderPage = Math.min(archivedClassesPage?.page || archivedFolderPage, Math.max(1, Math.ceil(archivedFolderTotal / FOLDER_PAGE_SIZE)))
  const foldersRefreshing = canCreate && ((activeClassesQuery.isFetching && Boolean(activeClassesQuery.data)) || (archivedClassesQuery.isFetching && Boolean(archivedClassesQuery.data)))
  const totalProjectPages = Math.max(1, Math.ceil(totalProjects / PROJECT_PAGE_SIZE))
  const currentProjectPage = Math.min(projectsPage?.page || projectPage, totalProjectPages)
  const projectsRefreshing = projectsQuery.isFetching && Boolean(projectsQuery.data)

  return (
    <div className="space-y-8">
      <Dialog open={classOpen} onOpenChange={setClassOpen} title="New folder" description="Create a colored folder for related projects.">
        <ClassForm
          currentUser={user}
          onCreated={(item) => {
            setClassOpen(false)
            queryClient.invalidateQueries({ queryKey: queryKeys.classes })
            navigate(`/workspace/classes/${item.id}`)
          }}
        />
      </Dialog>

      <PageHeader
        eyebrow="Workspace"
        title="Workspace"
        description={canCreate ? 'Organize supervised projects into folders, then open the active project workspaces.' : 'Open your supervised projects, assignments, submissions, and resources.'}
        action={canCreate ? <><Button type="button" variant="outline" onClick={() => setClassOpen(true)}><Plus className="size-4" /> New folder</Button><CreateProjectDialog onCreated={(project) => navigate(`/workspace/projects/${project.id}`)} /></> : null}
      />

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
                <Input className="rounded-full bg-white pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setActiveFolderPage(1); setArchivedFolderPage(1) }} placeholder="Search folders" />
              </label>
            </div>
          </div>

          {totalFolders === 0 ? <EmptyState title={hasFolderSearch ? 'No matching folders' : 'No folders yet'} message={hasFolderSearch ? 'Try another folder name, owner, color, or status.' : 'Create a folder when projects need grouping.'} /> : null}
          {totalFolders > 0 ? (
            <div className="relative space-y-6">
              {foldersRefreshing ? <span className="absolute right-0 top-0 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-muted-foreground shadow-sm ring-1 ring-border">Updating...</span> : null}
              <FolderShelf title="Active folders" count={activeFolderTotal} description="Current project folders for daily supervision." items={activeClasses} page={currentActiveFolderPage} isLoading={activeClassesQuery.isFetching} onPageChange={setActiveFolderPage} emptyTitle={hasFolderSearch ? 'No active matches' : 'No active folders'} emptyMessage={hasFolderSearch ? 'Try another search term or review archived folders below.' : 'Reactivate an archived folder or create a new one.'} />
              {(archivedFolderTotal > 0 || hasFolderSearch) ? <FolderShelf title="Archived folders" count={archivedFolderTotal} description="Older folders kept out of the daily workspace." items={archivedClasses} page={currentArchivedFolderPage} isLoading={archivedClassesQuery.isFetching} onPageChange={setArchivedFolderPage} emptyTitle={hasFolderSearch ? 'No archived matches' : 'No archived folders'} emptyMessage={hasFolderSearch ? 'Try another search term or clear the search.' : 'Archived folders will appear here after you archive one.'} muted /> : null}
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
            <Input className="rounded-full bg-white pl-9" value={projectSearch} onChange={(event) => { setProjectSearch(event.target.value); setProjectPage(1) }} placeholder="Search projects" />
          </label>
        </div>
        <div className="relative">
          {projectsRefreshing ? <span className="absolute right-0 top-0 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-muted-foreground shadow-sm ring-1 ring-border">Updating...</span> : null}
          <ProjectCardGrid projects={visibleStandaloneProjects} showContext allowShowAll={false} reserveSlots={PROJECT_PAGE_SIZE} emptyTitle={projectSearch.trim() ? 'No matching projects' : canCreate ? 'No standalone projects' : 'No projects yet'} emptyMessage={projectSearch.trim() ? 'Try another project name, topic, supervisor, or folder.' : canCreate ? 'Every project is already inside a folder, or no projects exist yet.' : 'Projects appear after a teacher adds your account.'} />
        </div>
        <PaginationControls page={currentProjectPage} pageSize={PROJECT_PAGE_SIZE} totalItems={totalProjects} itemLabel={`${canCreate ? 'standalone ' : ''}projects`} isLoading={projectsQuery.isFetching} onPageChange={setProjectPage} />
      </section>
    </div>
  )
}

function FolderShelf({ title, count, description, items, page, isLoading, onPageChange, emptyTitle, emptyMessage, muted = false }: { title: string; count: number; description: string; items: ClassFolder[]; page: number; isLoading: boolean; onPageChange: (page: number) => void; emptyTitle: string; emptyMessage: string; muted?: boolean }) {
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
      {items.length === 0 ? <EmptyState title={emptyTitle} message={emptyMessage} /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{items.map((item) => <ClassFolderCard key={item.id} item={item} />)}</div>}
      <PaginationControls page={page} pageSize={FOLDER_PAGE_SIZE} totalItems={count} itemLabel="folders" isLoading={isLoading} onPageChange={onPageChange} />
    </section>
  )
}

function ClassFolderCard({ item }: { item: ClassFolder }) {
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
    onError: (error) => {
      toast.error(getErrorMessage(error))
      refreshClassDataOnStaleError(queryClient, item.id, error)
    },
  })

  return (
    <article className={cn('group relative pt-3', isArchived ? 'opacity-75' : '')}>
      <Dialog open={editOpen} onOpenChange={setEditOpen} title="Edit folder" description="Update the folder label, color, notes, and lifecycle state.">
        <ClassEditForm item={item} onUpdated={() => setEditOpen(false)} />
      </Dialog>
      <div className={cn('absolute left-0 top-0 h-7 w-28 rounded-t-md rounded-br-sm border border-black/5 shadow-sm transition duration-200 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-focus-within:-translate-y-0.5', palette.tab)} />
      <div className={cn('relative min-h-52 overflow-hidden rounded-[1.35rem] rounded-tl-[0.9rem] border shadow-sm ring-1 ring-transparent transition duration-200 group-hover:shadow-panel group-hover:ring-primary/15 group-focus-within:ring-primary/20', palette.card)}>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.86),transparent_48%)]" />
        <div className="relative flex min-h-52 flex-col justify-between gap-5 p-5">
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
            <Button type="button" variant="edit" size="icon" className="size-8" aria-label={`Edit ${item.title}`} title={`Edit ${item.title}`} disabled={statusMutation.isPending} onClick={() => setEditOpen(true)}><Pencil className="size-3.5" /></Button>
            <Button type="button" variant={isArchived ? 'secondary' : 'ghost'} size="icon" className="size-8 bg-white/70 shadow-sm" aria-label={isArchived ? `Reactivate ${item.title}` : `Archive ${item.title}`} title={isArchived ? `Reactivate ${item.title}` : `Archive ${item.title}`} disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ classId: item.id, status: isArchived ? 'active' : 'archived' })}>
              {isArchived ? <RotateCcw className="size-3.5" /> : <Archive className="size-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </article>
  )
}

function ClassForm({ currentUser, onCreated }: { currentUser?: User | null; onCreated: (item: ClassFolder) => void }) {
  const queryClient = useQueryClient()
  const formId = useId()
  const isAdmin = currentUser?.role === 'admin'
  const form = useForm<ClassValues>({ resolver: zodResolver(classSchema), defaultValues: { title: '', color: 'blue', description: '', status: 'active', ownerTeacherId: currentUser?.id || '' } })
  const status = useWatch({ control: form.control, name: 'status' })
  const color = useWatch({ control: form.control, name: 'color' })
  const ownerTeacherId = useWatch({ control: form.control, name: 'ownerTeacherId' })
  const titleId = `${formId}-title`
  const statusId = `${formId}-status`
  const ownerId = `${formId}-owner`
  const descriptionId = `${formId}-description`
  const ownersQuery = useQuery({
    queryKey: [...queryKeys.adminUsers, 'folder-owners'],
    queryFn: () => getAdminUsers({ status: 'active', limit: 200 }),
    enabled: isAdmin,
  })
  const ownerOptions = (ownersQuery.data || []).filter((account) => account.role === 'teacher' || account.role === 'admin')
  const mutation = useMutation({
    mutationFn: createClass,
    onSuccess: (item) => {
      toast.success('Folder created')
      onCreated(item)
    },
    onError: (error) => {
      refreshWorkspaceDataOnStaleError(queryClient, error)
      toast.error(getErrorMessage(error))
    },
  })

  return (
    <form className="space-y-4 pb-5" onSubmit={form.handleSubmit((values) => mutation.mutate(cleanClassCreateValues(values, isAdmin)))}>
      <Field id={titleId} label="Folder name" error={form.formState.errors.title?.message}><Input id={titleId} placeholder="Capstone projects" {...form.register('title')} /></Field>
      <div className="grid gap-4 md:grid-cols-[1fr_14rem]">
        <ColorPicker value={color} onChange={(value) => form.setValue('color', value, { shouldDirty: true, shouldValidate: true })} />
        <Field id={statusId} label="Status">
          <Select value={status} onValueChange={(value) => form.setValue('status', value as ClassValues['status'], { shouldDirty: true, shouldValidate: true })}>
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
      {isAdmin ? (
        <Field id={ownerId} label="Folder owner">
          <Select value={ownerTeacherId || currentUser?.id || ''} onValueChange={(value) => form.setValue('ownerTeacherId', value, { shouldDirty: true, shouldValidate: true })} disabled={ownersQuery.isLoading}>
            <SelectTrigger id={ownerId}>
              <SelectValue placeholder={ownersQuery.isLoading ? 'Loading owners' : 'Select owner'} />
            </SelectTrigger>
            <SelectContent>
              {ownerOptions.map((account) => <SelectItem key={account.id} value={account.id}>{account.fullName} - {account.role}</SelectItem>)}
            </SelectContent>
          </Select>
          {ownersQuery.isError ? <p className="text-xs text-muted-foreground">Could not load owner accounts. The folder will use your account unless you retry later.</p> : null}
        </Field>
      ) : null}
      <Field id={descriptionId} label="Description"><Textarea id={descriptionId} placeholder="Optional notes for this folder." {...form.register('description')} /></Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Creating...' : 'Create folder'}</Button>
      </div>
    </form>
  )
}

function ClassEditForm({ item, onUpdated }: { item: ClassFolder; onUpdated: () => void }) {
  const queryClient = useQueryClient()
  const formId = useId()
  const form = useForm<ClassValues>({ resolver: zodResolver(classSchema), defaultValues: { title: item.title, color: item.color, description: item.description || '', status: item.status } })
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
    <form className="space-y-4 pb-5" onSubmit={form.handleSubmit((values) => mutation.mutate({ classId: item.id, ...cleanClassValues(values) }))}>
      <Field id={titleId} label="Folder name" error={form.formState.errors.title?.message}><Input id={titleId} placeholder="Capstone projects" {...form.register('title')} /></Field>
      <div className="grid gap-4 md:grid-cols-[1fr_14rem]">
        <ColorPicker value={color} onChange={(value) => form.setValue('color', value, { shouldDirty: true, shouldValidate: true })} />
        <Field id={statusId} label="Status">
          <Select value={status} onValueChange={(value) => form.setValue('status', value as ClassValues['status'], { shouldDirty: true, shouldValidate: true })}>
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
      <Field id={descriptionId} label="Description"><Textarea id={descriptionId} placeholder="Optional notes for this folder." {...form.register('description')} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={onUpdated}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save folder'}</Button>
      </div>
    </form>
  )
}

function Field({ id, label, error, children }: { id?: string; label: string; error?: string; children: ReactNode }) {
  return <BaseField><FieldLabel htmlFor={id}>{label}</FieldLabel>{children}<FieldError message={error} /></BaseField>
}

function cleanClassValues(values: ClassValues) {
  return {
    title: values.title.trim(),
    color: values.color,
    description: values.description?.trim() || '',
    status: values.status,
  }
}

function cleanClassCreateValues(values: ClassValues, includeOwner: boolean) {
  return {
    ...cleanClassValues(values),
    ownerTeacherId: includeOwner ? values.ownerTeacherId?.trim() || undefined : undefined,
  }
}

function invalidateClassWorkspaceQueries(queryClient: ReturnType<typeof useQueryClient>, classId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.classes })
  queryClient.invalidateQueries({ queryKey: queryKeys.class(classId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.projects })
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
}

function sortByAttention(projects: Project[]) {
  return [...projects].sort((a, b) => attentionScore([b]) - attentionScore([a]) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

function attentionScore(projects: Project[]) {
  return projects.reduce((score, project) => score + project.pendingReviewCount * 10 + project.overdueTaskCount * 5 + (projectNeedsAttention(project) ? 1 : 0), 0)
}

function ColorPicker({ value, onChange }: { value: ClassFolderColor; onChange: (value: ClassFolderColor) => void }) {
  const labelId = useId()
  const optionRefs = useRef<Record<ClassFolderColor, HTMLButtonElement | null>>({ blue: null, teal: null, amber: null, rose: null, violet: null, slate: null })
  const selectColor = (color: ClassFolderColor) => {
    onChange(color)
    optionRefs.current[color]?.focus()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, color: ClassFolderColor) => {
    const currentIndex = folderColors.indexOf(color)
    let nextColor: ClassFolderColor | undefined

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextColor = folderColors[(currentIndex + 1) % folderColors.length]
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextColor = folderColors[(currentIndex - 1 + folderColors.length) % folderColors.length]
    }
    if (event.key === 'Home') {
      nextColor = folderColors[0]
    }
    if (event.key === 'End') {
      nextColor = folderColors[folderColors.length - 1]
    }
    if (!nextColor) {
      return
    }

    event.preventDefault()
    selectColor(nextColor)
  }

  return (
    <BaseField>
      <FieldLabel id={labelId}>Folder color</FieldLabel>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby={labelId}>
        {folderColors.map((color) => {
          const palette = folderPalette(color)
          return (
            <button
              key={color}
              ref={(element) => { optionRefs.current[color] = element }}
              type="button"
              role="radio"
              aria-checked={value === color}
              tabIndex={value === color ? 0 : -1}
              className={cn('rounded-xl border px-3 py-2 text-left text-xs font-bold capitalize transition', palette.swatch, value === color ? 'ring-2 ring-primary ring-offset-2' : 'opacity-80 hover:opacity-100')}
              onClick={() => onChange(color)}
              onKeyDown={(event) => handleKeyDown(event, color)}
            >
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

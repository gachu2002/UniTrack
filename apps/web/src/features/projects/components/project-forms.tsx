import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Field as BaseField, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getClasses } from '@/features/classes/api'
import { addProjectMember, createProject, updateProject } from '@/features/projects/api'
import { getErrorMessage } from '@/lib/axios'
import { queryKeys } from '@/lib/query-keys'
import { useAuthStore } from '@/stores/auth-store'
import type { CourseSection, Project } from '@/types/api'

const projectBaseSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required.'),
  topic: z.string().optional(),
  description: z.string().optional(),
  classId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(['active', 'on_hold', 'completed', 'archived']),
})

const projectSchema = projectBaseSchema.refine(hasValidDateOrder, { path: ['endDate'], message: 'End date cannot be before start date.' })

type ProjectValues = z.infer<typeof projectSchema>

const editProjectSchema = projectBaseSchema.extend({ progressSummary: z.string().optional() }).refine(hasValidDateOrder, { path: ['endDate'], message: 'End date cannot be before start date.' })

type EditProjectValues = z.infer<typeof editProjectSchema>

const NO_CLASS_VALUE = '__no_folder__'

export function CreateProjectForm({ classId, onCreated, onCancel }: { classId?: string; onCreated?: (project: Project) => void; onCancel?: () => void }) {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const classesQuery = useQuery({ queryKey: queryKeys.classes, queryFn: getClasses, enabled: !classId })
  const form = useForm<ProjectValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: '', topic: '', description: '', classId: classId || '', startDate: '', endDate: '', status: 'active' },
  })
  const selectedClassId = useWatch({ control: form.control, name: 'classId' })
  const status = useWatch({ control: form.control, name: 'status' })
  const startDate = useWatch({ control: form.control, name: 'startDate' })
  const endDate = useWatch({ control: form.control, name: 'endDate' })
  const classOptions = filterClassesForSupervisor(classesQuery.data || [], user?.id)
  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      toast.success('Project created')
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      queryClient.invalidateQueries({ queryKey: queryKeys.classes })
      if (project.classId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.class(project.classId) })
        queryClient.invalidateQueries({ queryKey: queryKeys.classProjectCandidates(project.classId) })
      }
      form.reset({ name: '', topic: '', description: '', classId: classId || '', startDate: '', endDate: '', status: 'active' })
      onCreated?.(project)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <form className="flex min-h-0 flex-col" onSubmit={form.handleSubmit((values) => {
      const cleaned = cleanCreateProjectValues(values)
      const resolvedClassId = classId || cleaned.classId || undefined
      mutation.mutate({ ...cleaned, classId: resolvedClassId })
    })}>
      <div className="space-y-4 pb-5">
        {!classId ? (
          <Field label="Folder (optional)" error={form.formState.errors.classId?.message}>
            <Select value={selectedClassId || NO_CLASS_VALUE} onValueChange={(value) => form.setValue('classId', value === NO_CLASS_VALUE ? '' : value, { shouldDirty: true, shouldValidate: true })} disabled={classesQuery.isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={classesQuery.isLoading ? 'Loading folders...' : 'No folder'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CLASS_VALUE}>{classesQuery.isLoading ? 'Loading folders...' : 'No folder'}</SelectItem>
                {classOptions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{formatClassOption(item)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">Projects can stand alone. Choose a folder when it helps organize related work.</p>
          </Field>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Project name" error={form.formState.errors.name?.message}>
            <Input placeholder="Capstone AI review assistant" {...form.register('name')} />
          </Field>
          <Field label="Topic">
            <Input placeholder="Research topic or product focus" {...form.register('topic')} />
          </Field>
        </div>
        <Field label="Description">
          <Textarea placeholder="What is this team trying to deliver?" {...form.register('description')} />
        </Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Start date">
            <DatePicker value={startDate || ''} onValueChange={(value) => form.setValue('startDate', value, { shouldDirty: true, shouldValidate: true })} />
          </Field>
          <Field label="End date">
            <DatePicker value={endDate || ''} onValueChange={(value) => form.setValue('endDate', value, { shouldDirty: true, shouldValidate: true })} />
          </Field>
          <Field label="Status">
            <Select value={status} onValueChange={(value) => form.setValue('status', value as ProjectValues['status'], { shouldDirty: true, shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_hold">On hold</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>
      <div className="sticky bottom-0 -mx-5 border-t border-border bg-card/95 px-5 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={mutation.isPending}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creating...' : 'Create project'}
        </Button>
        </div>
      </div>
    </form>
  )
}

export function EditProjectForm({ project, onUpdated, onCancel }: { project: Project; onUpdated?: (project: Project) => void; onCancel?: () => void }) {
  const queryClient = useQueryClient()
  const classesQuery = useQuery({ queryKey: queryKeys.classes, queryFn: getClasses })
  const archivedLocked = project.status === 'archived'
  const form = useForm<EditProjectValues>({
    resolver: zodResolver(editProjectSchema),
    defaultValues: {
      name: project.name,
      topic: project.topic || '',
      description: project.description || '',
      classId: project.classId || '',
      startDate: project.startDate || '',
      endDate: project.endDate || '',
      status: project.status,
      progressSummary: project.progressSummary || '',
    },
  })
  const selectedClassId = useWatch({ control: form.control, name: 'classId' })
  const status = useWatch({ control: form.control, name: 'status' })
  const startDate = useWatch({ control: form.control, name: 'startDate' })
  const endDate = useWatch({ control: form.control, name: 'endDate' })
  const classOptions = filterClassesForSupervisor(classesQuery.data || [], project.supervisorId, project.classId)
  const mutation = useMutation({
    mutationFn: updateProject,
    onSuccess: (updated) => {
      toast.success('Project updated')
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      queryClient.invalidateQueries({ queryKey: queryKeys.project(project.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.classes })
      if (project.classId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.class(project.classId) })
        queryClient.invalidateQueries({ queryKey: queryKeys.classProjectCandidates(project.classId) })
      }
      if (updated.classId && updated.classId !== project.classId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.class(updated.classId) })
        queryClient.invalidateQueries({ queryKey: queryKeys.classProjectCandidates(updated.classId) })
      }
      onUpdated?.(updated)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <form className="flex min-h-0 flex-col" onSubmit={form.handleSubmit((values) => {
      if (archivedLocked) {
        mutation.mutate({ projectId: project.id, status: values.status })
        return
      }
      const cleaned = cleanEditProjectValues(values)
      mutation.mutate({ projectId: project.id, ...cleaned, classId: cleaned.classId === (project.classId || '') ? undefined : cleaned.classId })
    })}>
      <div className="space-y-4 pb-5">
        {archivedLocked ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Archived projects are read-only. Change the status first to reactivate editing.</p> : null}
        <Field label="Folder (optional)" error={form.formState.errors.classId?.message}>
          <Select value={selectedClassId || NO_CLASS_VALUE} onValueChange={(value) => form.setValue('classId', value === NO_CLASS_VALUE ? '' : value, { shouldDirty: true, shouldValidate: true })} disabled={classesQuery.isLoading || archivedLocked}>
          <SelectTrigger>
            <SelectValue placeholder={classesQuery.isLoading ? 'Loading folders...' : 'No folder'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CLASS_VALUE}>{classesQuery.isLoading ? 'Loading folders...' : 'No folder'}</SelectItem>
            {classOptions.map((item) => (
              <SelectItem key={item.id} value={item.id}>{formatClassOption(item)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">Move this project between folders or keep it outside a folder.</p>
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Project name" error={form.formState.errors.name?.message}>
            <Input disabled={archivedLocked} {...form.register('name')} />
          </Field>
          <Field label="Topic">
            <Input disabled={archivedLocked} {...form.register('topic')} />
          </Field>
        </div>
        <Field label="Description">
          <Textarea disabled={archivedLocked} {...form.register('description')} />
        </Field>
        <Field label="Progress summary">
          <Textarea disabled={archivedLocked} placeholder="Current official supervision summary" {...form.register('progressSummary')} />
        </Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Start date">
            <DatePicker value={startDate || ''} onValueChange={(value) => form.setValue('startDate', value, { shouldDirty: true, shouldValidate: true })} disabled={archivedLocked} />
          </Field>
          <Field label="End date">
            <DatePicker value={endDate || ''} onValueChange={(value) => form.setValue('endDate', value, { shouldDirty: true, shouldValidate: true })} disabled={archivedLocked} />
          </Field>
          <Field label="Status">
            <Select value={status} onValueChange={(value) => form.setValue('status', value as EditProjectValues['status'], { shouldDirty: true, shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_hold">On hold</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>
      <div className="sticky bottom-0 -mx-5 border-t border-border bg-card/95 px-5 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {onCancel ? <Button type="button" variant="ghost" onClick={onCancel} disabled={mutation.isPending}>Cancel</Button> : null}
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save project'}</Button>
        </div>
      </div>
    </form>
  )
}

function formatClassOption(item: CourseSection) {
  return item.title
}

function filterClassesForSupervisor(classes: CourseSection[], supervisorId?: string, currentClassId?: string) {
  if (!supervisorId) {
    return []
  }
  return classes.filter((item) => item.ownerTeacherId === supervisorId || item.id === currentClassId)
}

function hasValidDateOrder(values: { startDate?: string; endDate?: string }) {
  if (!values.startDate || !values.endDate) {
    return true
  }
  return values.endDate >= values.startDate
}

function cleanCreateProjectValues(values: ProjectValues) {
  return {
    name: values.name.trim(),
    topic: values.topic?.trim() || undefined,
    description: values.description?.trim() || undefined,
    classId: values.classId?.trim() || undefined,
    startDate: values.startDate || undefined,
    endDate: values.endDate || undefined,
    status: values.status,
  }
}

function cleanEditProjectValues(values: EditProjectValues) {
  return {
    name: values.name.trim(),
    topic: values.topic?.trim() || '',
    description: values.description?.trim() || '',
    classId: values.classId?.trim() || '',
    startDate: values.startDate || '',
    endDate: values.endDate || '',
    status: values.status,
    progressSummary: values.progressSummary?.trim() || '',
  }
}

const addMemberSchema = z.object({
  email: z.string().email('Enter a valid student email.'),
})

type AddMemberValues = z.infer<typeof addMemberSchema>

export function AddProjectMemberForm({ projectId, onAdded }: { projectId: string; onAdded?: () => void }) {
  const queryClient = useQueryClient()
  const form = useForm<AddMemberValues>({ resolver: zodResolver(addMemberSchema), defaultValues: { email: '' } })
  const mutation = useMutation({
    mutationFn: addProjectMember,
    onSuccess: (member) => {
      form.reset({ email: '' })
      toast.success(`${member.fullName} added to the project`)
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      queryClient.invalidateQueries({ queryKey: queryKeys.classes })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      onAdded?.()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <form className="space-y-3" onSubmit={form.handleSubmit((values) => mutation.mutate({ projectId, email: values.email }))}>
      <div>
        <Input type="email" placeholder="student@university.edu" {...form.register('email')} />
        {form.formState.errors.email ? <p className="mt-1 text-xs font-semibold text-destructive">{form.formState.errors.email.message}</p> : null}
        <p className="mt-1 text-xs text-muted-foreground">The student account must already exist and be active.</p>
      </div>
      <Button type="submit" disabled={mutation.isPending}>
        <UserPlus className="size-4" />
        {mutation.isPending ? 'Adding...' : 'Add student'}
      </Button>
    </form>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <BaseField>
      <FieldLabel>{label}</FieldLabel>
      {children}
      <FieldError message={error} />
    </BaseField>
  )
}

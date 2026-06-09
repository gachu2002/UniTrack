import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { Field as BaseField, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createTask, reviewProgress, submitProgress, updateTask } from '@/features/tasks/api'
import { getErrorMessage } from '@/lib/axios'
import { queryKeys } from '@/lib/query-keys'
import type { ProgressUpdate, ProjectMember, ProjectMilestone, Task } from '@/types/api'

const taskSchema = z.object({
  title: z.string().min(1, 'Title is required.'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
  deadline: z.string().optional(),
  milestoneId: z.string().min(1, 'Milestone is required.'),
  assignAll: z.boolean(),
  assigneeIds: z.array(z.string()),
})

type TaskValues = z.infer<typeof taskSchema>

const ASSIGNEE_OPTION_VISIBLE_COUNT = 80

export function CreateTaskForm({ projectId, members = [], milestones = [], milestoneId = '', onCreated }: { projectId: string; members?: ProjectMember[]; milestones?: ProjectMilestone[]; milestoneId?: string; onCreated?: () => void }) {
  const queryClient = useQueryClient()
  const form = useTaskForm(milestoneId)
  useEffect(() => {
    form.reset(defaultTaskValues(milestoneId))
  }, [form, milestoneId])
  const mutation = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      toast.success('Assignment created')
      form.reset(defaultTaskValues(milestoneId))
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMilestones(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      queryClient.invalidateQueries({ queryKey: queryKeys.classes })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      onCreated?.()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <TaskForm
      form={form}
      members={members}
      milestones={milestones}
      submitLabel="Create assignment"
      isSubmitting={mutation.isPending}
      onSubmit={(values) => {
        const assigneeIds = values.assignAll ? members.map((member) => member.id) : values.assigneeIds
        mutation.mutate({ projectId, title: values.title, description: values.description, priority: values.priority, deadline: values.deadline, milestoneId: values.milestoneId, assigneeIds })
      }}
    />
  )
}

export function EditTaskForm({ projectId, task, members = [], milestones = [], onUpdated }: { projectId: string; task: Task; members?: ProjectMember[]; milestones?: ProjectMilestone[]; onUpdated?: () => void }) {
  const queryClient = useQueryClient()
  const form = useForm<TaskValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      deadline: task.deadline ? task.deadline.slice(0, 10) : '',
      milestoneId: task.milestoneId || '',
      assignAll: false,
      assigneeIds: task.assignees.map((assignee) => assignee.id),
    },
  })
  const mutation = useMutation({
    mutationFn: updateTask,
    onSuccess: () => {
      toast.success('Assignment updated')
      queryClient.invalidateQueries({ queryKey: queryKeys.task(projectId, task.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMilestones(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      queryClient.invalidateQueries({ queryKey: queryKeys.classes })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      onUpdated?.()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <TaskForm
      form={form}
      members={members}
      milestones={milestones}
      submitLabel="Save assignment"
      isSubmitting={mutation.isPending}
      onSubmit={(values) => {
        const assigneeIds = values.assignAll ? members.map((member) => member.id) : values.assigneeIds
        mutation.mutate({ projectId, taskId: task.id, title: values.title, description: values.description, priority: values.priority, deadline: values.deadline, milestoneId: values.milestoneId, assigneeIds })
      }}
    />
  )
}

const progressSchema = z.object({
  title: z.string().optional(),
  description: z.string().min(1, 'Submission description is required.'),
  blockers: z.string().optional(),
})

type ProgressValues = z.infer<typeof progressSchema>

export function SubmitProgressForm({ projectId, taskId, onSubmitted }: { projectId: string; taskId: string; onSubmitted?: () => void }) {
  const queryClient = useQueryClient()
  const form = useForm<ProgressValues>({ resolver: zodResolver(progressSchema), defaultValues: { title: '', description: '', blockers: '' } })
  const mutation = useMutation({
    mutationFn: submitProgress,
    onSuccess: () => {
      toast.success('Submission sent for review')
      form.reset({ title: '', description: '', blockers: '' })
      queryClient.invalidateQueries({ queryKey: queryKeys.task(projectId, taskId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projectProgress(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMilestones(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      queryClient.invalidateQueries({ queryKey: queryKeys.classes })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      onSubmitted?.()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <form className="space-y-4 pb-5" onSubmit={form.handleSubmit((values) => mutation.mutate({ projectId, taskId, ...values }))}>
      <Field label="Submission title">
        <Input placeholder="Prototype evidence ready" {...form.register('title')} />
      </Field>
      <Field label="What did you complete?" error={form.formState.errors.description?.message}>
        <Textarea placeholder="What changed, what evidence exists, and what should the teacher review?" {...form.register('description')} />
      </Field>
      <Field label="Blockers or issues">
        <Textarea placeholder="Anything blocking the work?" {...form.register('blockers')} />
      </Field>
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Submitting...' : 'Submit work'}
      </Button>
    </form>
  )
}

const reviewSchema = z.object({
  decision: z.enum(['accept_progress', 'complete_assignment', 'return_revision']),
  reviewComment: z.string().optional(),
})

type ReviewValues = z.infer<typeof reviewSchema>

export function ReviewProgressForm({ projectId, update }: { projectId: string; update: ProgressUpdate }) {
  const queryClient = useQueryClient()
  const form = useForm<ReviewValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { decision: 'accept_progress', reviewComment: '' },
  })
  const mutation = useMutation({
    mutationFn: reviewProgress,
    onSuccess: () => {
      toast.success('Submission reviewed')
      queryClient.invalidateQueries({ queryKey: queryKeys.task(projectId, update.taskId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projectProgress(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMilestones(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      queryClient.invalidateQueries({ queryKey: queryKeys.classes })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <form
      className="mt-4 space-y-3 border-t border-border pt-4"
      onSubmit={form.handleSubmit((values) => mutation.mutate({ projectId, updateId: update.id, ...reviewPayload(values) }))}
    >
      <div className="grid gap-2 md:grid-cols-3">
        <ReviewChoice value="accept_progress" label="Accept progress" description="Work is moving forward." form={form} />
        <ReviewChoice value="complete_assignment" label="Approve and complete" description="This finishes the assignment." form={form} />
        <ReviewChoice value="return_revision" label="Return for revision" description="Student needs changes." form={form} />
      </div>
      <Textarea placeholder="Teacher review comment" {...form.register('reviewComment')} />
      <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save review'}</Button>
    </form>
  )
}

function reviewPayload(values: ReviewValues) {
  switch (values.decision) {
    case 'complete_assignment':
      return { reviewStatus: 'approved' as const, officialProgressState: 'completed' as const, reviewComment: values.reviewComment }
    case 'return_revision':
      return { reviewStatus: 'needs_changes' as const, officialProgressState: 'needs_changes' as const, reviewComment: values.reviewComment }
    default:
      return { reviewStatus: 'approved' as const, officialProgressState: 'in_progress' as const, reviewComment: values.reviewComment }
  }
}

function ReviewChoice({ value, label, description, form }: { value: ReviewValues['decision']; label: string; description: string; form: UseFormReturn<ReviewValues> }) {
  const selected = useWatch({ control: form.control, name: 'decision' })
  const isSelected = selected === value
  return (
    <button
      type="button"
      className={isSelected ? 'rounded-xl border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-semibold text-primary' : 'rounded-xl border border-border bg-card px-3 py-2 text-left text-sm font-semibold text-ink transition hover:border-primary/40 hover:bg-accent'}
      onClick={() => form.setValue('decision', value, { shouldDirty: true, shouldValidate: true })}
    >
      <span className="block">{label}</span>
      <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">{description}</span>
    </button>
  )
}

function useTaskForm(milestoneId = '') {
  return useForm<TaskValues>({ resolver: zodResolver(taskSchema), defaultValues: defaultTaskValues(milestoneId) })
}

function defaultTaskValues(milestoneId = ''): TaskValues {
  return { title: '', description: '', priority: 'medium', deadline: '', milestoneId, assignAll: false, assigneeIds: [] }
}

function TaskForm({
  form,
  members,
  milestones,
  submitLabel,
  isSubmitting,
  onSubmit,
}: {
  form: ReturnType<typeof useTaskForm>
  members: ProjectMember[]
  milestones: ProjectMilestone[]
  submitLabel: string
  isSubmitting: boolean
  onSubmit: (values: TaskValues) => void
}) {
  const assignAll = useWatch({ control: form.control, name: 'assignAll' })
  const selectedAssignees = useWatch({ control: form.control, name: 'assigneeIds' }) || []
  const priority = useWatch({ control: form.control, name: 'priority' })
  const selectedMilestoneId = useWatch({ control: form.control, name: 'milestoneId' }) || ''
  const deadline = useWatch({ control: form.control, name: 'deadline' }) || ''
  const [memberSearch, setMemberSearch] = useState('')
  const filteredMembers = members.filter((member) => `${member.fullName} ${member.email}`.toLowerCase().includes(memberSearch.toLowerCase()))
  const visibleMembers = filteredMembers.slice(0, ASSIGNEE_OPTION_VISIBLE_COUNT)
  return (
    <form className="flex min-h-0 flex-col" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-4 pb-5">
        <Field label="Title" error={form.formState.errors.title?.message}>
          <Input placeholder="Define the assignment students should complete" {...form.register('title')} />
        </Field>
        <Field label="Description">
          <Textarea placeholder="Expected outcome, evidence, and review notes for students" {...form.register('description')} />
        </Field>
        {milestones.length > 0 ? (
          <Field label="Milestone" description="Required checkpoint this assignment belongs under." error={form.formState.errors.milestoneId?.message}>
            <Select value={selectedMilestoneId} onValueChange={(value) => form.setValue('milestoneId', value, { shouldDirty: true, shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue placeholder="Choose milestone" />
              </SelectTrigger>
              <SelectContent>
                {milestones.map((milestone) => <SelectItem key={milestone.id} value={milestone.id}>{milestone.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        ) : <p className="rounded-xl border border-dashed border-border bg-paper px-3 py-2 text-sm text-muted-foreground">Create a milestone before adding assignments.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Priority" description="Used for scanning the supervision plan.">
            <Select value={priority} onValueChange={(value) => form.setValue('priority', value as TaskValues['priority'], { shouldDirty: true, shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Deadline" description="Date-only deadline used for overdue alerts.">
            <DatePicker value={deadline} onValueChange={(value) => form.setValue('deadline', value, { shouldDirty: true, shouldValidate: true })} />
          </Field>
        </div>
        <div className="rounded-md border bg-paper p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-ink">Assignment</p>
            <p className="text-xs leading-5 text-muted-foreground">Only active student members of this project can be assigned.</p>
          </div>
          <Label className="flex items-start gap-3">
            <Checkbox className="mt-1" {...form.register('assignAll')} />
            <span>
              Assign to all current student members
              <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
                {members.length > 0 ? `${members.length} student${members.length === 1 ? '' : 's'} will be assigned.` : 'Add students before assigning this work.'}
              </span>
            </span>
          </Label>
          {!assignAll && members.length > 0 ? (
            <div className="mt-4 space-y-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                <Input placeholder="Search students" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} />
                <span className="text-sm font-semibold text-muted-foreground">{selectedAssignees.length} selected</span>
              </div>
              <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                {visibleMembers.map((member) => (
                  <Label key={member.id} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
                    <Checkbox value={member.id} {...form.register('assigneeIds')} />
                    <span>
                      <span className="block font-medium">{member.fullName}</span>
                      <span className="text-xs font-normal text-muted-foreground">{member.email}</span>
                    </span>
                  </Label>
                ))}
              </div>
              {filteredMembers.length > ASSIGNEE_OPTION_VISIBLE_COUNT ? <p className="text-xs text-muted-foreground">Showing {ASSIGNEE_OPTION_VISIBLE_COUNT} of {filteredMembers.length} students. Search by name or email to narrow the list.</p> : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="sticky bottom-0 -mx-5 border-t border-border bg-card/95 px-5 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting || milestones.length === 0}>
            {isSubmitting ? 'Saving...' : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}

function Field({ label, description, error, children }: { label: string; description?: string; error?: string; children: ReactNode }) {
  return (
    <BaseField>
      <FieldLabel>{label}</FieldLabel>
      {description ? <p className="text-xs leading-5 text-muted-foreground">{description}</p> : null}
      {children}
      <FieldError message={error} />
    </BaseField>
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState, type ReactNode } from 'react'
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
import { getErrorMessage, isForbiddenOrConflictError } from '@/lib/axios'
import { invalidateAssignmentWorkflowData, refreshProjectDataOnStaleError } from '@/lib/query-invalidation'
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
    onError: (error) => {
      toast.error(getErrorMessage(error))
      refreshProjectDataOnStaleError(queryClient, projectId, error)
    },
  })

  return (
    <TaskForm
      form={form}
      members={members}
      milestones={milestones}
      submitLabel="Create assignment"
      isSubmitting={mutation.isPending}
      onSubmit={(values) => {
        const assignableMembers = getAssignableProjectMembers(members)
        const assigneeIds = values.assignAll ? assignableMembers.map((member) => member.id) : getAssignableAssigneeIds(values.assigneeIds, assignableMembers)
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
      invalidateAssignmentWorkflowData(queryClient, projectId, task.id)
      onUpdated?.()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      if (isForbiddenOrConflictError(error)) {
        refreshAssignmentWorkflow(queryClient, projectId, task.id)
      }
    },
  })

  return (
    <TaskForm
      form={form}
      members={members}
      milestones={milestones}
      submitLabel="Save assignment"
      isSubmitting={mutation.isPending}
      compact
      onSubmit={(values) => {
        const assignableMembers = getAssignableProjectMembers(members)
        const assigneeIds = values.assignAll ? assignableMembers.map((member) => member.id) : getAssignableAssigneeIds(values.assigneeIds, assignableMembers)
        mutation.mutate({ projectId, taskId: task.id, title: values.title, description: values.description, priority: values.priority, deadline: values.deadline, milestoneId: values.milestoneId, assigneeIds })
      }}
    />
  )
}

const progressSchema = z.object({
  title: z.string().trim().optional(),
  description: z.string().trim().min(1, 'Submission description is required.'),
  blockers: z.string().trim().optional(),
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
      invalidateAssignmentWorkflowData(queryClient, projectId, taskId)
      onSubmitted?.()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      if (isForbiddenOrConflictError(error)) {
        refreshAssignmentWorkflow(queryClient, projectId, taskId)
      }
    },
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
  reviewComment: z.string().trim().optional(),
}).superRefine((values, context) => {
  if (values.decision === 'return_revision' && !values.reviewComment) {
    context.addIssue({ code: 'custom', path: ['reviewComment'], message: 'Revision guidance is required.' })
  }
})

type ReviewValues = z.infer<typeof reviewSchema>

export function ReviewProgressForm({ projectId, update, compact = false, disabledReason }: { projectId: string; update: ProgressUpdate; compact?: boolean; disabledReason?: string }) {
  const queryClient = useQueryClient()
  const form = useForm<ReviewValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { decision: 'accept_progress', reviewComment: '' },
  })
  const decisionGroupName = useId()
  const decision = useWatch({ control: form.control, name: 'decision' })
  const requiresComment = decision === 'return_revision'
  const mutation = useMutation({
    mutationFn: reviewProgress,
    onSuccess: () => {
      toast.success('Submission reviewed')
      invalidateAssignmentWorkflowData(queryClient, projectId, update.taskId)
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      if (isForbiddenOrConflictError(error)) {
        refreshAssignmentWorkflow(queryClient, projectId, update.taskId)
      }
    },
  })

  return (
    <form
      className={compact ? 'space-y-3' : 'mt-4 space-y-3 border-t border-border pt-4'}
      onSubmit={form.handleSubmit((values) => mutation.mutate({ projectId, updateId: update.id, ...reviewPayload(values) }))}
    >
      <div className={compact ? 'grid gap-2' : 'grid gap-2 md:grid-cols-3'} role="radiogroup" aria-label="Review decision">
        <ReviewChoice name={decisionGroupName} value="accept_progress" label="Accept progress" description="Work is moving forward." form={form} compact={compact} />
        <ReviewChoice name={decisionGroupName} value="complete_assignment" label="Approve and complete" description="This finishes the assignment." form={form} compact={compact} />
        <ReviewChoice name={decisionGroupName} value="return_revision" label="Return for revision" description="Student needs changes." form={form} compact={compact} />
      </div>
      <Field label={requiresComment ? 'Revision guidance' : 'Review comment'} description={requiresComment ? 'Tell the student exactly what must change before resubmitting.' : 'Optional note for the submission timeline.'} error={form.formState.errors.reviewComment?.message}>
        <Textarea className={compact ? 'min-h-28' : undefined} placeholder={requiresComment ? 'What should the student revise?' : 'Teacher review comment'} {...form.register('reviewComment')} />
      </Field>
      {disabledReason ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-950">{disabledReason}</p> : null}
      <Button type="submit" className={compact ? 'w-full' : undefined} disabled={mutation.isPending || Boolean(disabledReason)}>{mutation.isPending ? 'Saving...' : 'Save review'}</Button>
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

function ReviewChoice({ name, value, label, description, form, compact = false }: { name: string; value: ReviewValues['decision']; label: string; description: string; form: UseFormReturn<ReviewValues>; compact?: boolean }) {
  const selected = useWatch({ control: form.control, name: 'decision' })
  const isSelected = selected === value
  return (
    <label className={isSelected ? `${compact ? 'rounded-lg px-3 py-2' : 'rounded-xl px-3 py-2'} block cursor-pointer border border-primary bg-primary/10 text-left text-sm font-semibold text-primary focus-within:ring-2 focus-within:ring-primary/20` : `${compact ? 'rounded-lg px-3 py-2' : 'rounded-xl px-3 py-2'} block cursor-pointer border border-border bg-card text-left text-sm font-semibold text-ink transition focus-within:ring-2 focus-within:ring-primary/20 hover:border-primary/40 hover:bg-accent`}>
      <input
        type="radio"
        className="sr-only"
        name={name}
        value={value}
        checked={isSelected}
        onChange={() => form.setValue('decision', value, { shouldDirty: true, shouldValidate: true })}
      />
      <span className="block">{label}</span>
      <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">{description}</span>
    </label>
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
  compact = false,
  onSubmit,
}: {
  form: ReturnType<typeof useTaskForm>
  members: ProjectMember[]
  milestones: ProjectMilestone[]
  submitLabel: string
  isSubmitting: boolean
  compact?: boolean
  onSubmit: (values: TaskValues) => void
}) {
  const assignAll = useWatch({ control: form.control, name: 'assignAll' })
  const selectedAssignees = useWatch({ control: form.control, name: 'assigneeIds' }) || []
  const priority = useWatch({ control: form.control, name: 'priority' })
  const selectedMilestoneId = useWatch({ control: form.control, name: 'milestoneId' }) || ''
  const deadline = useWatch({ control: form.control, name: 'deadline' }) || ''
  const [memberSearch, setMemberSearch] = useState('')
  const assignableMembers = getAssignableProjectMembers(members)
  const assignableMemberIDs = new Set(assignableMembers.map((member) => member.id))
  const filteredMembers = assignableMembers.filter((member) => `${member.fullName} ${member.email}`.toLowerCase().includes(memberSearch.toLowerCase()))
  const visibleMembers = filteredMembers.slice(0, ASSIGNEE_OPTION_VISIBLE_COUNT)
  const selectedAssignableCount = selectedAssignees.filter((assigneeId) => assignableMemberIDs.has(assigneeId)).length
  return (
    <form className="flex min-h-0 flex-col" onSubmit={form.handleSubmit(onSubmit)}>
      <div className={compact ? 'space-y-3 pb-4' : 'space-y-4 pb-5'}>
        <Field label="Title" error={form.formState.errors.title?.message}>
          <Input placeholder="Define the assignment students should complete" {...form.register('title')} />
        </Field>
        <Field label="Description">
          <Textarea className={compact ? 'min-h-24' : undefined} placeholder="Expected outcome, evidence, and review notes for students" {...form.register('description')} />
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
        <div className={compact ? 'rounded-md border bg-paper p-3' : 'rounded-md border bg-paper p-4'}>
          <div className="mb-3">
            <p className="text-sm font-semibold text-ink">Assignment</p>
            <p className="text-xs leading-5 text-muted-foreground">Only active student members of this project can be assigned.</p>
          </div>
          <Label className="flex items-start gap-3">
            <Checkbox className="mt-1" {...form.register('assignAll')} />
            <span>
              Assign to all current student members
              <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
                {assignableMembers.length > 0 ? `${assignableMembers.length} student${assignableMembers.length === 1 ? '' : 's'} will be assigned.` : 'Add active students before assigning this work.'}
              </span>
            </span>
          </Label>
          {!assignAll && assignableMembers.length > 0 ? (
            <div className="mt-4 space-y-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                <Input placeholder="Search students" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} />
                <span className="text-sm font-semibold text-muted-foreground">{selectedAssignableCount} selected</span>
              </div>
              <div className={compact ? 'grid max-h-40 gap-2 overflow-y-auto' : 'grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2'}>
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
      <div className="-mx-5 border-t border-border bg-card px-5 py-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting || milestones.length === 0}>
            {isSubmitting ? 'Saving...' : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}

function getAssignableProjectMembers(members: ProjectMember[]) {
  return members.filter((member) => member.role === 'student' && member.status === 'active')
}

function getAssignableAssigneeIds(assigneeIds: string[], assignableMembers: ProjectMember[]) {
  const assignableMemberIDs = new Set(assignableMembers.map((member) => member.id))
  return assigneeIds.filter((assigneeId) => assignableMemberIDs.has(assigneeId))
}

function refreshAssignmentWorkflow(queryClient: QueryClient, projectId: string, taskId: string) {
  invalidateAssignmentWorkflowData(queryClient, projectId, taskId)
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

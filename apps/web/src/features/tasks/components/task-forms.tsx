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
import { adjustTaskStatus, createTask, reviewProgress, submitProgress, updateTask } from '@/features/tasks/api'
import { getErrorMessage, isForbiddenOrConflictError } from '@/lib/axios'
import { invalidateAssignmentWorkflowData, refreshProjectDataOnStaleError } from '@/lib/query-invalidation'
import { queryKeys } from '@/lib/query-keys'
import type { ProgressUpdate, ProjectMember, ProjectMilestone, Task } from '@/types/api'

const taskSchema = z.object({
  title: z.string().min(1, 'Title is required.'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
  deadline: z.string().optional(),
  milestoneId: z.string().min(1, 'Checkpoint is required.'),
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
  const formId = useId()
  const form = useForm<ProgressValues>({ resolver: zodResolver(progressSchema), defaultValues: { title: '', description: '', blockers: '' } })
  const titleId = `${formId}-title`
  const descriptionId = `${formId}-description`
  const blockersId = `${formId}-blockers`
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
      <Field id={titleId} label="Submission title">
        <Input id={titleId} placeholder="Prototype evidence ready" {...form.register('title')} />
      </Field>
      <Field id={descriptionId} label="What did you complete?" error={form.formState.errors.description?.message}>
        <Textarea id={descriptionId} placeholder="What changed, what evidence exists, and what should the teacher review?" {...form.register('description')} />
      </Field>
      <Field id={blockersId} label="Blockers or issues">
        <Textarea id={blockersId} placeholder="Anything blocking the work?" {...form.register('blockers')} />
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
type ManualOfficialProgressState = Extract<Task['officialProgressState'], 'in_progress' | 'needs_changes' | 'completed'>

interface StatusAdjustmentValues {
  officialProgressState: ManualOfficialProgressState
  reason: string
}

const statusAdjustmentChoices: Array<{ value: ManualOfficialProgressState; label: string; description: string }> = [
  { value: 'in_progress', label: 'Mark in progress', description: 'Use when work has started or a completed assignment needs another pass.' },
  { value: 'needs_changes', label: 'Return for revision', description: 'Use when the student needs clear changes before this can move forward.' },
  { value: 'completed', label: 'Mark complete', description: 'Use when the assignment is finished outside the submission flow.' },
]

export function ReviewProgressForm({ projectId, update, compact = false, disabledReason }: { projectId: string; update: ProgressUpdate; compact?: boolean; disabledReason?: string }) {
  const queryClient = useQueryClient()
  const formId = useId()
  const form = useForm<ReviewValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { decision: 'accept_progress', reviewComment: '' },
  })
  const decisionGroupName = useId()
  const decision = useWatch({ control: form.control, name: 'decision' })
  const requiresComment = decision === 'return_revision'
  const reviewCommentId = `${formId}-review-comment`
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
      <Field id={reviewCommentId} label={requiresComment ? 'Revision guidance' : 'Review comment'} description={requiresComment ? 'Tell the student exactly what must change before resubmitting.' : 'Optional note for the submission timeline.'} error={form.formState.errors.reviewComment?.message}>
        <Textarea id={reviewCommentId} className={compact ? 'min-h-24' : undefined} placeholder={requiresComment ? 'What should the student revise?' : 'Teacher review comment'} {...form.register('reviewComment')} />
      </Field>
      {disabledReason ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-950">{disabledReason}</p> : null}
      <Button type="submit" className={compact ? 'w-full' : undefined} disabled={mutation.isPending || Boolean(disabledReason)}>{mutation.isPending ? 'Saving...' : 'Save review'}</Button>
    </form>
  )
}

export function AdjustTaskStatusForm({ projectId, task, disabledReason, onAdjusted }: { projectId: string; task: Task; disabledReason?: string; onAdjusted?: () => void }) {
  const queryClient = useQueryClient()
  const formId = useId()
  const choices = statusAdjustmentChoices.filter((choice) => choice.value !== task.officialProgressState)
  const defaultTargetState = defaultStatusAdjustmentTarget(task.officialProgressState)
  const form = useForm<StatusAdjustmentValues>({ defaultValues: { officialProgressState: defaultTargetState, reason: '' } })
  useEffect(() => {
    form.reset({ officialProgressState: defaultTargetState, reason: '' })
  }, [defaultTargetState, form, task.id])
  const targetState = useWatch({ control: form.control, name: 'officialProgressState' })
  const requiresReason = statusAdjustmentRequiresReason(task, targetState)
  const reasonId = `${formId}-reason`
  const mutation = useMutation({
    mutationFn: adjustTaskStatus,
    onSuccess: () => {
      toast.success('Assignment status adjusted')
      invalidateAssignmentWorkflowData(queryClient, projectId, task.id)
      onAdjusted?.()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      if (isForbiddenOrConflictError(error)) {
        refreshAssignmentWorkflow(queryClient, projectId, task.id)
      }
    },
  })

  return (
    <form
      className="space-y-4 pb-5"
      onSubmit={form.handleSubmit((values) => {
        const reason = values.reason.trim()
        if (statusAdjustmentRequiresReason(task, values.officialProgressState) && !reason) {
          form.setError('reason', { type: 'manual', message: 'Add a reason for this status change.' })
          return
        }
        mutation.mutate({ projectId, taskId: task.id, officialProgressState: values.officialProgressState, reason })
      })}
    >
      <p className="rounded-xl border border-dashed border-border bg-paper/70 px-4 py-3 text-sm leading-6 text-muted-foreground">
        Current assignment state: <span className="font-semibold text-ink">{statusAdjustmentLabel(task.officialProgressState)}</span>. This does not edit submission, review, or evidence history.
      </p>
      <div className="grid gap-2" role="radiogroup" aria-label="New assignment status">
        {choices.map((choice) => <StatusAdjustmentChoice key={choice.value} choice={choice} form={form} disabled={mutation.isPending || Boolean(disabledReason)} />)}
      </div>
      <Field id={reasonId} label="Reason" description={requiresReason ? 'Required for completion, revision, or reopening a completed assignment.' : 'Optional context saved to the activity history.'} error={form.formState.errors.reason?.message}>
        <Textarea id={reasonId} placeholder={statusAdjustmentReasonPlaceholder(targetState)} {...form.register('reason')} />
      </Field>
      {disabledReason ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-950">{disabledReason}</p> : null}
      <Button type="submit" disabled={mutation.isPending || Boolean(disabledReason)}>{mutation.isPending ? 'Saving...' : 'Save status'}</Button>
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
      {compact ? null : <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">{description}</span>}
    </label>
  )
}

function StatusAdjustmentChoice({ choice, form, disabled }: { choice: { value: ManualOfficialProgressState; label: string; description: string }; form: UseFormReturn<StatusAdjustmentValues>; disabled: boolean }) {
  const selected = useWatch({ control: form.control, name: 'officialProgressState' })
  const isSelected = selected === choice.value
  return (
    <label className={isSelected ? 'block cursor-pointer rounded-xl border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-semibold text-primary focus-within:ring-2 focus-within:ring-primary/20' : 'block cursor-pointer rounded-xl border border-border bg-card px-3 py-2 text-left text-sm font-semibold text-ink transition focus-within:ring-2 focus-within:ring-primary/20 hover:border-primary/40 hover:bg-accent'}>
      <input type="radio" className="sr-only" value={choice.value} disabled={disabled} {...form.register('officialProgressState')} />
      <span className="block">{choice.label}</span>
      <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">{choice.description}</span>
    </label>
  )
}

function defaultStatusAdjustmentTarget(officialProgressState: Task['officialProgressState']): ManualOfficialProgressState {
  if (officialProgressState === 'no_progress' || officialProgressState === 'completed' || officialProgressState === 'needs_changes') {
    return 'in_progress'
  }
  return 'completed'
}

function statusAdjustmentRequiresReason(task: Task, targetState: ManualOfficialProgressState) {
  return task.officialProgressState === 'completed' || task.status === 'done' || targetState === 'completed' || targetState === 'needs_changes'
}

function statusAdjustmentLabel(state: Task['officialProgressState']) {
  switch (state) {
    case 'completed':
      return 'Complete'
    case 'needs_changes':
      return 'Needs revision'
    case 'in_progress':
      return 'In progress'
    default:
      return 'Not started'
  }
}

function statusAdjustmentReasonPlaceholder(state: ManualOfficialProgressState) {
  switch (state) {
    case 'completed':
      return 'Why is this assignment complete?'
    case 'needs_changes':
      return 'What should the student revise?'
    default:
      return 'What changed outside the submission flow?'
  }
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
  const formId = useId()
  const priority = useWatch({ control: form.control, name: 'priority' })
  const selectedMilestoneId = useWatch({ control: form.control, name: 'milestoneId' }) || ''
  const deadline = useWatch({ control: form.control, name: 'deadline' }) || ''
  const [memberSearch, setMemberSearch] = useState('')
  const assignableMembers = getAssignableProjectMembers(members)
  const assignableMemberIDs = new Set(assignableMembers.map((member) => member.id))
  const filteredMembers = assignableMembers.filter((member) => `${member.fullName} ${member.email}`.toLowerCase().includes(memberSearch.toLowerCase()))
  const visibleMembers = filteredMembers.slice(0, ASSIGNEE_OPTION_VISIBLE_COUNT)
  const selectedAssignableCount = selectedAssignees.filter((assigneeId) => assignableMemberIDs.has(assigneeId)).length
  const titleId = `${formId}-title`
  const descriptionId = `${formId}-description`
  const milestoneId = `${formId}-milestone`
  const priorityId = `${formId}-priority`
  const deadlineId = `${formId}-deadline`
  const memberSearchId = `${formId}-member-search`
  return (
    <form className="flex min-h-0 flex-col" onSubmit={form.handleSubmit(onSubmit)}>
      <div className={compact ? 'space-y-3 pb-4' : 'space-y-4 pb-5'}>
        <Field id={titleId} label="Title" error={form.formState.errors.title?.message}>
          <Input id={titleId} placeholder="Define the assignment students should complete" {...form.register('title')} />
        </Field>
        <Field id={descriptionId} label="Description">
          <Textarea id={descriptionId} className={compact ? 'min-h-24' : undefined} placeholder="Expected outcome, evidence, and review notes for students" {...form.register('description')} />
        </Field>
        {milestones.length > 0 ? (
          <Field id={milestoneId} label="Checkpoint" description="Required checkpoint this assignment belongs under." error={form.formState.errors.milestoneId?.message}>
            <Select value={selectedMilestoneId} onValueChange={(value) => form.setValue('milestoneId', value, { shouldDirty: true, shouldValidate: true })}>
              <SelectTrigger id={milestoneId}>
                <SelectValue placeholder="Choose checkpoint" />
              </SelectTrigger>
              <SelectContent>
                {milestones.map((milestone) => <SelectItem key={milestone.id} value={milestone.id}>{milestone.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        ) : <p className="rounded-xl border border-dashed border-border bg-paper px-3 py-2 text-sm text-muted-foreground">Create a checkpoint before adding assignments.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <Field id={priorityId} label="Priority" description="Used for scanning the supervision plan.">
            <Select value={priority} onValueChange={(value) => form.setValue('priority', value as TaskValues['priority'], { shouldDirty: true, shouldValidate: true })}>
              <SelectTrigger id={priorityId}>
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id={deadlineId} label="Deadline" description="Date-only deadline used for overdue alerts.">
            <DatePicker id={deadlineId} value={deadline} onValueChange={(value) => form.setValue('deadline', value, { shouldDirty: true, shouldValidate: true })} />
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
                <Input id={memberSearchId} aria-label="Search students" placeholder="Search students" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} />
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

function Field({ id, label, description, error, children }: { id?: string; label: string; description?: string; error?: string; children: ReactNode }) {
  return (
    <BaseField>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {description ? <p className="text-xs leading-5 text-muted-foreground">{description}</p> : null}
      {children}
      <FieldError message={error} />
    </BaseField>
  )
}

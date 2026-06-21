import { apiClient } from '@/lib/axios'
import type { ProgressUpdate, Task, TaskDetail } from '@/types/api'

export interface CreateTaskInput {
  projectId: string
  title: string
  description?: string
  status?: Task['status']
  priority?: Task['priority']
  deadline?: string
  milestoneId?: string
  assigneeIds?: string[]
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {
  projectId: string
  taskId: string
  officialProgressState?: Task['officialProgressState']
}

export interface SubmitProgressInput {
  projectId: string
  taskId: string
  title?: string
  description: string
  blockers?: string
}

export interface ReviewProgressInput {
  projectId: string
  updateId: string
  reviewStatus: 'approved' | 'needs_changes' | 'rejected'
  reviewComment?: string
  officialProgressState?: 'no_progress' | 'in_progress' | 'needs_changes' | 'completed'
}

export async function createTask({ projectId, ...input }: CreateTaskInput) {
  const { data } = await apiClient.post<TaskDetail>(`/projects/${projectId}/tasks`, input)
  return data
}

export async function getTask(projectId: string, taskId: string) {
  const { data } = await apiClient.get<TaskDetail>(`/projects/${projectId}/tasks/${taskId}`)
  return data
}

export async function updateTask({ projectId, taskId, ...input }: UpdateTaskInput) {
  const { data } = await apiClient.patch<TaskDetail>(`/projects/${projectId}/tasks/${taskId}`, input)
  return data
}

export async function submitProgress({ projectId, taskId, title, description, blockers }: SubmitProgressInput) {
  const { data } = await apiClient.post<ProgressUpdate>(`/projects/${projectId}/tasks/${taskId}/progress-updates`, {
    title,
    description,
    blockers,
  })
  return data
}

export async function reviewProgress({ projectId, updateId, reviewStatus, reviewComment, officialProgressState }: ReviewProgressInput) {
  const { data } = await apiClient.post<ProgressUpdate>(`/projects/${projectId}/progress-updates/${updateId}/reviews`, {
    reviewStatus,
    reviewComment,
    officialProgressState,
  })
  return data
}

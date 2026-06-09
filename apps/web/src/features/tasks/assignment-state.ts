import type { Task } from '@/types/api'

export type AssignmentStateKey = 'not_started' | 'in_progress' | 'waiting_review' | 'needs_revision' | 'complete' | 'overdue'

export interface AssignmentState {
  key: AssignmentStateKey
  label: string
  tone: 'blue' | 'teal' | 'amber' | 'red' | 'slate'
  description: string
}

export function getAssignmentState(task: Task): AssignmentState {
  if (task.pendingReviewCount > 0) {
    return {
      key: 'waiting_review',
      label: 'Waiting for review',
      tone: 'amber',
      description: 'A student submitted work and needs a teacher decision.',
    }
  }
  if (task.officialProgressState === 'needs_changes') {
    return {
      key: 'needs_revision',
      label: 'Needs revision',
      tone: 'amber',
      description: 'The latest reviewed submission needs changes.',
    }
  }
  if (task.officialProgressState === 'completed') {
    return {
      key: 'complete',
      label: 'Complete',
      tone: 'teal',
      description: 'The teacher marked this assignment complete.',
    }
  }
  if (task.isOverdue) {
    return {
      key: 'overdue',
      label: 'Overdue',
      tone: 'red',
      description: 'The deadline has passed and this assignment is not complete.',
    }
  }
  if (task.officialProgressState === 'in_progress') {
    return {
      key: 'in_progress',
      label: 'In progress',
      tone: 'blue',
      description: 'The teacher accepted progress, but the assignment is not complete yet.',
    }
  }
  return {
    key: 'not_started',
    label: 'Not started',
    tone: 'slate',
    description: 'No reviewed work has started this assignment yet.',
  }
}

import { formatDate } from '@/lib/format'
import type { Project } from '@/types/api'

export function projectNeedsAttention(project: Project) {
  if (project.status === 'archived') {
    return false
  }
  if (project.status !== 'active') {
    return project.pendingReviewCount > 0
  }
  return project.overdueTaskCount > 0 || project.pendingReviewCount > 0 || hasMissingProgress(project)
}

export function getProjectAttentionReason(project: Project) {
  if (project.pendingReviewCount > 0) {
    return `${project.pendingReviewCount} review${project.pendingReviewCount === 1 ? '' : 's'}`
  }
  if (project.overdueTaskCount > 0) {
    return `${project.overdueTaskCount} overdue`
  }
  if (!project.lastApprovedUpdateAt) {
    return 'No approved update'
  }
  return 'Stale progress'
}

export function getLastApprovedLabel(project: Project) {
  return project.lastApprovedUpdateAt ? formatDate(project.lastApprovedUpdateAt) : 'none'
}

function hasMissingProgress(project: Project) {
  if (project.status !== 'active') {
    return false
  }
  if (project.taskCount === 0) {
    return false
  }
  if (!project.lastApprovedUpdateAt) {
    return true
  }
  return Date.now() - new Date(project.lastApprovedUpdateAt).getTime() > 7 * 24 * 60 * 60 * 1000
}

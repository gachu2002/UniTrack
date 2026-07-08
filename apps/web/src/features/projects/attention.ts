import { formatDate } from '@/lib/format'
import type { Project } from '@/types/api'

export interface ProjectWorkSignal {
  label: string
  tone: 'amber' | 'red'
}

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

export function getProjectWorkSignal(project: Project, { includeGeneralAttention = false }: { includeGeneralAttention?: boolean } = {}): ProjectWorkSignal | null {
  if (project.pendingReviewCount > 0) {
    return { label: `${project.pendingReviewCount} review${project.pendingReviewCount === 1 ? '' : 's'} waiting`, tone: 'amber' }
  }
  if (project.overdueTaskCount > 0) {
    return { label: `${project.overdueTaskCount} overdue`, tone: 'red' }
  }
  if (project.needsChangesTaskCount > 0 || project.officialProgressState === 'needs_changes') {
    return { label: 'Revision needed', tone: 'amber' }
  }
  if (includeGeneralAttention && projectNeedsAttention(project)) {
    return { label: 'Needs attention', tone: 'amber' }
  }
  return null
}

export function getLastApprovedLabel(project: Project) {
  return project.lastApprovedUpdateAt ? formatDate(project.lastApprovedUpdateAt) : 'None'
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

import type { Project, User } from '@/types/api'

export function canCreateProjects(user?: User | null) {
  return user?.role === 'admin' || user?.role === 'teacher'
}

export function canManageProject(user?: User | null, project?: Project | null) {
  if (!user || !project) {
    return false
  }
  return user.role === 'admin' || (user.role === 'teacher' && project.supervisorId === user.id)
}

export function canManageProjects(user?: User | null) {
  return canCreateProjects(user)
}

export function canReviewProgress(user?: User | null) {
  return user?.role === 'admin' || user?.role === 'teacher'
}

export function projectAcceptsPlanChanges(project?: Project | null) {
  return project?.status === 'active' || project?.status === 'on_hold'
}

export function projectAcceptsNewAssignments(project?: Project | null) {
  return project?.status === 'active'
}

export function projectAcceptsStudentSubmissions(project?: Project | null) {
  return project?.status === 'active'
}

export function projectAcceptsReviews(project?: Project | null) {
  return Boolean(project && project.status !== 'archived')
}

export function projectAcceptsTeamChanges(project?: Project | null) {
  return project?.status === 'active' || project?.status === 'on_hold'
}

export function projectAcceptsSupportChanges(project?: Project | null) {
  return project?.status === 'active' || project?.status === 'on_hold'
}

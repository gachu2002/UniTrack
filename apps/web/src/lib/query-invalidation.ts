import type { QueryClient } from '@tanstack/react-query'

import { isForbiddenOrConflictError } from '@/lib/axios'
import { queryKeys } from '@/lib/query-keys'

export function invalidateWorkspaceData(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
  queryClient.invalidateQueries({ queryKey: queryKeys.projects })
  queryClient.invalidateQueries({ queryKey: queryKeys.classes })
}

export function invalidateAdminAccountImpactData(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers })
  invalidateWorkspaceData(queryClient)
}

export function invalidateClassData(queryClient: QueryClient, classId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.classes })
  queryClient.invalidateQueries({ queryKey: queryKeys.class(classId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.classProjectCandidates(classId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.projects })
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
}

export function invalidateProjectData(queryClient: QueryClient, projectId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(projectId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.projectMilestones(projectId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.projectProgress(projectId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.projectResourceLinks(projectId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.projectFiles(projectId) })
  invalidateWorkspaceData(queryClient)
}

export function invalidateAssignmentWorkflowData(queryClient: QueryClient, projectId: string, taskId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.task(projectId, taskId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.projectProgress(projectId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.projectMilestones(projectId) })
  invalidateWorkspaceData(queryClient)
}

export function invalidateProjectSupportData(queryClient: QueryClient, projectId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.projectResourceLinks(projectId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.projectMilestones(projectId) })
  invalidateWorkspaceData(queryClient)
}

export function invalidateProjectEvidenceData(queryClient: QueryClient, projectId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.projectFiles(projectId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.projectProgress(projectId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.projectMilestones(projectId) })
  invalidateWorkspaceData(queryClient)
}

export function refreshWorkspaceDataOnStaleError(queryClient: QueryClient, error: unknown) {
  if (isForbiddenOrConflictError(error)) {
    invalidateWorkspaceData(queryClient)
  }
}

export function refreshClassDataOnStaleError(queryClient: QueryClient, classId: string, error: unknown) {
  if (isForbiddenOrConflictError(error)) {
    invalidateClassData(queryClient, classId)
  }
}

export function refreshProjectDataOnStaleError(queryClient: QueryClient, projectId: string, error: unknown) {
  if (isForbiddenOrConflictError(error)) {
    invalidateProjectData(queryClient, projectId)
  }
}

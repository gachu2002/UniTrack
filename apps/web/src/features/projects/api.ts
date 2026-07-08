import { apiClient } from '@/lib/axios'
import { fetchAllPaginated, paginatedTotalPages } from '@/lib/pagination'
import type { PaginatedResponse, ProgressUpdate, Project, ProjectMember, ProjectMilestone, ResourceLink, Task } from '@/types/api'

const PROJECT_RELATION_PAGE_LIMIT = 500

export interface CreateProjectInput {
  name: string
  description?: string
  topic?: string
  classId?: string
  startDate?: string
  endDate?: string
  status: Project['status']
}

export interface GetProjectsParams {
  limit?: number
  page?: number
  unassigned?: boolean
  search?: string
  excludeArchived?: boolean
  supervisorId?: string
}

export interface UpdateProjectInput extends Partial<CreateProjectInput> {
  projectId: string
  progressSummary?: string
}

export interface AddProjectMemberInput {
  projectId: string
  email: string
}

export interface CreateMilestoneInput {
  projectId: string
  title: string
  description?: string
  targetDate?: string
  sortOrder?: number
}

export interface UpdateMilestoneInput extends Partial<CreateMilestoneInput> {
  projectId: string
  milestoneId: string
}

export interface DeleteMilestoneInput {
  projectId: string
  milestoneId: string
}

export interface ReorderMilestonesInput {
  projectId: string
  milestoneIds: string[]
}

export interface RemoveProjectMemberInput {
  projectId: string
  memberId: string
}

export interface UpdateProjectMemberInput {
  projectId: string
  memberId: string
  memberRole: ProjectMember['memberRole']
}

export interface CreateResourceLinkInput {
  projectId: string
  relatedType?: ResourceLink['relatedType']
  relatedId?: string
  title: string
  url: string
  type?: ResourceLink['type']
  description?: string
}

export interface UpdateResourceLinkInput extends Partial<Omit<CreateResourceLinkInput, 'projectId'>> {
  projectId: string
  resourceLinkId: string
}

export interface DeleteResourceLinkInput {
  projectId: string
  resourceLinkId: string
}

export async function getProjectsPage(params?: GetProjectsParams) {
  const data = await fetchProjectsPage(params)
  const requestedPage = params?.page || data.page
  const totalPages = paginatedTotalPages(data)
  if (requestedPage > totalPages && data.page !== totalPages) {
    return fetchProjectsPage({ ...params, page: totalPages })
  }
  return data
}

export async function getProjects(params?: GetProjectsParams) {
  const data = await getProjectsPage(params)
  return data.items
}

export async function createProject(input: CreateProjectInput) {
  const { data } = await apiClient.post<Project>('/projects', input)
  return data
}

export async function updateProject({ projectId, ...input }: UpdateProjectInput) {
  const { data } = await apiClient.patch<Project>(`/projects/${projectId}`, input)
  return data
}

export async function getProject(projectId: string) {
  const { data } = await apiClient.get<Project>(`/projects/${projectId}`)
  return data
}

export async function getProjectMembers(projectId: string) {
  return fetchAllPaginated((page) => fetchProjectMembersPage(projectId, page))
}

export async function getProjectMilestones(projectId: string) {
  return fetchAllPaginated((page) => fetchProjectMilestonesPage(projectId, page))
}

export async function createMilestone({ projectId, ...input }: CreateMilestoneInput) {
  const { data } = await apiClient.post<ProjectMilestone>(`/projects/${projectId}/milestones`, input)
  return data
}

export async function updateMilestone({ projectId, milestoneId, ...input }: UpdateMilestoneInput) {
  const { data } = await apiClient.patch<ProjectMilestone>(`/projects/${projectId}/milestones/${milestoneId}`, input)
  return data
}

export async function deleteMilestone({ projectId, milestoneId }: DeleteMilestoneInput) {
  await apiClient.delete(`/projects/${projectId}/milestones/${milestoneId}`)
}

export async function reorderMilestones({ projectId, milestoneIds }: ReorderMilestonesInput) {
  const { data } = await apiClient.patch<ProjectMilestone[]>(`/projects/${projectId}/milestones/reorder`, { milestoneIds })
  return data
}

export async function getProjectTasks(projectId: string) {
  return fetchAllPaginated((page) => fetchProjectTasksPage(projectId, page))
}

export async function getProjectProgress(projectId: string) {
  return fetchAllPaginated((page) => fetchProjectProgressPage(projectId, page))
}

export async function getProjectResourceLinks(projectId: string) {
  return fetchAllPaginated((page) => fetchProjectResourceLinksPage(projectId, page))
}

export async function addProjectMember({ projectId, email }: AddProjectMemberInput) {
  const { data } = await apiClient.post<ProjectMember>(`/projects/${projectId}/members`, { email })
  return data
}

export async function removeProjectMember({ projectId, memberId }: RemoveProjectMemberInput) {
  await apiClient.delete(`/projects/${projectId}/members/${memberId}`)
}

export async function updateProjectMember({ projectId, memberId, memberRole }: UpdateProjectMemberInput) {
  const { data } = await apiClient.patch<ProjectMember>(`/projects/${projectId}/members/${memberId}`, { memberRole })
  return data
}

export async function createResourceLink({ projectId, ...input }: CreateResourceLinkInput) {
  const { data } = await apiClient.post<ResourceLink>(`/projects/${projectId}/resource-links`, input)
  return data
}

export async function updateResourceLink({ projectId, resourceLinkId, ...input }: UpdateResourceLinkInput) {
  const { data } = await apiClient.patch<ResourceLink>(`/projects/${projectId}/resource-links/${resourceLinkId}`, input)
  return data
}

export async function deleteResourceLink({ projectId, resourceLinkId }: DeleteResourceLinkInput) {
  await apiClient.delete(`/projects/${projectId}/resource-links/${resourceLinkId}`)
}

async function fetchProjectsPage(params?: GetProjectsParams) {
  const { data } = await apiClient.get<PaginatedResponse<Project>>('/projects', { params })
  return data
}

async function fetchProjectMembersPage(projectId: string, page: number) {
  const { data } = await apiClient.get<PaginatedResponse<ProjectMember>>(`/projects/${projectId}/members`, { params: { limit: PROJECT_RELATION_PAGE_LIMIT, page } })
  return data
}

async function fetchProjectMilestonesPage(projectId: string, page: number) {
  const { data } = await apiClient.get<PaginatedResponse<ProjectMilestone>>(`/projects/${projectId}/milestones`, { params: { limit: PROJECT_RELATION_PAGE_LIMIT, page } })
  return data
}

async function fetchProjectTasksPage(projectId: string, page: number) {
  const { data } = await apiClient.get<PaginatedResponse<Task>>(`/projects/${projectId}/tasks`, { params: { limit: PROJECT_RELATION_PAGE_LIMIT, page } })
  return data
}

async function fetchProjectProgressPage(projectId: string, page: number) {
  const { data } = await apiClient.get<PaginatedResponse<ProgressUpdate>>(`/projects/${projectId}/progress-updates`, { params: { limit: PROJECT_RELATION_PAGE_LIMIT, page } })
  return data
}

async function fetchProjectResourceLinksPage(projectId: string, page: number) {
  const { data } = await apiClient.get<PaginatedResponse<ResourceLink>>(`/projects/${projectId}/resource-links`, { params: { limit: PROJECT_RELATION_PAGE_LIMIT, page } })
  return data
}

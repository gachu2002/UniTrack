import { apiClient } from '@/lib/axios'
import type { ProgressUpdate, Project, ProjectMember, ProjectMilestone, ResourceLink, Task } from '@/types/api'

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
  unassigned?: boolean
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

export async function getProjects(params?: GetProjectsParams) {
  const { data } = await apiClient.get<Project[]>('/projects', { params })
  return data
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
  const { data } = await apiClient.get<ProjectMember[]>(`/projects/${projectId}/members`)
  return data
}

export async function getProjectMilestones(projectId: string) {
  const { data } = await apiClient.get<ProjectMilestone[]>(`/projects/${projectId}/milestones`)
  return data
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

export async function getProjectTasks(projectId: string) {
  const { data } = await apiClient.get<Task[]>(`/projects/${projectId}/tasks`)
  return data
}

export async function getProjectProgress(projectId: string) {
  const { data } = await apiClient.get<ProgressUpdate[]>(`/projects/${projectId}/progress-updates`)
  return data
}

export async function getProjectResourceLinks(projectId: string) {
  const { data } = await apiClient.get<ResourceLink[]>(`/projects/${projectId}/resource-links`)
  return data
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

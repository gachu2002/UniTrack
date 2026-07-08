import { apiClient } from '@/lib/axios'
import type { ClassFolder, ClassFolderDetail, PaginatedResponse } from '@/types/api'

export interface GetClassesParams {
  limit?: number
  page?: number
  status?: ClassFolder['status']
  search?: string
}

export interface CreateClassFolderInput {
  title: string
  color?: ClassFolder['color']
  description?: string
  status?: ClassFolder['status']
  ownerTeacherId?: string
}

export interface UpdateClassFolderInput {
  classId: string
  title?: string
  color?: ClassFolder['color']
  description?: string
  status?: ClassFolder['status']
}

export interface LinkClassProjectInput {
  classId: string
  projectId: string
}

export async function getClassesPage(params?: GetClassesParams) {
  const { data } = await apiClient.get<PaginatedResponse<ClassFolder>>('/classes', { params })
  return data
}

export async function getClasses(params?: GetClassesParams) {
  const data = await getClassesPage({ limit: 200, ...params })
  return data.items
}

export async function createClass(input: CreateClassFolderInput) {
  const { data } = await apiClient.post<ClassFolder>('/classes', input)
  return data
}

export async function getClass(classId: string) {
  const { data } = await apiClient.get<ClassFolderDetail>(`/classes/${classId}`)
  return data
}

export async function updateClass({ classId, ...input }: UpdateClassFolderInput) {
  const { data } = await apiClient.patch<ClassFolder>(`/classes/${classId}`, input)
  return data
}

export async function linkClassProject({ classId, projectId }: LinkClassProjectInput) {
  const { data } = await apiClient.post<ClassFolderDetail>(`/classes/${classId}/projects`, { projectId })
  return data
}

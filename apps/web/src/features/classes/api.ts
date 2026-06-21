import { apiClient } from '@/lib/axios'
import type { ClassFolder, ClassFolderDetail } from '@/types/api'

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

export async function getClasses() {
  const { data } = await apiClient.get<ClassFolder[]>('/classes')
  return data
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

import { apiClient } from '@/lib/axios'
import type { ClassFolder, CourseSectionDetail } from '@/types/api'

export interface CreateCourseSectionInput {
  title: string
  color?: ClassFolder['color']
  description?: string
  status?: ClassFolder['status']
}

export interface UpdateCourseSectionInput {
  classId: string
  title?: string
  color?: ClassFolder['color']
  description?: string
  status?: ClassFolder['status']
}

export interface LinkCourseProjectInput {
  classId: string
  projectId: string
}

export async function getClasses() {
  const { data } = await apiClient.get<ClassFolder[]>('/classes')
  return data
}

export async function createClass(input: CreateCourseSectionInput) {
  const { data } = await apiClient.post<ClassFolder>('/classes', input)
  return data
}

export async function getClass(classId: string) {
  const { data } = await apiClient.get<CourseSectionDetail>(`/classes/${classId}`)
  return data
}

export async function updateClass({ classId, ...input }: UpdateCourseSectionInput) {
  const { data } = await apiClient.patch<ClassFolder>(`/classes/${classId}`, input)
  return data
}

export async function linkClassProject({ classId, projectId }: LinkCourseProjectInput) {
  const { data } = await apiClient.post<CourseSectionDetail>(`/classes/${classId}/projects`, { projectId })
  return data
}

import { apiClient } from '@/lib/axios'
import { paginatedTotalPages } from '@/lib/pagination'
import type { ClassFolder, ClassFolderDetail, PaginatedResponse } from '@/types/api'

const CLASS_PROJECT_PAGE_LIMIT = 500

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
  const data = await fetchClassesPage(params)
  const requestedPage = params?.page || data.page
  const totalPages = paginatedTotalPages(data)
  if (requestedPage > totalPages && data.page !== totalPages) {
    return fetchClassesPage({ ...params, page: totalPages })
  }
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
  const firstPage = await fetchClassDetailPage(classId, 1)
  if (!firstPage.projectsPage) {
    return firstPage
  }

  const projects = [...firstPage.projectsPage.items]
  const totalPages = paginatedTotalPages(firstPage.projectsPage)
  for (let page = 2; page <= totalPages; page += 1) {
    const detail = await fetchClassDetailPage(classId, page)
    projects.push(...(detail.projectsPage?.items ?? detail.projects))
  }

  return {
    ...firstPage,
    projects,
    projectsPage: { ...firstPage.projectsPage, items: projects },
  }
}

export async function updateClass({ classId, ...input }: UpdateClassFolderInput) {
  const { data } = await apiClient.patch<ClassFolder>(`/classes/${classId}`, input)
  return data
}

export async function linkClassProject({ classId, projectId }: LinkClassProjectInput) {
  const { data } = await apiClient.post<ClassFolderDetail>(`/classes/${classId}/projects`, { projectId })
  return data
}

async function fetchClassesPage(params?: GetClassesParams) {
  const { data } = await apiClient.get<PaginatedResponse<ClassFolder>>('/classes', { params })
  return data
}

async function fetchClassDetailPage(classId: string, page: number) {
  const { data } = await apiClient.get<ClassFolderDetail>(`/classes/${classId}`, { params: { limit: CLASS_PROJECT_PAGE_LIMIT, page } })
  return data
}

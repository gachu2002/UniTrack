import { apiClient } from '@/lib/axios'
import { fetchAllPaginated } from '@/lib/pagination'
import type { PaginatedResponse, UploadedFile } from '@/types/api'

const PROJECT_FILE_PAGE_LIMIT = 500

export interface UploadProjectFileInput {
  projectId: string
  targetType: UploadedFile['relatedType']
  targetId: string
  file: File
}

export interface UploadedFileInput {
  projectId: string
  fileId: string
}

export async function getProjectFiles(projectId: string) {
  return fetchAllPaginated((page) => fetchProjectFilesPage(projectId, page))
}

export async function uploadProjectFile({ projectId, targetId, file }: UploadProjectFileInput) {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await apiClient.post<UploadedFile>(`/projects/${projectId}/progress-updates/${targetId}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function downloadUploadedFile({ projectId, fileId }: UploadedFileInput) {
  const { data } = await apiClient.get<Blob>(`/projects/${projectId}/files/${fileId}/download`, { responseType: 'blob' })
  return data
}

export async function deleteUploadedFile({ projectId, fileId }: UploadedFileInput) {
  await apiClient.delete(`/projects/${projectId}/files/${fileId}`)
}

async function fetchProjectFilesPage(projectId: string, page: number) {
  const { data } = await apiClient.get<PaginatedResponse<UploadedFile>>(`/projects/${projectId}/files`, { params: { limit: PROJECT_FILE_PAGE_LIMIT, page } })
  return data
}

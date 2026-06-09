import { apiClient } from '@/lib/axios'
import type { UploadedFile } from '@/types/api'

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
  const { data } = await apiClient.get<UploadedFile[]>(`/projects/${projectId}/files`)
  return data
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

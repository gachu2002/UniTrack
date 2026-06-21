import type { UploadedFile } from '@/types/api'

export function filesForTarget(files: UploadedFile[], targetType: UploadedFile['relatedType'], targetId: string) {
  return files.filter((file) => file.relatedType === targetType && file.relatedId === targetId)
}

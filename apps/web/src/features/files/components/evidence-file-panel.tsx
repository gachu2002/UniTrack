import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, Paperclip, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteUploadedFile, downloadUploadedFile, uploadProjectFile } from '@/features/files/api'
import { getErrorMessage } from '@/lib/axios'
import { formatDateTime } from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import type { UploadedFile } from '@/types/api'

const EVIDENCE_FILE_INITIAL_COUNT = 8

interface EvidenceFilePanelProps {
  projectId: string
  targetType: UploadedFile['relatedType']
  targetId: string
  files: UploadedFile[]
  canUpload: boolean
  canManage: boolean
  currentUserId?: string
  description: string
  emptyMessage?: string
}

export function EvidenceFilePanel({ projectId, targetType, targetId, files, canUpload, canManage, currentUserId, description, emptyMessage = 'No evidence files attached yet.' }: EvidenceFilePanelProps) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [showAllFiles, setShowAllFiles] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UploadedFile | null>(null)
  const uploadMutation = useMutation({
    mutationFn: uploadProjectFile,
    onSuccess: () => {
      toast.success('Evidence uploaded')
      setFile(null)
      setFileInputKey((key) => key + 1)
      queryClient.invalidateQueries({ queryKey: queryKeys.projectFiles(projectId) })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const downloadMutation = useMutation({
    mutationFn: async (uploadedFile: UploadedFile) => {
      const blob = await downloadUploadedFile({ projectId, fileId: uploadedFile.id })
      saveBlob(blob, uploadedFile.originalFileName)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const deleteMutation = useMutation({
    mutationFn: deleteUploadedFile,
    onSuccess: () => {
      toast.success('Evidence removed')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: queryKeys.projectFiles(projectId) })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const visibleFiles = showAllFiles ? files : files.slice(0, EVIDENCE_FILE_INITIAL_COUNT)

  return (
    <>
    <section className="mt-3 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground"><Paperclip className="size-3.5" /> Evidence docket</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {canUpload ? (
          <form className="flex flex-col gap-2 sm:min-w-72" onSubmit={(event) => {
            event.preventDefault()
            if (!file) {
              toast.error('Choose a file first')
              return
            }
            uploadMutation.mutate({ projectId, targetType, targetId, file })
          }}>
            <Input key={fileInputKey} type="file" className="bg-white" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            <Button type="submit" size="sm" disabled={!file || uploadMutation.isPending}><Upload className="size-4" /> {uploadMutation.isPending ? 'Uploading...' : 'Upload evidence'}</Button>
          </form>
        ) : null}
      </div>

      {files.length > 0 ? (
        <div className="divide-y divide-border border-t border-border">
          {visibleFiles.map((uploadedFile) => {
            const canDelete = canManage || uploadedFile.uploadedBy === currentUserId
            const isDownloading = downloadMutation.isPending && downloadMutation.variables?.id === uploadedFile.id
            const isDeleting = deleteMutation.isPending && deleteMutation.variables?.fileId === uploadedFile.id
            return (
              <article key={uploadedFile.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="size-4" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{uploadedFile.originalFileName}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(uploadedFile.fileSizeBytes)} · {uploadedFile.uploadedByName} · {formatDateTime(uploadedFile.createdAt)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={isDownloading} onClick={() => downloadMutation.mutate(uploadedFile)}><Download className="size-4" /> {isDownloading ? 'Downloading...' : 'Download'}</Button>
                  {canDelete ? <Button type="button" variant="ghost" size="sm" disabled={isDeleting} onClick={() => setDeleteTarget(uploadedFile)}><Trash2 className="size-4" /> {isDeleting ? 'Deleting...' : 'Delete'}</Button> : null}
                </div>
              </article>
            )
          })}
          {files.length > EVIDENCE_FILE_INITIAL_COUNT ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAllFiles((value) => !value)}>{showAllFiles ? 'Show fewer files' : `Show all ${files.length} files`}</Button>
            </div>
          ) : null}
        </div>
      ) : <p className="text-sm text-muted-foreground">{emptyMessage}</p>}
    </section>
    <ConfirmDialog
      open={Boolean(deleteTarget)}
      title="Delete evidence?"
      description={deleteTarget ? `Delete "${deleteTarget.originalFileName}" from this submission.` : ''}
      confirmLabel="Delete evidence"
      isPending={deleteMutation.isPending}
      onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
      onConfirm={() => {
        if (deleteTarget) {
          deleteMutation.mutate({ projectId, fileId: deleteTarget.id })
        }
      }}
    />
    </>
  )
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

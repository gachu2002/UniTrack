import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { Download, FileText, Paperclip, Trash2, Upload } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteUploadedFile, downloadUploadedFile, uploadProjectFile } from '@/features/files/api'
import { getErrorMessage, isForbiddenOrConflictError } from '@/lib/axios'
import { formatDateTime } from '@/lib/format'
import { invalidateProjectEvidenceData } from '@/lib/query-invalidation'
import { queryKeys } from '@/lib/query-keys'
import type { UploadedFile } from '@/types/api'

const EVIDENCE_FILE_INITIAL_COUNT = 8
const MAX_EVIDENCE_FILE_BYTES = 10 * 1024 * 1024

interface EvidenceFilePanelProps {
  projectId: string
  targetType: UploadedFile['relatedType']
  targetId: string
  files: UploadedFile[]
  canUpload: boolean
  canManage: boolean
  canDeleteOwn: boolean
  currentUserId?: string
  description: string
  emptyMessage?: string
}

export function EvidenceFilePanel({ projectId, targetType, targetId, files, canUpload, canManage, canDeleteOwn, currentUserId, description, emptyMessage = 'No evidence files attached yet.' }: EvidenceFilePanelProps) {
  const queryClient = useQueryClient()
  const inputId = useId()
  const helperId = useId()
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
    onError: (error) => {
      toast.error(getErrorMessage(error))
      if (isForbiddenOrConflictError(error)) {
        refreshEvidenceState(queryClient, projectId)
      }
    },
  })
  const downloadMutation = useMutation({
    mutationFn: async (uploadedFile: UploadedFile) => {
      const blob = await downloadUploadedFile({ projectId, fileId: uploadedFile.id })
      saveBlob(blob, uploadedFile.originalFileName)
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      if (isForbiddenOrConflictError(error)) {
        refreshEvidenceState(queryClient, projectId)
      }
    },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteUploadedFile,
    onSuccess: () => {
      toast.success('Evidence removed')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: queryKeys.projectFiles(projectId) })
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      if (isForbiddenOrConflictError(error)) {
        refreshEvidenceState(queryClient, projectId)
      }
    },
  })

  const visibleFiles = showAllFiles ? files : files.slice(0, EVIDENCE_FILE_INITIAL_COUNT)

  return (
    <>
    <section className="mt-3 space-y-3 rounded-2xl border border-border bg-paper/60 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground"><Paperclip className="size-3.5" /> Evidence docket</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {canUpload ? (
          <form className="rounded-xl border border-dashed border-primary/25 bg-white/85 p-3 sm:min-w-80" onSubmit={(event) => {
            event.preventDefault()
            if (!file) {
              toast.error('Choose a file first')
              return
            }
            uploadMutation.mutate({ projectId, targetType, targetId, file })
          }}>
            <label htmlFor={inputId} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-paper/70 px-3 py-2 text-sm transition hover:border-primary/30 hover:bg-primary/5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <span className="inline-flex items-center gap-2 font-semibold text-ink"><Upload className="size-4 text-primary" /> Choose file</span>
              <span id={helperId} className="max-w-40 truncate text-xs text-muted-foreground">{file ? file.name : '10 MB max'}</span>
              <Input id={inputId} key={fileInputKey} type="file" className="sr-only" aria-describedby={helperId} onChange={(event) => {
                const selectedFile = event.target.files?.[0] || null
                if (selectedFile && selectedFile.size > MAX_EVIDENCE_FILE_BYTES) {
                  toast.error('File must be 10 MB or smaller')
                  setFile(null)
                  setFileInputKey((key) => key + 1)
                  return
                }
                setFile(selectedFile)
              }} />
            </label>
            <Button type="submit" size="sm" className="mt-2 w-full" disabled={!file || uploadMutation.isPending}><Upload className="size-4" /> {uploadMutation.isPending ? 'Uploading...' : 'Upload evidence'}</Button>
          </form>
        ) : null}
      </div>

      {files.length > 0 ? (
        <div className="grid gap-2">
          {visibleFiles.map((uploadedFile) => {
            const canDelete = canManage || (canDeleteOwn && uploadedFile.uploadedBy === currentUserId)
            const isDownloading = downloadMutation.isPending && downloadMutation.variables?.id === uploadedFile.id
            const isDeleting = deleteMutation.isPending && deleteMutation.variables?.fileId === uploadedFile.id
            return (
              <article key={uploadedFile.id} className="flex flex-col gap-3 rounded-xl border border-border bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="size-4" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{uploadedFile.originalFileName}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(uploadedFile.fileSizeBytes)} · {uploadedFile.uploadedByName} · {formatDateTime(uploadedFile.createdAt)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={isDownloading} aria-label={`Download ${uploadedFile.originalFileName}`} onClick={() => downloadMutation.mutate(uploadedFile)}><Download className="size-4" /> {isDownloading ? 'Downloading...' : 'Download'}</Button>
                  {canDelete ? <Button type="button" variant="ghost" size="sm" disabled={isDeleting} aria-label={`Delete ${uploadedFile.originalFileName}`} onClick={() => setDeleteTarget(uploadedFile)}><Trash2 className="size-4" /> {isDeleting ? 'Deleting...' : 'Delete'}</Button> : null}
                </div>
              </article>
            )
          })}
          {files.length > EVIDENCE_FILE_INITIAL_COUNT ? (
            <div className="px-1 py-1 text-sm text-muted-foreground">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAllFiles((value) => !value)}>{showAllFiles ? 'Show fewer files' : `Show all ${files.length} files`}</Button>
            </div>
          ) : null}
        </div>
      ) : <p className="rounded-xl border border-dashed border-border bg-white/70 px-3 py-3 text-sm text-muted-foreground">{emptyMessage}</p>}
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

function refreshEvidenceState(queryClient: QueryClient, projectId: string) {
  invalidateProjectEvidenceData(queryClient, projectId)
}

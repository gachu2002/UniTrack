import { CheckCircle2, Clock, ExternalLink, MessageSquareWarning } from 'lucide-react'

import { EmptyState } from '@/components/shared/empty-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { EvidenceFilePanel } from '@/features/files/components/evidence-file-panel'
import { filesForTarget } from '@/features/files/utils'
import { resourcesForTarget } from '@/features/resources/utils'
import { ReviewProgressForm } from '@/features/tasks/components/task-forms'
import { formatDateTime } from '@/lib/format'
import type { ProgressUpdate, ResourceLink, UploadedFile } from '@/types/api'

interface ProgressTimelineProps {
  projectId: string
  updates: ProgressUpdate[]
  canReview: boolean
  canUploadEvidence: boolean
  canManageEvidence: boolean
  currentUserId?: string
  uploadedFiles?: UploadedFile[]
  resourceLinks?: ResourceLink[]
}

export function ProgressTimeline({ projectId, updates, canReview, canUploadEvidence, canManageEvidence, currentUserId, uploadedFiles = [], resourceLinks = [] }: ProgressTimelineProps) {
  return (
    <section id="progress-timeline" className="overflow-hidden rounded-[1.4rem] border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-heading text-xl font-semibold tracking-tight text-ink">Submissions</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Student work submitted for teacher review.</p>
      </div>
      {updates.length > 0 ? (
        <div className="divide-y divide-border">
          {updates.map((update) => <ProgressUpdateRow key={update.id} projectId={projectId} update={update} canReview={canReview} canUploadEvidence={canUploadEvidence} canManageEvidence={canManageEvidence} currentUserId={currentUserId} files={filesForTarget(uploadedFiles, 'progress_update', update.id)} resources={resourcesForTarget(resourceLinks, 'progress_update', update.id)} />)}
        </div>
      ) : (
        <div className="px-5 py-8">
          <EmptyState title="No submissions yet" message="Student work will appear here after it is submitted for review." />
        </div>
      )}
    </section>
  )
}

function ProgressUpdateRow({ projectId, update, canReview, canUploadEvidence, canManageEvidence, currentUserId, files, resources }: { projectId: string; update: ProgressUpdate; canReview: boolean; canUploadEvidence: boolean; canManageEvidence: boolean; currentUserId?: string; files: UploadedFile[]; resources: ResourceLink[] }) {
  const canUploadToUpdate = canUploadEvidence && (canManageEvidence || update.submittedBy === currentUserId)
  const showEvidence = canUploadToUpdate || files.length > 0
  return (
    <article id={`progress-${update.id}`} className="scroll-mt-24 px-5 py-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-heading text-lg font-semibold text-ink">{update.title || 'Submission'}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" /> {formatDateTime(update.createdAt)}</span>
            <span>By {update.submittedByName}</span>
          </p>
        </div>
        <StatusBadge value={update.reviewStatus} />
      </div>
      <p className="mt-3 max-w-4xl text-sm leading-7 text-muted-foreground">{update.description}</p>
      {update.blockers ? <p className="mt-3 inline-flex items-start gap-2 border-l-2 border-amber-300 pl-3 text-sm leading-6 text-amber-800"><MessageSquareWarning className="mt-0.5 size-4 shrink-0" /> {update.blockers}</p> : null}
      {resources.length > 0 ? <ProgressLinks resources={resources} /> : null}
      {update.latestReview ? (
        <div className="mt-4 border-l-2 border-emerald-300 pl-3 text-sm text-emerald-800">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-4" /> Reviewed by {update.latestReview.reviewedByName}</p>
          {update.latestReview.reviewComment ? <p className="mt-1 leading-6">{update.latestReview.reviewComment}</p> : null}
          <p className="mt-1 text-xs text-emerald-700">{formatDateTime(update.latestReview.reviewedAt)}</p>
        </div>
      ) : null}
      {showEvidence ? (
        <details className="mt-4 border-t border-border pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Evidence files ({files.length})</summary>
          <EvidenceFilePanel projectId={projectId} targetType="progress_update" targetId={update.id} files={files} canUpload={canUploadToUpdate} canManage={canManageEvidence} currentUserId={currentUserId} description="Attach files that support this progress submission." />
        </details>
      ) : null}
      {canReview && update.reviewStatus === 'pending_review' ? <ReviewProgressForm projectId={projectId} update={update} /> : null}
    </article>
  )
}

function ProgressLinks({ resources }: { resources: ResourceLink[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {resources.map((resource) => (
        <a key={resource.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary underline-offset-4 hover:underline" href={resource.url} target="_blank" rel="noreferrer">
          <span className="truncate">{resource.title}</span>
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
      ))}
    </div>
  )
}

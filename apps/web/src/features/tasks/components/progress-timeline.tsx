import { CheckCircle2, Clock, ExternalLink, MessageSquareWarning } from 'lucide-react'

import { EmptyState } from '@/components/shared/empty-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { EvidenceFilePanel } from '@/features/files/components/evidence-file-panel'
import { filesForTarget } from '@/features/files/utils'
import { ResourceLinkButton } from '@/features/resources/components/resource-link-drawer'
import { resourcesForTarget } from '@/features/resources/utils'
import { ReviewProgressForm } from '@/features/tasks/components/task-forms'
import { formatDateTime } from '@/lib/format'
import type { ProgressReview, ProgressUpdate, ResourceLink, UploadedFile } from '@/types/api'

interface ProgressTimelineProps {
  projectId: string
  updates: ProgressUpdate[]
  canReview: boolean
  canUploadEvidence: boolean
  canManageEvidence: boolean
  canDeleteOwnEvidence: boolean
  currentUserId?: string
  uploadedFiles?: UploadedFile[]
  resourceLinks?: ResourceLink[]
  canManageResources?: boolean
  onManageResources?: (update: ProgressUpdate) => void
  showReviewForms?: boolean
  title?: string
  description?: string
  emptyTitle?: string
  emptyMessage?: string
  compact?: boolean
}

export function ProgressTimeline({ projectId, updates, canReview, canUploadEvidence, canManageEvidence, canDeleteOwnEvidence, currentUserId, uploadedFiles = [], resourceLinks = [], canManageResources = false, onManageResources, showReviewForms = true, title = 'Submissions', description = 'Student work submitted for teacher review.', emptyTitle = 'No submissions yet', emptyMessage = 'Student work will appear here after it is submitted for review.', compact = false }: ProgressTimelineProps) {
  return (
    <section id="progress-timeline" className={compact ? 'overflow-hidden rounded-xl border border-border bg-card/90 shadow-sm' : 'overflow-hidden rounded-[1.4rem] border border-border bg-card shadow-sm'}>
      <div className={compact ? 'border-b border-border px-4 py-3' : 'border-b border-border px-5 py-4'}>
        <h2 className={compact ? 'font-heading text-lg font-semibold tracking-tight text-ink' : 'font-heading text-xl font-semibold tracking-tight text-ink'}>{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {updates.length > 0 ? (
        <div className="divide-y divide-border">
          {updates.map((update) => <ProgressUpdateRow key={update.id} projectId={projectId} update={update} canReview={canReview} canUploadEvidence={canUploadEvidence} canManageEvidence={canManageEvidence} canDeleteOwnEvidence={canDeleteOwnEvidence} currentUserId={currentUserId} files={filesForTarget(uploadedFiles, 'progress_update', update.id)} resources={resourcesForTarget(resourceLinks, 'progress_update', update.id)} canManageResources={canManageResources} onManageResources={onManageResources} showReviewForm={showReviewForms} compact={compact} />)}
        </div>
      ) : (
        <div className={compact ? 'px-4 py-6' : 'px-5 py-8'}>
          <EmptyState title={emptyTitle} message={emptyMessage} />
        </div>
      )}
    </section>
  )
}

function ProgressUpdateRow({ projectId, update, canReview, canUploadEvidence, canManageEvidence, canDeleteOwnEvidence, currentUserId, files, resources, canManageResources, onManageResources, showReviewForm, compact }: { projectId: string; update: ProgressUpdate; canReview: boolean; canUploadEvidence: boolean; canManageEvidence: boolean; canDeleteOwnEvidence: boolean; currentUserId?: string; files: UploadedFile[]; resources: ResourceLink[]; canManageResources: boolean; onManageResources?: (update: ProgressUpdate) => void; showReviewForm: boolean; compact: boolean }) {
  const canChangeSupport = update.reviewStatus === 'pending_review'
  const canUploadToUpdate = canChangeSupport && canUploadEvidence && (canManageEvidence || update.submittedBy === currentUserId)
  const showEvidence = canUploadToUpdate || files.length > 0
  const canManageSubmissionResources = canChangeSupport && canManageResources && (canManageEvidence || update.submittedBy === currentUserId) && Boolean(onManageResources)
  const reviewTone = update.latestReview ? latestReviewTone(update.latestReview.reviewStatus) : null
  return (
    <article id={`progress-${update.id}`} className={compact ? 'scroll-mt-24 px-4 py-4' : 'scroll-mt-24 px-5 py-5'}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className={compact ? 'break-words font-heading text-base font-semibold text-ink' : 'break-words font-heading text-lg font-semibold text-ink'}>{update.title || 'Submission'}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" /> {formatDateTime(update.createdAt)}</span>
            <span>By {update.submittedByName}</span>
          </p>
        </div>
        <StatusBadge value={update.reviewStatus} />
      </div>
      <p className={compact ? 'mt-2 max-w-4xl break-words text-sm leading-6 text-muted-foreground' : 'mt-3 max-w-4xl break-words text-sm leading-7 text-muted-foreground'}>{update.description}</p>
      {update.blockers ? <p className="mt-3 inline-flex items-start gap-2 break-words border-l-2 border-amber-300 pl-3 text-sm leading-6 text-amber-800"><MessageSquareWarning className="mt-0.5 size-4 shrink-0" /> {update.blockers}</p> : null}
      {(resources.length > 0 || canManageSubmissionResources) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {resources.length > 0 ? <ProgressLinks resources={resources} /> : null}
          {canManageSubmissionResources && onManageResources ? <ResourceLinkButton count={resources.length} onClick={() => onManageResources(update)} ariaLabel={`Manage resources for submission ${update.title || update.id}`} /> : null}
        </div>
      ) : null}
      {update.latestReview && reviewTone ? (
        <div className={`${compact ? 'mt-3 rounded-lg px-3 py-2' : 'mt-4 border-l-2 pl-3'} text-sm ${reviewTone.containerClass}`}>
          <p className="flex items-center gap-2 font-semibold">
            {reviewTone.kind === 'approved' ? <CheckCircle2 className="size-4" /> : <MessageSquareWarning className="size-4" />}
            {reviewTone.label} by {update.latestReview.reviewedByName}
          </p>
          {update.latestReview.reviewComment ? <p className="mt-1 break-words leading-6">{update.latestReview.reviewComment}</p> : null}
          <p className={`mt-1 text-xs ${reviewTone.dateClass}`}>{formatDateTime(update.latestReview.reviewedAt)}</p>
        </div>
      ) : null}
      {showReviewForm && canReview && update.reviewStatus === 'pending_review' ? <ReviewProgressForm projectId={projectId} update={update} /> : null}
      {showEvidence ? (
          <div className="mt-3 border-t border-border pt-3">
          <EvidenceFilePanel projectId={projectId} targetType="progress_update" targetId={update.id} files={files} canUpload={canUploadToUpdate} canManage={canChangeSupport && canManageEvidence} canDeleteOwn={canChangeSupport && canDeleteOwnEvidence} currentUserId={currentUserId} description="Attach files that support this progress submission." compact={compact} />
        </div>
      ) : null}
    </article>
  )
}

function latestReviewTone(status: ProgressReview['reviewStatus']) {
  if (status === 'needs_changes') {
    return { kind: 'needs_changes', label: 'Returned for revision', containerClass: 'border-amber-300 bg-amber-50/70 text-amber-800', dateClass: 'text-amber-700' }
  }
  if (status === 'rejected') {
    return { kind: 'rejected', label: 'Rejected', containerClass: 'border-red-300 bg-red-50/70 text-red-800', dateClass: 'text-red-700' }
  }
  return { kind: 'approved', label: 'Approved', containerClass: 'border-emerald-300 bg-emerald-50/70 text-emerald-800', dateClass: 'text-emerald-700' }
}

function ProgressLinks({ resources }: { resources: ResourceLink[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {resources.map((resource) => (
        <a key={resource.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary underline-offset-4 hover:underline" href={resource.url} target="_blank" rel="noreferrer">
          <span className="truncate">{resource.title}</span>
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
      ))}
    </div>
  )
}

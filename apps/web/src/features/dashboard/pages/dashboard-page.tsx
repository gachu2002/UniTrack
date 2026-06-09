import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowUpRight, Clock, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/layout/page-header'
import { ErrorState } from '@/components/shared/error-state'
import { LedgerSection } from '@/components/shared/ledger-section'
import { LoadingState } from '@/components/shared/loading-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { getDashboard } from '@/features/dashboard/api'
import { ProgressUpdateTable } from '@/features/projects/components/progress-table'
import { ProjectTable } from '@/features/projects/components/project-table'
import { projectNeedsAttention } from '@/features/projects/attention'
import { TaskTable } from '@/features/tasks/components/task-table'
import { formatDateTime } from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import type { DashboardStats, ProgressUpdate } from '@/types/api'

export function DashboardPage() {
  const dashboardQuery = useQuery({ queryKey: queryKeys.dashboard, queryFn: getDashboard })

  if (dashboardQuery.isLoading) {
    return <LoadingState label="Loading dashboard" />
  }
  if (dashboardQuery.isError) {
    return <ErrorState message="The dashboard could not be loaded." onRetry={() => void dashboardQuery.refetch()} />
  }
  if (!dashboardQuery.data) {
    return <ErrorState message="The dashboard returned no data." onRetry={() => void dashboardQuery.refetch()} />
  }

  const dashboard = dashboardQuery.data
  const isStudent = dashboard.role === 'student'
  const isAdmin = dashboard.role === 'admin'
  const attentionProjects = dashboard.projects.filter(projectNeedsAttention)
  const followUpProjects = attentionProjects.filter((project) => project.pendingReviewCount === 0)
  const pendingReviewUpdates = sortOldestFirst(dashboard.progressUpdates.filter((update) => update.reviewStatus === 'pending_review'))

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={isStudent ? 'Student dashboard' : isAdmin ? 'Admin dashboard' : 'Teacher dashboard'}
        title={isStudent ? 'Do next' : 'Review queue'}
        description={
          isStudent
            ? 'Start with open assignments. Submitted work moves below while it waits for review.'
            : 'Start with student submissions, then check overdue assignments and project follow-ups.'
        }
      />
      <DashboardSummary isStudent={isStudent} stats={dashboard.stats} />

      {isStudent ? (
        <section className="space-y-6">
          <LedgerSection id="work" title="Open assignments" description="Assignments you can still move forward." bodyClassName="p-0">
            <TaskTable tasks={dashboard.tasks} showProject showAssignees={false} emptyTitle="No open assignments" emptyMessage="Nothing needs action right now. Submitted or completed work appears below or in your projects." />
          </LedgerSection>

          <LedgerSection title="Recent submissions" description="Your submitted work and teacher review status." bodyClassName="p-0">
            <ProgressUpdateTable updates={dashboard.progressUpdates} showSubmittedBy={false} showTaskColumn={false} emptyTitle="No submissions yet" emptyMessage="Work you submit for assignments will appear here." />
          </LedgerSection>
        </section>
      ) : (
        <section className="space-y-6">
          <LedgerSection id="reviews" title="Pending reviews" description="Oldest submissions are listed first so review debt is easy to clear." bodyClassName="p-0">
            <TeacherReviewQueue updates={pendingReviewUpdates} />
          </LedgerSection>

          <LedgerSection id="overdue" title="Overdue assignments" description="Specific assignments past their due date in active projects." bodyClassName="p-0">
            <TaskTable tasks={dashboard.tasks} showProject showAttention emptyTitle="No overdue assignments" emptyMessage="Assignments that need follow-up will appear here." />
          </LedgerSection>

          <LedgerSection id="work" title="Project follow-ups" description="Active projects with stale or missing approved progress, excluding work already covered by the review queue." bodyClassName="p-0">
            <ProjectTable projects={followUpProjects} mode="attention" showSupervisor={isAdmin} emptyTitle="No project follow-ups" emptyMessage="Projects with stale or missing progress will appear here after review work is clear." />
          </LedgerSection>
        </section>
      )}
    </div>
  )
}

function DashboardSummary({ isStudent, stats }: { isStudent: boolean; stats: DashboardStats }) {
  const items = isStudent
    ? [
        `${stats.overdueTaskCount} overdue`,
        `${stats.pendingReviews} waiting review`,
        `${stats.taskCount} assigned total`,
      ]
    : [
        `${stats.pendingReviews} review${stats.pendingReviews === 1 ? '' : 's'} waiting`,
        `${stats.overdueTaskCount} overdue assignment${stats.overdueTaskCount === 1 ? '' : 's'}`,
        `${stats.projectCount} project${stats.projectCount === 1 ? '' : 's'}`,
      ]
  return (
    <div className="flex flex-wrap gap-2 border-y border-border py-3">
      {items.map((item) => <span key={item} className="rounded-full bg-card px-3 py-1 text-sm font-semibold text-muted-foreground shadow-sm ring-1 ring-border">{item}</span>)}
    </div>
  )
}

function TeacherReviewQueue({ updates }: { updates: ProgressUpdate[] }) {
  if (updates.length === 0) {
    return <div className="p-6"><div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/70 px-5 py-6 text-center"><p className="font-heading text-lg font-semibold text-ink">No pending reviews</p><p className="mt-1 text-sm text-muted-foreground">Student submissions waiting for review will appear here.</p></div></div>
  }

  return (
    <div className="divide-y divide-border bg-card">
      {updates.map((update, index) => {
        const reviewHref = `/workspace/projects/${update.projectId}/tasks/${update.taskId}#progress-${update.id}`
        return (
          <article key={update.id} className="grid gap-4 px-4 py-4 transition hover:bg-slate-50/80 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full border border-amber-200 bg-amber-50 font-heading text-sm font-semibold text-amber-800">{String(index + 1).padStart(2, '0')}</span>
              <div className="hidden h-12 w-px bg-border lg:block" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={update.reviewStatus} />
                {update.blockers ? <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700"><AlertTriangle className="size-3.5" /> Blocker</span> : null}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-paper px-2.5 py-1 text-xs font-medium text-muted-foreground"><Clock className="size-3.5" /> {formatDateTime(update.createdAt)}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-paper px-2.5 py-1 text-xs font-medium text-muted-foreground"><UserRound className="size-3.5" /> {update.submittedByName}</span>
              </div>
              <h3 className="mt-2 truncate font-heading text-lg font-semibold tracking-tight text-ink">{update.title || update.taskTitle}</h3>
              <p className="mt-1 text-sm text-muted-foreground"><span className="font-semibold text-ink">{update.projectName}</span> · {update.taskTitle}</p>
              <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-muted-foreground">{update.description}</p>
              {update.blockers ? <p className="mt-2 line-clamp-1 text-sm font-medium text-red-700">Blocker: {update.blockers}</p> : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button asChild size="sm">
                <Link to={reviewHref}>Review <ArrowUpRight className="size-4" /></Link>
              </Button>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function sortOldestFirst(updates: ProgressUpdate[]) {
  return [...updates].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

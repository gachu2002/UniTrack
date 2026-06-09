import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/shared/empty-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { projectNeedsAttention } from '@/features/projects/attention'
import { cn } from '@/lib/utils'
import type { ClassFolderColor, Project } from '@/types/api'

const PROJECT_CARD_INITIAL_COUNT = 36

interface ProjectCardGridProps {
  projects?: Project[] | null
  emptyTitle: string
  emptyMessage: string
  showContext?: boolean
}

export function ProjectCardGrid({ projects, emptyTitle, emptyMessage, showContext = false }: ProjectCardGridProps) {
  const [showAll, setShowAll] = useState(false)
  const items = projects ?? []
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />
  }
  const visibleItems = showAll ? items : items.slice(0, PROJECT_CARD_INITIAL_COUNT)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleItems.map((project) => <ProjectCard key={project.id} project={project} showContext={showContext} />)}
      </div>
      {items.length > PROJECT_CARD_INITIAL_COUNT ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border bg-white/70 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Showing {visibleItems.length} of {items.length} projects.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show fewer' : 'Show all'}</Button>
        </div>
      ) : null}
    </div>
  )
}

export function ProjectCard({ project, showContext = false, actions }: { project: Project; showContext?: boolean; actions?: ReactNode }) {
  const hasAttention = projectNeedsAttention(project)
  const context = project.classTitle || ''
  const palette = projectPalette(project.classColor)
  const cardClass = 'group relative block pt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
  const content = <ProjectCardContent project={project} showContext={showContext} context={context} hasAttention={hasAttention} linkedTitle={Boolean(actions)} actions={actions} palette={palette} />

  if (actions) {
    return <article className={cardClass}>{content}</article>
  }

  return (
    <Link to={`/workspace/projects/${project.id}`} className={cardClass}>
      {content}
    </Link>
  )
}

function ProjectCardContent({ project, showContext, context, hasAttention, linkedTitle, actions, palette }: { project: Project; showContext: boolean; context: string; hasAttention: boolean; linkedTitle: boolean; actions?: ReactNode; palette: ReturnType<typeof projectPalette> }) {
  const compact = Boolean(actions)
  const progressPercent = clampPercent(project.plannedProgressPercent)
  const title = <h3 className={cn('line-clamp-2 font-heading font-semibold leading-tight tracking-tight text-ink transition-colors group-hover:text-primary group-focus-visible:text-primary', compact ? 'text-base' : 'text-lg')}>{project.name}</h3>
  const scopeLabel = project.milestoneCount > 0 ? `${project.completedMilestoneCount}/${project.milestoneCount} milestones` : `${project.completedTaskCount}/${project.taskCount} tasks`

  return (
    <div className="relative">
      <div className={cn('absolute left-3 top-0 rounded-t-md rounded-br-sm border border-black/5 shadow-sm transition duration-200 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-focus-within:-translate-y-0.5', compact ? 'h-5 w-20' : 'h-6 w-24', palette.tab)} />
      <div className={cn('relative overflow-hidden rounded-[1.15rem] rounded-tl-[0.75rem] border shadow-sm ring-1 ring-transparent transition duration-200 group-hover:shadow-panel group-hover:ring-primary/15 group-focus-within:ring-primary/20', compact ? 'min-h-32' : 'min-h-40', palette.card)}>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.9),transparent_48%)]" />
        {actions ? <div className="absolute right-3 top-3 z-10 flex gap-1.5">{actions}</div> : null}
        <div className={cn('relative flex flex-col justify-between', compact ? 'min-h-32 gap-3 p-3' : 'min-h-40 gap-4 p-4')}>
          <div className="flex items-start justify-between gap-3">
            <div className={cn('min-w-0 flex-1', compact ? 'pr-20' : '')}>
              {showContext && context ? <span className={cn('mb-2 inline-flex max-w-full truncate rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ring-1 ring-white/80', palette.pill)}>{context}</span> : null}
              {linkedTitle ? <Link className="block underline-offset-4 hover:underline" to={`/workspace/projects/${project.id}`}>{title}</Link> : title}
              <p className={cn('mt-1.5 text-sm leading-5 text-muted-foreground', compact ? 'line-clamp-1' : 'line-clamp-2')}>{project.topic || project.description || 'Assignments, submissions, resources, and members.'}</p>
            </div>
            {!actions ? <ArrowUpRight className="mt-1 size-5 shrink-0 text-muted-foreground transition duration-200 motion-safe:translate-x-1 group-hover:text-primary motion-safe:group-hover:translate-x-0 group-focus-visible:text-primary motion-safe:group-focus-visible:translate-x-0" /> : null}
          </div>

          <div className={compact ? 'space-y-2' : 'space-y-3'}>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={project.status} />
              <StatusBadge value={project.officialProgressState} />
              {hasAttention ? <StatusBadge value="attention" tone="red" /> : null}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{scopeLabel}</span>
                <span className="font-semibold text-ink">{progressPercent}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/75 shadow-inner">
                <div className={cn('h-full rounded-full transition-all duration-300', palette.progress)} style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-white/80 px-2.5 py-1 font-medium text-muted-foreground shadow-sm ring-1 ring-white/80">{project.memberCount} member{project.memberCount === 1 ? '' : 's'}</span>
              {project.pendingReviewCount > 0 ? <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800 shadow-sm ring-1 ring-amber-200">{project.pendingReviewCount} review{project.pendingReviewCount === 1 ? '' : 's'}</span> : null}
              {project.overdueTaskCount > 0 ? <span className="rounded-full bg-red-100 px-2.5 py-1 font-semibold text-red-700 shadow-sm ring-1 ring-red-200">{project.overdueTaskCount} overdue</span> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function projectPalette(color?: ClassFolderColor) {
  switch (color) {
    case 'teal':
      return { card: 'border-teal-200 bg-gradient-to-br from-teal-50 via-white to-emerald-50', tab: 'bg-teal-200', pill: 'bg-teal-100 text-teal-800', progress: 'bg-gradient-to-r from-teal-500 to-emerald-400' }
    case 'amber':
      return { card: 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50', tab: 'bg-amber-200', pill: 'bg-amber-100 text-amber-800', progress: 'bg-gradient-to-r from-amber-500 to-orange-400' }
    case 'rose':
      return { card: 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-pink-50', tab: 'bg-rose-200', pill: 'bg-rose-100 text-rose-800', progress: 'bg-gradient-to-r from-rose-500 to-pink-400' }
    case 'violet':
      return { card: 'border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50', tab: 'bg-violet-200', pill: 'bg-violet-100 text-violet-800', progress: 'bg-gradient-to-r from-violet-500 to-indigo-400' }
    case 'slate':
      return { card: 'border-slate-200 bg-gradient-to-br from-slate-100 via-white to-slate-50', tab: 'bg-slate-300', pill: 'bg-slate-200 text-slate-800', progress: 'bg-gradient-to-r from-slate-600 to-slate-400' }
    case 'blue':
      return { card: 'border-blue-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50', tab: 'bg-blue-200', pill: 'bg-blue-100 text-blue-800', progress: 'bg-gradient-to-r from-blue-600 to-cyan-400' }
    default:
      return { card: 'border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50/60', tab: 'bg-slate-200', pill: 'bg-slate-100 text-slate-700', progress: 'bg-gradient-to-r from-primary to-secondary' }
  }
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(100, value))
}

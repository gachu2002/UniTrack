import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/shared/empty-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { getProjectWorkSignal, type ProjectWorkSignal } from '@/features/projects/attention'
import { cn } from '@/lib/utils'
import type { ClassFolderColor, Project } from '@/types/api'

const PROJECT_CARD_INITIAL_COUNT = 8

interface ProjectCardGridProps {
  projects?: Project[] | null
  emptyTitle: string
  emptyMessage: string
  showContext?: boolean
  allowShowAll?: boolean
  reserveSlots?: number
}

export function ProjectCardGrid({ projects, emptyTitle, emptyMessage, showContext = false, allowShowAll = true, reserveSlots = 0 }: ProjectCardGridProps) {
  const [showAll, setShowAll] = useState(false)
  const items = projects ?? []
  if (items.length === 0) {
    if (reserveSlots > 0) {
      return <div className="grid min-h-[28rem] place-items-center rounded-2xl border border-dashed border-border bg-white/55 px-4 py-8 md:min-h-[25rem] 2xl:min-h-[23rem]"><EmptyState title={emptyTitle} message={emptyMessage} /></div>
    }
    return <EmptyState title={emptyTitle} message={emptyMessage} />
  }
  const visibleItems = allowShowAll && !showAll ? items.slice(0, PROJECT_CARD_INITIAL_COUNT) : items
  const placeholderCount = Math.max(0, reserveSlots - visibleItems.length)

  return (
    <div className="space-y-4">
      <div className="grid auto-rows-fr gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {visibleItems.map((project) => <ProjectCard key={project.id} project={project} showContext={showContext} />)}
        {placeholderCount > 0 ? Array.from({ length: placeholderCount }, (_, index) => <div key={`project-placeholder-${index}`} className="invisible hidden h-56 pt-2 md:block" aria-hidden="true" />) : null}
      </div>
      {allowShowAll && items.length > PROJECT_CARD_INITIAL_COUNT ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border bg-white/70 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Showing {visibleItems.length} of {items.length} projects.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show fewer' : 'Show all'}</Button>
        </div>
      ) : null}
    </div>
  )
}

export function ProjectCard({ project, showContext = false, actions }: { project: Project; showContext?: boolean; actions?: ReactNode }) {
  const context = project.classTitle || ''
  const palette = projectPalette(project.classColor)
  const compact = Boolean(actions)
  const cardClass = cn('group relative block pt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30', compact ? 'h-48' : 'h-56')
  const content = <ProjectCardContent project={project} showContext={showContext} context={context} linkedTitle={compact} actions={actions} palette={palette} />

  if (actions) {
    return <article className={cardClass}>{content}</article>
  }

  return (
    <Link to={`/workspace/projects/${project.id}`} className={cardClass}>
      {content}
    </Link>
  )
}

function ProjectCardContent({ project, showContext, context, linkedTitle, actions, palette }: { project: Project; showContext: boolean; context: string; linkedTitle: boolean; actions?: ReactNode; palette: ReturnType<typeof projectPalette> }) {
  const compact = Boolean(actions)
  const progressPercent = clampPercent(project.plannedProgressPercent)
  const title = <h3 className={cn('line-clamp-2 break-words font-heading font-semibold leading-tight tracking-tight text-ink transition-colors group-hover:text-primary group-focus-visible:text-primary', compact ? 'text-base' : 'text-lg')} title={project.name}>{project.name}</h3>
  const assignmentLabel = `assignment${project.taskCount === 1 ? '' : 's'}`
  const scopeLabel = project.milestoneCount > 0 ? `${project.completedMilestoneCount}/${project.milestoneCount} checkpoints` : `${project.completedTaskCount}/${project.taskCount} ${assignmentLabel}`

  return (
    <div className="relative h-full">
      <div className={cn('absolute left-3 top-0 rounded-t-md rounded-br-sm border border-black/5 shadow-sm transition duration-200 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-focus-within:-translate-y-0.5', compact ? 'h-5 w-20' : 'h-6 w-24', palette.tab)} />
      <div className={cn('relative h-full overflow-hidden rounded-[1.15rem] rounded-tl-[0.75rem] border shadow-sm ring-1 ring-transparent transition duration-200 group-hover:shadow-panel group-hover:ring-primary/15 group-focus-within:ring-primary/20', palette.card)}>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.9),transparent_48%)]" />
        {actions ? <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">{actions}</div> : null}
        <div className={cn('relative grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto]', compact ? 'gap-3 p-3' : 'gap-4 p-4')}>
          <div className="flex min-h-0 items-start justify-between gap-3 overflow-hidden">
            <div className={cn('min-w-0 flex-1', compact ? 'pr-28' : '')}>
              {showContext && context ? <span className={cn('mb-2 inline-flex max-w-full truncate rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ring-1 ring-white/80', palette.pill)}>{context}</span> : null}
              {linkedTitle ? <Link className="block min-w-0 underline-offset-4 hover:underline" to={`/workspace/projects/${project.id}`}>{title}</Link> : title}
              <p className={cn('mt-1.5 text-sm leading-5 text-muted-foreground', compact || showContext ? 'line-clamp-1' : 'line-clamp-2')}>{project.topic || project.description || 'Assignments, submissions, resources, and members.'}</p>
            </div>
            {!actions ? <ArrowUpRight className="mt-1 size-5 shrink-0 text-muted-foreground transition duration-200 motion-safe:translate-x-1 group-hover:text-primary motion-safe:group-hover:translate-x-0 group-focus-visible:text-primary motion-safe:group-focus-visible:translate-x-0" /> : null}
          </div>

          {compact ? <ProjectCardCompactFooter project={project} /> : <ProjectCardFullFooter project={project} scopeLabel={scopeLabel} progressPercent={progressPercent} palette={palette} />}
        </div>
      </div>
    </div>
  )
}

function ProjectCardFullFooter({ project, scopeLabel, progressPercent, palette }: { project: Project; scopeLabel: string; progressPercent: number; palette: ReturnType<typeof projectPalette> }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{scopeLabel}</span>
          <span className="font-semibold text-ink">{progressPercent}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/75 shadow-inner">
          <div className={cn('h-full rounded-full transition-all duration-300', palette.progress)} style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className="flex min-h-7 min-w-0 items-center gap-2 overflow-hidden text-xs">
        <span className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 font-medium text-muted-foreground shadow-sm ring-1 ring-white/80">{project.memberCount} member{project.memberCount === 1 ? '' : 's'}</span>
        <ProjectCardLifecycleBadge project={project} />
        <ProjectCardStateBadge project={project} />
      </div>
    </div>
  )
}

function ProjectCardCompactFooter({ project }: { project: Project }) {
  return (
    <div className="flex min-h-10 min-w-0 items-center gap-2 overflow-hidden border-t border-white/70 pt-3 text-xs">
      <span className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 font-medium text-muted-foreground shadow-sm ring-1 ring-white/80">{project.taskCount} assignment{project.taskCount === 1 ? '' : 's'}</span>
      <ProjectCardLifecycleBadge project={project} />
      <ProjectCardStateBadge project={project} />
    </div>
  )
}

function ProjectCardLifecycleBadge({ project }: { project: Project }) {
  if (project.status === 'active') {
    return null
  }
  return <StatusBadge value={project.status} />
}

function ProjectCardStateBadge({ project }: { project: Project }) {
  const signal = getProjectWorkSignal(project, { includeGeneralAttention: true })
  if (signal) {
    return <ProjectCardSignalBadge project={project} signal={signal} />
  }
  return <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-200/70">steady</span>
}

function ProjectCardSignalBadge({ project, signal }: { project: Project; signal: ProjectWorkSignal }) {
  return <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ring-1', signal.tone === 'red' ? 'bg-red-100 text-red-700 ring-red-200' : 'bg-amber-100 text-amber-800 ring-amber-200')}>{projectCardSignalLabel(project)}</span>
}

function projectCardSignalLabel(project: Project) {
  if (project.pendingReviewCount > 0) {
    return `${project.pendingReviewCount} review`
  }
  if (project.overdueTaskCount > 0) {
    return `${project.overdueTaskCount} overdue`
  }
  if (project.needsChangesTaskCount > 0 || project.officialProgressState === 'needs_changes') {
    return 'revision'
  }
  return 'attention'
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

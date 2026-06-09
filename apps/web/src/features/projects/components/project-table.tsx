import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/shared/empty-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getLastApprovedLabel, getProjectAttentionReason } from '@/features/projects/attention'
import type { Project } from '@/types/api'

interface ProjectTableProps {
  projects?: Project[] | null
  emptyTitle: string
  emptyMessage: string
  mode?: 'default' | 'attention'
  showSupervisor?: boolean
}

export function ProjectTable({ projects, emptyTitle, emptyMessage, mode = 'default', showSupervisor = true }: ProjectTableProps) {
  const items = projects ?? []

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />
  }

  return (
    <div className="overflow-hidden bg-card">
      <Table>
        <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>{showSupervisor ? 'Supervisor' : 'Topic'}</TableHead>
              <TableHead className="hidden md:table-cell">Members</TableHead>
            <TableHead className="hidden md:table-cell">Tasks</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>{mode === 'attention' ? 'Attention' : 'Progress'}</TableHead>
            <TableHead className="w-20 text-right">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((project) => (
            <TableRow key={project.id} className={mode === 'attention' ? 'bg-red-50/70 hover:bg-red-50' : undefined}>
              <TableCell>
                <Link className="font-heading font-semibold text-ink underline-offset-4 hover:underline" to={`/workspace/projects/${project.id}`}>
                  {project.name}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground md:hidden">{project.memberCount} members · {project.taskCount} tasks</p>
              </TableCell>
              <TableCell className="text-muted-foreground">{showSupervisor ? project.supervisorName : project.topic || 'No topic set'}</TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{project.memberCount}</TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{project.taskCount}</TableCell>
              <TableCell><StatusBadge value={project.status} /></TableCell>
              <TableCell>
                {mode === 'attention' ? <ProjectAttentionLabel project={project} /> : <ProjectProgressLabel project={project} />}
              </TableCell>
              <TableCell className="text-right">
                <Link className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline" to={`/workspace/projects/${project.id}`} aria-label={`Open ${project.name}`}>
                  <span>Open</span>
                  <ArrowUpRight className="size-4" />
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function ProjectProgressLabel({ project }: { project: Project }) {
  return (
    <div className="min-w-28 space-y-1">
      <div className="flex items-center gap-2">
        <StatusBadge value={project.officialProgressState} />
        <span className="text-xs font-semibold text-muted-foreground">{project.plannedProgressPercent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-primary" style={{ width: `${project.plannedProgressPercent}%` }} />
      </div>
    </div>
  )
}

function ProjectAttentionLabel({ project }: { project: Project }) {
  return (
    <div className="space-y-1">
      <StatusBadge value="attention" tone="red" />
      <p className="text-xs text-slate-600">{getProjectAttentionReason(project)}</p>
      <p className="text-xs text-slate-500">Last approved: {getLastApprovedLabel(project)}</p>
    </div>
  )
}

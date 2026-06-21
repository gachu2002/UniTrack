import { Badge } from '@/components/ui/badge'
import { titleize } from '@/lib/format'

interface StatusBadgeProps {
  value: string
  tone?: 'default' | 'blue' | 'teal' | 'amber' | 'red' | 'slate'
}

const statusTone: Record<string, StatusBadgeProps['tone']> = {
  active: 'blue',
  completed: 'teal',
  archived: 'slate',
  on_hold: 'amber',
  planned: 'slate',
  empty: 'slate',
  todo: 'slate',
  not_started: 'slate',
  in_progress: 'blue',
  waiting_review: 'amber',
  submitted: 'amber',
  needs_changes: 'amber',
  needs_revision: 'amber',
  done: 'teal',
  complete: 'teal',
  no_progress: 'slate',
  pending_review: 'amber',
  overdue: 'red',
  approved: 'teal',
  rejected: 'red',
  high: 'red',
  medium: 'amber',
  low: 'slate',
}

const toneClass: Record<NonNullable<StatusBadgeProps['tone']>, string> = {
  default: 'border-border bg-card text-muted-foreground',
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  teal: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  red: 'border-red-200 bg-red-50 text-red-700',
  slate: 'border-slate-200 bg-slate-50 text-slate-600',
}

export function StatusBadge({ value, tone }: StatusBadgeProps) {
  const resolvedTone = tone || statusTone[value] || 'default'
  return <Badge className={toneClass[resolvedTone]} variant="outline">{titleize(value)}</Badge>
}

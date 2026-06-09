import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Link2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/shared/empty-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createResourceLink, deleteResourceLink, updateResourceLink } from '@/features/projects/api'
import { resourcesForTarget } from '@/features/resources/utils'
import { getErrorMessage } from '@/lib/axios'
import { formatDateTime } from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import { useAuthStore } from '@/stores/auth-store'
import type { ResourceLink } from '@/types/api'

const RESOURCE_CHIP_INITIAL_COUNT = 12

export interface ResourceLinkTarget {
  type: ResourceLink['relatedType']
  id: string
  label: string
  eyebrow: string
}

interface ResourceLinkDialogProps {
  projectId: string
  target: ResourceLinkTarget | null
  resources: ResourceLink[]
  canCreate: boolean
  canManageAll: boolean
  onClose: () => void
}

export function ResourceLinkDialog({ projectId, target, resources, canCreate, canManageAll, onClose }: ResourceLinkDialogProps) {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<ResourceLink | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ResourceLink | null>(null)
  const deleteMutation = useMutation({
    mutationFn: deleteResourceLink,
    onSuccess: () => {
      toast.success('Resource link deleted')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: queryKeys.projectResourceLinks(projectId) })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const closeDialog = () => {
    setCreateOpen(false)
    setEditing(null)
    setDeleteTarget(null)
    onClose()
  }

  const targetResources = target ? resourcesForTarget(resources, target.type, target.id) : []
  const canManage = (resource: ResourceLink) => canCreate && (canManageAll || resource.addedBy === user?.id)

  return (
    <>
    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) closeDialog() }} title={target?.label || 'Resources'} description={target ? `${target.eyebrow} · ${targetResources.length} resource link${targetResources.length === 1 ? '' : 's'}` : undefined} className="max-w-3xl">
      {target ? (
        <div className="space-y-4 pb-4">
          {targetResources.length > 0 ? (
            <div className="max-h-[44svh] space-y-3 overflow-y-auto pr-1">
              {targetResources.map((resource) => (
                <ResourceLinkItem
                  key={resource.id}
                  resource={resource}
                  canManage={canManage(resource)}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables?.resourceLinkId === resource.id}
                  onEdit={() => { setEditing(resource); setCreateOpen(false) }}
                  onDelete={() => setDeleteTarget(resource)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-paper/70 py-8 text-center">
              <EmptyState title="No resources yet" message="Add a useful reference for this item." />
            </div>
          )}

          {canCreate ? <div className="sticky bottom-0 -mx-5 border-t border-border bg-card/95 px-5 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            {editing ? (
              <ResourceLinkForm projectId={projectId} target={target} resource={editing} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />
            ) : createOpen ? (
              <ResourceLinkForm projectId={projectId} target={target} onSaved={() => setCreateOpen(false)} onCancel={() => setCreateOpen(false)} />
            ) : (
              <div className="flex justify-end">
                <Button type="button" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> Add resource</Button>
              </div>
            )}
          </div> : null}
        </div>
      ) : null}
    </Dialog>
    <ConfirmDialog
      open={Boolean(deleteTarget)}
      title="Delete resource?"
      description={deleteTarget ? `Delete "${deleteTarget.title}" from this resource list.` : ''}
      confirmLabel="Delete resource"
      isPending={deleteMutation.isPending}
      onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
      onConfirm={() => {
        if (deleteTarget) {
          deleteMutation.mutate({ projectId, resourceLinkId: deleteTarget.id })
        }
      }}
    />
    </>
  )
}

function ResourceLinkItem({ resource, canManage, isDeleting, onEdit, onDelete }: { resource: ResourceLink; canManage: boolean; isDeleting: boolean; onEdit: () => void; onDelete: () => void }) {
  return (
    <article className="border-b border-border pb-3 last:border-b-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <a className="inline-flex max-w-full items-center gap-2 font-heading text-lg font-semibold text-ink underline-offset-4 hover:text-primary hover:underline" href={resource.url} target="_blank" rel="noreferrer">
            <span className="truncate">{resource.title}</span>
            <ExternalLink className="size-4 shrink-0" />
          </a>
          <p className="mt-1 truncate text-sm font-medium text-primary">{resourceDomain(resource.url)}</p>
          {resource.description ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{resource.description}</p> : null}
          <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{resource.relatedLabel}</span>
            <span>· {resource.addedByName}</span>
            <span>· {formatDateTime(resource.createdAt)}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <StatusBadge value={resource.type} tone="blue" />
          {canManage ? <Button type="button" variant="edit" size="sm" onClick={onEdit}><Pencil className="size-4" /> Edit</Button> : null}
          {canManage ? <Button type="button" variant="ghost" size="sm" disabled={isDeleting} onClick={onDelete}><Trash2 className="size-4" /></Button> : null}
        </div>
      </div>
    </article>
  )
}

function ResourceLinkForm({ projectId, target, resource, onSaved, onCancel }: { projectId: string; target: ResourceLinkTarget; resource?: ResourceLink; onSaved: () => void; onCancel: () => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(resource?.title || '')
  const [url, setURL] = useState(resource?.url || '')
  const [type, setType] = useState<ResourceLink['type']>(resource?.type || 'external_link')
  const [description, setDescription] = useState(resource?.description || '')
  const createMutation = useMutation({
    mutationFn: createResourceLink,
    onSuccess: () => {
      toast.success('Resource link added')
      queryClient.invalidateQueries({ queryKey: queryKeys.projectResourceLinks(projectId) })
      onSaved()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const updateMutation = useMutation({
    mutationFn: updateResourceLink,
    onSuccess: () => {
      toast.success('Resource link updated')
      queryClient.invalidateQueries({ queryKey: queryKeys.projectResourceLinks(projectId) })
      onSaved()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault()
      const trimmedTitle = title.trim()
      const trimmedURL = url.trim()
      if (!trimmedTitle) {
        toast.error('Resource title is required')
        return
      }
      if (!isValidResourceURL(trimmedURL)) {
        toast.error('Use a valid http or https URL')
        return
      }
      const trimmedDescription = description.trim()
      const payload = { projectId, title: trimmedTitle, url: trimmedURL, type, description: resource ? trimmedDescription : trimmedDescription || undefined }
      if (resource) {
        updateMutation.mutate({ ...payload, resourceLinkId: resource.id })
      } else {
        createMutation.mutate({ ...payload, relatedType: target.type, relatedId: target.id })
      }
    }}>
      <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
        <label className="space-y-1 text-sm font-medium text-ink">Title<Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Design board" /></label>
        <label className="space-y-1 text-sm font-medium text-ink">Type
          <Select value={type} onValueChange={(value) => setType(value as ResourceLink['type'])}>
            <SelectTrigger>
              <SelectValue placeholder="Resource type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="external_link">External link</SelectItem>
              <SelectItem value="github">GitHub</SelectItem>
              <SelectItem value="google_drive">Google Drive</SelectItem>
              <SelectItem value="document">Document</SelectItem>
              <SelectItem value="design">Design</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>
      <label className="block space-y-1 text-sm font-medium text-ink">URL<Input value={url} onChange={(event) => setURL(event.target.value)} placeholder="https://..." /></label>
      <label className="block space-y-1 text-sm font-medium text-ink">Description<Textarea className="min-h-20" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Why this reference matters." /></label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>Cancel</Button>
        <Button type="submit" disabled={isPending}>{isPending ? 'Saving...' : resource ? 'Save resource' : 'Add resource'}</Button>
      </div>
    </form>
  )
}

export function ResourceLinkButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button type="button" className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-primary" onClick={onClick}>
      <Link2 className="size-3.5" /> {count > 0 ? `${count} resource${count === 1 ? '' : 's'}` : 'Resources'}
    </button>
  )
}

export function ResourceLinkShelf({ resources, title = 'Resources', canCreate, onManage, compact = false }: { resources: ResourceLink[]; title?: string; canCreate?: boolean; onManage?: () => void; compact?: boolean }) {
  const [showAll, setShowAll] = useState(false)
  if (resources.length === 0 && !canCreate) {
    return null
  }
  const visibleResources = showAll ? resources : resources.slice(0, RESOURCE_CHIP_INITIAL_COUNT)

  return (
    <section className={compact ? 'space-y-2' : 'rounded-2xl border border-border bg-card px-4 py-3'}>
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground"><Link2 className="size-3.5" /> {title}</p>
        {onManage ? <Button type="button" variant="ghost" size="sm" onClick={onManage}>{resources.length > 0 ? 'Manage' : 'Add'}</Button> : null}
      </div>
      {resources.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {visibleResources.map((resource) => <ResourceChip key={resource.id} resource={resource} />)}
          {resources.length > RESOURCE_CHIP_INITIAL_COUNT ? (
            <button type="button" className="inline-flex items-center rounded-full border border-dashed border-border bg-white px-2.5 py-1 text-xs font-semibold text-muted-foreground transition hover:border-primary/30 hover:text-primary" onClick={() => setShowAll((value) => !value)}>
              {showAll ? 'Show fewer' : `+${resources.length - RESOURCE_CHIP_INITIAL_COUNT} more`}
            </button>
          ) : null}
        </div>
      ) : <p className="mt-2 text-sm text-muted-foreground">No resources yet.</p>}
    </section>
  )
}

export function ResourceChip({ resource }: { resource: ResourceLink }) {
  return (
    <a className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary underline-offset-4 hover:bg-primary/15 hover:underline" href={resource.url} target="_blank" rel="noreferrer" title={resource.url}>
      <span className="truncate">{resource.title}</span>
      <ExternalLink className="size-3.5 shrink-0" />
    </a>
  )
}

function resourceDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return value
  }
}

function isValidResourceURL(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

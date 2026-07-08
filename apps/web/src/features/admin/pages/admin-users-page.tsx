import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, KeyRound, Pencil, Plus, Search, ShieldCheck, X } from 'lucide-react'
import { useDeferredValue, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { ForbiddenState } from '@/components/shared/forbidden-state'
import { LoadingState } from '@/components/shared/loading-state'
import { PaginationControls } from '@/components/shared/pagination-controls'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field as BaseField, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SortableTableHead, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createAdminUser, getAdminUsers, getAdminUsersPage, setAdminUserPassword, updateAdminUser, type GetAdminUsersParams } from '@/features/admin/api'
import { getErrorMessage, getErrorPayload, isForbiddenError, isForbiddenOrConflictError } from '@/lib/axios'
import { formatDateTime } from '@/lib/format'
import { invalidateAdminAccountImpactData } from '@/lib/query-invalidation'
import { queryKeys } from '@/lib/query-keys'
import { dateSortValue, sortItems, toggleSort, type SortState } from '@/lib/sort'
import { useAuthStore } from '@/stores/auth-store'
import type { User, UserRole } from '@/types/api'

type RoleFilter = UserRole | 'all'
type StatusFilter = User['status'] | 'all'
type AccountSortKey = 'account' | 'role' | 'status' | 'created'
const ACCOUNT_PAGE_SIZE = 10

interface AccountTransitionImpact {
  requiresReplacementSupervisor: boolean
  requiresStudentCleanupConfirmation: boolean
  openProjectCount: number
  activeFolderCount: number
  activeMembershipCount: number
  activeAssignmentCount: number
  message: string
}

export function AdminUsersPage() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.user)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [role, setRole] = useState<RoleFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState<AccountSortKey> | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<User | null>(null)
  const filters = useMemo<GetAdminUsersParams>(() => ({
    search: deferredSearch.trim() || undefined,
    role: role === 'all' ? undefined : role,
    status: status === 'all' ? undefined : status,
    limit: ACCOUNT_PAGE_SIZE,
  }), [deferredSearch, role, status])
  const usersQuery = useQuery({
    queryKey: queryKeys.adminUsersFiltered({ ...filters, page }),
    queryFn: () => getAdminUsersPage({ ...filters, page }),
    placeholderData: (previousData) => previousData,
  })
  const adminForbidden = usersQuery.isError && isForbiddenError(usersQuery.error)

  useEffect(() => {
    if (adminForbidden) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.authMe })
    }
  }, [adminForbidden, queryClient])

  const usersPage = usersQuery.data
  const users = usersPage?.items || []
  const totalUsers = usersPage?.total || 0
  const totalPages = Math.max(1, Math.ceil(totalUsers / ACCOUNT_PAGE_SIZE))
  const currentPage = Math.min(usersPage?.page || page, totalPages)
  const startItem = totalUsers === 0 ? 0 : (currentPage - 1) * ACCOUNT_PAGE_SIZE + 1
  const endItem = totalUsers === 0 ? 0 : Math.min(startItem + users.length - 1, totalUsers)
  const visibleUsers = sortItems(users, sort, {
    account: (user) => `${user.fullName} ${user.email}`,
    role: (user) => user.role,
    status: (user) => user.status,
    created: (user) => dateSortValue(user.createdAt),
  })
  const onSort = (key: AccountSortKey) => setSort((current) => toggleSort(current, key))

  if (usersQuery.isLoading && !usersQuery.data) {
    return <LoadingState label="Loading accounts" />
  }
  if (adminForbidden) {
    return <ForbiddenState eyebrow="Admin area" title="Admin is restricted" message="Only admins can manage accounts. Your session permissions may have changed; refresh or sign in again if this looks wrong." />
  }
  if (usersQuery.isError && !usersQuery.data) {
    return <ErrorState message="Admin accounts could not be loaded." onRetry={() => void usersQuery.refetch()} />
  }

  const isRefreshing = usersQuery.isFetching && Boolean(usersQuery.data)
  const hasActiveFilters = search.trim().length > 0 || role !== 'all' || status !== 'all'
  const pageLabel = totalUsers === 0 ? 'No accounts' : `${startItem}-${endItem} of ${totalUsers} accounts`
  const clearFilters = () => {
    setSearch('')
    setRole('all')
    setStatus('all')
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <Dialog open={createOpen} onOpenChange={setCreateOpen} title="Create account" description="Create an active or inactive account with an admin-set password.">
        <AccountForm onSaved={() => setCreateOpen(false)} onCancel={() => setCreateOpen(false)} />
      </Dialog>
      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }} title="Edit account" description="Update role, status, and display name. Email stays fixed for audit clarity.">
        {editing ? <AccountForm user={editing} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} /> : null}
      </Dialog>
      <Dialog open={Boolean(passwordTarget)} onOpenChange={(open) => { if (!open) setPasswordTarget(null) }} title="Set password" description={passwordTarget ? `Set a new password for ${passwordTarget.email}.` : undefined} className="max-w-xl">
        {passwordTarget ? <PasswordForm user={passwordTarget} onSaved={() => setPasswordTarget(null)} onCancel={() => setPasswordTarget(null)} /> : null}
      </Dialog>

      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-2"><ShieldCheck className="size-4" /> Admin</span>}
        title="Accounts"
        description="Create users, set temporary passwords, and control role/status without public registration."
        action={<Button type="button" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> Create account</Button>}
      />

      <section className="overflow-hidden rounded-[1.85rem] border border-border bg-card shadow-panel">
        <div className="border-b border-border bg-gradient-to-br from-paper via-white to-accent/35 p-4 sm:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                <span>Account directory</span>
                <span className="rounded-full bg-white/85 px-2.5 py-1 text-[0.68rem] normal-case tracking-normal text-primary shadow-sm ring-1 ring-border">{pageLabel}</span>
                {isRefreshing ? <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.68rem] normal-case tracking-normal text-primary">Refreshing...</span> : null}
              </div>
              <label className="relative block w-full xl:max-w-xl">
                <span className="sr-only">Search accounts</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-11 rounded-full bg-white pl-9 pr-10 shadow-sm" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search name or email" />
                {search.trim() ? <button type="button" className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-ink" aria-label="Clear account search" onClick={() => { setSearch(''); setPage(1) }}><X className="size-3.5" /></button> : null}
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,10rem)_auto] sm:items-center xl:w-[26rem]">
              <Select value={role} onValueChange={(value) => { setRole(value as RoleFilter); setPage(1) }}>
                <SelectTrigger className="bg-white shadow-sm" aria-label="Filter by role"><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(value) => { setStatus(value as StatusFilter); setPage(1) }}>
                <SelectTrigger className="bg-white shadow-sm" aria-label="Filter by status"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="sm" className="justify-center bg-white/75 shadow-sm" disabled={!hasActiveFilters} onClick={clearFilters}>Clear</Button>
            </div>
          </div>
        </div>

        {users.length === 0 ? (
          <div className="space-y-4 px-5 py-12 text-center">
            <EmptyState title="No matching accounts" message="Clear filters or create a new account." />
            {hasActiveFilters ? <Button type="button" variant="outline" onClick={clearFilters}>Clear filters</Button> : null}
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table className="min-w-[58rem]">
                <TableHeader className="bg-primary/5">
                  <TableRow className="hover:bg-transparent">
                    <SortableTableHead sortKey="account" sort={sort} onSort={onSort} className="w-[42%] text-ink">Account</SortableTableHead>
                    <SortableTableHead sortKey="role" sort={sort} onSort={onSort} className="w-[10rem] text-ink">Role</SortableTableHead>
                    <SortableTableHead sortKey="status" sort={sort} onSort={onSort} className="w-[10rem] text-ink">Status</SortableTableHead>
                    <SortableTableHead sortKey="created" sort={sort} onSort={onSort} className="w-[14rem] text-ink">Created</SortableTableHead>
                    <TableHead className="w-[15rem] text-right text-ink">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleUsers.map((user) => (
                    <TableRow key={user.id} className="group hover:bg-accent/35">
                      <TableCell className="py-4"><AccountIdentity user={user} currentUserId={currentUser?.id} /></TableCell>
                      <TableCell><StatusBadge value={user.role} tone={roleTone(user.role)} /></TableCell>
                      <TableCell><StatusBadge value={user.status} tone={user.status === 'active' ? 'blue' : 'slate'} /></TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{user.createdAt ? formatDateTime(user.createdAt) : 'Unknown'}</TableCell>
                      <TableCell><AccountActions user={user} onPassword={() => setPasswordTarget(user)} onEdit={() => setEditing(user)} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="grid gap-3 p-4 md:hidden">
              {visibleUsers.map((user) => <AccountCard key={user.id} user={user} currentUserId={currentUser?.id} onPassword={() => setPasswordTarget(user)} onEdit={() => setEditing(user)} />)}
            </div>
            <PaginationControls page={currentPage} pageSize={ACCOUNT_PAGE_SIZE} totalItems={totalUsers} itemLabel="accounts" isLoading={usersQuery.isFetching} onPageChange={setPage} />
          </>
        )}
      </section>
    </div>
  )
}

function AccountIdentity({ user, currentUserId }: { user: User; currentUserId?: string }) {
  const isCurrentUser = user.id === currentUserId
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary/15 to-secondary/10 font-heading text-sm font-semibold text-primary ring-1 ring-primary/10">{initials(user.fullName)}</span>
      <div className="min-w-0">
        <p className="flex min-w-0 flex-wrap items-center gap-2 font-heading text-base font-semibold tracking-tight text-ink">
          <span className="truncate">{user.fullName}</span>
          {isCurrentUser ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-primary">You</span> : null}
        </p>
        <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground" title={user.email}>{user.email}</p>
      </div>
    </div>
  )
}

function AccountActions({ user, onPassword, onEdit, compact = false }: { user: User; onPassword: () => void; onEdit: () => void; compact?: boolean }) {
  return (
    <div className={compact ? 'grid grid-cols-2 gap-2' : 'flex justify-end gap-2'}>
      <Button type="button" variant={compact ? 'outline' : 'ghost'} size="sm" className={compact ? 'justify-center' : undefined} onClick={onPassword} aria-label={`Set password for ${user.fullName}`}><KeyRound className="size-4" /> Password</Button>
      <Button type="button" variant="edit" size="sm" className={compact ? 'justify-center' : undefined} onClick={onEdit} aria-label={`Edit ${user.fullName}`}><Pencil className="size-4" /> Edit</Button>
    </div>
  )
}

function AccountCard({ user, currentUserId, onPassword, onEdit }: { user: User; currentUserId?: string; onPassword: () => void; onEdit: () => void }) {
  return (
    <article className="rounded-2xl border border-border bg-white/85 p-4 shadow-sm">
      <AccountIdentity user={user} currentUserId={currentUserId} />
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <AccountFact label="Role"><StatusBadge value={user.role} tone={roleTone(user.role)} /></AccountFact>
        <AccountFact label="Status"><StatusBadge value={user.status} tone={user.status === 'active' ? 'blue' : 'slate'} /></AccountFact>
        <AccountFact label="Created" className="col-span-2"><span className="text-sm font-semibold text-ink">{user.createdAt ? formatDateTime(user.createdAt) : 'Unknown'}</span></AccountFact>
      </div>
      <div className="mt-4 border-t border-border pt-3">
        <AccountActions user={user} compact onPassword={onPassword} onEdit={onEdit} />
      </div>
    </article>
  )
}

function AccountFact({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-xl border border-border bg-paper/70 px-3 py-2 ${className}`}>
      <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-[0.13em] text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function roleTone(role: UserRole) {
  return role === 'admin' ? 'teal' : role === 'teacher' ? 'blue' : 'slate'
}

function AccountForm({ user, onSaved, onCancel }: { user?: User; onSaved: () => void; onCancel: () => void }) {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.user)
  const formId = useId()
  const [fullName, setFullName] = useState(user?.fullName || '')
  const [email, setEmail] = useState(user?.email || '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>(user?.role || 'student')
  const [status, setStatus] = useState<User['status']>(user?.status || 'active')
  const [error, setError] = useState('')
  const [transitionImpact, setTransitionImpact] = useState<AccountTransitionImpact | null>(null)
  const [replacementSupervisorId, setReplacementSupervisorId] = useState('')
  const [confirmStudentCleanup, setConfirmStudentCleanup] = useState(false)
  const replacementOptionsQuery = useQuery({
    queryKey: [...queryKeys.adminUsers, 'replacement-supervisors'],
    queryFn: getReplacementSupervisorOptions,
    enabled: Boolean(user),
  })
  const createMutation = useMutation({
    mutationFn: createAdminUser,
    onSuccess: () => {
      toast.success('Account created')
      invalidateAdminAccountImpactData(queryClient)
      onSaved()
    },
    onError: (error) => {
      if (isForbiddenOrConflictError(error)) {
        invalidateAdminAccountImpactData(queryClient)
      }
      setError(getErrorMessage(error))
    },
  })
  const updateMutation = useMutation({
    mutationFn: updateAdminUser,
    onSuccess: () => {
      toast.success('Account updated')
      invalidateAdminAccountImpactData(queryClient)
      if (user?.id === currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.authMe })
      }
      onSaved()
    },
    onError: (error) => {
      const impact = getAccountTransitionImpact(error)
      if (impact) {
        setTransitionImpact(impact)
        setError('')
        return
      }
      if (isForbiddenOrConflictError(error)) {
        invalidateAdminAccountImpactData(queryClient)
      }
      setError(getErrorMessage(error))
    },
  })
  const isPending = createMutation.isPending || updateMutation.isPending
  const isEdit = Boolean(user)
  const isSelf = Boolean(user && user.id === currentUser?.id)
  const fullNameId = `${formId}-full-name`
  const emailId = `${formId}-email`
  const passwordId = `${formId}-password`
  const roleId = `${formId}-role`
  const statusId = `${formId}-status`
  const cleanupId = `${formId}-confirm-cleanup`
  const replacementOptions = useMemo(() => (replacementOptionsQuery.data || []).filter((candidate) => candidate.id !== user?.id), [replacementOptionsQuery.data, user?.id])
  const replacementSupportUnavailable = Boolean(transitionImpact?.requiresReplacementSupervisor && (replacementOptionsQuery.isLoading || replacementOptionsQuery.isError))
  const clearTransition = () => {
    setTransitionImpact(null)
    setReplacementSupervisorId('')
    setConfirmStudentCleanup(false)
  }

  return (
    <form className="space-y-4 pb-4" onSubmit={(event) => {
      event.preventDefault()
      setError('')
      const trimmedName = fullName.trim()
      const trimmedEmail = email.trim().toLowerCase()
      if (!trimmedName) {
        setError('Full name is required')
        return
      }
      if (!isEdit && (!trimmedEmail || !trimmedEmail.includes('@'))) {
        setError('Valid email is required')
        return
      }
      if (!isEdit) {
        const passwordError = validateAdminPassword(password)
        if (passwordError) {
          setError(passwordError)
          return
        }
      }
      if (isSelf && (role !== 'admin' || status !== 'active')) {
        setError('You cannot remove your own active admin access')
        return
      }
      if (transitionImpact?.requiresReplacementSupervisor && !replacementSupervisorId) {
        if (replacementOptionsQuery.isLoading) {
          setError('Replacement supervisor choices are still loading')
          return
        }
        if (replacementOptionsQuery.isError) {
          setError('Replacement supervisor choices could not be loaded')
          return
        }
        setError('Choose a replacement teacher or admin before saving this account transition')
        return
      }
      if (transitionImpact?.requiresStudentCleanupConfirmation && !confirmStudentCleanup) {
        setError('Confirm active project and assignment removal before saving this account transition')
        return
      }
      if (user) {
        updateMutation.mutate({
          userId: user.id,
          fullName: trimmedName,
          role,
          status,
          replacementSupervisorId: transitionImpact?.requiresReplacementSupervisor ? replacementSupervisorId : undefined,
          confirmStudentCleanup: transitionImpact?.requiresStudentCleanupConfirmation ? confirmStudentCleanup : undefined,
        })
      } else {
        createMutation.mutate({ fullName: trimmedName, email: trimmedEmail, password, role, status })
      }
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={fullNameId} label="Full name"><Input id={fullNameId} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nguyen Lan" /></Field>
        <Field id={emailId} label="Email"><Input id={emailId} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@unitrack.local" type="email" disabled={isEdit} /></Field>
      </div>
      {!isEdit ? <Field id={passwordId} label="Temporary password"><Input id={passwordId} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" type="password" /></Field> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={roleId} label="Role">
          <Select value={role} onValueChange={(value) => { setRole(value as UserRole); clearTransition() }} disabled={isSelf}>
            <SelectTrigger id={roleId}><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="teacher">Teacher</SelectItem>
              <SelectItem value="student">Student</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field id={statusId} label="Status">
          <Select value={status} onValueChange={(value) => { setStatus(value as User['status']); clearTransition() }} disabled={isSelf}>
            <SelectTrigger id={statusId}><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      {isSelf ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">Your own role and status stay locked as active admin so you cannot remove your current access.</p> : null}
      {transitionImpact ? (
        <AccountTransitionPanel
          impact={transitionImpact}
          replacementOptions={replacementOptions}
          replacementSupervisorId={replacementSupervisorId}
          onReplacementSupervisorChange={setReplacementSupervisorId}
          replacementOptionsLoading={replacementOptionsQuery.isLoading}
          replacementOptionsError={replacementOptionsQuery.isError}
          onRetryReplacementOptions={() => void replacementOptionsQuery.refetch()}
          confirmStudentCleanup={confirmStudentCleanup}
          onConfirmStudentCleanupChange={setConfirmStudentCleanup}
          cleanupId={cleanupId}
        />
      ) : null}
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p> : null}
      <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-border bg-card/95 px-5 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>Cancel</Button>
        <Button type="submit" disabled={isPending || replacementSupportUnavailable}>{isPending ? 'Saving...' : isEdit ? 'Save account' : 'Create account'}</Button>
      </div>
    </form>
  )
}

function AccountTransitionPanel({ impact, replacementOptions, replacementSupervisorId, onReplacementSupervisorChange, replacementOptionsLoading, replacementOptionsError, onRetryReplacementOptions, confirmStudentCleanup, onConfirmStudentCleanupChange, cleanupId }: { impact: AccountTransitionImpact; replacementOptions: User[]; replacementSupervisorId: string; onReplacementSupervisorChange: (value: string) => void; replacementOptionsLoading: boolean; replacementOptionsError: boolean; onRetryReplacementOptions: () => void; confirmStudentCleanup: boolean; onConfirmStudentCleanupChange: (value: boolean) => void; cleanupId: string }) {
  return (
    <section className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" />
        <div>
          <p className="font-semibold">Account transition needed</p>
          <p className="mt-1 leading-6 text-amber-900">{impact.message}</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {impact.openProjectCount > 0 ? <ImpactCount label="Open projects" value={impact.openProjectCount} /> : null}
        {impact.activeFolderCount > 0 ? <ImpactCount label="Active folders" value={impact.activeFolderCount} /> : null}
        {impact.activeMembershipCount > 0 ? <ImpactCount label="Active project memberships" value={impact.activeMembershipCount} /> : null}
        {impact.activeAssignmentCount > 0 ? <ImpactCount label="Active assignments" value={impact.activeAssignmentCount} /> : null}
      </div>
      {impact.requiresReplacementSupervisor ? (
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800" htmlFor="replacement-supervisor">Replacement supervisor</label>
          <select id="replacement-supervisor" className="h-10 w-full rounded-lg border border-amber-200 bg-white px-3 text-sm font-medium text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60" value={replacementSupervisorId} disabled={replacementOptionsLoading || replacementOptionsError} onChange={(event) => onReplacementSupervisorChange(event.target.value)}>
            <option value="">{replacementOptionsLoading ? 'Loading active teacher/admin accounts' : replacementOptionsError ? 'Replacement choices unavailable' : 'Choose active teacher/admin'}</option>
            {replacementOptions.map((option) => <option key={option.id} value={option.id}>{option.fullName} ({option.email})</option>)}
          </select>
          {replacementOptionsError ? <p className="text-xs font-medium text-amber-800">Could not load replacement choices. <button type="button" className="font-bold underline" onClick={onRetryReplacementOptions}>Retry</button></p> : null}
          {!replacementOptionsLoading && !replacementOptionsError && replacementOptions.length === 0 ? <p className="text-xs font-medium text-amber-800">Create or reactivate a teacher/admin account before completing this transition.</p> : null}
        </div>
      ) : null}
      {impact.requiresStudentCleanupConfirmation ? (
        <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-white/70 p-3 text-sm font-medium text-amber-950" htmlFor={cleanupId}>
          <input id={cleanupId} type="checkbox" className="mt-1 size-4 accent-primary" checked={confirmStudentCleanup} onChange={(event) => onConfirmStudentCleanupChange(event.target.checked)} />
          <span>Remove this account from active project memberships and active assignments. Historical submissions and reviews stay readable.</span>
        </label>
      ) : null}
    </section>
  )
}

function ImpactCount({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-amber-200 bg-white/70 px-3 py-2"><span className="font-semibold text-ink">{value}</span> <span className="text-amber-900">{label}</span></div>
}

function PasswordForm({ user, onSaved, onCancel }: { user: User; onSaved: () => void; onCancel: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const currentUser = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const passwordFormId = useId()
  const passwordId = `${passwordFormId}-new-password`
  const isSelf = user.id === currentUser?.id
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: setAdminUserPassword,
    onSuccess: () => {
      if (isSelf) {
        toast.success('Password set. Sign in again with the new password.')
        setUser(null)
        queryClient.removeQueries()
        onSaved()
        navigate('/login', { replace: true })
        return
      }
      toast.success('Password set')
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers })
      onSaved()
    },
    onError: (error) => {
      if (isForbiddenOrConflictError(error)) {
        invalidateAdminAccountImpactData(queryClient)
      }
      setError(getErrorMessage(error))
    },
  })

  return (
    <form className="space-y-4 pb-4" onSubmit={(event) => {
      event.preventDefault()
      setError('')
      const passwordError = validateAdminPassword(password)
      if (passwordError) {
        setError(passwordError)
        return
      }
      mutation.mutate({ userId: user.id, password })
    }}>
      <div className="rounded-2xl border border-border bg-paper px-4 py-3">
        <p className="font-semibold text-ink">{user.fullName}</p>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>
      {isSelf ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">Setting your own password revokes this session. You will need to sign in again.</p> : null}
      <Field id={passwordId} label="New password"><Input id={passwordId} value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="At least 8 characters" /></Field>
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={mutation.isPending}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Set password'}</Button>
      </div>
    </form>
  )
}

function Field({ id, label, error, children }: { id?: string; label: string; error?: string; children: ReactNode }) {
  return (
    <BaseField>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
      <FieldError message={error} />
    </BaseField>
  )
}

function validateAdminPassword(password: string) {
  if (password !== password.trim()) {
    return 'Password cannot start or end with spaces'
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters'
  }
  return ''
}

function getAccountTransitionImpact(error: unknown): AccountTransitionImpact | null {
  const payload = getErrorPayload(error)
  if (payload?.code !== 'account_transition_required' || !payload.impact || typeof payload.impact !== 'object') {
    return null
  }
  const impact = payload.impact as Partial<AccountTransitionImpact>
  return {
    requiresReplacementSupervisor: Boolean(impact.requiresReplacementSupervisor),
    requiresStudentCleanupConfirmation: Boolean(impact.requiresStudentCleanupConfirmation),
    openProjectCount: Number(impact.openProjectCount || 0),
    activeFolderCount: Number(impact.activeFolderCount || 0),
    activeMembershipCount: Number(impact.activeMembershipCount || 0),
    activeAssignmentCount: Number(impact.activeAssignmentCount || 0),
    message: typeof impact.message === 'string' ? impact.message : 'Review this account transition before saving.',
  }
}

async function getReplacementSupervisorOptions() {
  const [teachers, admins] = await Promise.all([
    getAdminUsers({ role: 'teacher', status: 'active', limit: 200 }),
    getAdminUsers({ role: 'admin', status: 'active', limit: 200 }),
  ])
  return [...teachers, ...admins].sort((left, right) => left.fullName.localeCompare(right.fullName) || left.email.localeCompare(right.email))
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'
}

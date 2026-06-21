import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, KeyRound, Pencil, Plus, Search, ShieldCheck } from 'lucide-react'
import { useDeferredValue, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { ForbiddenState } from '@/components/shared/forbidden-state'
import { LoadingState } from '@/components/shared/loading-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field as BaseField, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createAdminUser, getAdminUsers, setAdminUserPassword, updateAdminUser, type GetAdminUsersParams } from '@/features/admin/api'
import { getErrorMessage, getErrorPayload, isForbiddenError } from '@/lib/axios'
import { formatDateTime } from '@/lib/format'
import { invalidateAdminAccountImpactData } from '@/lib/query-invalidation'
import { queryKeys } from '@/lib/query-keys'
import { useAuthStore } from '@/stores/auth-store'
import type { User, UserRole } from '@/types/api'

type RoleFilter = UserRole | 'all'
type StatusFilter = User['status'] | 'all'
const ACCOUNT_PAGE_SIZE = 25

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
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<User | null>(null)
  const filters = useMemo<GetAdminUsersParams>(() => ({
    search: deferredSearch.trim() || undefined,
    role: role === 'all' ? undefined : role,
    status: status === 'all' ? undefined : status,
    limit: 200,
  }), [deferredSearch, role, status])
  const usersQuery = useQuery({
    queryKey: queryKeys.adminUsersFiltered(filters),
    queryFn: () => getAdminUsers(filters),
    placeholderData: (previousData) => previousData,
  })
  const adminForbidden = usersQuery.isError && isForbiddenError(usersQuery.error)

  useEffect(() => {
    if (adminForbidden) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.authMe })
    }
  }, [adminForbidden, queryClient])

  if (usersQuery.isLoading && !usersQuery.data) {
    return <LoadingState label="Loading accounts" />
  }
  if (adminForbidden) {
    return <ForbiddenState eyebrow="Admin area" title="Admin is restricted" message="Only admins can manage accounts. Your session permissions may have changed; refresh or sign in again if this looks wrong." />
  }
  if (usersQuery.isError && !usersQuery.data) {
    return <ErrorState message="Admin accounts could not be loaded." onRetry={() => void usersQuery.refetch()} />
  }

  const users = usersQuery.data || []
  const isRefreshing = usersQuery.isFetching && Boolean(usersQuery.data)
  const totalPages = Math.max(1, Math.ceil(users.length / ACCOUNT_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const startIndex = users.length === 0 ? 0 : (currentPage - 1) * ACCOUNT_PAGE_SIZE
  const endIndex = Math.min(startIndex + ACCOUNT_PAGE_SIZE, users.length)
  const visibleUsers = users.slice(startIndex, endIndex)

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

      <section className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground"><ShieldCheck className="size-4" /> Admin</p>
          <h1 className="mt-2 font-heading text-4xl font-semibold tracking-tight text-ink md:text-5xl">Accounts</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Create users, set temporary passwords, and control role/status without public registration.</p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> Create account</Button>
      </section>

      <section className="overflow-hidden rounded-[1.65rem] border border-border bg-card shadow-sm">
        <div className="sticky top-4 z-10 flex flex-col gap-3 border-b border-border bg-paper/95 p-4 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block w-full lg:max-w-md">
            <span className="sr-only">Search accounts</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="rounded-full bg-white pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search name or email" />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {isRefreshing ? <span className="text-xs font-semibold text-muted-foreground">Refreshing...</span> : null}
            {users.length >= 200 ? <span className="text-xs font-semibold text-amber-700">Showing first 200</span> : null}
            <div className="grid gap-2 sm:grid-cols-2 lg:w-[24rem]">
              <Select value={role} onValueChange={(value) => { setRole(value as RoleFilter); setPage(1) }}>
                <SelectTrigger className="bg-white"><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(value) => { setStatus(value as StatusFilter); setPage(1) }}>
                <SelectTrigger className="bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {users.length === 0 ? (
          <div className="py-12"><EmptyState title="No matching accounts" message="Clear filters or create a new account." /></div>
        ) : (
          <>
            <Table>
              <TableHeader className="sticky top-0 z-[1]">
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 font-heading text-sm font-semibold text-primary">{initials(user.fullName)}</span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{user.fullName}{user.id === currentUser?.id ? <span className="ml-2 text-xs font-medium text-muted-foreground">You</span> : null}</p>
                          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge value={user.role} tone={user.role === 'admin' ? 'teal' : user.role === 'teacher' ? 'blue' : 'slate'} /></TableCell>
                    <TableCell><StatusBadge value={user.status} tone={user.status === 'active' ? 'blue' : 'slate'} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.createdAt ? formatDateTime(user.createdAt) : 'Unknown'}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setPasswordTarget(user)}><KeyRound className="size-4" /> Password</Button>
                        <Button type="button" variant="edit" size="sm" onClick={() => setEditing(user)}><Pencil className="size-4" /> Edit</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-col gap-3 border-t border-border bg-paper/80 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>Showing {startIndex + 1}-{endIndex} of {users.length} accounts</span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
                <span className="font-semibold text-ink">Page {currentPage} of {totalPages}</span>
                <Button type="button" variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
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
    onError: (error) => setError(getErrorMessage(error)),
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
    onError: (error) => setError(getErrorMessage(error)),
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

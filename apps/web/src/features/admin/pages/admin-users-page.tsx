import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Pencil, Plus, Search, ShieldCheck } from 'lucide-react'
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { LoadingState } from '@/components/shared/loading-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field as BaseField, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createAdminUser, getAdminUsers, setAdminUserPassword, updateAdminUser, type GetAdminUsersParams } from '@/features/admin/api'
import { getErrorMessage } from '@/lib/axios'
import { formatDateTime } from '@/lib/format'
import { queryKeys } from '@/lib/query-keys'
import { useAuthStore } from '@/stores/auth-store'
import type { User, UserRole } from '@/types/api'

type RoleFilter = UserRole | 'all'
type StatusFilter = User['status'] | 'all'

export function AdminUsersPage() {
  const currentUser = useAuthStore((state) => state.user)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [role, setRole] = useState<RoleFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
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

  if (usersQuery.isLoading && !usersQuery.data) {
    return <LoadingState label="Loading accounts" />
  }
  if (usersQuery.isError && !usersQuery.data) {
    return <ErrorState message="Admin accounts could not be loaded." onRetry={() => void usersQuery.refetch()} />
  }

  const users = usersQuery.data || []
  const isRefreshing = usersQuery.isFetching && Boolean(usersQuery.data)
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
        <div className="flex flex-col gap-3 border-b border-border bg-paper/60 p-4 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block w-full lg:max-w-md">
            <span className="sr-only">Search accounts</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="rounded-full bg-white pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {isRefreshing ? <span className="text-xs font-semibold text-muted-foreground">Refreshing...</span> : null}
            {users.length >= 200 ? <span className="text-xs font-semibold text-amber-700">Showing first 200</span> : null}
            <div className="grid gap-2 sm:grid-cols-2 lg:w-[24rem]">
              <Select value={role} onValueChange={(value) => setRole(value as RoleFilter)}>
                <SelectTrigger className="bg-white"><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
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
        )}
      </section>
    </div>
  )
}

function AccountForm({ user, onSaved, onCancel }: { user?: User; onSaved: () => void; onCancel: () => void }) {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.user)
  const [fullName, setFullName] = useState(user?.fullName || '')
  const [email, setEmail] = useState(user?.email || '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>(user?.role || 'student')
  const [status, setStatus] = useState<User['status']>(user?.status || 'active')
  const [error, setError] = useState('')
  const createMutation = useMutation({
    mutationFn: createAdminUser,
    onSuccess: () => {
      toast.success('Account created')
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers })
      onSaved()
    },
    onError: (error) => setError(getErrorMessage(error)),
  })
  const updateMutation = useMutation({
    mutationFn: updateAdminUser,
    onSuccess: () => {
      toast.success('Account updated')
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers })
      if (user?.id === currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.authMe })
      }
      onSaved()
    },
    onError: (error) => setError(getErrorMessage(error)),
  })
  const isPending = createMutation.isPending || updateMutation.isPending
  const isEdit = Boolean(user)

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
      if (!isEdit && password.trim().length < 8) {
        setError('Password must be at least 8 characters')
        return
      }
      if (user) {
        updateMutation.mutate({ userId: user.id, fullName: trimmedName, role, status })
      } else {
        createMutation.mutate({ fullName: trimmedName, email: trimmedEmail, password, role, status })
      }
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name"><Input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nguyen Lan" /></Field>
        <Field label="Email"><Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@unitrack.local" type="email" disabled={isEdit} /></Field>
      </div>
      {!isEdit ? <Field label="Temporary password"><Input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" type="password" /></Field> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Role">
          <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
            <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="teacher">Teacher</SelectItem>
              <SelectItem value="student">Student</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onValueChange={(value) => setStatus(value as User['status'])}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p> : null}
      <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-border bg-card/95 px-5 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>Cancel</Button>
        <Button type="submit" disabled={isPending}>{isPending ? 'Saving...' : isEdit ? 'Save account' : 'Create account'}</Button>
      </div>
    </form>
  )
}

function PasswordForm({ user, onSaved, onCancel }: { user: User; onSaved: () => void; onCancel: () => void }) {
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: setAdminUserPassword,
    onSuccess: () => {
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
      if (password.trim().length < 8) {
        setError('Password must be at least 8 characters')
        return
      }
      mutation.mutate({ userId: user.id, password })
    }}>
      <div className="rounded-2xl border border-border bg-paper px-4 py-3">
        <p className="font-semibold text-ink">{user.fullName}</p>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>
      <Field label="New password"><Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="At least 8 characters" /></Field>
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={mutation.isPending}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Set password'}</Button>
      </div>
    </form>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <BaseField>
      <FieldLabel>{label}</FieldLabel>
      {children}
      <FieldError message={error} />
    </BaseField>
  )
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'
}

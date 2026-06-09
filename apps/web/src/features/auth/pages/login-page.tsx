import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, LockKeyhole, Mail } from 'lucide-react'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Field as BaseField, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { login } from '@/features/auth/api'
import { AuthFrame } from '@/features/auth/components/auth-frame'
import { getErrorMessage } from '@/lib/axios'
import { queryKeys } from '@/lib/query-keys'
import { useAuthStore } from '@/stores/auth-store'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const setUser = useAuthStore((state) => state.setUser)
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })
  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (user) => {
      queryClient.removeQueries()
      setUser(user)
      queryClient.setQueryData(queryKeys.authMe, user)
      navigate(safeRedirect(redirectTarget), { replace: true })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const fromState = location.state && typeof location.state === 'object' && 'from' in location.state && typeof location.state.from === 'string'
    ? location.state.from
    : ''
  const redirectTarget = fromState || searchParams.get('from') || ''
  const redirected = Boolean(redirectTarget)

  return (
    <AuthFrame
      title="Sign in"
      description={redirected ? 'Sign in to continue where you left off.' : 'Use your UniTrack account to continue.'}
      footer={<span>Students receive access after a teacher or admin adds their existing account to a project.</span>}
    >
      <form className="space-y-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
        <AuthField label="Email" error={form.formState.errors.email?.message} icon={<Mail className="size-4" />}>
          <Input className="h-12 border-blue-100 bg-white pl-10 focus:border-blue-500" type="email" autoComplete="email" placeholder="teacher@unitrack.local" {...form.register('email')} />
        </AuthField>
        <AuthField label="Password" error={form.formState.errors.password?.message} icon={<LockKeyhole className="size-4" />}>
          <Input className="h-12 border-blue-100 bg-white pl-10 focus:border-blue-500" type="password" autoComplete="current-password" placeholder="Password" {...form.register('password')} />
        </AuthField>
        <Button className="h-12 w-full shadow-lg shadow-primary/15" size="lg" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Signing in...' : 'Sign in'}
          <ArrowRight className="size-4" />
        </Button>
      </form>
    </AuthFrame>
  )
}

function safeRedirect(value: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard'
  }
  return value
}

function AuthField({ label, error, icon, children }: { label: string; error?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <BaseField>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        {icon ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span> : null}
        {children}
      </div>
      <FieldError message={error} />
    </BaseField>
  )
}

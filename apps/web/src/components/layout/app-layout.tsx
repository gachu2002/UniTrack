import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpenCheck, FolderKanban, LayoutDashboard, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { logout } from '@/features/auth/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import type { User } from '@/types/api'

interface AppLayoutProps {
  user: User
}

function navigationFor(user?: User) {
  if (user?.role === 'teacher' || user?.role === 'admin') {
    const links = [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Workspace', href: '/workspace', icon: FolderKanban },
    ]
    if (user.role === 'admin') {
      links.push({ label: 'Admin', href: '/admin/users', icon: ShieldCheck })
    }
    return links
  }
  return [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Workspace', href: '/workspace', icon: FolderKanban },
  ]
}

export function AppLayout({ user }: AppLayoutProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setUser = useAuthStore((state) => state.setUser)
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      setUser(null)
      queryClient.removeQueries()
      navigate('/login', { replace: true })
    },
    onError: () => toast.error('Could not log out. Try again.'),
  })

  return (
    <div className="min-h-screen text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-[#102A43] p-4 text-white lg:block">
        <SidebarContent user={user} onLogout={() => logoutMutation.mutate()} isLoggingOut={logoutMutation.isPending} />
      </aside>

      <header className="sticky top-0 z-20 border-b border-slate-800 bg-[#102A43] px-4 py-3 text-white lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-white/10 text-white">
              <BookOpenCheck className="size-5" />
            </div>
            <div>
              <p className="font-heading text-lg font-semibold">UniTrack</p>
              <p className="text-xs font-medium text-white/60">{user.role}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => logoutMutation.mutate()} aria-label="Log out">
            <LogOut className="size-5" />
          </Button>
        </div>
        <MobileNavigation user={user} />
      </header>

      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-none px-3 py-4 md:px-5 lg:px-6 lg:py-6 xl:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function MobileNavigation({ user }: { user: User }) {
  return (
    <nav className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Primary navigation">
      {navigationFor(user).map((link) => {
        const Icon = link.icon
        const classes = 'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white'
        return (
          <NavLink key={link.href} to={link.href} className={({ isActive }) => cn(classes, isActive ? 'bg-white text-[#102A43]' : '')}>
            <Icon className="size-4" />
            {link.label}
          </NavLink>
        )
      })}
    </nav>
  )
}

function SidebarContent({ user, onLogout, isLoggingOut }: { user: User; onLogout: () => void; isLoggingOut: boolean }) {
  return (
    <div className="flex h-full flex-col">
      <div className="pb-6">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-white/10 text-white">
            <BookOpenCheck className="size-6" />
          </div>
          <div>
            <p className="font-heading text-xl font-semibold">UniTrack</p>
            <p className="text-xs font-medium text-white/55">Project supervision</p>
          </div>
        </div>
      </div>

      <nav className="mt-4 space-y-1" aria-label="Primary navigation">
        {navigationFor(user).map((link) => {
          const Icon = link.icon
          return (
            <NavLink
              key={link.href}
              to={link.href}
              className={({ isActive }) =>
                cn(
                  'flex min-h-10 items-center gap-3 rounded-md border px-3 py-2.5 text-sm font-semibold transition',
                  isActive ? 'border-white bg-white text-[#102A43]' : 'border-transparent text-white/68 hover:bg-white/10 hover:text-white',
                )
              }
            >
              <Icon className="size-5" />
              {link.label}
            </NavLink>
          )
        })}
      </nav>

      <div className="mt-auto border-t border-white/10 pt-4">
        <div className="flex items-start gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-white/10 text-white">
            <UserRound className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{user.fullName}</p>
            <p className="truncate text-xs text-white/55">{user.email}</p>
            <p className="mt-2 text-xs font-medium text-white/70">{user.role}</p>
          </div>
        </div>
        <Button className="mt-4 w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" variant="outline" onClick={onLogout} disabled={isLoggingOut}>
          <LogOut className="size-4" />
          Log out
        </Button>
      </div>
    </div>
  )
}

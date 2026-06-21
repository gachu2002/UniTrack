import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LogOut, UserRound } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { OceanAdminIcon, OceanCurrentLines, OceanDashboardIcon, OceanMark, OceanWorkspaceIcon } from '@/components/shared/ocean-lines'
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
      { label: 'Dashboard', href: '/dashboard', icon: OceanDashboardIcon },
      { label: 'Workspace', href: '/workspace', icon: OceanWorkspaceIcon },
    ]
    if (user.role === 'admin') {
      links.push({ label: 'Admin', href: '/admin/users', icon: OceanAdminIcon })
    }
    return links
  }
  return [
    { label: 'Dashboard', href: '/dashboard', icon: OceanDashboardIcon },
    { label: 'Workspace', href: '/workspace', icon: OceanWorkspaceIcon },
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
    <div className="relative min-h-screen overflow-x-hidden text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary focus:shadow-panel focus:outline-none focus:ring-2 focus:ring-primary/25"
        onClick={(event) => {
          const target = document.getElementById('main-content')
          if (!target) {
            return
          }
          event.preventDefault()
          target.focus()
          target.scrollIntoView({ block: 'start' })
          window.history.replaceState(null, '', '#main-content')
        }}
      >
        Skip to main content
      </a>
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_14%_6%,rgba(14,165,233,0.18),transparent_26rem),radial-gradient(circle_at_88%_8%,rgba(34,211,238,0.12),transparent_28rem),linear-gradient(180deg,rgba(237,247,252,0.92)_0%,rgba(248,252,255,0.98)_46%,rgba(230,242,248,0.94)_100%)]" />
      <OceanCurrentLines className="pointer-events-none fixed inset-x-[-12%] top-6 z-0 h-[28rem] w-[124%] text-sky-400/18" />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 overflow-hidden bg-[#02172a] p-4 text-white shadow-[18px_0_48px_rgba(2,17,31,0.22)] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_8%,rgba(14,165,233,0.2),transparent_14rem),linear-gradient(180deg,#031d34_0%,#02111f_100%)]" />
        <OceanCurrentLines className="absolute bottom-[-4rem] left-[-9rem] h-72 w-[30rem] text-cyan-100/14" />
        <div className="relative z-10 h-full">
          <SidebarContent user={user} onLogout={() => logoutMutation.mutate()} isLoggingOut={logoutMutation.isPending} />
        </div>
      </aside>

      <header className="sticky top-0 z-20 overflow-hidden border-b border-cyan-100/10 bg-[#02172a] px-4 py-3 text-white shadow-sm lg:hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(14,165,233,0.22),transparent_14rem),linear-gradient(180deg,#031d34_0%,#02172a_100%)]" />
        <OceanCurrentLines className="absolute inset-x-[-10rem] top-[-8rem] h-56 text-cyan-100/12" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl border border-cyan-100/15 bg-cyan-50/10 text-cyan-100">
              <OceanMark className="size-7" />
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
        <div className="relative">
          <MobileNavigation user={user} />
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="relative z-10 lg:pl-64 focus:outline-none">
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
        const classes = 'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-cyan-100/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/72 transition hover:border-cyan-100/20 hover:bg-white/10 hover:text-white'
        return (
          <NavLink key={link.href} to={link.href} className={({ isActive }) => cn(classes, isActive ? 'border-cyan-50 bg-cyan-50 text-sky-950 shadow-sm' : '')}>
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
          <div className="grid size-11 place-items-center rounded-xl border border-cyan-100/15 bg-cyan-50/10 text-cyan-100 shadow-sm shadow-cyan-950/20">
            <OceanMark className="size-8" />
          </div>
          <div>
            <p className="font-heading text-xl font-semibold">UniTrack</p>
            <p className="text-xs font-medium text-cyan-100/60">Project supervision</p>
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
                  isActive ? 'border-cyan-50 bg-cyan-50 text-sky-950 shadow-sm shadow-cyan-950/20' : 'border-transparent text-white/68 hover:border-cyan-100/10 hover:bg-white/10 hover:text-white',
                )
              }
            >
              <Icon className="size-5" />
              {link.label}
            </NavLink>
          )
        })}
      </nav>

      <div className="mt-auto border-t border-cyan-100/10 pt-4">
        <div className="flex items-start gap-3">
          <div className="grid size-9 place-items-center rounded-lg border border-cyan-100/10 bg-cyan-50/10 text-cyan-100">
            <UserRound className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{user.fullName}</p>
            <p className="truncate text-xs text-cyan-100/55">{user.email}</p>
            <p className="mt-2 text-xs font-medium text-white/70">{user.role}</p>
          </div>
        </div>
        <Button className="mt-4 w-full border-cyan-100/15 bg-white/5 text-white hover:border-cyan-100/25 hover:bg-white/10 hover:text-white" variant="outline" onClick={onLogout} disabled={isLoggingOut}>
          <LogOut className="size-4" />
          Log out
        </Button>
      </div>
    </div>
  )
}

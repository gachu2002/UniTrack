import { OceanCurrentLines, OceanMark } from '@/components/shared/ocean-lines'
import { cn } from '@/lib/utils'

type LoadingStateVariant = 'screen' | 'app' | 'section' | 'inline'

interface LoadingStateProps {
  label?: string
  variant?: LoadingStateVariant
  showLabel?: boolean
  className?: string
}

interface WaterLoaderProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const loadingStateClasses: Record<LoadingStateVariant, string> = {
  screen: 'grid min-h-screen place-items-center px-6',
  app: 'min-h-screen',
  section: 'grid min-h-[180px] place-items-center p-8',
  inline: 'inline-grid place-items-center',
}

const waterLoaderSizes: Record<NonNullable<WaterLoaderProps['size']>, string> = {
  sm: 'size-8',
  md: 'size-14',
  lg: 'size-20',
}

export function LoadingState({ label = 'Loading', variant = 'section', showLabel = false, className }: LoadingStateProps) {
  const loaderSize = variant === 'screen' || variant === 'app' ? 'lg' : variant === 'inline' ? 'sm' : 'md'

  if (variant === 'app') {
    return <AppLoadingState label={label} showLabel={showLabel} className={className} />
  }

  return (
    <div className={cn(loadingStateClasses[variant], className)} role="status" aria-live="polite" aria-label={label}>
      <div className="grid place-items-center gap-3">
        <WaterLoader size={loaderSize} />
        {showLabel ? <p className="text-sm font-semibold text-primary">{label}</p> : <span className="sr-only">{label}</span>}
      </div>
    </div>
  )
}

export function WaterLoader({ size = 'md', className }: WaterLoaderProps) {
  return (
    <span className={cn('relative inline-grid place-items-center text-primary', waterLoaderSizes[size], className)} aria-hidden="true">
      <span className="water-loader-ripple absolute inset-0 rounded-full bg-primary/10" />
      <svg className="relative size-full overflow-visible" viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="40" r="26" className="fill-cyan-50 stroke-primary/15" strokeWidth="2" />
        <path className="water-loader-wave stroke-cyan-600" d="M8 35c8-7 16-7 24 0s16 7 24 0 16-7 24 0" strokeWidth="4" strokeLinecap="round" />
        <path className="water-loader-wave water-loader-wave-alt stroke-sky-300" d="M0 46c9-6 18-6 27 0s18 6 27 0 18-6 27 0" strokeWidth="3" strokeLinecap="round" />
        <path className="water-loader-wave water-loader-wave-soft stroke-primary/25" d="M12 56c7-4 14-4 21 0s14 4 21 0 14-4 21 0" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function AppLoadingState({ label, showLabel, className }: { label: string; showLabel: boolean; className?: string }) {
  return (
    <div className={cn('relative min-h-screen overflow-x-hidden text-foreground', className)} role="status" aria-live="polite" aria-label={label}>
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_14%_6%,rgba(14,165,233,0.18),transparent_26rem),linear-gradient(180deg,rgba(237,247,252,0.94)_0%,rgba(248,252,255,0.98)_48%,rgba(230,242,248,0.94)_100%)]" />
      <OceanCurrentLines className="pointer-events-none fixed inset-x-[-12%] top-6 z-0 h-[28rem] w-[124%] text-sky-400/20" />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 overflow-hidden bg-[#02172a] p-4 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_8%,rgba(14,165,233,0.2),transparent_14rem),linear-gradient(180deg,#031d34_0%,#02111f_100%)]" />
        <OceanCurrentLines className="absolute bottom-[-4rem] left-[-9rem] h-72 w-[30rem] text-cyan-100/15" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl border border-cyan-100/15 bg-cyan-50/10 text-cyan-100">
            <OceanMark className="size-8" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-24 rounded-full bg-white/16" />
            <div className="h-2.5 w-32 rounded-full bg-white/10" />
          </div>
        </div>
        <div className="relative z-10 mt-10 space-y-2">
          <div className="h-10 rounded-md bg-white/10" />
          <div className="h-10 rounded-md bg-white/6" />
        </div>
      </aside>

      <header className="sticky top-0 z-20 overflow-hidden border-b border-cyan-100/10 bg-[#02172a] px-4 py-3 lg:hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(14,165,233,0.22),transparent_14rem),linear-gradient(180deg,#031d34_0%,#02172a_100%)]" />
        <OceanCurrentLines className="absolute inset-x-[-10rem] top-[-8rem] h-56 text-cyan-100/10" />
        <div className="relative flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl border border-cyan-100/15 bg-cyan-50/10 text-cyan-100">
            <OceanMark className="size-7" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-24 rounded-full bg-white/16" />
            <div className="h-2.5 w-16 rounded-full bg-white/10" />
          </div>
        </div>
      </header>

      <main className="relative z-10 lg:pl-64">
        <div className="mx-auto grid min-h-[70svh] w-full max-w-[82rem] place-items-center px-4 py-6 md:px-8 lg:px-10 lg:py-10">
          <div className="grid place-items-center gap-3">
            <WaterLoader size="lg" />
            {showLabel ? <p className="text-sm font-semibold text-primary">{label}</p> : <span className="sr-only">{label}</span>}
          </div>
        </div>
      </main>
    </div>
  )
}

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
        <circle cx="40" cy="40" r="26" className="fill-blue-50 stroke-primary/15" strokeWidth="2" />
        <path className="water-loader-wave stroke-sky-500" d="M8 35c8-7 16-7 24 0s16 7 24 0 16-7 24 0" strokeWidth="4" strokeLinecap="round" />
        <path className="water-loader-wave water-loader-wave-alt stroke-blue-300" d="M0 46c9-6 18-6 27 0s18 6 27 0 18-6 27 0" strokeWidth="3" strokeLinecap="round" />
        <path className="water-loader-wave water-loader-wave-soft stroke-primary/25" d="M12 56c7-4 14-4 21 0s14 4 21 0 14-4 21 0" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function AppLoadingState({ label, showLabel, className }: { label: string; showLabel: boolean; className?: string }) {
  return (
    <div className={cn('min-h-screen text-foreground', className)} role="status" aria-live="polite" aria-label={label}>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-[#102A43] p-4 lg:block">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-white/10" />
          <div className="space-y-2">
            <div className="h-4 w-24 rounded-full bg-white/16" />
            <div className="h-2.5 w-32 rounded-full bg-white/10" />
          </div>
        </div>
        <div className="mt-10 space-y-2">
          <div className="h-10 rounded-md bg-white/10" />
          <div className="h-10 rounded-md bg-white/6" />
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-slate-800 bg-[#102A43] px-4 py-3 lg:hidden">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-white/10" />
          <div className="space-y-2">
            <div className="h-4 w-24 rounded-full bg-white/16" />
            <div className="h-2.5 w-16 rounded-full bg-white/10" />
          </div>
        </div>
      </header>

      <main className="lg:pl-64">
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

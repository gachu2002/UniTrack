import { useEffect, type ReactNode } from 'react'

import { OceanCurrentLines, OceanMark } from '@/components/shared/ocean-lines'
import { cn } from '@/lib/utils'

interface AuthFrameProps {
  eyebrow?: string
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  singleLineHeader?: boolean
}

export function AuthFrame({ eyebrow, title, description, children, footer, className, singleLineHeader = false }: AuthFrameProps) {
  useEffect(() => {
    document.documentElement.classList.add('unitrack-auth-page')
    document.body.classList.add('unitrack-auth-page')

    return () => {
      document.documentElement.classList.remove('unitrack-auth-page')
      document.body.classList.remove('unitrack-auth-page')
    }
  }, [])

  return (
    <main className="relative min-h-screen overflow-x-hidden overflow-y-auto bg-[#02111f] px-4 py-8 text-foreground sm:px-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(14,165,233,0.24),transparent_30rem),radial-gradient(circle_at_78%_8%,rgba(34,211,238,0.14),transparent_28rem),linear-gradient(160deg,#02111f_0%,#042940_50%,#063b52_100%)]" />
      <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(186,230,253,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(186,230,253,0.07)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="absolute inset-x-[-8rem] top-[18%] h-px bg-gradient-to-r from-transparent via-cyan-100/20 to-transparent" />
      <div className="absolute right-[-12rem] top-[-10rem] h-[30rem] w-[30rem] rounded-full border border-cyan-100/10" />
      <div className="absolute left-[-12rem] bottom-[-14rem] h-[34rem] w-[34rem] rounded-full bg-cyan-300/10 blur-3xl" />
      <OceanCurrentLines className="absolute inset-x-[-10%] bottom-[-2rem] h-[24rem] w-[120%] text-cyan-100/24" />
      <OceanCurrentLines className="absolute inset-x-[-14%] top-[4rem] h-[18rem] w-[128%] rotate-180 text-sky-200/10" />

      <section className="relative mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-5xl items-center justify-center py-6">
        <div className={cn('w-full max-w-[29rem]', className)}>
          <div className="relative overflow-hidden rounded-[1.75rem] border border-cyan-50/20 bg-[#f8fbff] shadow-[0_32px_90px_rgba(0,8,20,0.42)] ring-1 ring-cyan-950/5">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
            <OceanCurrentLines className="pointer-events-none absolute inset-x-[-18%] top-[-6rem] h-40 w-[136%] text-sky-300/16" />
            <div className="relative">
              <header className="border-b border-cyan-950/10 px-6 pb-6 pt-7 text-center md:px-8 md:pt-8">
                <div className="mx-auto mb-5 grid size-12 place-items-center rounded-2xl border border-primary/10 bg-primary/5 text-primary shadow-sm shadow-cyan-950/5">
                  <OceanMark className="size-8" />
                </div>
                {singleLineHeader ? (
                  <div className="mx-auto flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm leading-6">
                    {eyebrow ? <span className="font-bold uppercase tracking-[0.2em] text-primary/70">{eyebrow}</span> : null}
                    {eyebrow ? <span className="text-cyan-950/25">/</span> : null}
                    <h1 className="inline font-heading text-base font-semibold tracking-tight text-ink">{title}</h1>
                    {description ? <span className="text-cyan-950/25">/</span> : null}
                    {description ? <span className="text-muted-foreground">{description}</span> : null}
                  </div>
                ) : (
                  <>
                    {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary/70">{eyebrow}</p> : null}
                    <h1 className={cn('font-heading text-3xl font-semibold tracking-tight text-ink md:text-4xl', eyebrow ? 'mt-2' : '')}>{title}</h1>
                    {description ? <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p> : null}
                  </>
                )}
              </header>
              <div className="px-6 py-6 md:px-8 md:py-7">{children}</div>
            </div>
          </div>

          {footer ? (
            <div className="mx-auto mt-5 w-fit max-w-full rounded-full border border-white/15 bg-white/10 px-4 py-2 text-center text-sm text-white/90 shadow-sm backdrop-blur">
              {footer}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  )
}

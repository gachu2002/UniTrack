import { useEffect, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface AuthFrameProps {
  eyebrow?: string
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function AuthFrame({ eyebrow, title, description, children, footer, className }: AuthFrameProps) {
  useEffect(() => {
    document.documentElement.classList.add('unitrack-auth-page')
    document.body.classList.add('unitrack-auth-page')

    return () => {
      document.documentElement.classList.remove('unitrack-auth-page')
      document.body.classList.remove('unitrack-auth-page')
    }
  }, [])

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#031525] px-4 py-8 text-foreground sm:px-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(37,99,235,0.2),transparent_30rem),radial-gradient(circle_at_78%_8%,rgba(14,165,233,0.12),transparent_28rem),linear-gradient(160deg,#031525_0%,#08233f_50%,#063c56_100%)]" />
      <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(186,230,253,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(186,230,253,0.07)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="absolute inset-x-[-8rem] top-[18%] h-px bg-gradient-to-r from-transparent via-cyan-100/20 to-transparent" />
      <div className="absolute right-[-12rem] top-[-10rem] h-[30rem] w-[30rem] rounded-full border border-cyan-100/10" />
      <div className="absolute left-[-12rem] bottom-[-14rem] h-[34rem] w-[34rem] rounded-full bg-cyan-300/10 blur-3xl" />
      <svg className="absolute inset-x-[-10%] bottom-[-3.5rem] h-[24rem] w-[120%] text-cyan-100/20" viewBox="0 0 1440 360" preserveAspectRatio="none" fill="none" aria-hidden="true">
        <path d="M-80 158C46 111 154 110 288 158C430 209 552 210 690 158C832 104 950 106 1092 158C1228 208 1338 210 1520 158" stroke="currentColor" strokeWidth="2" />
        <path d="M-80 206C62 156 178 156 326 206C480 258 618 259 770 206C920 154 1052 155 1202 206C1340 253 1398 254 1520 222" stroke="currentColor" strokeWidth="2" />
        <path d="M-80 252C64 211 198 211 352 252C506 293 644 294 802 252C956 211 1098 211 1256 252C1386 286 1450 287 1520 270" stroke="currentColor" strokeWidth="2" />
      </svg>
      <svg className="absolute bottom-0 left-0 h-[18rem] w-full text-blue-950/65" viewBox="0 0 1440 280" preserveAspectRatio="none" fill="none" aria-hidden="true">
        <path d="M0 112C130 82 257 82 384 112C512 142 640 142 768 112C896 82 1024 82 1152 112C1280 142 1364 142 1440 124V280H0V112Z" fill="currentColor" />
        <path d="M0 170C150 128 294 128 442 170C590 212 735 213 884 170C1034 127 1192 128 1440 170V280H0V170Z" fill="#02101d" opacity="0.7" />
      </svg>

      <section className="relative mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-5xl items-center justify-center">
        <div className={cn('w-full max-w-[32rem]', className)}>
          <div className="relative overflow-hidden rounded-[1.65rem] border border-white/15 bg-[#f5f7fb] shadow-[0_32px_90px_rgba(0,8,20,0.46)]">
            <div className="relative">
              <header className="border-b border-slate-200/80 px-6 pb-6 pt-7 md:px-8 md:pt-8">
                {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p> : null}
                <h1 className={cn('font-heading text-4xl font-semibold tracking-tight text-ink md:text-5xl', eyebrow ? 'mt-3' : '')}>{title}</h1>
                {description ? <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{description}</p> : null}
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

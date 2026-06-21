import type { SVGProps } from 'react'

import { cn } from '@/lib/utils'

type OceanIconProps = SVGProps<SVGSVGElement> & {
  title?: string
}

export function OceanMark({ className, title, ...props }: OceanIconProps) {
  return (
    <svg className={cn('shrink-0', className)} viewBox="0 0 48 48" fill="none" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      <path d="M8 19c4.8-4.2 9.6-4.2 14.4 0s9.6 4.2 14.4 0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M5 27c6.3-4.9 12.7-4.9 19 0s12.7 4.9 19 0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.72" />
      <path d="M11 35c4.4-2.9 8.7-2.9 13 0s8.7 2.9 13 0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.52" />
    </svg>
  )
}

export function OceanDashboardIcon({ className, title, ...props }: OceanIconProps) {
  return (
    <svg className={cn('shrink-0', className)} viewBox="0 0 24 24" fill="none" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      <path d="M4 12a8 8 0 1 1 16 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6 15c2-1.7 4-1.7 6 0s4 1.7 6 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 19h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function OceanWorkspaceIcon({ className, title, ...props }: OceanIconProps) {
  return (
    <svg className={cn('shrink-0', className)} viewBox="0 0 24 24" fill="none" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      <path d="M4 6.5h5.3l1.8 2H20v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-11Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7 13c1.7-1.4 3.3-1.4 5 0s3.3 1.4 5 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 16c1.3-.9 2.7-.9 4 0s2.7.9 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.65" />
    </svg>
  )
}

export function OceanAdminIcon({ className, title, ...props }: OceanIconProps) {
  return (
    <svg className={cn('shrink-0', className)} viewBox="0 0 24 24" fill="none" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      <path d="M12 3.8 19 6v5.6c0 4.4-2.9 7.5-7 8.6-4.1-1.1-7-4.2-7-8.6V6l7-2.2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 12.2c1.4-1.2 2.7-1.2 4 0s2.6 1.2 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 15.2c1-.7 2-.7 3 0s2 .7 3 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.65" />
    </svg>
  )
}

export function OceanCurrentLines({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg className={cn('overflow-visible', className)} viewBox="0 0 1440 420" preserveAspectRatio="none" fill="none" aria-hidden="true" {...props}>
      <g className="ocean-current-drift">
        <path className="ocean-line-flow" d="M-80 102C55 58 166 58 302 102c145 47 268 47 414 0 147-48 270-48 418 0 136 44 246 44 386 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path className="ocean-line-flow ocean-line-flow-slow" d="M-94 172C64 123 192 123 350 172c162 50 298 50 460 0 161-50 302-50 462 0 136 42 222 45 342 14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity="0.74" />
        <path className="ocean-line-flow ocean-line-flow-soft" d="M-78 245C70 208 206 208 356 245c152 38 290 38 444 0 156-39 306-39 462 0 124 31 206 32 294 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.56" />
        <path d="M44 334c94-22 184-21 274 3 106 28 208 28 310 0 100-27 202-28 306-1 114 30 226 29 338-2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity="0.38" />
      </g>
    </svg>
  )
}

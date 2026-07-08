import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationControlsProps {
  page: number
  pageSize: number
  totalItems: number
  itemLabel: string
  isLoading?: boolean
  onPageChange: (page: number) => void
}

type PaginationItem = number | 'start-ellipsis' | 'end-ellipsis'

export function PaginationControls({ page, pageSize, totalItems, itemLabel, isLoading = false, onPageChange }: PaginationControlsProps) {
  if (totalItems <= 0) {
    return null
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const currentPage = clampPage(page, totalPages)
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(startItem + pageSize - 1, totalItems)
  const items = paginationItems(currentPage, totalPages)

  return (
    <div className="flex flex-col items-center justify-center gap-2 px-3 py-4 text-xs text-muted-foreground">
      <span className="font-semibold">{startItem}-{endItem} of {totalItems} {itemLabel}</span>
      <nav className="flex flex-wrap items-center justify-center gap-1" aria-label={`${itemLabel} pagination`}>
        <button type="button" className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 font-semibold transition hover:bg-muted hover:text-ink disabled:pointer-events-none disabled:opacity-40" aria-label={`Previous ${itemLabel} page`} disabled={currentPage <= 1 || isLoading} onClick={() => onPageChange(Math.max(1, currentPage - 1))}>
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">Previous</span>
        </button>
        {items.map((item) => item === 'start-ellipsis' || item === 'end-ellipsis' ? (
          <span key={item} className="grid h-9 min-w-7 place-items-center px-1 font-bold text-muted-foreground">...</span>
        ) : (
          <button key={item} type="button" className={item === currentPage ? 'grid h-9 min-w-9 place-items-center rounded-full bg-primary px-3 font-bold text-white shadow-sm' : 'grid h-9 min-w-9 place-items-center rounded-full px-3 font-bold text-muted-foreground transition hover:bg-muted hover:text-ink'} aria-current={item === currentPage ? 'page' : undefined} aria-label={`Page ${item} of ${itemLabel}`} disabled={isLoading || item === currentPage} onClick={() => onPageChange(item)}>
            {item}
          </button>
        ))}
        <button type="button" className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 font-semibold transition hover:bg-muted hover:text-ink disabled:pointer-events-none disabled:opacity-40" aria-label={`Next ${itemLabel} page`} disabled={currentPage >= totalPages || isLoading} onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}>
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-4" />
        </button>
      </nav>
    </div>
  )
}

function paginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const visiblePages = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1])
  if (currentPage <= 3) {
    visiblePages.add(2)
    visiblePages.add(3)
    visiblePages.add(4)
  }
  if (currentPage >= totalPages - 2) {
    visiblePages.add(totalPages - 3)
    visiblePages.add(totalPages - 2)
    visiblePages.add(totalPages - 1)
  }

  const sortedPages = [...visiblePages]
    .filter((visiblePage) => visiblePage >= 1 && visiblePage <= totalPages)
    .sort((left, right) => left - right)
  const items: PaginationItem[] = []
  for (const visiblePage of sortedPages) {
    const previous = items[items.length - 1]
    if (typeof previous === 'number' && visiblePage - previous > 1) {
      items.push(previous === 1 ? 'start-ellipsis' : 'end-ellipsis')
    }
    items.push(visiblePage)
  }
  return items
}

function clampPage(page: number, totalPages: number) {
  if (!Number.isFinite(page)) {
    return 1
  }
  return Math.max(1, Math.min(totalPages, Math.floor(page)))
}

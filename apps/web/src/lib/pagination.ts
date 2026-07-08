import type { PaginatedResponse } from '@/types/api'

export function pageItems<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const currentPage = clampPage(page, totalPages)
  const startIndex = (currentPage - 1) * pageSize
  return {
    currentPage,
    startIndex,
    items: items.slice(startIndex, startIndex + pageSize),
  }
}

export function paginatedTotalPages(data: PaginatedResponse<unknown>) {
  return Math.max(1, Math.ceil(data.total / Math.max(1, data.limit)))
}

export async function fetchAllPaginated<T>(fetchPage: (page: number) => Promise<PaginatedResponse<T>>) {
  const firstPage = await fetchPage(1)
  const items = [...firstPage.items]
  const totalPages = paginatedTotalPages(firstPage)

  for (let page = 2; page <= totalPages; page += 1) {
    const data = await fetchPage(page)
    items.push(...data.items)
  }

  return items
}

function clampPage(page: number, totalPages: number) {
  if (!Number.isFinite(page)) {
    return 1
  }
  return Math.max(1, Math.min(totalPages, Math.floor(page)))
}

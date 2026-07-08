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

function clampPage(page: number, totalPages: number) {
  if (!Number.isFinite(page)) {
    return 1
  }
  return Math.max(1, Math.min(totalPages, Math.floor(page)))
}

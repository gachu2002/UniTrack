export type SortDirection = 'asc' | 'desc'

export interface SortState<TKey extends string> {
  key: TKey
  direction: SortDirection
}

type SortableValue = string | number | boolean | Date | null | undefined

export function toggleSort<TKey extends string>(current: SortState<TKey> | null, key: TKey, defaultDirection: SortDirection = 'asc'): SortState<TKey> {
  if (current?.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  }
  return { key, direction: defaultDirection }
}

export function sortItems<TItem, TKey extends string>(items: TItem[], sort: SortState<TKey> | null, selectors: Record<TKey, (item: TItem) => SortableValue>) {
  if (!sort) {
    return items
  }
  const selector = selectors[sort.key]
  return [...items].sort((left, right) => {
    const leftValue = selector(left)
    const rightValue = selector(right)
    const missingCompare = compareMissingValues(leftValue, rightValue)
    if (missingCompare !== null) {
      return missingCompare
    }
    const result = compareValues(leftValue, rightValue)
    return sort.direction === 'asc' ? result : -result
  })
}

export function dateSortValue(value?: string | null) {
  if (!value) {
    return null
  }
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function compareMissingValues(left: SortableValue, right: SortableValue) {
  const leftMissing = left == null || left === ''
  const rightMissing = right == null || right === ''
  if (!leftMissing && !rightMissing) {
    return null
  }
  if (leftMissing && rightMissing) {
    return 0
  }
  return leftMissing ? 1 : -1
}

function compareValues(left: SortableValue, right: SortableValue) {
  const normalizedLeft = normalizeSortValue(left)
  const normalizedRight = normalizeSortValue(right)
  if (typeof normalizedLeft === 'number' && typeof normalizedRight === 'number') {
    return normalizedLeft - normalizedRight
  }
  return String(normalizedLeft).localeCompare(String(normalizedRight), undefined, { numeric: true, sensitivity: 'base' })
}

function normalizeSortValue(value: SortableValue) {
  if (value instanceof Date) {
    return value.getTime()
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase()
  }
  return value
}

export function formatDate(value?: string) {
  if (!value) {
    return 'No date'
  }
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(parseDate(value))
}

export function formatDateTime(value?: string) {
  if (!value) {
    return 'No date'
  }
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function titleize(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function parseDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
  }
  return new Date(value)
}

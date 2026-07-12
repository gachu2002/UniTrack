import { useQuery } from '@tanstack/react-query'
import { Folder, Search, UserRound } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { searchGlobally } from '@/features/activity/api'
import { queryKeys } from '@/lib/query-keys'
import type { GlobalSearch } from '@/types/api'

interface GlobalSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GlobalSearch({ open: isOpen, onOpenChange }: GlobalSearchProps) {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const searchTerm = value.trim()
  const [deferredValue, setDeferredValue] = useState(searchTerm)
  useEffect(() => {
    const timeout = window.setTimeout(() => setDeferredValue(searchTerm), 250)
    return () => window.clearTimeout(timeout)
  }, [searchTerm])
  const query = useQuery({
    queryKey: queryKeys.globalSearch(deferredValue),
    queryFn: () => searchGlobally(deferredValue),
    enabled: deferredValue.length >= 2,
  })
  const results = query.data
  const hasResults = Boolean(results && (results.students.length || results.projects.length || results.folders.length))
  const showPanel = value.trim().length >= 2

  function open(path: string) {
    setValue('')
    onOpenChange(false)
    navigate(path)
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setValue('')
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange} title="Search workspace" className="self-start mt-[10vh] max-w-3xl overflow-visible border-0 bg-transparent shadow-none" hideHeader>
      <div className="pb-5">
        <label className="relative block">
          <span className="sr-only">Global search</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-14 rounded-2xl border-0 bg-card pl-12 pr-5 text-base shadow-panel" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Search students, folders, projects" />
        </label>
        {showPanel ? <SearchResults results={results} query={deferredValue} isLoading={query.isFetching || searchTerm !== deferredValue} hasResults={hasResults} onOpen={open} /> : null}
      </div>
    </Dialog>
  )
}

function SearchResults({ results, query, isLoading, hasResults, onOpen }: { results?: GlobalSearch; query: string; isLoading: boolean; hasResults: boolean; onOpen: (path: string) => void }) {
  return (
    <div className="mt-3 max-h-[min(60svh,34rem)] overflow-y-auto rounded-xl border border-border bg-card text-foreground shadow-panel">
      {isLoading ? <p className="px-3 py-3 text-sm text-muted-foreground">Searching...</p> : null}
      {!isLoading && !hasResults ? <p className="px-3 py-3 text-sm text-muted-foreground">No accessible students, folders, or projects match.</p> : null}
      {results?.students.length ? <ResultGroup label="Students">{results.students.map((student) => <ResultButton key={student.id} icon={<UserRound className="size-4" />} label={student.fullName} detail={student.email} query={query} onClick={() => onOpen(`/work?studentId=${student.id}`)} />)}</ResultGroup> : null}
      {results?.folders.length ? <ResultGroup label="Folders">{results.folders.map((folder) => <ResultButton key={folder.id} icon={<Folder className="size-4" />} label={folder.label} detail={folder.detail} query={query} onClick={() => onOpen(`/workspace/classes/${folder.id}`)} />)}</ResultGroup> : null}
      {results?.projects.length ? <ResultGroup label="Projects">{results.projects.map((project) => <ResultButton key={project.id} icon={<Search className="size-4" />} label={project.label} detail={project.detail} query={query} onClick={() => onOpen(`/workspace/projects/${project.id}`)} />)}</ResultGroup> : null}
    </div>
  )
}

function ResultGroup({ label, children }: { label: string; children: ReactNode }) {
  return <div className="border-b border-border last:border-b-0"><p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><div className="p-1">{children}</div></div>
}

function ResultButton({ icon, label, detail, query, onClick }: { icon: ReactNode; label: string; detail?: string; query: string; onClick: () => void }) {
  return <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted" onClick={onClick}><span className="text-muted-foreground">{icon}</span><span className="min-w-0"><span className="block truncate font-medium">{highlightMatch(label, query)}</span>{detail ? <span className="block truncate text-xs text-muted-foreground">{highlightMatch(detail, query)}</span> : null}</span></button>
}

function highlightMatch(text: string, query: string) {
  if (!query) {
    return text
  }
  const lowerText = text.toLocaleLowerCase()
  const lowerQuery = query.toLocaleLowerCase()
  const parts: ReactNode[] = []
  let start = 0
  let matchIndex = lowerText.indexOf(lowerQuery, start)

  while (matchIndex !== -1) {
    if (matchIndex > start) {
      parts.push(text.slice(start, matchIndex))
    }
    parts.push(<mark key={matchIndex} className="bg-transparent font-semibold text-primary underline decoration-primary/60 decoration-2 underline-offset-2">{text.slice(matchIndex, matchIndex + query.length)}</mark>)
    start = matchIndex + query.length
    matchIndex = lowerText.indexOf(lowerQuery, start)
  }
  if (start < text.length) {
    parts.push(text.slice(start))
  }
  return parts.length > 0 ? parts : text
}

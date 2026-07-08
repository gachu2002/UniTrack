import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { getCurrentUser } from '@/features/auth/api'
import { isUnauthorizedError } from '@/lib/axios'
import { queryKeys } from '@/lib/query-keys'
import { useAuthStore } from '@/stores/auth-store'

export function useCurrentUser() {
  const queryClient = useQueryClient()
  const setUser = useAuthStore((state) => state.setUser)
  const query = useQuery({
    queryKey: queryKeys.authMe,
    queryFn: getCurrentUser,
    retry: false,
  })

  useEffect(() => {
    if (query.data) {
      setUser(query.data)
    }
    if (query.isError && isUnauthorizedError(query.error)) {
      setUser(null)
      queryClient.removeQueries({ predicate: (cachedQuery) => cachedQuery.queryKey[0] !== 'auth' })
    }
  }, [query.data, query.error, query.isError, queryClient, setUser])

  return query
}

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'

import { getCurrentUser } from '@/features/auth/api'
import { queryKeys } from '@/lib/query-keys'
import { useAuthStore } from '@/stores/auth-store'

export function useCurrentUser() {
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
    if (query.isError) {
      setUser(null)
    }
  }, [query.data, query.isError, setUser])

  return query
}

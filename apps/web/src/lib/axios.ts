import axios from 'axios'

import { env } from '@/lib/env'
import { queryClient } from '@/lib/query-client'
import { useAuthStore } from '@/stores/auth-store'

interface ApiError {
  error?: string
}

export const apiClient = axios.create({
  baseURL: env.apiUrl,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401 && shouldHandleUnauthorized(error.config?.url)) {
      useAuthStore.getState().setUser(null)
      queryClient.removeQueries()

      const path = window.location.pathname
      const publicPath = path === '/login'
      if (!publicPath) {
        const from = encodeURIComponent(`${window.location.pathname}${window.location.search}`)
        window.location.assign(`/login?from=${from}`)
      }
    }
    return Promise.reject(error)
  },
)

function shouldHandleUnauthorized(url?: string) {
  if (!url) {
    return true
  }
  return !url.includes('/auth/login') && !url.includes('/auth/me')
}

export function getErrorMessage(error: unknown) {
  if (axios.isAxiosError<ApiError>(error)) {
    return error.response?.data?.error || error.message || 'Request failed'
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong'
}

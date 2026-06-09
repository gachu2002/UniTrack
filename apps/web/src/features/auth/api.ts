import { apiClient } from '@/lib/axios'
import type { User } from '@/types/api'

export interface LoginInput {
  email: string
  password: string
}

export async function login(input: LoginInput) {
  const { data } = await apiClient.post<User>('/auth/login', input)
  return data
}

export async function logout() {
  await apiClient.post('/auth/logout')
}

export async function getCurrentUser() {
  const { data } = await apiClient.get<User>('/auth/me')
  return data
}

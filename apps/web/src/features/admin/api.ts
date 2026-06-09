import { apiClient } from '@/lib/axios'
import type { User, UserRole } from '@/types/api'

export interface GetAdminUsersParams {
  search?: string
  role?: UserRole
  status?: User['status']
  limit?: number
}

export interface CreateAdminUserInput {
  fullName: string
  email: string
  password: string
  role: UserRole
  status: User['status']
}

export interface UpdateAdminUserInput {
  userId: string
  fullName?: string
  role?: UserRole
  status?: User['status']
}

export interface SetAdminUserPasswordInput {
  userId: string
  password: string
}

export async function getAdminUsers(params: GetAdminUsersParams) {
  const { data } = await apiClient.get<User[]>('/admin/users', { params })
  return data
}

export async function createAdminUser(input: CreateAdminUserInput) {
  const { data } = await apiClient.post<User>('/admin/users', input)
  return data
}

export async function updateAdminUser({ userId, ...input }: UpdateAdminUserInput) {
  const { data } = await apiClient.patch<User>(`/admin/users/${userId}`, input)
  return data
}

export async function setAdminUserPassword({ userId, password }: SetAdminUserPasswordInput) {
  await apiClient.post(`/admin/users/${userId}/password`, { password })
}

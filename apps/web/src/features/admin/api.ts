import { apiClient } from '@/lib/axios'
import type { PaginatedResponse, User, UserRole } from '@/types/api'

export interface GetAdminUsersParams {
  search?: string
  role?: UserRole
  status?: User['status']
  limit?: number
  page?: number
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
  replacementSupervisorId?: string
  confirmStudentCleanup?: boolean
}

export interface SetAdminUserPasswordInput {
  userId: string
  password: string
}

export async function getAdminUsersPage(params: GetAdminUsersParams) {
  const { data } = await apiClient.get<PaginatedResponse<User>>('/admin/users', { params })
  return data
}

export async function getAdminUsers(params: GetAdminUsersParams) {
  const data = await getAdminUsersPage(params)
  return data.items
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

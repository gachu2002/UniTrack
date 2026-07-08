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
  const data = await fetchAdminUsersPage(params)
  const requestedPage = params.page || data.page
  const totalPages = paginatedTotalPages(data)
  if (requestedPage > totalPages && data.page !== totalPages) {
    return fetchAdminUsersPage({ ...params, page: totalPages })
  }
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

async function fetchAdminUsersPage(params: GetAdminUsersParams) {
  const { data } = await apiClient.get<PaginatedResponse<User>>('/admin/users', { params })
  return data
}

function paginatedTotalPages(data: PaginatedResponse<unknown>) {
  return Math.max(1, Math.ceil(data.total / Math.max(1, data.limit)))
}

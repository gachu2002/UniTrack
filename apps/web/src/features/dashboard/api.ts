import { apiClient } from '@/lib/axios'
import type { Dashboard } from '@/types/api'

export async function getDashboard() {
  const { data } = await apiClient.get<Dashboard>('/dashboard')
  return {
    ...data,
    stats: data.stats ?? { projectCount: 0, taskCount: 0, overdueTaskCount: 0, pendingReviews: 0 },
    projects: data.projects ?? [],
    tasks: data.tasks ?? [],
    progressUpdates: data.progressUpdates ?? [],
  }
}

import { apiClient } from '@/lib/axios'
import type { GlobalSearch, StudentWork, TeacherWork } from '@/types/api'

export async function getStudentWork(studentId?: string) {
  const { data } = await apiClient.get<StudentWork>('/work', { params: studentId ? { studentId } : undefined })
  return {
    ...data,
    activeTasks: data.activeTasks ?? [],
    historyTasks: data.historyTasks ?? [],
    progressUpdates: data.progressUpdates ?? [],
    currentProjects: data.currentProjects ?? [],
  }
}

export async function getTeacherWork(teacherId: string) {
  const { data } = await apiClient.get<TeacherWork>('/work', { params: { teacherId } })
  return { ...data, projects: data.projects ?? [] }
}

export async function searchGlobally(query: string) {
  const { data } = await apiClient.get<GlobalSearch>('/search', { params: { q: query } })
  return {
    students: data.students ?? [],
    projects: data.projects ?? [],
    folders: data.folders ?? [],
  }
}

import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom'

import { AppLayout } from '@/components/layout/app-layout'
import { ForbiddenState } from '@/components/shared/forbidden-state'
import { LoadingState } from '@/components/shared/loading-state'
import { LoginPage } from '@/features/auth/pages/login-page'
import { AdminUsersPage } from '@/features/admin/pages/admin-users-page'
import { ClassDetailPage } from '@/features/classes/pages/class-detail-page'
import { useCurrentUser } from '@/features/auth/hooks'
import { DashboardPage } from '@/features/dashboard/pages/dashboard-page'
import { ProjectDetailPage } from '@/features/projects/pages/project-detail-page'
import { TaskDetailPage } from '@/features/tasks/pages/task-detail-page'
import { WorkspacePage } from '@/features/workspace/pages/workspace-page'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/workspace" element={<WorkspacePage />} />
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
        </Route>
        <Route element={<TeacherAdminLayout />}>
          <Route path="/workspace/classes/:classId" element={<ClassDetailPage />} />
        </Route>
        <Route path="/workspace/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/workspace/projects/:projectId/tasks/:taskId" element={<TaskDetailPage />} />
        <Route path="/projects" element={<Navigate to="/workspace" replace />} />
        <Route path="/projects/:projectId" element={<LegacyProjectRedirect />} />
        <Route path="/projects/:projectId/tasks/:taskId" element={<LegacyTaskRedirect />} />
        <Route path="/classes" element={<Navigate to="/workspace" replace />} />
        <Route path="/classes/:classId" element={<LegacyClassRedirect />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

function LegacyProjectRedirect() {
  const { projectId } = useParams()
  return <Navigate to={`/workspace/projects/${projectId || ''}`} replace />
}

function LegacyTaskRedirect() {
  const { projectId, taskId } = useParams()
  return <Navigate to={`/workspace/projects/${projectId || ''}/tasks/${taskId || ''}`} replace />
}

function LegacyClassRedirect() {
  const { classId } = useParams()
  return <Navigate to={`/workspace/classes/${classId || ''}`} replace />
}

function RootRedirect() {
  const currentUser = useCurrentUser()
  if (currentUser.isLoading) {
    return <LoadingState label="Checking session" variant="app" />
  }
  return <Navigate to={currentUser.data ? '/dashboard' : '/login'} replace />
}

function ProtectedLayout() {
  const location = useLocation()
  const currentUser = useCurrentUser()
  if (currentUser.isLoading) {
    return <LoadingState label="Checking session" variant="screen" />
  }
  if (!currentUser.data) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  }
  if (currentUser.data.status !== 'active') {
    return <Navigate to="/login" replace />
  }
  return <AppLayout user={currentUser.data} />
}

function TeacherAdminLayout() {
  const currentUser = useCurrentUser()
  if (currentUser.isLoading) {
    return <LoadingState label="Checking permissions" variant="app" />
  }
  if (!currentUser.data) {
    return <Navigate to="/login" replace />
  }
  if (currentUser.data.role !== 'teacher' && currentUser.data.role !== 'admin') {
    return <ForbiddenState title="Folders are restricted" message="Only teachers and admins can manage project folders." />
  }
  return <Outlet />
}

function AdminLayout() {
  const currentUser = useCurrentUser()
  if (currentUser.isLoading) {
    return <LoadingState label="Checking permissions" variant="app" />
  }
  if (!currentUser.data) {
    return <Navigate to="/login" replace />
  }
  if (currentUser.data.role !== 'admin') {
    return <ForbiddenState title="Admin is restricted" message="Only admins can manage accounts." />
  }
  return <Outlet />
}

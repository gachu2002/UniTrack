import { expect, request as playwrightRequest, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'

import { requireAPIAvailable } from './api-availability'

const apiURL = (process.env.VITE_API_URL?.trim() || 'http://localhost:8080/api/v1').replace(/\/+$/, '')
const webOrigin = (process.env.PLAYWRIGHT_BASE_URL?.trim() || 'http://localhost:5173').replace(/\/+$/, '')
const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim() || 'admin@unitrack.local'
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'admin12345'
const userPassword = 'DemoPass123!'

interface UserDTO {
  id: string
  fullName: string
  email: string
  role: 'admin' | 'teacher' | 'student'
  status: 'active' | 'inactive'
}

interface ProjectDTO {
  id: string
  name: string
}

interface MilestoneDTO {
  id: string
}

interface TaskDetailDTO {
  task: {
    id: string
    title: string
  }
}

interface ProgressUpdateDTO {
  id: string
  title?: string
}

interface DashboardFixture {
  teacher: UserDTO
  student: UserDTO
  project: ProjectDTO
  revisionTask: TaskDetailDTO['task']
  waitingTask: TaskDetailDTO['task']
  overdueTask: TaskDetailDTO['task']
  waitingUpdate: ProgressUpdateDTO
}

let apiUnavailable = false
let fixture: DashboardFixture | null = null

test.beforeAll(async ({ request }) => {
  apiUnavailable = !(await isAPIAvailable(request))
  if (apiUnavailable) {
    return
  }
  fixture = await createDashboardFixture()
})

test('role dashboards render actionable queues', async ({ page }) => {
  const data = requireFixture()

  await signIn(page, adminEmail, adminPassword)
  await expect(page.getByRole('heading', { name: 'Review work' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pending reviews' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Overdue assignments' })).toBeVisible()

  await signIn(page, data.teacher.email, userPassword)
  await expect(page.getByRole('heading', { name: 'Review work' })).toBeVisible()
  await expect(page.getByText(data.waitingUpdate.title ?? data.waitingTask.title)).toBeVisible()
  await expect(page.getByText(data.overdueTask.title)).toBeVisible()

  await signIn(page, data.student.email, userPassword)
  await expect(page.getByRole('heading', { name: 'Do next' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Open assignments' })).toBeVisible()
  await expect(page.getByText(/Needs Revision/i).first()).toBeVisible()
  await expect(page.getByText(/Overdue/i).first()).toBeVisible()
  await expect(page.getByRole('link', { name: data.revisionTask.title, exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: data.overdueTask.title, exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: data.waitingUpdate.title ?? data.waitingTask.title, exact: true })).toBeVisible()
})

function requireFixture() {
  requireAPIAvailable(apiUnavailable, apiURL, 'dashboard tests')
  if (!fixture) {
    throw new Error('dashboard fixture was not created')
  }
  return fixture
}

async function createDashboardFixture() {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const admin = await authenticatedContext(adminEmail, adminPassword)
  const teacherEmail = `a12.teacher.${runId}@unitrack.local`
  const studentEmail = `a12.student.${runId}@unitrack.local`

  try {
    const teacher = await createUser(admin, 'A12 Dashboard Teacher', teacherEmail, 'teacher', 'active')
    const student = await createUser(admin, 'A12 Dashboard Student', studentEmail, 'student', 'active')
    const teacherAPI = await authenticatedContext(teacher.email, userPassword)
    const studentAPI = await authenticatedContext(student.email, userPassword)

    try {
      const project = await readJSON<ProjectDTO>(await teacherAPI.post(apiEndpoint('/projects'), { data: { name: `A12 Dashboard Project ${runId}`, topic: 'Dashboard browser fixture', status: 'active' } }), 'create project')
      await readJSON(await teacherAPI.post(apiEndpoint(`/projects/${project.id}/members`), { data: { email: student.email } }), 'add project member')
      const milestone = await readJSON<MilestoneDTO>(await teacherAPI.post(apiEndpoint(`/projects/${project.id}/milestones`), { data: { title: 'A12 dashboard checkpoint' } }), 'create milestone')
      const revisionTask = await createTask(teacherAPI, project.id, milestone.id, `A12 Revision Assignment ${runId}`, [student.id], futureDate(3), 'high')
      const waitingTask = await createTask(teacherAPI, project.id, milestone.id, `A12 Waiting Review ${runId}`, [student.id], futureDate(4), 'medium')
      const overdueTask = await createTask(teacherAPI, project.id, milestone.id, `A12 Overdue Assignment ${runId}`, [student.id], pastDate(2), 'high')

      const revisionUpdate = await submitProgress(studentAPI, project.id, revisionTask.task.id, 'A12 revision submission', 'Initial work that needs revision.')
      await readJSON(await teacherAPI.post(apiEndpoint(`/projects/${project.id}/progress-updates/${revisionUpdate.id}/reviews`), { data: { reviewStatus: 'needs_changes', reviewComment: 'Please revise and resubmit.', officialProgressState: 'needs_changes' } }), 'review revision submission')
      const waitingUpdate = await submitProgress(studentAPI, project.id, waitingTask.task.id, 'A12 pending submission', 'Work waiting for review.')

      return { teacher, student, project, revisionTask: revisionTask.task, waitingTask: waitingTask.task, overdueTask: overdueTask.task, waitingUpdate }
    } finally {
      await teacherAPI.dispose()
      await studentAPI.dispose()
    }
  } finally {
    await admin.dispose()
  }
}

async function authenticatedContext(email: string, password: string) {
  const context = await playwrightRequest.newContext({ extraHTTPHeaders: { Origin: webOrigin } })
  const response = await context.post(apiEndpoint('/auth/login'), { data: { email, password } })
  if (!response.ok()) {
    const body = await response.text()
    await context.dispose()
    throw new Error(`login failed for ${email}: ${response.status()} ${body}`)
  }
  return context
}

async function createUser(api: APIRequestContext, fullName: string, email: string, role: UserDTO['role'], status: UserDTO['status']) {
  return readJSON<UserDTO>(await api.post(apiEndpoint('/admin/users'), { data: { fullName, email, password: userPassword, role, status } }), `create ${role} user`)
}

async function createTask(api: APIRequestContext, projectId: string, milestoneId: string, title: string, assigneeIds: string[], deadline: string, priority: 'medium' | 'high') {
  return readJSON<TaskDetailDTO>(await api.post(apiEndpoint(`/projects/${projectId}/tasks`), { data: { title, description: `${title} for dashboard browser coverage.`, milestoneId, assigneeIds, deadline, priority } }), `create task ${title}`)
}

async function submitProgress(api: APIRequestContext, projectId: string, taskId: string, title: string, description: string) {
  return readJSON<ProgressUpdateDTO>(await api.post(apiEndpoint(`/projects/${projectId}/tasks/${taskId}/progress-updates`), { data: { title, description } }), `submit ${title}`)
}

async function readJSON<T = unknown>(response: APIResponse, label: string) {
  if (!response.ok()) {
    throw new Error(`${label} failed: ${response.status()} ${await response.text()}`)
  }
  return response.json() as Promise<T>
}

async function signIn(page: Page, email: string, password: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

async function isAPIAvailable(request: APIRequestContext) {
  try {
    const response = await request.get(apiEndpoint('/health'))
    return response.ok()
  } catch {
    return false
  }
}

function apiEndpoint(pathname: string) {
  return `${apiURL}${pathname}`
}

function futureDate(days: number) {
  return offsetDate(days)
}

function pastDate(days: number) {
  return offsetDate(-days)
}

function offsetDate(days: number) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

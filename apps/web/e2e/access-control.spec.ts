import { Buffer } from 'node:buffer'

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
  status: 'active' | 'on_hold' | 'completed' | 'archived'
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
}

interface UploadedFileDTO {
  id: string
  originalFileName: string
}

interface AccessFixture {
  teacher: UserDTO
  student: UserDTO
  nonMemberStudent: UserDTO
  inactiveStudent: UserDTO
  project: ProjectDTO
  task: TaskDetailDTO['task']
  evidenceFile: UploadedFileDTO
}

let apiUnavailable = false
let fixture: AccessFixture | null = null

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
  apiUnavailable = !(await isAPIAvailable(request))
  if (apiUnavailable) {
    return
  }
  fixture = await createAccessFixture()
})

test('non-admin route guards block account and folder management', async ({ page }) => {
  const data = requireFixture()

  await signIn(page, data.teacher.email, userPassword)
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: 'Admin is restricted' })).toBeVisible()
  await expect(page.getByText('Only admins can manage accounts.')).toBeVisible()

  await signIn(page, data.student.email, userPassword)
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: 'Admin is restricted' })).toBeVisible()

  await page.goto('/workspace/classes/00000000-0000-0000-0000-000000000000')
  await expect(page.getByRole('heading', { name: 'Folders are restricted' })).toBeVisible()
  await expect(page.getByText('Only teachers and admins can manage project folders.')).toBeVisible()
})

test('project pages hide manager actions and reject non-members', async ({ page }) => {
  const data = requireFixture()

  await signIn(page, data.teacher.email, userPassword)
  await page.goto(`/workspace/projects/${data.project.id}`)
  await expect(page.getByRole('heading', { name: data.project.name })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit project' })).toBeVisible()

  await signIn(page, data.student.email, userPassword)
  await page.goto(`/workspace/projects/${data.project.id}`)
  await expect(page.getByRole('heading', { name: data.project.name })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit project' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /New assignment/i })).toHaveCount(0)

  await signIn(page, data.nonMemberStudent.email, userPassword)
  await page.goto(`/workspace/projects/${data.project.id}`)
  await expect(page.getByText('This project is restricted, missing, or temporarily unavailable.')).toBeVisible()
})

test('closed assignment evidence stays downloadable but read-only', async ({ page }) => {
  const data = requireFixture()

  await signIn(page, data.student.email, userPassword)
  await page.goto(`/workspace/projects/${data.project.id}/tasks/${data.task.id}`)

  await expect(page.getByRole('heading', { name: data.task.title })).toBeVisible()
  await expect(page.getByText(data.evidenceFile.originalFileName)).toBeVisible()
  await expect(page.getByRole('button', { name: /Download/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Upload evidence/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Delete/i })).toHaveCount(0)
})

test('inactive accounts cannot establish a protected session', async ({ page }) => {
  const data = requireFixture()

  await page.goto('/login')
  await page.getByLabel('Email').fill(data.inactiveStudent.email)
  await page.getByLabel('Password').fill(userPassword)
  await page.getByRole('button', { name: /^sign in$/i }).click()

  await expect(page).toHaveURL(/\/login(?:\?.*)?$/)
  await expect(page.getByText(/account is inactive/i)).toBeVisible()
})

function requireFixture() {
  requireAPIAvailable(apiUnavailable, apiURL, 'access-control tests')
  if (!fixture) {
    throw new Error('access-control fixture was not created')
  }
  return fixture
}

async function createAccessFixture() {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const admin = await authenticatedContext(adminEmail, adminPassword)
  const teacherEmail = `a02.teacher.${runId}@unitrack.local`
  const studentEmail = `a02.student.${runId}@unitrack.local`
  const nonMemberEmail = `a02.nonmember.${runId}@unitrack.local`
  const inactiveEmail = `a02.inactive.${runId}@unitrack.local`

  try {
    const teacher = await createUser(admin, 'A02 Teacher', teacherEmail, 'teacher', 'active')
    const student = await createUser(admin, 'A02 Student', studentEmail, 'student', 'active')
    const nonMemberStudent = await createUser(admin, 'A02 Non Member', nonMemberEmail, 'student', 'active')
    const inactiveStudent = await createUser(admin, 'A02 Inactive', inactiveEmail, 'student', 'inactive')
    const teacherAPI = await authenticatedContext(teacher.email, userPassword)
    const studentAPI = await authenticatedContext(student.email, userPassword)

    try {
      const project = await readJSON<ProjectDTO>(
        await teacherAPI.post(apiEndpoint('/projects'), { data: { name: `A02 Access Project ${runId}`, topic: 'Access-control e2e fixture', status: 'active' } }),
        'create project',
      )
      await readJSON(await teacherAPI.post(apiEndpoint(`/projects/${project.id}/members`), { data: { email: student.email } }), 'add project member')
      const milestone = await readJSON<MilestoneDTO>(await teacherAPI.post(apiEndpoint(`/projects/${project.id}/milestones`), { data: { title: 'Access checkpoint' } }), 'create milestone')
      const task = await readJSON<TaskDetailDTO>(
        await teacherAPI.post(apiEndpoint(`/projects/${project.id}/tasks`), {
          data: {
            title: `A02 Evidence Assignment ${runId}`,
            description: 'Assignment used for access-control browser regression coverage.',
            milestoneId: milestone.id,
            assigneeIds: [student.id],
            priority: 'medium',
          },
        }),
        'create assignment',
      )
      const update = await readJSON<ProgressUpdateDTO>(
        await studentAPI.post(apiEndpoint(`/projects/${project.id}/tasks/${task.task.id}/progress-updates`), {
          data: { title: 'Access-control submission', description: 'Submitted work with evidence.' },
        }),
        'submit progress',
      )
      const fileName = `a02-evidence-${runId}.txt`
      const evidenceFile = await readJSON<UploadedFileDTO>(
        await studentAPI.post(apiEndpoint(`/projects/${project.id}/progress-updates/${update.id}/files`), {
          multipart: {
            file: {
              name: fileName,
              mimeType: 'text/plain',
              buffer: Buffer.from('A02 access-control evidence'),
            },
          },
        }),
        'upload evidence file',
      )
      const completedProject = await readJSON<ProjectDTO>(await teacherAPI.patch(apiEndpoint(`/projects/${project.id}`), { data: { status: 'completed' } }), 'complete project')

      return { teacher, student, nonMemberStudent, inactiveStudent, project: completedProject, task: task.task, evidenceFile }
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
  return readJSON<UserDTO>(
    await api.post(apiEndpoint('/admin/users'), {
      data: { fullName, email, password: userPassword, role, status },
    }),
    `create ${role} user`,
  )
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
    const response = await request.get(`${apiURL}/health`, { timeout: 5_000 })
    return response.ok()
  } catch {
    return false
  }
}

function apiEndpoint(path: string) {
  return `${apiURL}${path}`
}

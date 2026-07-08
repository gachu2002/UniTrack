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

interface HappyPathFixture {
  teacher: UserDTO
  student: UserDTO
  projectName: string
  checkpointTitle: string
  assignmentTitle: string
  submissionText: string
  reviewText: string
}

let apiUnavailable = false
let fixture: HappyPathFixture | null = null

test.setTimeout(60_000)

test.beforeAll(async ({ request }) => {
  apiUnavailable = !(await isAPIAvailable(request))
  if (apiUnavailable) {
    return
  }
  fixture = await createHappyPathFixture()
})

test('teacher project assignment submission review happy path', async ({ page }) => {
  const data = requireFixture()

  await signIn(page, data.teacher.email, userPassword)
  await page.goto('/workspace')
  await expect(page.getByRole('heading', { name: 'Workspace' })).toBeVisible()

  await page.getByRole('button', { name: 'New project' }).click()
  const projectDialog = page.getByRole('dialog', { name: 'New project' })
  await projectDialog.getByLabel('Project name').fill(data.projectName)
  await projectDialog.getByLabel('Topic').fill('A17 happy path')
  await projectDialog.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: data.projectName })).toBeVisible()

  await page.getByRole('button', { name: /Open project team/ }).click()
  const teamPanel = page.locator('section[aria-label="Project team"]')
  await teamPanel.getByRole('button', { name: 'Add student' }).click()
  await teamPanel.getByLabel('Student email').fill(data.student.email)
  await teamPanel.getByRole('button', { name: 'Add student' }).last().click()
  await expect(teamPanel.getByText(data.student.fullName, { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Create checkpoint' }).first().click()
  const checkpointDialog = page.getByRole('dialog', { name: 'New checkpoint' })
  await checkpointDialog.getByLabel('Checkpoint title').fill(data.checkpointTitle)
  await checkpointDialog.getByRole('button', { name: 'Create checkpoint' }).click()
  const checkpointSection = page.locator('section').filter({ has: page.getByRole('heading', { name: data.checkpointTitle }) }).first()
  await expect(checkpointSection).toBeVisible()

  const addAssignment = checkpointSection.getByRole('button', { name: 'Add assignment' })
  await expect(addAssignment).toBeEnabled()
  await addAssignment.click()
  const assignmentDialog = page.getByRole('dialog', { name: 'New assignment' })
  await assignmentDialog.getByLabel('Title').fill(data.assignmentTitle)
  await assignmentDialog.getByLabel('Description').fill('Prepare reviewable progress evidence.')
  await assignmentDialog.getByLabel('Assign to all current student members').check()
  await assignmentDialog.getByRole('button', { name: 'Create assignment' }).click()
  await expect(page.getByRole('link', { name: data.assignmentTitle })).toBeVisible()

  await page.getByRole('link', { name: data.assignmentTitle }).click()
  await expect(page.getByRole('heading', { name: data.assignmentTitle })).toBeVisible()
  const assignmentPath = new URL(page.url()).pathname

  await signIn(page, data.student.email, userPassword)
  await page.goto(assignmentPath)
  await expect(page.getByRole('heading', { name: data.assignmentTitle })).toBeVisible()
  await page.getByRole('button', { name: 'Submit work' }).first().click()
  const submissionDialog = page.getByRole('dialog', { name: 'Submit work' })
  await submissionDialog.getByLabel('What did you complete?').fill(data.submissionText)
  await submissionDialog.getByRole('button', { name: 'Submit work' }).click()
  await expect(page.getByRole('heading', { name: 'Waiting for teacher review' })).toBeVisible()

  await signIn(page, data.teacher.email, userPassword)
  await page.goto(assignmentPath)
  await expect(page.getByRole('heading', { name: 'Review outcome' })).toBeVisible()
  await page.getByText('Approve and complete', { exact: true }).click()
  await page.getByLabel('Review comment').fill(data.reviewText)
  await page.getByRole('button', { name: 'Save review' }).click()
  await expect(page.getByRole('heading', { name: 'Assignment complete' })).toBeVisible()
})

function requireFixture() {
  requireAPIAvailable(apiUnavailable, apiURL, 'assignment happy path test')
  if (!fixture) {
    throw new Error('assignment happy path fixture was not created')
  }
  return fixture
}

async function createHappyPathFixture() {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const admin = await authenticatedContext(adminEmail, adminPassword)

  try {
    const teacher = await createUser(admin, 'A17 Happy Teacher', `a17happy.teacher.${runId}@unitrack.local`, 'teacher', 'active')
    const student = await createUser(admin, 'A17 Happy Student', `a17happy.student.${runId}@unitrack.local`, 'student', 'active')
    return {
      teacher,
      student,
      projectName: `A17 Happy Project ${runId}`,
      checkpointTitle: `A17 Checkpoint ${runId}`,
      assignmentTitle: `A17 Assignment ${runId}`,
      submissionText: `A17 completed work ${runId}`,
      reviewText: `A17 approved ${runId}`,
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

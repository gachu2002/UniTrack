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

interface ClassFolderDTO {
  id: string
  title: string
}

interface ProjectDTO {
  id: string
  name: string
}

interface IntegrityFixture {
  folder: ClassFolderDTO
  matchingProject: ProjectDTO
  mismatchedProject: ProjectDTO
}

let apiUnavailable = false
let fixture: IntegrityFixture | null = null

test.beforeAll(async ({ request }) => {
  apiUnavailable = !(await isAPIAvailable(request))
  if (apiUnavailable) {
    return
  }
  fixture = await createIntegrityFixture()
})

test('folder project candidates respect supervisor ownership', async ({ page }) => {
  const data = requireFixture()

  await signIn(page, adminEmail, adminPassword)
  await page.goto(`/workspace/classes/${data.folder.id}`)

  await expect(page.getByRole('heading', { name: data.folder.title })).toBeVisible()
  await page.getByRole('combobox', { name: 'Search standalone projects' }).fill('A13')
  await expect(page.getByRole('option', { name: new RegExp(escapeRegExp(data.matchingProject.name)) })).toBeVisible()
  await expect(page.getByText(data.mismatchedProject.name)).toHaveCount(0)
})

function requireFixture() {
  requireAPIAvailable(apiUnavailable, apiURL, 'database-integrity tests')
  if (!fixture) {
    throw new Error('database-integrity fixture was not created')
  }
  return fixture
}

async function createIntegrityFixture() {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const admin = await authenticatedContext(adminEmail, adminPassword)

  try {
    const ownerTeacher = await createUser(admin, 'A13 Owner Teacher', `a13.owner.${runId}@unitrack.local`, 'teacher', 'active')
    const otherTeacher = await createUser(admin, 'A13 Other Teacher', `a13.other.${runId}@unitrack.local`, 'teacher', 'active')
    const folder = await readJSON<ClassFolderDTO>(await admin.post(apiEndpoint('/classes'), { data: { title: `A13 Integrity Folder ${runId}`, color: 'blue', ownerTeacherId: ownerTeacher.id } }), 'create folder')
    const matchingProject = await readJSON<ProjectDTO>(await admin.post(apiEndpoint('/projects'), { data: { name: `A13 Matching Project ${runId}`, topic: 'Integrity browser fixture', supervisorId: ownerTeacher.id } }), 'create matching project')
    const mismatchedProject = await readJSON<ProjectDTO>(await admin.post(apiEndpoint('/projects'), { data: { name: `A13 Mismatched Project ${runId}`, topic: 'Integrity browser fixture', supervisorId: otherTeacher.id } }), 'create mismatched project')

    return { folder, matchingProject, mismatchedProject }
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

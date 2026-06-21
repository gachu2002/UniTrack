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

interface StateFlowFixture {
  teacher: UserDTO
  folder: ClassFolderDTO
  candidateProject: ProjectDTO
}

let apiUnavailable = false
let fixture: StateFlowFixture | null = null

test.beforeAll(async ({ request }) => {
  apiUnavailable = !(await isAPIAvailable(request))
  if (apiUnavailable) {
    return
  }
  fixture = await createStateFlowFixture()
})

test('folder edit can clear description', async ({ page }) => {
  const data = requireFixture()

  await signIn(page, data.teacher.email, userPassword)
  await page.goto(`/workspace/classes/${data.folder.id}`)
  await expect(page.getByRole('heading', { name: data.folder.title })).toBeVisible()

  await page.getByRole('button', { name: 'Edit folder' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit folder' })
  await dialog.getByLabel('Description').fill('')
  await dialog.getByRole('button', { name: 'Save folder' }).click()

  await expect(page.getByText('Drop related projects here to keep the workspace easy to scan.')).toBeVisible()
})

test('folder candidate search hides stale previous results while refreshing', async ({ page }) => {
  const data = requireFixture()

  await page.route('**/api/v1/projects?**', async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('search')?.includes('A15 Beta')) {
      await new Promise((resolve) => setTimeout(resolve, 750))
    }
    await route.continue()
  })

  await signIn(page, adminEmail, adminPassword)
  await page.goto(`/workspace/classes/${data.folder.id}`)
  const search = page.getByRole('combobox', { name: 'Search standalone projects' })

  await search.fill('A15 Alpha')
  await expect(page.getByRole('option', { name: new RegExp(escapeRegExp(data.candidateProject.name)) })).toBeVisible()

  await search.fill('A15 Beta')
  await expect(page.getByRole('option', { name: new RegExp(escapeRegExp(data.candidateProject.name)) })).toHaveCount(0)
  await expect(page.getByText('Searching...')).toBeVisible()
})

function requireFixture() {
  requireAPIAvailable(apiUnavailable, apiURL, 'state-flow tests')
  if (!fixture) {
    throw new Error('state-flow fixture was not created')
  }
  return fixture
}

async function createStateFlowFixture() {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const admin = await authenticatedContext(adminEmail, adminPassword)

  try {
    const teacher = await createUser(admin, 'A15 State Teacher', `a15.teacher.${runId}@unitrack.local`, 'teacher', 'active')
    const folder = await readJSON<ClassFolderDTO>(await admin.post(apiEndpoint('/classes'), { data: { title: `A15 State Folder ${runId}`, color: 'teal', description: 'Description that should clear.', ownerTeacherId: teacher.id } }), 'create folder')
    const candidateProject = await readJSON<ProjectDTO>(await admin.post(apiEndpoint('/projects'), { data: { name: `A15 Alpha Candidate ${runId}`, topic: 'State flow browser fixture', supervisorId: teacher.id } }), 'create candidate project')

    return { teacher, folder, candidateProject }
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

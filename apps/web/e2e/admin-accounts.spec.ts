import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { requireAPIAvailable } from './api-availability'

const apiURL = (process.env.VITE_API_URL?.trim() || 'http://localhost:8080/api/v1').replace(/\/+$/, '')
const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim() || 'admin@unitrack.local'
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'admin12345'
const userPassword = 'DemoPass123!'

let apiUnavailable = false

test.beforeAll(async ({ request }) => {
  apiUnavailable = !(await isAPIAvailable(request))
})

test('admin can create and find a teacher account through the UI', async ({ page }) => {
  requireAPIAvailable(apiUnavailable, apiURL, 'admin account tests')

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const teacherName = `A17 UI Teacher ${runId}`
  const teacherEmail = `a17.teacher.${runId}@unitrack.local`

  await signIn(page, adminEmail, adminPassword)
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()

  await page.getByRole('button', { name: 'Create account' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create account' })
  await expect(dialog).toBeVisible()

  await dialog.getByLabel('Full name').fill(teacherName)
  await dialog.getByLabel('Email').fill(teacherEmail)
  await dialog.getByLabel('Temporary password').fill(userPassword)
  await dialog.getByLabel('Role').click()
  await page.getByRole('option', { name: 'Teacher' }).click()
  await dialog.getByRole('button', { name: 'Create account' }).click()

  await expect(dialog).toBeHidden()
  await page.getByPlaceholder('Search name or email').fill(teacherEmail)
  await expect(page.getByText(teacherEmail).first()).toBeVisible()
  await expect(page.getByText(teacherName).first()).toBeVisible()

  await signIn(page, teacherEmail, userPassword)
  await expect(page.getByRole('heading', { name: 'Review work' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: /Workspace/ })).toBeVisible()
})

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

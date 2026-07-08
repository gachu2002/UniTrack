import { expect, test, type APIRequestContext } from '@playwright/test'

import { requireAPIAvailable } from './api-availability'

const apiURL = process.env.VITE_API_URL?.trim() || 'http://localhost:8080/api/v1'
const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim() || 'admin@unitrack.local'
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'admin12345'

test('local admin can sign in and reach the dashboard', async ({ page, request }) => {
  const apiAvailable = await isAPIAvailable(request)
  requireAPIAvailable(!apiAvailable, apiURL, 'the auth flow test')

  await page.goto('/')
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/)

  await page.getByPlaceholder('teacher@unitrack.local').fill(adminEmail)
  await page.getByPlaceholder('Password').fill(adminPassword)
  await page.getByRole('button', { name: /^sign in$/i }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Review work' })).toBeVisible()
  await expect(page.getByText(adminEmail)).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: /Workspace/ })).toBeVisible()
})

async function isAPIAvailable(request: APIRequestContext) {
  try {
    const response = await request.get(`${apiURL}/health`, { timeout: 5_000 })
    return response.ok()
  } catch {
    return false
  }
}

import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { requireAPIAvailable } from './api-availability'

const apiURL = process.env.VITE_API_URL?.trim() || 'http://localhost:8080/api/v1'
const teacherEmail = process.env.E2E_TEACHER_EMAIL?.trim() || 'teacher01@demo.unitrack.local'
const teacherPassword = process.env.E2E_TEACHER_PASSWORD || 'DemoPass123!'

let apiUnavailable = false

test.beforeAll(async ({ request }) => {
  apiUnavailable = !(await isAPIAvailable(request))
})

test('protected app exposes a keyboard skip link', async ({ page }) => {
  requireAPI()

  await signIn(page)
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Review queue' })).toBeVisible()
  await page.evaluate(() => {
    document.body.setAttribute('tabindex', '-1')
    document.body.focus()
  })

  await page.keyboard.press('Tab')
  const skipLink = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skipLink).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
})

test('dialog exposes one named close control and traps tab focus', async ({ page }) => {
  requireAPI()

  await signIn(page)
  await page.getByRole('link', { name: /Workspace/ }).click()
  await page.getByRole('button', { name: 'New folder' }).click()

  const dialog = page.getByRole('dialog', { name: 'New folder' })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close dialog' })).toHaveCount(1)

  const blue = page.getByRole('radio', { name: 'blue' })
  const teal = page.getByRole('radio', { name: 'teal' })
  await blue.focus()
  await page.keyboard.press('ArrowRight')
  await expect(teal).toBeFocused()
  await expect(teal).toHaveAttribute('aria-checked', 'true')

  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Tab')
    await expect(page.locator('body')).not.toBeFocused()
    expect(await focusIsInsideDialog(page)).toBe(true)
  }
})

function requireAPI() {
  requireAPIAvailable(apiUnavailable, apiURL, 'accessibility tests')
}

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(teacherEmail)
  await page.getByLabel('Password').fill(teacherPassword)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

async function focusIsInsideDialog(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    return Boolean(dialog?.contains(document.activeElement))
  })
}

async function isAPIAvailable(request: APIRequestContext) {
  try {
    const response = await request.get(`${apiURL}/health`, { timeout: 5_000 })
    return response.ok()
  } catch {
    return false
  }
}

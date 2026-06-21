import { expect, test } from '@playwright/test'

test('login page renders and captures a visual artifact', async ({ page }, testInfo) => {
  await page.goto('/login')

  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.getByPlaceholder('teacher@unitrack.local')).toBeVisible()
  await expect(page.getByPlaceholder('Password')).toBeVisible()
  await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible()

  await testInfo.attach('login-page', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
})

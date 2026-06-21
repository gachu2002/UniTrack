import { test } from '@playwright/test'

const skipAPIUnavailable = process.env.PLAYWRIGHT_SKIP_API_UNAVAILABLE === 'true'

export function requireAPIAvailable(apiUnavailable: boolean, apiURL: string, suiteName: string) {
  if (!apiUnavailable) {
    return
  }

  const message = `API is not available at ${apiURL}. Start it before running ${suiteName}.`
  if (skipAPIUnavailable) {
    test.skip(true, message)
    return
  }
  throw new Error(`${message} Set PLAYWRIGHT_SKIP_API_UNAVAILABLE=true only when you intentionally want API-dependent browser specs to skip.`)
}

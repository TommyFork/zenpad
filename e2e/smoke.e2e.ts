import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// Collects console errors and CSP violations, which only show up in the production build.
function watchForErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

test('build output carries the security policy', () => {
  const html = readFileSync('dist/index.html', 'utf8').replaceAll('&#39;', "'")
  expect(html).toContain('http-equiv="Content-Security-Policy"')
  expect(html).toContain("connect-src 'none'")

  const headers = readFileSync('dist/_headers', 'utf8')
  expect(headers).toContain("connect-src 'none'")
  expect(headers).toContain("frame-ancestors 'none'")
})

test('loads the welcome note without errors or CSP violations', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await expect(page.locator('.cm-content')).toContainText('Welcome to Zenpad')
  expect(errors).toEqual([])
})

test('keeps what you write after a reload', async ({ page }) => {
  await page.goto('/')
  const editor = page.locator('.cm-content')
  await expect(editor).toContainText('Welcome to Zenpad')

  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('\nSaved by the smoke test')
  await expect(editor).toContainText('Saved by the smoke test')

  // Wait out the autosave delay before reloading.
  await page.waitForTimeout(1000)
  await page.reload()
  await expect(page.locator('.cm-content')).toContainText('Saved by the smoke test')
})

test('loads offline once the service worker is installed', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.locator('.cm-content')).toContainText('Welcome to Zenpad')
  await page.evaluate(() => navigator.serviceWorker.ready)

  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.cm-content')).toContainText('Welcome to Zenpad')
})

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

test('opens a snippet by clicking its hover preview in a note', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await expect(page.locator('.cm-content')).toContainText('Welcome to Zenpad')

  await page.locator('.cm-snippet', { hasText: '@tone' }).first().hover()
  const card = page.locator('.cm-snippet-tooltip')
  await expect(card).toContainText('Click to open')
  await card.click()
  await expect(page.getByRole('list', { name: 'Used in' })).toContainText('Welcome to Zenpad')
  expect(errors).toEqual([])
})

test('loads offline once the service worker is installed', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.locator('.cm-content')).toContainText('Welcome to Zenpad')
  await page.evaluate(() => navigator.serviceWorker.ready)

  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.cm-content')).toContainText('Welcome to Zenpad')
})

test('remembers the accent color picked in settings', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.cm-content')).toContainText('Welcome to Zenpad')

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('radio', { name: 'Sage' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'sage')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'sage')
})

test('shows where a snippet is used and maps it', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await expect(page.locator('.cm-content')).toContainText('Welcome to Zenpad')

  await page.locator('.snippet-item', { hasText: '@tone' }).click()
  const usedIn = page.getByRole('list', { name: 'Used in' })
  await expect(usedIn).toContainText('Welcome to Zenpad')

  await usedIn.getByRole('button', { name: /Welcome to Zenpad/ }).hover()
  const peek = page.getByRole('tooltip')
  await expect(peek).toContainText('@tone')
  await expect(peek.locator('mark')).toHaveText('@tone')
  await page.mouse.move(0, 0)
  await expect(peek).toBeHidden()

  // The card stays open while the pointer is over it, and clicking it opens the note.
  await usedIn.getByRole('button', { name: /Welcome to Zenpad/ }).hover()
  await peek.hover()
  await page.waitForTimeout(400)
  await expect(peek).toBeVisible()
  await peek.click()
  await expect(peek).toBeHidden()
  await expect(page.locator('.cm-content')).toContainText('Welcome to Zenpad')
  await page.locator('.snippet-item', { hasText: '@tone' }).click()

  await page.getByRole('button', { name: 'Map', exact: true }).click()
  const map = page.getByRole('dialog', { name: 'Snippet map' })
  await expect(map.getByRole('button', { name: /^Open @tone/ })).toBeVisible()
  await map.getByRole('button', { name: /^Open note “Welcome to Zenpad”/ }).click()
  await expect(map).toBeHidden()
  await expect(page.locator('.cm-content')).toContainText('Welcome to Zenpad')
  expect(errors).toEqual([])
})

test('deletes a snippet from the sidebar without leaving the open note', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  const editor = page.locator('.cm-content')
  await expect(editor).toContainText('Welcome to Zenpad')

  const snippet = page.locator('.snippet-item', { hasText: '@tone' })
  await snippet.hover()
  await page.getByRole('button', { name: 'Delete snippet @tone' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Delete @tone?' })
  await expect(dialog).toContainText('uses it')
  await dialog.getByRole('button', { name: 'Delete' }).click()

  await expect(snippet).toHaveCount(0)
  await expect(editor).toContainText('Welcome to Zenpad')

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(snippet).toHaveCount(1)
  await expect(editor).toContainText('Welcome to Zenpad')
  expect(errors).toEqual([])
})

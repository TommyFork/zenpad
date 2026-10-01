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
  // The editor only renders lines near the viewport, so bring the end of the note into view.
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+End')
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

test('fills in note variables and jumps to where one is set', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await expect(page.locator('.cm-content')).toContainText('Welcome to Zenpad')

  await page.keyboard.press('ControlOrMeta+Alt+KeyN')
  await expect(page.locator('.cm-content')).not.toContainText('Welcome to Zenpad')
  await page.locator('.cm-content').click()
  await page.keyboard.insertText('$branch = fix/login\n\nCheckout $branch, then rebase $branch.')
  await expect(page.locator('.cm-variable', { hasText: '$branch' })).toHaveCount(3)

  // ⌘ click selects the value, so typing replaces it everywhere.
  await page.locator('.cm-variable', { hasText: '$branch' }).last().click({ modifiers: ['ControlOrMeta'] })
  await page.keyboard.type('feat/signup')

  await page.keyboard.press('ControlOrMeta+KeyE')
  const preview = page.locator('.preview-host .cm-content')
  await expect(preview).toHaveText('Checkout feat/signup, then rebase feat/signup.')
  await expect(page.locator('.cm-preview-variable')).toHaveCount(2)
  expect(errors).toEqual([])
})

test('sets a variable inline and fills it in where it was set', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await expect(page.locator('.cm-content')).toContainText('Welcome to Zenpad')
  await page.keyboard.press('ControlOrMeta+Alt+KeyN')
  await expect(page.locator('.cm-content')).not.toContainText('Welcome to Zenpad')

  await page.locator('.cm-content').click()
  await page.keyboard.insertText('Reviewing PR $PR{482} today. Link: pull/$PR')
  await page.locator('.cm-variable', { hasText: '$PR' }).last().click({ modifiers: ['ControlOrMeta'] })
  await page.keyboard.type('517')

  await page.keyboard.press('ControlOrMeta+KeyE')
  await expect(page.locator('.preview-host .cm-content')).toHaveText('Reviewing PR 517 today. Link: pull/517')
  expect(errors).toEqual([])
})

test('folds a block variable and fills it in where it is used', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await expect(page.locator('.cm-content')).toContainText('Welcome to Zenpad')
  await page.keyboard.press('ControlOrMeta+Alt+KeyN')
  await expect(page.locator('.cm-content')).not.toContainText('Welcome to Zenpad')

  await page.locator('.cm-content').click()
  await page.keyboard.insertText('$context = """\nLong context line one.\nLine two.\n"""\n\nUse this: $context')
  const editor = page.locator('.cm-content')
  await expect(editor).toContainText('Long context line one.')

  await page.getByRole('button', { name: 'Fold', exact: true }).click()
  await expect(editor).not.toContainText('Long context line one.')
  await expect(page.locator('.cm-variable-fold')).toHaveText('2 lines · 6 words')

  await page.keyboard.press('ControlOrMeta+KeyE')
  await expect(page.locator('.preview-host .cm-content')).toHaveText('Use this: Long context line one.Line two.')
  await page.keyboard.press('ControlOrMeta+KeyE')

  await page.locator('.cm-variable-fold').click()
  await expect(editor).toContainText('Long context line one.')
  expect(errors).toEqual([])
})

test('folds selected text away into a block and renames it', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await expect(page.locator('.cm-content')).toContainText('Welcome to Zenpad')
  await page.keyboard.press('ControlOrMeta+Alt+KeyN')
  await expect(page.locator('.cm-content')).not.toContainText('Welcome to Zenpad')

  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.insertText('Intro\nBig pasted context\nOutro')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.getByRole('button', { name: 'Fold away' }).click()

  await expect(editor).not.toContainText('Big pasted context')
  await expect(page.locator('.cm-variable-fold')).toHaveText('1 line · 3 words')
  // Both copies of the name are selected, so typing renames the block and its use together.
  await page.keyboard.type('background')
  await page.keyboard.press('Escape')
  await expect(page.locator('.cm-variable', { hasText: '$background' })).toHaveCount(2)

  await page.keyboard.press('ControlOrMeta+KeyE')
  await expect(page.locator('.preview-host .cm-content')).toHaveText('IntroBig pasted contextOutro')
  expect(errors).toEqual([])
})

test('remembers which blocks were left open', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await expect(page.locator('.cm-content')).toContainText('Welcome to Zenpad')
  await page.keyboard.press('ControlOrMeta+Alt+KeyN')
  await expect(page.locator('.cm-content')).not.toContainText('Welcome to Zenpad')

  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.insertText('$notes = """\nStill open after a reload.\n"""\n\nUse $notes')
  await expect(editor).toContainText('Still open after a reload.')

  // A block left open stays open.
  await page.waitForTimeout(1000)
  await page.reload()
  await expect(page.locator('.cm-content')).toContainText('Still open after a reload.')

  // A block folded again starts folded.
  await page.getByRole('button', { name: 'Fold', exact: true }).click()
  await expect(page.locator('.cm-variable-fold')).toBeVisible()
  await page.reload()
  await expect(page.locator('.cm-content')).toContainText('Use')
  await expect(page.locator('.cm-variable-fold')).toHaveText('1 line · 5 words')
  expect(errors).toEqual([])
})

test('groups notes by date in the sidebar', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await expect(page.locator('.cm-content')).toContainText('Welcome to Zenpad')

  await page.getByRole('button', { name: 'New note' }).first().click()
  await page.locator('.cm-content').click()
  await page.keyboard.type('Grouped note')

  // Grouping by date is the default.
  const notes = page.locator('#sidebar-section-notes')
  await expect(notes.getByRole('group', { name: 'Today' })).toContainText('Grouped note')

  // A date group collapses and stays collapsed across reloads.
  await notes.getByRole('button', { name: 'Today' }).click()
  await expect(notes.getByRole('button', { name: /^Grouped note/ })).toBeHidden()
  await page.reload()
  await expect(notes.getByRole('button', { name: /^Today/ })).toHaveAttribute('aria-expanded', 'false')
  await notes.getByRole('button', { name: /^Today/ }).click()
  await expect(notes.getByRole('group', { name: 'Today' })).toContainText('Grouped note')

  // Switching to one list is remembered across reloads.
  await page.getByRole('button', { name: /Notes shown grouped by date/ }).click()
  await expect(notes.getByRole('group')).toHaveCount(0)
  await page.reload()
  await expect(notes.getByRole('button', { name: /^Grouped note/ })).toBeVisible()
  await expect(notes.getByRole('group')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('pastes a snippet as text from the @ list and the command palette', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await expect(page.locator('.cm-content')).toContainText('Welcome to Zenpad')
  await page.keyboard.press('ControlOrMeta+Alt+KeyN')
  const editor = page.locator('.cm-content')
  await expect(editor).not.toContainText('Welcome to Zenpad')

  await editor.click()
  await page.keyboard.type('@ton')
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('paste text')
  await page.keyboard.press('Shift+Enter')
  await expect(editor).toHaveText('Be direct and concise. Lead with the answer, then only the detail that matters.')
  await expect(page.locator('.cm-snippet')).toHaveCount(0)

  await page.keyboard.press('Enter')
  await page.keyboard.press('ControlOrMeta+KeyK')
  await page.keyboard.type('paste snippet')
  await page.keyboard.press('Enter')
  await expect(page.getByPlaceholder('Paste the text of a snippet')).toBeVisible()
  await page.keyboard.type('tone')
  await page.keyboard.press('Enter')
  await expect(editor.locator('.cm-line')).toHaveText([
    'Be direct and concise. Lead with the answer, then only the detail that matters.',
    'Be direct and concise. Lead with the answer, then only the detail that matters.',
  ])
  expect(errors).toEqual([])
})

# Zenpad

**A calm, beautiful place to write.** Save the text you reuse as `@snippets`, drop them into any note, and keep everything private in your browser.

Zenpad was built for writing AI prompts, but it works for any writing where you repeat yourself.

## Features

- **Focused writing.** A single centered page in a warm serif. The top bar and status bar fade away while you type and come back when you move the mouse.
- **@snippets.** Type `@` to insert a saved snippet. Snippets stay linked: edit one and every note that uses it picks up the change.
- **Copy with snippets filled in.** `⌘ Enter` copies the note with every `@snippet` replaced by its full text. Snippets can contain other snippets, and loops are detected.
- **Preview with snippets filled in.** `⌘ E` shows the note as it will be copied, with every snippet filled in. It keeps the same layout and markdown styling as the editor, so nothing shifts. Filled-in text is tinted so you can see where each snippet starts and ends; turn the tint off in Settings or the command palette for a clean read. `Esc` goes back to editing.
- **See where snippets are used.** A snippet's page lists every note and snippet that uses it, one click away. The **snippet map** draws all your snippets and the notes that use them as an interactive graph: hover to trace connections, click to open, drag to rearrange, and scroll to zoom. Open it from the Snippets section, a snippet's page, or `⌘ K`.
- **Note variables.** Set a value once, like `$branch = fix/login-redirect` on its own line or `$branch{fix/login-redirect}` right in a sentence, and use `$branch` anywhere in the note. Change the value and every use follows. Variables are filled in when you copy or preview, and snippets can use them too, so one `@review-pr` snippet can fill in each note's own `$pr` and `$branch`.
- **Favorites.** Star a note to pin it to a Favorites section at the top of the sidebar. The Favorites, Notes, and Snippets sections each collapse, and Zenpad remembers which ones you closed.
- **Delete from the sidebar.** Hover a note or snippet in the sidebar and click the trash icon to delete it without opening it. Deleting asks first and can be undone for a few seconds.
- **Search and commands.** `⌘ K` searches every note and snippet and runs every command.
- **Private by design.** No server, no accounts, no analytics. Notes live in your browser's IndexedDB.
- **Works offline.** Installable as an app (PWA) that loads with no network.
- **Light and dark themes**, plus serif, sans, and mono writing fonts.

## Keyboard

| Keys | Action |
| --- | --- |
| `⌘ K` | Search and commands |
| `⌘ Enter` | Copy with snippets filled in |
| `⌘ E` | Preview with snippets filled in, or back to editing |
| `⌘ \` | Show or hide the sidebar |
| `⌘ ⌥ N` | New note |
| `⌘ click` on an `@snippet` | Open it, or create it if it doesn't exist (also works on filled-in text in preview) |
| `⌘ click` on a `$variable` | Jump to its value, selected so you can type a new one |
| `⌘ F` | Find in the current note |

On Windows and Linux, use `Ctrl` in place of `⌘`.

## How snippets work

- Names use lowercase letters, numbers, dashes, and underscores: `@repo-context`, `@style_guide`.
- An `@` right after a letter or number is ignored, so email addresses like `me@site.com` are left alone.
- Chips show a snippet's state. Filled chips are linked, outlined chips are empty, and gray outlined chips don't match any snippet yet. Hover a chip to preview it.
- Renaming a snippet updates every `@reference` in your notes and snippets.
- The token count in the status bar is an estimate (about 4 characters per token) of the text you would copy, with snippets filled in.

## How variables work

- Set a variable on a line of its own with `$name = value`. These lines are settings: they are left out when you copy or preview, and out of the note's title in the sidebar.
- Or set it inline with `$name{value}`, right where you first mention it. It is copied as just the value, so `Working on $branch{fix/login} today` copies as `Working on fix/login today`.
- Use it anywhere in the note as `$name`. Only names the note sets are filled in, so text like `$HOME` or `${HOME}` stays as written.
- Names use letters, numbers, dashes, and underscores, and start with a letter, so prices like `$5` are left alone. Case matters: `$PR` and `$pr` are different variables.
- If a name is set more than once, the first one in the note wins.
- A value can use other variables and snippets: `$url = https://github.com/acme/web/pull/$pr`.
- Snippets can use variables too. A snippet's `$pr` is filled in from the note it is copied from.
- Type `$` to pick a variable, hover one to see its value, and `⌘ click` one to jump to where it's set, with the value selected so you can type a new one.

## Your data

Everything is stored in this browser only. Clearing site data, or a browser freeing up space, can delete it. Zenpad asks the browser to keep its storage (and installing it as an app helps), but you should still **export a backup** from Settings now and then. Importing a backup merges it into your library, and the newer copy of each note or snippet wins.

## Security

The production build ships a strict Content Security Policy:

```
default-src 'none'; script-src 'self'; connect-src 'none'; ...
```

`connect-src 'none'` blocks the page from making network requests (fetch, XHR, WebSockets), and scripts, styles, fonts, and images can only load from Zenpad itself. There are no third-party scripts, and fonts are self-hosted. The policy is added only to production builds, because Vite's dev server needs inline scripts.

If your host lets you set headers, send the same policy as a `Content-Security-Policy` header too (see `vite.config.ts`).

## Development

Requires Node 20.19 or newer.

```bash
npm install
npm run dev        # start the dev server
npm test           # unit tests (Vitest)
npm run test:e2e   # browser smoke tests of the production build (Playwright, run `npm run build` first)
npm run typecheck  # TypeScript
npm run lint       # oxlint
npm run build      # production build in dist/
npm run preview    # serve the production build
```

## Deploying

Zenpad is hosted on Cloudflare Pages at https://zenpad.pages.dev, configured in `wrangler.jsonc`. The build also writes a `_headers` file, so Cloudflare sends the security policy as a real HTTP header.

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and push:

- **check**: type check, lint (warnings fail the build), unit tests, and `npm audit` of production dependencies.
- **node-compat**: unit tests and build on Node 20.19 and 22, the oldest versions `package.json` supports.
- **build**: the production build, then Playwright smoke tests that load it in Chromium and fail on any console error or CSP violation, check that notes survive a reload, and check that the app loads offline.
- **preview**: each pull request from a branch in this repo gets a preview deploy at `https://pr-<number>.zenpad.pages.dev`, which updates on every push and is linked in a comment on the PR. Pull requests from forks skip the preview, since they can't read the repo's secrets.

Pushes to `main` then deploy with `wrangler pages deploy`. Previews and production both deploy the exact `dist/` the smoke tests ran against. Dependabot (`.github/dependabot.yml`) opens weekly update PRs for npm packages and GitHub Actions. Deploys need two settings on the GitHub repo:

- `CLOUDFLARE_API_TOKEN` (secret): a Cloudflare API token with the "Cloudflare Pages: Edit" account permission.
- `CLOUDFLARE_ACCOUNT_ID` (variable): your Cloudflare account ID.

To deploy by hand, run `npx wrangler login` once, then `npm run deploy`.

## Project layout

```
src/
  App.tsx            app shell: layout, shortcuts, command list
  app/               React hooks for the workspace, autosave, toasts
  components/        sidebar, top bar, command palette, settings
  editor/            CodeMirror setup: @snippet chips, autocomplete, theme
  lib/               storage (Dexie), snippet expansion, backups, settings
```

Built with Vite, React, TypeScript, CodeMirror 6, and Dexie.

# Zenpad

**A calm, beautiful place to write.** Save the text you reuse as `@snippets`, drop them into any note, and keep everything private in your browser.

Zenpad was built for writing AI prompts, but it works for any writing where you repeat yourself.

## Features

- **Focused writing.** A single centered page in a warm serif. The top bar and status bar fade away while you type and come back when you move the mouse.
- **@snippets.** Type `@` to insert a saved snippet. Snippets stay linked: edit one and every note that uses it picks up the change.
- **Copy with snippets filled in.** `⌘ Enter` copies the note with every `@snippet` replaced by its full text. Snippets can contain other snippets, and loops are detected.
- **Preview with snippets filled in.** `⌘ E` shows the note as it will be copied, with every snippet filled in. Filled-in text is tinted so you can see where each snippet starts and ends, and you can turn the tint off for a clean read. `Esc` goes back to editing.
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
| `⌘ F` | Find in the current note |

On Windows and Linux, use `Ctrl` in place of `⌘`.

## How snippets work

- Names use lowercase letters, numbers, dashes, and underscores: `@repo-context`, `@style_guide`.
- An `@` right after a letter or number is ignored, so email addresses like `me@site.com` are left alone.
- Chips show a snippet's state. Filled chips are linked, outlined chips are empty, and gray outlined chips don't match any snippet yet. Hover a chip to preview it.
- Renaming a snippet updates every `@reference` in your notes and snippets.
- The token count in the status bar is an estimate (about 4 characters per token) of the text you would copy, with snippets filled in.

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
npm run typecheck  # TypeScript
npm run lint       # oxlint
npm run build      # production build in dist/
npm run preview    # serve the production build
```

## Deploying

Zenpad is hosted on Cloudflare Pages at https://zenpad.pages.dev, configured in `wrangler.jsonc`. The build also writes a `_headers` file, so Cloudflare sends the security policy as a real HTTP header.

GitHub Actions (`.github/workflows/ci.yml`) runs the type check, lint, tests, and build on every pull request and push. Pushes to `main` then deploy with `wrangler pages deploy`. Each pull request from a branch in this repo also gets a preview deploy at `https://pr-<number>.zenpad.pages.dev`, which updates on every push and is linked in a comment on the PR. Pull requests from forks skip the preview, since they can't read the repo's secrets. Deploys need two settings on the GitHub repo:

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

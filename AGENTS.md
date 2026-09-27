# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, and others) working in this repository. `CLAUDE.md` imports this file, so keep shared guidance here.

## Project

Zenpad is a calm, local-first writing app with reusable `@snippets`. It is a static single-page app: no server, no accounts, no network requests. Notes and snippets live in the browser's IndexedDB via Dexie, and it installs as an offline PWA. It is deployed to Cloudflare Pages (https://zenpad.pages.dev) from `main`. See `README.md` for the user-facing feature list and keyboard shortcuts.

Stack: Vite, React 19, TypeScript, CodeMirror 6, Dexie, vite-plugin-pwa, Vitest, Playwright, oxlint, Wrangler.

## Layout

```
src/
  main.tsx           entry point
  App.tsx            app shell: layout, shortcuts, command list
  index.css          global styles and theme variables
  app/               React hooks: workspace (open/create/rename/delete), autosave, toasts, focus mode
  components/        sidebar, top bar, status bar, command palette, settings, dialogs, note preview, snippet map
  editor/            CodeMirror setup: @snippet chips, autocomplete, extract-to-snippet tooltip, theme
  lib/               pure logic and storage: Dexie schema, library CRUD, snippet parsing and expansion,
                     snippet graph and layout, backups, settings, note titles and counts
e2e/                 Playwright smoke tests (*.e2e.ts) run against the production build
public/              favicon and PWA icons (public/favicon.svg is also the logo in README.md)
docs/                README assets (preview.gif)
vite.config.ts       build config, Content Security Policy, _headers file, PWA manifest
wrangler.jsonc       Cloudflare Pages config
```

Where things live:

- **Storage.** `src/lib/db.ts` defines the Dexie schema (`notes`, `snippets`, `meta`). `src/lib/library.ts` holds all reads and writes; UI code should go through it rather than calling `db` directly where a helper exists.
- **Snippets.** `src/lib/snippets.ts` owns the `@name` token pattern, name validation, expansion (with loop detection), and renaming references. Keep snippet rules there so the editor, preview, copy, and graph all agree.
- **Settings.** UI preferences and the last opened document live in `localStorage` (`src/lib/settings.ts`), not IndexedDB. New settings need a default in `DEFAULT_SETTINGS`, since stored settings are merged over the defaults.
- **Backups.** `src/lib/backup.ts` defines the export format (`format: 'zenpad-backup'`, `version: 1`). Importing merges, and the newer copy of each note or snippet wins.

## Commands

Requires Node 20.19+ or 22.12+ (see `engines` in `package.json`). CI uses Node 24.

```bash
npm ci             # install dependencies
npm run dev        # start the dev server
npm run typecheck  # TypeScript (tsc -b, covers app, node config, and e2e)
npm run lint       # oxlint (CI runs it with --deny-warnings)
npm test           # unit tests (Vitest)
npm run build      # production build in dist/
npm run preview    # serve dist/ locally
npm run test:e2e   # Playwright smoke tests of the production build (run after npm run build)
```

`npm run test:e2e` starts `npm run preview` on port 4173 itself. It needs a Chromium that Playwright can find; if one is not installed, run `npx playwright install chromium`.

Run a single unit test file with `npx vitest run src/lib/snippets.test.ts`.

Before opening a PR, run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e`.

## CI and deploys

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`:

- **check**: typecheck, lint with `--deny-warnings`, unit tests, and `npm audit --omit=dev --audit-level=high`.
- **build**: production build, then the Playwright smoke tests (console errors, CSP violations, persistence across reload, offline load, snippet map).
- **node-compat** (`main` only): unit tests and build on Node 20.19 and 22.
- **preview** (PRs from this repo): deploys to `https://pr-<number>.zenpad.pages.dev` and comments the link on the PR.
- **deploy** (`main` only): deploys the exact `dist/` the smoke tests ran against.

`.github/workflows/pr-title.yml` checks PR titles (see below). `.github/workflows/claude.yml` runs Claude Code when someone mentions `@claude` on an issue or PR. Dependabot opens weekly grouped updates for npm and GitHub Actions.

Deploys need a `CLOUDFLARE_API_TOKEN` secret (a Cloudflare API token with the "Cloudflare Pages: Edit" account permission) and a `CLOUDFLARE_ACCOUNT_ID` variable on the GitHub repo. Pull requests from forks skip the preview deploy, since they can't read secrets. To deploy by hand, run `npx wrangler login` once, then `npm run deploy`.

## Conventions

- Match the style of the surrounding code: no semicolons, single quotes, 2-space indent, named exports (except `App`), function components with hooks. Comments are short and explain why, not what.
- Tests sit next to the code they cover as `*.test.ts` (see `src/lib/`). Put logic you want to test in `src/lib/` as plain functions, away from React and the DOM. Browser-level behavior belongs in `e2e/smoke.e2e.ts`.
- Keep Zenpad private and offline: do not add network calls, analytics, third-party scripts, remote fonts, or CDN assets. Fonts are self-hosted via `@fontsource-variable/*`. The production Content Security Policy (`connect-src 'none'`, see `vite.config.ts`) will block remote requests anyway, and the smoke tests fail on CSP violations.
- Do not change the Dexie schema without adding a new `db.version(n)` with an upgrade, since users' existing data must keep loading. Changing the shape of `Note` or `Snippet` also affects backups: keep `parseBackup` accepting older files.
- Do not break the `@snippet` name rules (lowercase letters, numbers, `-` and `_`; an `@` after a word character is ignored) without updating the tests and `README.md`.
- When you add or change a user-facing feature or shortcut, update `README.md` too.
- Never commit secrets. Deploy credentials (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) live in GitHub secrets and variables only.

## Commits and pull requests

### Conventional Commits

Commit messages **and PR titles** must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <description>
```

- Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Scope is optional, lowercase, and usually names the area touched: `editor`, `sidebar`, `snippets`, `storage`, `backup`, `settings`, `pwa`, `deps`.
- Description is imperative, lowercase, and has no trailing period.
- Mark breaking changes with `!` after the type or scope, e.g. `feat(storage)!: drop v1 backup format`.

Examples:

- `feat(editor): show snippet preview on hover`
- `fix(snippets): detect loops in nested expansions`
- `docs: explain backup import merging`
- `ci: check PR titles for conventional commits`

The **PR title** check (`.github/workflows/pr-title.yml`) fails any pull request into `main` whose title does not match this format.

### PR body template

Always fill in the PR description using the template in `.github/pull_request_template.md`. Keep every heading, fill in each section from your actual changes, tick only the checks you really ran, and delete optional sections (Screenshots, Notes for reviewers) that don't apply. The template is reproduced here for reference:

```markdown
<!--
PR title must follow Conventional Commits: <type>(<optional scope>): <description>
e.g. "feat(editor): add snippet preview on hover" or "fix: keep chips linked after rename"
Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
-->

## Summary

<!-- What does this PR change, and why? -->

## Changes

-

## Testing

<!-- How did you verify this? Check what applies. -->

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Tried it in the app (`npm run dev`)

## Screenshots

<!-- For UI changes, add before/after screenshots. Delete this section otherwise. -->

## Notes for reviewers

<!-- Anything risky, follow-ups, or context worth calling out. Delete if none. -->
```

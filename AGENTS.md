# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, and others) working in this repository.

## Project

Zenpad is a calm, local-first writing app with reusable `@snippets`. It is a static single-page app: no server, no accounts, no network requests. Data lives in the browser's IndexedDB via Dexie. It is deployed to Cloudflare Pages (https://zenpad.pages.dev) from `main`.

Stack: Vite, React 19, TypeScript, CodeMirror 6, Dexie, Vitest, Playwright, oxlint.

```
src/
  App.tsx            app shell: layout, shortcuts, command list
  app/               React hooks for the workspace, autosave, toasts
  components/        sidebar, top bar, command palette, settings
  editor/            CodeMirror setup: @snippet chips, autocomplete, theme
  lib/               storage (Dexie), snippet expansion, backups, settings
```

## Commands

Requires Node 20.19 or newer (CI uses Node 24).

```bash
npm ci             # install dependencies
npm run dev        # start the dev server
npm run typecheck  # TypeScript (tsc -b)
npm run lint       # oxlint
npm test           # unit tests (Vitest)
npm run build      # production build in dist/
npm run test:e2e   # Playwright smoke tests of the production build (run after npm run build)
```

Before opening a PR, run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e`. CI runs the same checks on every pull request, and also fails on lint warnings.

## Conventions

- Match the style of the surrounding code. Tests sit next to the code they cover as `*.test.ts` (see `src/lib/`).
- Keep Zenpad private and offline: do not add network calls, analytics, third-party scripts, or remote fonts. The production Content Security Policy (`connect-src 'none'`, see `vite.config.ts`) will block them anyway.
- Do not change the Dexie schema without adding a migration, since users' existing data must keep loading.
- Never commit secrets. Deploy credentials live in GitHub secrets and variables only.

## Commits and pull requests

### Conventional Commits

Commit messages **and PR titles** must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <description>
```

- Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Scope is optional, lowercase, and usually names the area touched: `editor`, `sidebar`, `snippets`, `storage`, `pwa`, `deps`.
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

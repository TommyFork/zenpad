# CLAUDE.md

All project guidance for Claude Code lives in `AGENTS.md`, which is shared with other coding agents. It is imported below; edit `AGENTS.md` rather than duplicating guidance here.

@AGENTS.md

## Claude-specific notes

- When you open a pull request, use a Conventional Commits title and fill in the body with `.github/pull_request_template.md`, as described in `AGENTS.md`.
- Commit messages follow the same Conventional Commits format as PR titles.
- Run the checks listed under Commands before pushing. For UI changes, try the app with `npm run dev` (or the production build with `npm run build && npm run preview`) rather than relying on unit tests alone.
- If you change the Dexie schema, backup format, or snippet name rules, call it out under "Notes for reviewers" in the PR.

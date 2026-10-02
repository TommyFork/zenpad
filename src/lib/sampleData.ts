import type { Note, Snippet } from './db'

// Set by `vite build --mode sample` (see .env.sample), which PR previews use.
// Production builds leave it unset, so the sample library is dropped from the bundle.
export const SAMPLE_DATA_ON_FIRST_LAUNCH = import.meta.env.VITE_SAMPLE_DATA === 'true'

// The "Add sample data" command is offered in dev and in sample builds, never in production.
export const SAMPLE_DATA_COMMAND = import.meta.env.DEV || SAMPLE_DATA_ON_FIRST_LAUNCH

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

interface SampleSnippet {
  name: string
  body: string
  age: number
}

interface SampleNote {
  body: string
  age: number
  favorite?: boolean
}

// Covers nesting, variables in snippets (including a folded block), an unused snippet, a missing reference, and a loop.
const SAMPLE_SNIPPETS: SampleSnippet[] = [
  {
    name: 'persona',
    body: 'You are a senior software engineer who writes clear, well-tested code and explains trade-offs plainly.',
    age: 40 * DAY,
  },
  {
    name: 'style',
    body: 'Be direct and concise. Lead with the answer, then only the detail that matters. Use short paragraphs.',
    age: 38 * DAY,
  },
  {
    name: 'repo-context',
    body: 'The project is $repo, a TypeScript app built with Vite and React. Tests use Vitest, and lint uses oxlint.',
    age: 30 * DAY,
  },
  {
    name: 'system',
    body: '@persona\n\n@style',
    age: 12 * DAY,
  },
  {
    name: 'review-pr',
    body: 'Review pull request #$pr in $repo. Look for correctness bugs first, then readability. Quote the lines you mean.\n\n@output-format',
    age: 6 * DAY,
  },
  {
    name: 'output-format',
    body: 'Reply in Markdown with these sections:\n- Summary\n- Issues (most severe first)\n- Suggestions',
    age: 20 * DAY,
  },
  {
    name: 'bug-report',
    body: 'Steps to reproduce:\n1. \n2. \n\nExpected:\n\nActual:\n\nBrowser and version:',
    age: 55 * DAY,
  },
  {
    name: 'sign-off',
    body: 'Thanks,\n$name',
    age: 70 * DAY,
  },
  {
    name: 'meeting-notes',
    body: 'Attendees:\n\nAgenda:\n\nDecisions:\n\nAction items:\n- [ ] ',
    age: 90 * DAY,
  },
  {
    name: 'no-yapping',
    body: 'Skip the preamble and the recap. No apologies, no "Great question".',
    age: 3 * HOUR,
  },
  {
    name: 'test-plan',
    body: 'Write a test plan for $feature. Cover the happy path, edge cases, and what happens offline.\n\n@output-format',
    age: 2 * DAY,
  },
  {
    name: 'with-background',
    body: 'The background for this task follows. Ask before assuming anything it does not say.',
    age: 1 * DAY,
  },
  {
    name: 'unused_snippet',
    body: 'Nothing references this snippet, so it sits alone on the snippet map.',
    age: 120 * DAY,
  },
  {
    name: 'loop-a',
    body: 'This snippet includes @loop-b, which includes this one again.',
    age: 15 * DAY,
  },
  {
    name: 'loop-b',
    body: 'And this one points back at @loop-a, so expansion has to stop.',
    age: 15 * DAY,
  },
]

const LONG_NOTE_PARAGRAPHS = Array.from(
  { length: 40 },
  (_, index) =>
    `Paragraph ${index + 1}. A long note for checking scrolling, the word count, and how the editor behaves far from the top. Every tenth paragraph uses a snippet${index % 10 === 0 ? ': @style' : '.'}`,
)

// A design doc long enough that folding it away is worth it, for the folded block note.
const DESIGN_DOC_SECTIONS = ['Goals', 'Non-goals', 'Storage', 'Conflicts', 'Offline', 'Migration', 'Testing', 'Rollout']
const DESIGN_DOC = DESIGN_DOC_SECTIONS.flatMap((section, index) => [
  `## ${index + 1}. ${section}`,
  '',
  `The ${section.toLowerCase()} section of the sync design. Sync runs in the background, never blocks typing, and keeps every write in IndexedDB first, so a lost connection loses nothing.`,
  `- Decision ${index + 1}a: the newer copy of a note wins, matching backup imports.`,
  `- Decision ${index + 1}b: snippets sync before the notes that use them.`,
  '',
]).join('\n')

const SAMPLE_NOTES: SampleNote[] = [
  {
    body: `$repo = zenpad

# Plan the sync feature

@persona

@with-background

$background = """
${DESIGN_DOC}
"""

Read the design above, then answer these:

$questions = """
1. What breaks if two devices rename the same snippet at once?
2. Which parts of $repo need to change first?
3. What should the first pull request contain?
"""

@style`,
    age: 20 * MINUTE,
    favorite: true,
  },
  {
    body: `$repo = zenpad
$pr = 42

# Review PR $pr

@system

@repo-context

@review-pr`,
    age: 5 * MINUTE,
    favorite: true,
  },
  {
    body: `# Test plan for offline mode

$repo{zenpad} is a PWA, so this matters.
$feature = offline mode

@system

@test-plan

@no-yapping`,
    age: 40 * MINUTE,
  },
  {
    body: `# Refactor the autosave hook

@persona

The autosave hook in $repo{zenpad} debounces writes. Suggest a cleaner way to flush on unload without losing the last keystroke.

@style`,
    age: 3 * HOUR,
    favorite: true,
  },
  {
    body: `Grocery list

- [x] oat milk
- [ ] coffee beans
- [x] lemons
- [ ] sourdough`,
    age: 9 * HOUR,
  },
  {
    body: `# Standup, Monday

@meeting-notes`,
    age: 26 * HOUR,
  },
  {
    body: `# Bug: chips flicker when renaming a snippet

@bug-report`,
    age: 2 * DAY,
  },
  {
    body: `# Email to the design team

$name = Sam

Hi all,

The new accent colors look great. Could we try a slightly warmer sage?

@sign-off`,
    age: 3 * DAY,
  },
  {
    body: `# Loop check

This note uses @loop-a. Preview and copy should stop at the loop instead of hanging.`,
    age: 4 * DAY,
  },
  {
    body: `# Missing snippet

This note mentions @not-written-yet, which doesn't exist. ⌘ click it to create it.

Email addresses like someone@example.com are not snippets.`,
    age: 5 * DAY,
  },
  {
    body: `# Variables everywhere

$branch = fix/login
$ticket = ZEN-118

Check out $branch, rebase $branch on main, and link $ticket in the PR.
$HOME and $5 are not set, so they stay as written.`,
    age: 6 * DAY,
  },
  {
    body: `# Folded context

The blocks below open folded. Click one to show the text, or Fold to hide it again.
A block fills in where it sits, so there is no need to write its name again.

Here are the logs from $repo:
$logs = """
[12:04:01] GET /notes 200 12ms
[12:04:03] PUT /notes/42 500 3ms
TypeError: Cannot read properties of undefined (reading 'body')
    at saveNote (library.ts:88)
    at flush (useAutosave.ts:31)
Uses $repo, so the block fills in its own variables. @output-format
"""
$repo = zenpad
$empty = """
"""

Writing a block's name again repeats its text somewhere else.
An empty block fills in as nothing: "$empty"`,
    age: 6 * DAY + HOUR,
  },
  {
    body: `# Folded block edge cases

$first = """
  The first block named $first wins.
  $inside = not a definition, just text in the block
"""
$first = """
A second block with the same name shows the first one's text.
"""
    $indented = """
Indented quotes still open and close a block.
    """

Uses: $first / $indented / $inside

$unclosed = """
This block never closes, so it stays visible, and $unclosed fills in as the quotes.`,
    age: 6 * DAY + 2 * HOUR,
  },
  {
    body: `# Ideas

- Snippet folders
- Per-note accent color
- A reading mode with wider margins
- Keyboard shortcut cheat sheet`,
    age: 8 * DAY,
    favorite: true,
  },
  {
    body: `# Book notes: A Philosophy of Software Design

Deep modules hide a lot of complexity behind a small interface.
Define errors out of existence where you can.
Comments should describe things that aren't obvious from the code.`,
    age: 11 * DAY,
  },
  {
    body: `# Long note

${LONG_NOTE_PARAGRAPHS.join('\n\n')}`,
    age: 14 * DAY,
  },
  {
    body: `# Markdown sampler

## A heading

Some **bold**, some *italic*, and some \`inline code\`.

> A quote that goes on long enough to wrap onto a second line at most window widths, just to see how it looks.

1. First
2. Second
3. Third

\`\`\`ts
const greeting = 'hello'
\`\`\``,
    age: 20 * DAY,
  },
  {
    body: `# Travel checklist

- Passport
- Chargers
- Headphones
- @sign-off for the out of office reply`,
    age: 35 * DAY,
  },
  {
    body: `# Prompt: summarize a meeting

@persona

Summarize these notes into decisions and action items.

@output-format`,
    age: 48 * DAY,
  },
  {
    body: `# Release 1.2 checklist

Every box is checked, so the sidebar shows a full ring.

- [x] Bump the version
  - [x] package.json
  - [X] the changelog
1. [x] Tag the release
2. [x] Deploy

The example below is code, so it isn't counted:

\`\`\`md
- [ ] not a real task
\`\`\``,
    age: 30 * DAY,
  },
  {
    body: `A note without a heading. Its first line becomes the title in the sidebar, even when the line is long enough that it has to be cut short somewhere along the way.`,
    age: 75 * DAY,
  },
  {
    body: `# Old draft from last year

Kept around to check how older notes show up in the list.`,
    age: 400 * DAY,
  },
]

export interface SampleLibrary {
  notes: Note[]
  snippets: Snippet[]
}

// Timestamps are relative to `now` so the sidebar shows a spread of recent and older notes.
export function buildSampleLibrary(now: number, newId: () => string = () => crypto.randomUUID()): SampleLibrary {
  return {
    snippets: SAMPLE_SNIPPETS.map(({ name, body, age }) => ({
      id: newId(),
      name,
      body,
      createdAt: now - age,
      updatedAt: now - age,
    })),
    notes: SAMPLE_NOTES.map(({ body, age, favorite }) => ({
      id: newId(),
      body,
      createdAt: now - age,
      updatedAt: now - age,
      ...(favorite ? { favorite } : {}),
    })),
  }
}

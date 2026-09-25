import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

// Colors come from CSS custom properties so the editor follows the app theme without reconfiguring.
const zenTheme = EditorView.theme({
  '&': {
    color: 'var(--ink)',
    backgroundColor: 'transparent',
    fontSize: 'var(--editor-size)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--editor-font)',
    lineHeight: 'var(--editor-leading)',
  },
  '.cm-content': {
    padding: '0 0 45vh',
    caretColor: 'var(--caret)',
  },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--caret)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'var(--selection)' },
  '.cm-placeholder': { color: 'var(--faint)', fontStyle: 'italic' },
  '.cm-snippet': {
    color: 'var(--accent-ink)',
    backgroundColor: 'var(--accent-wash)',
    borderRadius: '5px',
    padding: '0.08em 0.28em',
    margin: '0 -0.04em',
    fontFamily: 'var(--ui-font)',
    fontSize: '0.84em',
    fontWeight: '550',
    letterSpacing: '0.01em',
    whiteSpace: 'nowrap',
  },
  '.cm-snippet-empty': {
    backgroundColor: 'transparent',
    boxShadow: 'inset 0 0 0 1px var(--accent-wash-strong)',
  },
  '.cm-snippet-missing': {
    color: 'var(--muted)',
    backgroundColor: 'transparent',
    boxShadow: 'inset 0 0 0 1px var(--line-strong)',
  },
  '.cm-tooltip': {
    border: '1px solid var(--line)',
    backgroundColor: 'var(--surface-raised)',
    color: 'var(--ink)',
    borderRadius: '12px',
    boxShadow: 'var(--shadow-pop)',
    overflow: 'hidden',
    fontFamily: 'var(--ui-font)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete': { padding: '6px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'var(--ui-font)',
    fontSize: '14px',
    maxHeight: '18em',
    minWidth: '260px',
    maxWidth: 'min(460px, 90vw)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    padding: '7px 10px',
    borderRadius: '8px',
    lineHeight: '1.35',
    display: 'flex',
    alignItems: 'baseline',
    gap: '10px',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--accent-wash)',
    color: 'var(--ink)',
  },
  '.cm-completionLabel': { fontWeight: '550', color: 'var(--accent-ink)', flexShrink: '0' },
  '.cm-completionMatchedText': { textDecoration: 'none', color: 'var(--ink)' },
  '.cm-completionDetail': {
    color: 'var(--muted)',
    fontStyle: 'normal',
    marginLeft: 'auto',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '13px',
  },
  '.cm-completionInfo': { display: 'none' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > completion-section': { display: 'none' },
  '.cm-snippet-tooltip': { padding: '12px 14px', maxWidth: 'min(420px, 86vw)' },
  '.cm-snippet-tooltip-name': { fontWeight: '600', color: 'var(--accent-ink)', fontSize: '13px', marginBottom: '6px' },
  '.cm-snippet-tooltip-body': {
    fontSize: '14px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
    color: 'var(--ink-soft)',
    maxHeight: '14em',
    overflow: 'hidden',
  },
  '.cm-snippet-tooltip-hint': { marginTop: '10px', fontSize: '12px', color: 'var(--faint)' },
  '.cm-panels': { backgroundColor: 'var(--surface-raised)', color: 'var(--ink)', fontFamily: 'var(--ui-font)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
  '.cm-search': { padding: '10px 12px', fontSize: '13px' },
  '.cm-search input, .cm-search button': { fontFamily: 'var(--ui-font)', fontSize: '13px' },
  '.cm-textfield': {
    border: '1px solid var(--line-strong)',
    borderRadius: '7px',
    backgroundColor: 'var(--surface)',
    color: 'var(--ink)',
    padding: '4px 8px',
  },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--line-strong)',
    borderRadius: '7px',
    color: 'var(--ink)',
    padding: '4px 10px',
  },
  '.cm-searchMatch': { backgroundColor: 'var(--highlight)', borderRadius: '3px' },
  '.cm-searchMatch-selected': { backgroundColor: 'var(--highlight-strong)' },
  '.cm-panel.cm-search [name=close]': { color: 'var(--muted)', fontSize: '18px', right: '8px', top: '6px' },
})

const zenHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: '650', fontSize: '1.3em', letterSpacing: '-0.01em' },
  { tag: tags.heading2, fontWeight: '650', fontSize: '1.15em' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontWeight: '650' },
  { tag: tags.strong, fontWeight: '650' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--muted)' },
  { tag: tags.monospace, fontFamily: 'var(--mono-font)', fontSize: '0.86em', color: 'var(--code-ink)' },
  { tag: tags.quote, color: 'var(--ink-soft)', fontStyle: 'italic' },
  { tag: [tags.link, tags.url], color: 'var(--accent-ink)', textDecoration: 'underline' },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: 'var(--faint)' },
])

export const zenAppearance = [zenTheme, syntaxHighlighting(zenHighlight)]

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown'
import { LanguageSupport } from '@codemirror/language'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { EditorState, Prec, type Extension } from '@codemirror/state'
import { drawSelection, EditorView, keymap, placeholder, tooltips } from '@codemirror/view'
import { checklists, toggleChecklistLines } from './checklists'
import { extractTooltip } from './extractTooltip'
import { foldedRanges } from '@codemirror/language'
import { parseDocumentKey } from '../app/documents'
import { readOpenBlocks, writeOpenBlocks } from '../lib/settings'
import { blockWrapping, foldVariableBlocks, noteVariables, openBlockNames } from './noteVariables'
import { replaceState } from './replaceState'
import { snippetChips } from './snippetChips'
import { snippetCompletion } from './snippetCompletion'
import { setSnippetBodies, snippetBodiesField, type SnippetBodies } from './snippetState'
import { zenAppearance } from './theme'

const TOOLTIP_EDGE_MARGIN = 12

export interface EditorDocument {
  key: string
  text: string
  // Discards cached editor states, used after the stored text changed underneath the editor.
  reload: boolean
  focus: boolean
}

export interface EditorSelection {
  // The document the selection belongs to, so a late edit can't land in a different one.
  key: string
  from: number
  to: number
  text: string
  // The characters just outside the selection.
  before: string
  after: string
}

export interface EditorHandle {
  selection: () => EditorSelection | null
  replace: (selection: EditorSelection, insert: string) => boolean
  // Turns the selected lines into a checklist, or back into plain lines.
  toggleChecklist: () => void
}

interface EditorProps {
  ref?: Ref<EditorHandle>
  document: EditorDocument
  snippets: SnippetBodies
  placeholderText: string
  onChange: (text: string) => void
  // Opens the named snippet, creating it first when it doesn't exist yet.
  onOpenSnippet: (name: string) => void
  onCreateSnippet: (name: string) => void
  // Asks to move the selected text into a new snippet.
  onExtract: () => void
  // Called after the selected text was folded away into a block with this name.
  onFolded: (name: string) => void
}

export function Editor({
  ref,
  document,
  snippets,
  placeholderText,
  onChange,
  onOpenSnippet,
  onCreateSnippet,
  onExtract,
  onFolded,
}: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const cachedStates = useRef(new Map<string, EditorState>())
  const openKey = useRef<string | null>(null)
  const extensionsRef = useRef<Extension[]>([])
  const snippetsRef = useRef(snippets)
  const callbacks = useRef({ onChange, onOpenSnippet, onCreateSnippet, onExtract, onFolded })

  useEffect(() => {
    callbacks.current = { onChange, onOpenSnippet, onCreateSnippet, onExtract, onFolded }
  })

  useImperativeHandle(
    ref,
    () => ({
      selection() {
        const view = viewRef.current
        const key = openKey.current
        if (!view || !key) return null
        const { from, to } = view.state.selection.main
        if (from === to) return null
        const { doc } = view.state
        return {
          key,
          from,
          to,
          text: doc.sliceString(from, to),
          before: doc.sliceString(Math.max(0, from - 1), from),
          after: doc.sliceString(to, Math.min(doc.length, to + 1)),
        }
      },
      replace(selection, insert) {
        const view = viewRef.current
        if (!view || openKey.current !== selection.key) return false
        if (view.state.sliceDoc(selection.from, selection.to) !== selection.text) return false
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert },
          selection: { anchor: selection.from + insert.length },
          scrollIntoView: true,
          userEvent: 'input.extract',
        })
        view.focus()
        return true
      },
      toggleChecklist() {
        const view = viewRef.current
        if (!view) return
        toggleChecklistLines(view)
        view.focus()
      },
    }),
    [],
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    extensionsRef.current = [
      history(),
      drawSelection(),
      EditorView.lineWrapping,
      // markdown() would also bundle HTML, CSS, and JS parsers for embedded code, which notes don't need.
      new LanguageSupport(markdownLanguage),
      Prec.high(keymap.of(markdownKeymap)),
      search({ top: true }),
      tooltips({
        tooltipSpace: () => ({
          top: TOOLTIP_EDGE_MARGIN,
          left: TOOLTIP_EDGE_MARGIN,
          bottom: window.innerHeight - TOOLTIP_EDGE_MARGIN,
          right: window.innerWidth - TOOLTIP_EDGE_MARGIN,
        }),
      }),
      highlightSelectionMatches(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      snippetBodiesField,
      snippetChips((name) => callbacks.current.onOpenSnippet(name)),
      snippetCompletion((name) => callbacks.current.onCreateSnippet(name)),
      noteVariables,
      checklists({ interactive: true }),
      extractTooltip(
        () => callbacks.current.onExtract(),
        (name) => callbacks.current.onFolded(name),
      ),
      // Folding text away selects both copies of the new name, so typing renames it.
      EditorState.allowMultipleSelections.of(true),
      // ⌘ click is for opening snippets and jumping to variables, not adding cursors.
      EditorView.clickAddsSelectionRange.of(() => false),
      EditorView.contentAttributes.of({ spellcheck: 'true', autocapitalize: 'sentences', 'aria-label': 'Note' }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) callbacks.current.onChange(update.state.doc.toString())
        const key = openKey.current
        const foldsChanged = foldedRanges(update.startState) !== foldedRanges(update.state)
        if (key && (update.docChanged || foldsChanged)) writeOpenBlocks(key, openBlockNames(update.state))
      }),
      zenAppearance,
    ]
    const view = new EditorView({ parent: host })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
      openKey.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (openKey.current) cachedStates.current.set(openKey.current, view.state)
    if (document.reload) cachedStates.current.clear()

    const cached = cachedStates.current.get(document.key)
    const state =
      cached ??
      EditorState.create({
        doc: document.text,
        extensions: [
          ...extensionsRef.current,
          placeholder(placeholderText),
          blockWrapping.of(parseDocumentKey(document.key)?.kind === 'note'),
        ],
      })
    replaceState(view, state)
    openKey.current = document.key
    // Blocks start folded, except the ones left open last time. A cached state keeps them as they were.
    const folds = cached ? [] : foldVariableBlocks(view.state, new Set(readOpenBlocks(document.key)))
    view.dispatch({ effects: [setSnippetBodies.of(snippetsRef.current), ...folds] })
    if (cached) view.dispatch({ effects: EditorView.scrollIntoView(cached.selection.main.head, { y: 'center' }) })
    else view.scrollDOM.scrollTop = 0
    if (document.focus) view.focus()
  }, [document, placeholderText])

  useEffect(() => {
    snippetsRef.current = snippets
    viewRef.current?.dispatch({ effects: setSnippetBodies.of(snippets) })
  }, [snippets])

  return <div className="editor-host" ref={hostRef} />
}

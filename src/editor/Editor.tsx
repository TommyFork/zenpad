import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown'
import { LanguageSupport } from '@codemirror/language'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { EditorState, Prec, type Extension } from '@codemirror/state'
import { drawSelection, EditorView, keymap, placeholder, tooltips } from '@codemirror/view'
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

interface EditorProps {
  document: EditorDocument
  snippets: SnippetBodies
  placeholderText: string
  onChange: (text: string) => void
  // Opens the named snippet, creating it first when it doesn't exist yet.
  onOpenSnippet: (name: string) => void
  onCreateSnippet: (name: string) => void
}

export function Editor({ document, snippets, placeholderText, onChange, onOpenSnippet, onCreateSnippet }: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const cachedStates = useRef(new Map<string, EditorState>())
  const openKey = useRef<string | null>(null)
  const extensionsRef = useRef<Extension[]>([])
  const snippetsRef = useRef(snippets)
  const callbacks = useRef({ onChange, onOpenSnippet, onCreateSnippet })

  useEffect(() => {
    callbacks.current = { onChange, onOpenSnippet, onCreateSnippet }
  })

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
      EditorView.contentAttributes.of({ spellcheck: 'true', autocapitalize: 'sentences', 'aria-label': 'Note' }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) callbacks.current.onChange(update.state.doc.toString())
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
        extensions: [...extensionsRef.current, placeholder(placeholderText)],
      })
    view.setState(state)
    view.dispatch({ effects: setSnippetBodies.of(snippetsRef.current) })
    if (cached) view.dispatch({ effects: EditorView.scrollIntoView(cached.selection.main.head, { y: 'center' }) })
    else view.scrollDOM.scrollTop = 0
    openKey.current = document.key
    if (document.focus) view.focus()
  }, [document, placeholderText])

  useEffect(() => {
    snippetsRef.current = snippets
    viewRef.current?.dispatch({ effects: setSnippetBodies.of(snippets) })
  }, [snippets])

  return <div className="editor-host" ref={hostRef} />
}

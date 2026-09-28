import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { documentKey, isSameDocument, type DocumentRef } from './app/documents'
import { hasModifier, MOD_LABEL } from './app/keys'
import { useLibrary } from './app/useLibrary'
import { useMediaQuery } from './app/useMediaQuery'
import { useToast } from './app/useToast'
import { useWorkspace } from './app/useWorkspace'
import { useWritingFocus } from './app/useWritingFocus'
import { CommandPalette, type PaletteItem } from './components/CommandPalette'
import { DeleteDialog } from './components/DeleteDialog'
import { ExtractDialog } from './components/ExtractDialog'
import { NotePreview } from './components/NotePreview'
import type { IconName } from './components/Icon'
import { SettingsPanel } from './components/SettingsPanel'
import { SnippetHeader } from './components/SnippetHeader'
import { SnippetMap } from './components/SnippetMap'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { ToastView } from './components/ToastView'
import { TopBar } from './components/TopBar'
import { Editor, type EditorSelection } from './editor/Editor'
import { useEditorHandle } from './editor/useEditorHandle'
import { BackupError } from './lib/backup'
import { downloadJson, pickFile } from './lib/files'
import type { Note, Snippet } from './lib/db'
import {
  createSnippet,
  exportLibrary,
  importLibrary,
  isSnippetNameTaken,
  requestPersistentStorage,
  seedOnFirstLaunch,
  setNoteFavorite,
} from './lib/library'
import { notePreview, noteTitle } from './lib/notes'
import { useSettings, type Accent, type EditorFont, type SidebarSection, type Theme } from './lib/settings'
import {
  describeUses,
  extractToSnippet,
  isValidSnippetName,
  suggestSnippetName,
  snippetUsers,
  toSnippetName,
  type SnippetSort,
} from './lib/snippets'
import { fillIn } from './lib/variables'

const NARROW_SCREEN = '(max-width: 760px)'
const NOTE_PLACEHOLDER = 'Start writing…'
const SNIPPET_PLACEHOLDER = 'Write the text this snippet stands for…'
const PEEK_CLOSE_DELAY_MS = 250

interface Command {
  id: string
  label: string
  icon: IconName
  shortcut?: string
  run: () => unknown
}

function focusEditor() {
  document.querySelector<HTMLElement>('.cm-content')?.focus()
}

interface SnippetUses {
  notes: number
  snippets: number
  // Snippets nested inside this one in the sidebar.
  nested: number
}

function deleteCopy(snippet: Snippet | undefined, uses: SnippetUses, text: string): { title: string; detail: string } {
  const undoHint = 'You can undo this for a few seconds afterwards.'
  if (!snippet) return { title: `Delete “${noteTitle(text)}”?`, detail: undoHint }
  const users = describeUses(uses.notes, uses.snippets)
  const nested = uses.nested > 0 ? `The ${uses.nested === 1 ? 'snippet' : 'snippets'} inside it will stay. ` : ''
  if (!users) return { title: `Delete @${snippet.name}?`, detail: `${nested}${undoHint}` }
  const verb = uses.notes + uses.snippets === 1 ? 'uses' : 'use'
  return {
    title: `Delete @${snippet.name}?`,
    detail: `${users} ${verb} it. They'll keep @${snippet.name} as plain text. ${nested}${undoHint}`,
  }
}

function uniqueName(base: string, taken: ReadonlySet<string>): string {
  let candidate = base
  for (let suffix = 2; taken.has(candidate); suffix++) candidate = `${base}-${suffix}`
  return candidate
}

function applyTheme(theme: Theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
}

function applyAccent(accent: Accent) {
  if (accent === 'lake') delete document.documentElement.dataset.accent
  else document.documentElement.dataset.accent = accent
}

export default function App() {
  const [settings, updateSettings] = useSettings()
  const library = useLibrary()
  const { notes, snippets, snippetBodies, referenceCounts, snippetParents } = library
  const { toast, showToast, dismissToast } = useToast()
  const workspace = useWorkspace(library, showToast)
  const isNarrow = useMediaQuery(NARROW_SCREEN)
  const isWriting = useWritingFocus()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [peeking, setPeeking] = useState(false)
  const peekTimer = useRef<number | undefined>(undefined)
  // Set after the sidebar is hidden with a click, so the show button appearing under the pointer doesn't slide it straight back in.
  const peekHeld = useRef(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DocumentRef | null>(null)
  const [extracting, setExtracting] = useState<EditorSelection | null>(null)
  const { ref: editorRef, selection: editorSelection, replace: replaceInEditor } = useEditorHandle()
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null)
  const started = useRef(false)

  const sidebarVisible = isNarrow ? drawerOpen : settings.sidebarOpen
  const { openDoc, openDocRecord, text } = workspace
  const openSnippet = openDoc?.kind === 'snippet' ? snippets.find((snippet) => snippet.id === openDoc.id) : undefined
  const returnToNote = notes.find((note) => note.id === workspace.returnTo?.id)
  const openKey = openDoc ? documentKey(openDoc) : null
  const previewing = openKey !== null && openKey === previewKey

  // Opening a different note leaves preview. Visiting a snippet and coming back keeps it.
  if (previewKey && openDoc?.kind === 'note' && openKey !== previewKey) setPreviewKey(null)

  const openNote = openDoc?.kind === 'note' ? notes.find((note) => note.id === openDoc.id) : undefined

  useEffect(() => {
    if (started.current) return
    started.current = true
    seedOnFirstLaunch()
      .then(workspace.openInitialDocument)
      .catch((error: unknown) => showToast(`Zenpad couldn't open your library: ${String(error)}`))
    requestPersistentStorage().then(setStoragePersisted, (error: unknown) => {
      console.warn('Zenpad: persistent storage request failed.', error)
      setStoragePersisted(false)
    })
  }, [workspace.openInitialDocument, showToast])

  useEffect(() => applyTheme(settings.theme), [settings.theme])
  useEffect(() => applyAccent(settings.accent), [settings.accent])

  const stopPeek = useCallback(() => {
    window.clearTimeout(peekTimer.current)
    setPeeking(false)
  }, [])

  const setSidebar = useCallback(
    (open: boolean) => {
      setPeeking(false)
      if (isNarrow) setDrawerOpen(open)
      else updateSettings({ sidebarOpen: open })
    },
    [isNarrow, updateSettings],
  )

  // Hovering the show-sidebar button slides the sidebar in; it slides away shortly after the pointer leaves both.
  const startPeek = useCallback(() => {
    if (peekHeld.current) return
    window.clearTimeout(peekTimer.current)
    setPeeking(true)
  }, [])

  const endPeek = useCallback(() => {
    window.clearTimeout(peekTimer.current)
    peekTimer.current = window.setTimeout(() => setPeeking(false), PEEK_CLOSE_DELAY_MS)
  }, [])

  useEffect(() => () => window.clearTimeout(peekTimer.current), [])

  useEffect(() => {
    if (sidebarVisible) peekHeld.current = false
  }, [sidebarVisible])

  const closePalette = useCallback(() => {
    setPaletteOpen(false)
    focusEditor()
  }, [])

  const cancelDelete = useCallback(() => {
    setDeleteTarget(null)
    focusEditor()
  }, [])

  function documentText(doc: DocumentRef): string {
    if (isSameDocument(openDoc, doc)) return text
    const records: (Note | Snippet)[] = doc.kind === 'note' ? notes : snippets
    return records.find((record) => record.id === doc.id)?.body ?? ''
  }

  // Blank documents have nothing to lose, so they skip the confirmation.
  function requestDelete(doc: DocumentRef | null = openDoc) {
    if (!doc) return
    if (documentText(doc).trim() === '') void workspace.deleteDocument(doc)
    else setDeleteTarget(doc)
  }

  function confirmDelete() {
    if (!deleteTarget) return
    setDeleteTarget(null)
    void workspace.deleteDocument(deleteTarget)
  }

  const togglePreview = useCallback(() => {
    if (previewing) {
      setPreviewKey(null)
      requestAnimationFrame(focusEditor)
    } else {
      setPreviewKey(openKey)
    }
  }, [previewing, openKey])

  const exitPreview = useCallback(() => {
    if (paletteOpen || settingsOpen || deleteTarget || mapOpen) return
    setPreviewKey(null)
    requestAnimationFrame(focusEditor)
  }, [paletteOpen, settingsOpen, deleteTarget, mapOpen])

  function toggleFavorite() {
    if (!openNote) return
    const favorite = !openNote.favorite
    setNoteFavorite(openNote.id, favorite).then(
      () => showToast(favorite ? 'Added to favorites.' : 'Removed from favorites.'),
      (error: unknown) => showToast(`Couldn't update favorites: ${String(error)}`),
    )
  }

  function toggleSection(section: SidebarSection) {
    const collapsed = settings.collapsedSections
    updateSettings({
      collapsedSections: collapsed.includes(section) ? collapsed.filter((name) => name !== section) : [...collapsed, section],
    })
  }

  const closeMap = useCallback(() => {
    setMapOpen(false)
    focusEditor()
  }, [])

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
    focusEditor()
  }, [])

  const expandedText = useMemo(() => fillIn(text, snippetBodies), [text, snippetBodies])

  const openSnippetUsers = useMemo(
    () => snippetUsers(openSnippet?.name ?? '', openSnippet ? notes : [], openSnippet ? snippets : []),
    [notes, snippets, openSnippet],
  )

  const deleteSnippetTarget = deleteTarget?.kind === 'snippet' ? snippets.find((snippet) => snippet.id === deleteTarget.id) : undefined

  function snippetUses(snippet: Snippet | undefined): SnippetUses {
    if (!snippet) return { notes: 0, snippets: 0, nested: 0 }
    const users = snippetUsers(snippet.name, notes, snippets)
    return {
      notes: users.notes.length,
      snippets: users.snippets.length,
      nested: [...snippetParents.values()].filter((parent) => parent === snippet.name).length,
    }
  }

  function toggleSnippetExpanded(id: string) {
    const expanded = settings.expandedSnippets.filter((candidate) => snippets.some((snippet) => snippet.id === candidate))
    updateSettings({
      expandedSnippets: expanded.includes(id) ? expanded.filter((candidate) => candidate !== id) : [...expanded, id],
    })
  }

  const startExtract = useCallback(() => {
    const selection = previewing ? null : editorSelection()
    if (!selection || selection.text.trim() === '') {
      showToast('Select some text first, then make it a snippet.')
      return
    }
    setExtracting(selection)
  }, [previewing, showToast, editorSelection])

  const cancelExtract = useCallback(() => {
    setExtracting(null)
    focusEditor()
  }, [])

  async function confirmExtract(requested: string): Promise<string | null> {
    if (!extracting) return null
    const name = toSnippetName(requested)
    if (!isValidSnippetName(name)) return 'Snippet names use lowercase letters, numbers, dashes, and underscores.'
    if (await isSnippetNameTaken(name)) return `@${name} already exists. Pick another name.`
    const extraction = extractToSnippet(extracting.text, name, extracting.before, extracting.after)
    const snippet = await createSnippet(name, extraction.body)
    setExtracting(null)
    if (!replaceInEditor(extracting, extraction.insert)) {
      showToast(`Created @${name}, but the text changed, so it wasn't swapped in.`)
      return null
    }
    showToast(`Moved into @${name}.`, { label: 'Open', run: () => open({ kind: 'snippet', id: snippet.id }) })
    return null
  }

  function open(doc: DocumentRef) {
    if (isNarrow) setDrawerOpen(false)
    setMapOpen(false)
    void workspace.openDocument(doc)
  }

  async function exportBackup() {
    await workspace.flush()
    const backup = await exportLibrary()
    downloadJson(`zenpad-backup-${new Date().toISOString().slice(0, 10)}.json`, backup)
    showToast(`Exported ${backup.notes.length} notes and ${backup.snippets.length} snippets.`)
  }

  async function importBackup() {
    const file = await pickFile('application/json,.json')
    if (!file) return
    await workspace.flush()
    try {
      const result = await importLibrary(await file.text())
      showToast(`Imported ${result.notes} notes and ${result.snippets} snippets.`)
    } catch (error) {
      showToast(error instanceof BackupError ? error.message : `Import failed: ${String(error)}`)
      return
    }
    if (openDoc) await workspace.openDocument(openDoc, { reload: true })
  }

  const shortcuts = useRef<(event: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    shortcuts.current = (event) => {
      if (!hasModifier(event)) return
      const handlers: Record<string, () => void> = {
        KeyK: () => setPaletteOpen((isOpen) => !isOpen),
        Enter: () => void workspace.copyCurrent(),
        KeyE: togglePreview,
        Backslash: () => setSidebar(!sidebarVisible),
        'Alt+KeyN': () => void workspace.newNote(),
        'Alt+KeyS': startExtract,
      }
      const run = handlers[event.altKey ? `Alt+${event.code}` : event.code]
      if (!run) return
      event.preventDefault()
      event.stopPropagation()
      run()
    }
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => shortcuts.current(event)
    window.addEventListener('keydown', listener, { capture: true })
    return () => window.removeEventListener('keydown', listener, { capture: true })
  }, [])

  const setTheme = (theme: Theme) => updateSettings({ theme })
  const setFont = (font: EditorFont) => updateSettings({ font })

  const commands: Command[] = [
    { id: 'new-note', label: 'New note', icon: 'plus', shortcut: `${MOD_LABEL} ⌥ N`, run: workspace.newNote },
    { id: 'new-snippet', label: 'New snippet', icon: 'at', run: workspace.newSnippet },
    { id: 'extract', label: 'Make a snippet from the selection', icon: 'at', shortcut: `${MOD_LABEL} ⌥ S`, run: startExtract },
    { id: 'copy', label: 'Copy with snippets filled in', icon: 'copy', shortcut: `${MOD_LABEL} ↵`, run: workspace.copyCurrent },
    {
      id: 'preview',
      label: previewing ? 'Back to editing' : 'Preview with snippets filled in',
      icon: previewing ? 'pencil' : 'eye',
      shortcut: `${MOD_LABEL} E`,
      run: togglePreview,
    },
    {
      id: 'preview-highlights',
      label: settings.previewHighlights ? 'Preview: Hide snippet highlights' : 'Preview: Highlight snippets',
      icon: 'eye',
      run: () => updateSettings({ previewHighlights: !settings.previewHighlights }),
    },
    ...(openNote
      ? [{ id: 'favorite', label: openNote.favorite ? 'Remove from favorites' : 'Add to favorites', icon: 'star' as const, run: toggleFavorite }]
      : []),
    { id: 'map', label: 'Snippet map', icon: 'map', run: () => setMapOpen(true) },
    { id: 'sidebar', label: sidebarVisible ? 'Hide sidebar' : 'Show sidebar', icon: 'sidebar', shortcut: `${MOD_LABEL} \\`, run: () => setSidebar(!sidebarVisible) },
    { id: 'theme-light', label: 'Theme: Light', icon: 'sun', run: () => setTheme('light') },
    { id: 'theme-dark', label: 'Theme: Dark', icon: 'moon', run: () => setTheme('dark') },
    { id: 'theme-system', label: 'Theme: Match system', icon: 'settings', run: () => setTheme('system') },
    { id: 'font-serif', label: 'Font: Serif', icon: 'type', run: () => setFont('serif') },
    { id: 'font-sans', label: 'Font: Sans', icon: 'type', run: () => setFont('sans') },
    { id: 'font-mono', label: 'Font: Mono', icon: 'type', run: () => setFont('mono') },
    { id: 'export', label: 'Export backup', icon: 'download', run: exportBackup },
    { id: 'import', label: 'Import backup', icon: 'upload', run: importBackup },
    { id: 'settings', label: 'Settings', icon: 'settings', run: () => setSettingsOpen(true) },
    { id: 'delete', label: openDoc?.kind === 'snippet' ? 'Delete this snippet' : 'Delete this note', icon: 'trash', run: () => requestDelete() },
  ]

  const paletteItems: PaletteItem[] = paletteOpen
    ? [
        ...notes.map((note) => ({
          id: documentKey({ kind: 'note', id: note.id }),
          group: 'Notes' as const,
          label: noteTitle(note.body),
          detail: notePreview(note.body),
          icon: 'note' as const,
          searchText: note.body,
          run: () => open({ kind: 'note', id: note.id }),
        })),
        ...snippets.map((snippet) => ({
          id: documentKey({ kind: 'snippet', id: snippet.id }),
          group: 'Snippets' as const,
          label: `@${snippet.name}`,
          detail: snippet.body.split('\n')[0],
          icon: 'at' as const,
          searchText: `${snippet.name} ${snippet.body}`,
          run: () => open({ kind: 'snippet', id: snippet.id }),
        })),
        ...commands.map((command) => ({
          id: `command:${command.id}`,
          label: command.label,
          icon: command.icon,
          shortcut: command.shortcut,
          group: 'Commands' as const,
          searchText: command.label,
          run: () => void command.run(),
        })),
      ]
    : []

  const classes = [
    'app',
    `font-${settings.font}`,
    sidebarVisible ? 'has-sidebar' : 'no-sidebar',
    isNarrow ? 'is-narrow' : '',
    isWriting && !previewing && !paletteOpen && !settingsOpen && !deleteTarget && !extracting && !mapOpen ? 'is-writing' : '',
  ]

  const sidebarProps = {
    notes,
    snippets,
    openDoc,
    collapsedSections: settings.collapsedSections,
    onToggleSection: toggleSection,
    referenceCounts,
    snippetParents,
    snippetSort: settings.snippetSort,
    onSnippetSortChange: (snippetSort: SnippetSort) => updateSettings({ snippetSort }),
    expandedSnippets: settings.expandedSnippets,
    onToggleSnippet: toggleSnippetExpanded,
    onOpen: open,
    onDelete: (doc: DocumentRef) => requestDelete(doc),
    onNewNote: () => {
      if (isNarrow) setDrawerOpen(false)
      void workspace.newNote()
    },
    onNewSnippet: () => {
      if (isNarrow) setDrawerOpen(false)
      void workspace.newSnippet()
    },
    onShowMap: () => {
      if (isNarrow) setDrawerOpen(false)
      setMapOpen(true)
    },
    onSearch: () => setPaletteOpen(true),
    onSettings: () => setSettingsOpen(true),
  }

  return (
    <div className={classes.filter(Boolean).join(' ')}>
      {sidebarVisible && isNarrow && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}
      {sidebarVisible ? (
        <Sidebar
          {...sidebarProps}
          onClose={(byPointer) => {
            setSidebar(false)
            peekHeld.current = byPointer === true
          }}
        />
      ) : (
        !isNarrow && (
          <Sidebar
            {...sidebarProps}
            onSearch={() => {
              stopPeek()
              setPaletteOpen(true)
            }}
            onSettings={() => {
              stopPeek()
              setSettingsOpen(true)
            }}
            onShowMap={() => {
              stopPeek()
              setMapOpen(true)
            }}
            onClose={stopPeek}
            peek={{ open: peeking, onPin: () => setSidebar(true), onPointerEnter: startPeek, onPointerLeave: endPeek }}
          />
        )
      )}

      <main className="stage">
        <TopBar
          sidebarOpen={sidebarVisible}
          isSnippet={openSnippet !== undefined}
          returnTo={returnToNote}
          previewing={previewing}
          favorite={openNote ? openNote.favorite === true : undefined}
          onShowSidebar={() => setSidebar(true)}
          onPeekSidebar={startPeek}
          onEndPeek={() => {
            peekHeld.current = false
            endPeek()
          }}
          onNewNote={() => void workspace.newNote()}
          onReturn={() => workspace.returnTo && open(workspace.returnTo)}
          onTogglePreview={togglePreview}
          onCopy={() => void workspace.copyCurrent()}
          onDelete={() => requestDelete()}
          onToggleFavorite={toggleFavorite}
        />
        <div className={`page${previewing ? ' is-previewing' : ''}`} data-kind={openDoc?.kind}>
          {openSnippet && (
            <SnippetHeader
              snippet={openSnippet}
              users={openSnippetUsers}
              parentName={snippetParents.get(openSnippet.name)}
              focusName={workspace.focusNameFor === openSnippet.id}
              onRename={workspace.renameOpenSnippet}
              onNameDone={focusEditor}
              onOpenSnippet={(name) => void workspace.openSnippetByName(name)}
              onOpen={open}
              onShowMap={() => setMapOpen(true)}
            />
          )}
          {workspace.editorDocument && (
            <Editor
              ref={editorRef}
              document={workspace.editorDocument}
              snippets={snippetBodies}
              placeholderText={openDoc?.kind === 'snippet' ? SNIPPET_PLACEHOLDER : NOTE_PLACEHOLDER}
              onChange={workspace.handleChange}
              onOpenSnippet={(name) => void workspace.openSnippetByName(name)}
              onCreateSnippet={(name) => void workspace.createSnippetInBackground(name)}
              onExtract={startExtract}
            />
          )}
          {previewing && (
            <NotePreview
              text={text}
              snippets={snippetBodies}
              highlights={settings.previewHighlights}
              onOpenSnippet={(name) => void workspace.openSnippetByName(name)}
              onExit={exitPreview}
            />
          )}
        </div>
        {openDocRecord && <StatusBar text={previewing ? expandedText : text} expandedText={expandedText} saveStatus={workspace.saveStatus} />}
      </main>

      {mapOpen && <SnippetMap notes={notes} snippets={snippets} openDoc={openDoc} onOpen={open} onClose={closeMap} />}
      {paletteOpen && <CommandPalette items={paletteItems} onClose={closePalette} />}
      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          storagePersisted={storagePersisted}
          noteCount={notes.length}
          snippetCount={snippets.length}
          onChange={updateSettings}
          onExport={() => void exportBackup()}
          onImport={() => void importBackup()}
          onClose={closeSettings}
        />
      )}
      {deleteTarget && (
        <DeleteDialog
          {...deleteCopy(deleteSnippetTarget, snippetUses(deleteSnippetTarget), documentText(deleteTarget))}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
      {extracting && (
        <ExtractDialog
          text={extracting.text}
          suggestedName={uniqueName(suggestSnippetName(extracting.text), new Set(snippetBodies.keys()))}
          onConfirm={confirmExtract}
          onCancel={cancelExtract}
        />
      )}
      <ToastView toast={toast} onDismiss={dismissToast} />
    </div>
  )
}

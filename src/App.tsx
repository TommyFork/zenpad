import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { documentKey, type DocumentRef } from './app/documents'
import { hasModifier, MOD_LABEL } from './app/keys'
import { useLibrary } from './app/useLibrary'
import { useMediaQuery } from './app/useMediaQuery'
import { useToast } from './app/useToast'
import { useWorkspace } from './app/useWorkspace'
import { useWritingFocus } from './app/useWritingFocus'
import { CommandPalette, type PaletteItem } from './components/CommandPalette'
import { DeleteDialog } from './components/DeleteDialog'
import { NotePreview } from './components/NotePreview'
import type { IconName } from './components/Icon'
import { SettingsPanel } from './components/SettingsPanel'
import { SnippetHeader } from './components/SnippetHeader'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { ToastView } from './components/ToastView'
import { TopBar } from './components/TopBar'
import { Editor } from './editor/Editor'
import { BackupError } from './lib/backup'
import { downloadJson, pickFile } from './lib/files'
import type { Snippet } from './lib/db'
import { exportLibrary, importLibrary, requestPersistentStorage, seedOnFirstLaunch, setNoteFavorite } from './lib/library'
import { notePreview, noteTitle } from './lib/notes'
import { useSettings, type EditorFont, type SidebarSection, type Theme } from './lib/settings'
import { expandSnippets, referencedSnippetNames } from './lib/snippets'

const NARROW_SCREEN = '(max-width: 760px)'
const NOTE_PLACEHOLDER = 'Start writing…'
const SNIPPET_PLACEHOLDER = 'Write the text this snippet stands for…'

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

function deleteCopy(snippet: Snippet | undefined, usageCount: number, text: string): { title: string; detail: string } {
  const undoHint = 'You can undo this for a few seconds afterwards.'
  if (!snippet) return { title: `Delete “${noteTitle(text)}”?`, detail: undoHint }
  if (usageCount === 0) return { title: `Delete @${snippet.name}?`, detail: undoHint }
  const notes = `${usageCount} ${usageCount === 1 ? 'note uses' : 'notes use'}`
  return { title: `Delete @${snippet.name}?`, detail: `${notes} it. They'll keep @${snippet.name} as plain text. ${undoHint}` }
}

function applyTheme(theme: Theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
}

export default function App() {
  const [settings, updateSettings] = useSettings()
  const library = useLibrary()
  const { notes, snippets, snippetBodies } = library
  const { toast, showToast, dismissToast } = useToast()
  const workspace = useWorkspace(library, showToast)
  const isNarrow = useMediaQuery(NARROW_SCREEN)
  const isWriting = useWritingFocus()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [deleteRequested, setDeleteRequested] = useState(false)
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

  const setSidebar = useCallback(
    (open: boolean) => (isNarrow ? setDrawerOpen(open) : updateSettings({ sidebarOpen: open })),
    [isNarrow, updateSettings],
  )

  const closePalette = useCallback(() => {
    setPaletteOpen(false)
    focusEditor()
  }, [])

  const cancelDelete = useCallback(() => {
    setDeleteRequested(false)
    focusEditor()
  }, [])

  // Blank notes have nothing to lose, so they skip the confirmation.
  function requestDelete() {
    if (text.trim() === '') void workspace.deleteCurrent()
    else setDeleteRequested(true)
  }

  function confirmDelete() {
    setDeleteRequested(false)
    void workspace.deleteCurrent()
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
    if (paletteOpen || settingsOpen || deleteRequested) return
    setPreviewKey(null)
    requestAnimationFrame(focusEditor)
  }, [paletteOpen, settingsOpen, deleteRequested])

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

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
    focusEditor()
  }, [])

  const expandedText = useMemo(() => expandSnippets(text, snippetBodies), [text, snippetBodies])

  const usageCount = useMemo(
    () => (openSnippet ? notes.filter((note) => referencedSnippetNames(note.body).includes(openSnippet.name)).length : 0),
    [notes, openSnippet],
  )

  function open(doc: DocumentRef) {
    if (isNarrow) setDrawerOpen(false)
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
    { id: 'copy', label: 'Copy with snippets filled in', icon: 'copy', shortcut: `${MOD_LABEL} ↵`, run: workspace.copyCurrent },
    {
      id: 'preview',
      label: previewing ? 'Back to editing' : 'Preview with snippets filled in',
      icon: previewing ? 'pencil' : 'eye',
      shortcut: `${MOD_LABEL} E`,
      run: togglePreview,
    },
    ...(openNote
      ? [{ id: 'favorite', label: openNote.favorite ? 'Remove from favorites' : 'Add to favorites', icon: 'star' as const, run: toggleFavorite }]
      : []),
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
    { id: 'delete', label: openDoc?.kind === 'snippet' ? 'Delete this snippet' : 'Delete this note', icon: 'trash', run: requestDelete },
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
    isWriting && !previewing && !paletteOpen && !settingsOpen && !deleteRequested ? 'is-writing' : '',
  ]

  return (
    <div className={classes.filter(Boolean).join(' ')}>
      {sidebarVisible && (
        <>
          {isNarrow && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}
          <Sidebar
            notes={notes}
            snippets={snippets}
            openDoc={openDoc}
            collapsedSections={settings.collapsedSections}
            onToggleSection={toggleSection}
            onOpen={open}
            onNewNote={() => {
              if (isNarrow) setDrawerOpen(false)
              void workspace.newNote()
            }}
            onNewSnippet={() => {
              if (isNarrow) setDrawerOpen(false)
              void workspace.newSnippet()
            }}
            onSearch={() => setPaletteOpen(true)}
            onSettings={() => setSettingsOpen(true)}
            onClose={() => setSidebar(false)}
          />
        </>
      )}

      <main className="stage">
        <TopBar
          sidebarOpen={sidebarVisible}
          isSnippet={openSnippet !== undefined}
          returnTo={returnToNote}
          previewing={previewing}
          favorite={openNote ? openNote.favorite === true : undefined}
          onShowSidebar={() => setSidebar(true)}
          onReturn={() => workspace.returnTo && open(workspace.returnTo)}
          onTogglePreview={togglePreview}
          onCopy={() => void workspace.copyCurrent()}
          onDelete={requestDelete}
          onToggleFavorite={toggleFavorite}
        />
        <div className={`page${previewing ? ' is-previewing' : ''}`} data-kind={openDoc?.kind}>
          {openSnippet && (
            <SnippetHeader
              snippet={openSnippet}
              usageCount={usageCount}
              focusName={workspace.focusNameFor === openSnippet.id}
              onRename={workspace.renameOpenSnippet}
              onNameDone={focusEditor}
            />
          )}
          {workspace.editorDocument && (
            <Editor
              document={workspace.editorDocument}
              snippets={snippetBodies}
              placeholderText={openDoc?.kind === 'snippet' ? SNIPPET_PLACEHOLDER : NOTE_PLACEHOLDER}
              onChange={workspace.handleChange}
              onOpenSnippet={(name) => void workspace.openSnippetByName(name)}
              onCreateSnippet={(name) => void workspace.createSnippetInBackground(name)}
            />
          )}
          {previewing && (
            <NotePreview
              text={text}
              snippets={snippetBodies}
              highlights={settings.previewHighlights}
              onToggleHighlights={() => updateSettings({ previewHighlights: !settings.previewHighlights })}
              onOpenSnippet={(name) => void workspace.openSnippetByName(name)}
              onExit={exitPreview}
            />
          )}
        </div>
        {openDocRecord && <StatusBar text={previewing ? expandedText : text} expandedText={expandedText} saveStatus={workspace.saveStatus} />}
      </main>

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
      {deleteRequested && <DeleteDialog {...deleteCopy(openSnippet, usageCount, text)} onConfirm={confirmDelete} onCancel={cancelDelete} />}
      <ToastView toast={toast} onDismiss={dismissToast} />
    </div>
  )
}

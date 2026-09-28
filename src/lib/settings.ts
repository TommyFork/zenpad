import { useCallback, useEffect, useState } from 'react'
import type { SnippetSort } from './snippets'

export type Theme = 'system' | 'light' | 'dark'
export type EditorFont = 'serif' | 'sans' | 'mono'
export type Accent = 'lake' | 'sage' | 'clay' | 'plum' | 'graphite'
export type SidebarSection = 'favorites' | 'notes' | 'snippets'
export type NoteGrouping = 'none' | 'date'

export interface Settings {
  theme: Theme
  accent: Accent
  font: EditorFont
  sidebarOpen: boolean
  // Tints the text each snippet filled in when previewing a note.
  previewHighlights: boolean
  collapsedSections: SidebarSection[]
  // Splits the Notes list under headings like Today, Yesterday, and Previous 7 days.
  noteGrouping: NoteGrouping
  snippetSort: SnippetSort
  // Snippets whose nested snippets are shown in the sidebar, by id.
  expandedSnippets: string[]
}

const STORAGE_KEY = 'zenpad.settings'

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: 'lake',
  font: 'serif',
  sidebarOpen: true,
  previewHighlights: true,
  collapsedSections: [],
  noteGrouping: 'date',
  snippetSort: 'name',
  expandedSnippets: [],
}

function readSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? { ...DEFAULT_SETTINGS, ...(JSON.parse(stored) as Partial<Settings>) } : DEFAULT_SETTINGS
  } catch (error) {
    console.warn('Zenpad: could not read settings, using defaults.', error)
    return DEFAULT_SETTINGS
  }
}

function writeSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.warn('Zenpad: could not save settings.', error)
  }
}

export function useSettings() {
  const [settings, setSettings] = useState(readSettings)

  useEffect(() => writeSettings(settings), [settings])

  const updateSettings = useCallback((changes: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...changes }))
  }, [])

  return [settings, updateSettings] as const
}

const LAST_OPENED_KEY = 'zenpad.lastOpened'

export function readLastOpened(): string | null {
  try {
    return localStorage.getItem(LAST_OPENED_KEY)
  } catch (error) {
    console.warn('Zenpad: could not read the last opened note.', error)
    return null
  }
}

export function writeLastOpened(key: string): void {
  try {
    localStorage.setItem(LAST_OPENED_KEY, key)
  } catch (error) {
    console.warn('Zenpad: could not remember the last opened note.', error)
  }
}

import { useCallback, useRef } from 'react'
import type { EditorHandle, EditorSelection } from './Editor'

// Lets the app read and replace the editor's selection from commands and dialogs.
export function useEditorHandle() {
  const ref = useRef<EditorHandle>(null)
  const selection = useCallback(() => ref.current?.selection() ?? null, [])
  const replace = useCallback((range: EditorSelection, insert: string) => ref.current?.replace(range, insert) ?? false, [])
  const insert = useCallback((text: string) => ref.current?.insert(text) ?? false, [])
  const toggleChecklist = useCallback(() => ref.current?.toggleChecklist(), [])
  return { ref, selection, replace, insert, toggleChecklist }
}

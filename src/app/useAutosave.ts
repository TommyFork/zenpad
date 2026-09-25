import { useCallback, useEffect, useRef, useState } from 'react'
import { saveNoteBody, saveSnippetBody } from '../lib/library'
import type { DocumentRef } from './documents'

const SAVE_DELAY_MS = 400

export type SaveStatus = 'saved' | 'saving' | 'failed'

interface PendingSave {
  doc: DocumentRef
  body: string
}

function persist({ doc, body }: PendingSave): Promise<void> {
  return doc.kind === 'note' ? saveNoteBody(doc.id, body) : saveSnippetBody(doc.id, body)
}

export function useAutosave(onError: (error: unknown) => void) {
  const [status, setStatus] = useState<SaveStatus>('saved')
  const pending = useRef<PendingSave | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onErrorRef.current = onError
  })

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current)
    const save = pending.current
    if (!save) return
    pending.current = null
    try {
      await persist(save)
      if (!pending.current) setStatus('saved')
    } catch (error) {
      pending.current ??= save
      setStatus('failed')
      onErrorRef.current(error)
    }
  }, [])

  const schedule = useCallback(
    (doc: DocumentRef, body: string) => {
      pending.current = { doc, body }
      setStatus('saving')
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(flush, SAVE_DELAY_MS)
    },
    [flush],
  )

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    document.addEventListener('visibilitychange', flushWhenHidden)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flushWhenHidden)
      window.removeEventListener('pagehide', flush)
    }
  }, [flush])

  return { status, schedule, flush }
}

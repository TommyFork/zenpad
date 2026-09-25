import { useCallback, useEffect, useRef, useState } from 'react'

const TOAST_DURATION_MS = 4200
const TOAST_WITH_ACTION_DURATION_MS = 7000

export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: number
  message: string
  action?: ToastAction
}

export type ShowToast = (message: string, action?: ToastAction) => void

export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null)
  const nextId = useRef(0)

  const showToast = useCallback<ShowToast>((message, action) => {
    nextId.current += 1
    setToast({ id: nextId.current, message, action })
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(dismissToast, toast.action ? TOAST_WITH_ACTION_DURATION_MS : TOAST_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [toast, dismissToast])

  return { toast, showToast, dismissToast }
}

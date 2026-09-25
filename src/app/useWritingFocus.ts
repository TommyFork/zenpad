import { useEffect, useState } from 'react'

// Pointer movement smaller than this is treated as a bump of the trackpad, not intent to leave writing.
const POINTER_WAKE_DISTANCE = 12

// True while the person is typing, so surrounding chrome can fade away until the pointer moves.
export function useWritingFocus(): boolean {
  const [isWriting, setIsWriting] = useState(false)

  useEffect(() => {
    let pointerAnchor: { x: number; y: number } | null = null

    function startWriting(event: KeyboardEvent) {
      const typedCharacter = event.key.length === 1 || event.key === 'Enter' || event.key === 'Backspace'
      const inEditor = event.target instanceof HTMLElement && event.target.closest('.cm-content') !== null
      if (!typedCharacter || !inEditor || event.metaKey || event.ctrlKey) return
      pointerAnchor = null
      setIsWriting(true)
    }

    function stopWriting(event: PointerEvent) {
      if (!pointerAnchor) {
        pointerAnchor = { x: event.clientX, y: event.clientY }
        return
      }
      if (Math.hypot(event.clientX - pointerAnchor.x, event.clientY - pointerAnchor.y) >= POINTER_WAKE_DISTANCE) setIsWriting(false)
    }

    window.addEventListener('keydown', startWriting)
    window.addEventListener('pointermove', stopWriting)
    return () => {
      window.removeEventListener('keydown', startWriting)
      window.removeEventListener('pointermove', stopWriting)
    }
  }, [])

  return isWriting
}

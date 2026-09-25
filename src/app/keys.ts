import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.userAgent)

export const MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl'

export function hasModifier(event: KeyboardEvent | ReactKeyboardEvent): boolean {
  return IS_MAC ? event.metaKey : event.ctrlKey
}

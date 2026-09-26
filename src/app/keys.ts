export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.userAgent)

export const MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl'

export function hasModifier(event: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return IS_MAC ? event.metaKey : event.ctrlKey
}

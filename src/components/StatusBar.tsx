import type { SaveStatus } from '../app/useAutosave'
import { countWords, estimateTokens } from '../lib/notes'

const SAVE_LABELS: Record<SaveStatus, string> = {
  saved: 'Saved',
  saving: 'Saving',
  failed: 'Not saved',
}

interface StatusBarProps {
  text: string
  expandedText: string
  saveStatus: SaveStatus
}

function formatCount(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(count)
}

export function StatusBar({ text, expandedText, saveStatus }: StatusBarProps) {
  const words = countWords(text)
  const tokens = estimateTokens(expandedText)
  return (
    <footer className="statusbar" aria-live="polite">
      <span>
        {formatCount(words)} {words === 1 ? 'word' : 'words'}
      </span>
      <span className="dot" aria-hidden="true" />
      <span title="Estimated tokens once snippets are filled in">~{formatCount(tokens)} tokens</span>
      <span className="dot" aria-hidden="true" />
      <span className={`save-status is-${saveStatus}`}>{SAVE_LABELS[saveStatus]}</span>
    </footer>
  )
}

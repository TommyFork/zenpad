import { MOD_LABEL } from '../app/keys'
import type { Note } from '../lib/db'
import { noteTitle } from '../lib/notes'
import { Icon } from './Icon'

interface TopBarProps {
  sidebarOpen: boolean
  isSnippet: boolean
  returnTo: Note | undefined
  previewing: boolean
  onShowSidebar: () => void
  onReturn: () => void
  onTogglePreview: () => void
  onCopy: () => void
  onDelete: () => void
}

export function TopBar({ sidebarOpen, isSnippet, returnTo, previewing, onShowSidebar, onReturn, onTogglePreview, onCopy, onDelete }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-start">
        {!sidebarOpen && (
          <button className="icon-button" onClick={onShowSidebar} aria-label="Show sidebar" title={`Show sidebar  ${MOD_LABEL} \\`}>
            <Icon name="sidebar" />
          </button>
        )}
        {returnTo && (
          <button className="back-link" onClick={onReturn} title="Back to your note">
            <Icon name="back" size={16} />
            <span>{noteTitle(returnTo.body)}</span>
          </button>
        )}
      </div>

      <div className="topbar-end">
        <button
          className={`preview-button${previewing ? ' is-active' : ''}`}
          onClick={onTogglePreview}
          aria-pressed={previewing}
          title={previewing ? `Back to editing  ${MOD_LABEL} E` : `Preview with snippets filled in  ${MOD_LABEL} E`}
        >
          <Icon name={previewing ? 'pencil' : 'eye'} size={16} />
          <span>{previewing ? 'Edit' : 'Preview'}</span>
        </button>
        <button className="icon-button" onClick={onDelete} aria-label={isSnippet ? 'Delete snippet' : 'Delete note'} title="Delete">
          <Icon name="trash" />
        </button>
        <button className="copy-button" onClick={onCopy} title={`Copy with snippets filled in  ${MOD_LABEL} Enter`}>
          <Icon name="copy" size={16} />
          <span>Copy</span>
        </button>
      </div>
    </header>
  )
}

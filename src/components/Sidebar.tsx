import type { ReactNode } from 'react'
import { isSameDocument, type DocumentRef } from '../app/documents'
import { MOD_LABEL } from '../app/keys'
import { useNow } from '../app/useNow'
import type { Note, Snippet } from '../lib/db'
import { notePreview, noteTitle } from '../lib/notes'
import type { SidebarSection } from '../lib/settings'
import { formatRelativeTime } from '../lib/time'
import { GitHubIcon, Icon } from './Icon'

const RELATIVE_TIME_REFRESH_MS = 30_000
const REPOSITORY_URL = 'https://github.com/TommyFork/zenpad'

interface SidebarProps {
  notes: Note[]
  snippets: Snippet[]
  openDoc: DocumentRef | null
  collapsedSections: SidebarSection[]
  onToggleSection: (section: SidebarSection) => void
  onOpen: (doc: DocumentRef) => void
  onNewNote: () => void
  onNewSnippet: () => void
  onSearch: () => void
  onSettings: () => void
  onClose: () => void
}

interface SectionProps {
  id: SidebarSection
  title: string
  collapsed: boolean
  onToggle: (section: SidebarSection) => void
  action?: ReactNode
  children: ReactNode
}

function Section({ id, title, collapsed, onToggle, action, children }: SectionProps) {
  const bodyId = `sidebar-section-${id}`
  return (
    <section className={collapsed ? 'sidebar-section is-collapsed' : 'sidebar-section'}>
      <div className="section-head">
        <h2>
          <button className="section-toggle" aria-expanded={!collapsed} aria-controls={bodyId} onClick={() => onToggle(id)}>
            <Icon name="chevron" size={12} />
            <span>{title}</span>
          </button>
        </h2>
        {action}
      </div>
      {!collapsed && <div id={bodyId}>{children}</div>}
    </section>
  )
}

export function Sidebar({
  notes,
  snippets,
  openDoc,
  collapsedSections,
  onToggleSection,
  onOpen,
  onNewNote,
  onNewSnippet,
  onSearch,
  onSettings,
  onClose,
}: SidebarProps) {
  const now = useNow(RELATIVE_TIME_REFRESH_MS)
  const favorites = notes.filter((note) => note.favorite)
  const otherNotes = notes.filter((note) => !note.favorite)
  const isCollapsed = (section: SidebarSection) => collapsedSections.includes(section)

  function noteList(list: Note[]) {
    return (
      <ul className="doc-list">
        {list.map((note) => {
          const doc: DocumentRef = { kind: 'note', id: note.id }
          const preview = notePreview(note.body)
          return (
            <li key={note.id}>
              <button
                className="doc-item"
                aria-current={isSameDocument(openDoc, doc) ? 'page' : undefined}
                onClick={() => onOpen(doc)}
              >
                <span className="doc-item-row">
                  <span className={note.body.trim() ? 'doc-title' : 'doc-title is-empty'}>{noteTitle(note.body)}</span>
                  <time className="doc-time">{formatRelativeTime(note.updatedAt, now)}</time>
                </span>
                {preview && <span className="doc-preview">{preview}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <aside className="sidebar" aria-label="Library">
      <div className="sidebar-head">
        <span className="wordmark">Zenpad</span>
        <button className="icon-button" onClick={onClose} aria-label="Hide sidebar" title={`Hide sidebar  ${MOD_LABEL} \\`}>
          <Icon name="sidebar" />
        </button>
      </div>

      <button className="search-trigger" onClick={onSearch}>
        <Icon name="search" size={16} />
        <span>Search</span>
        <kbd>{MOD_LABEL} K</kbd>
      </button>

      <div className="sidebar-scroll">
        {favorites.length > 0 && (
          <Section id="favorites" title="Favorites" collapsed={isCollapsed('favorites')} onToggle={onToggleSection}>
            {noteList(favorites)}
          </Section>
        )}

        <Section
          id="notes"
          title="Notes"
          collapsed={isCollapsed('notes')}
          onToggle={onToggleSection}
          action={
            <button className="icon-button small" onClick={onNewNote} aria-label="New note" title="New note">
              <Icon name="plus" size={16} />
            </button>
          }
        >
          {otherNotes.length === 0 ? <p className="section-empty">Every note is in Favorites.</p> : noteList(otherNotes)}
        </Section>

        <Section
          id="snippets"
          title="Snippets"
          collapsed={isCollapsed('snippets')}
          onToggle={onToggleSection}
          action={
            <button className="icon-button small" onClick={onNewSnippet} aria-label="New snippet" title="New snippet">
              <Icon name="plus" size={16} />
            </button>
          }
        >
          {snippets.length === 0 ? (
            <p className="section-empty">
              Save text you reuse, then type <span className="inline-chip">@name</span> in any note to drop it in.
            </p>
          ) : (
            <ul className="doc-list">
              {snippets.map((snippet) => {
                const doc: DocumentRef = { kind: 'snippet', id: snippet.id }
                return (
                  <li key={snippet.id}>
                    <button
                      className="doc-item snippet-item"
                      aria-current={isSameDocument(openDoc, doc) ? 'page' : undefined}
                      onClick={() => onOpen(doc)}
                    >
                      <span className="snippet-name">@{snippet.name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>
      </div>

      <div className="sidebar-foot">
        <button className="foot-button" onClick={onSettings}>
          <Icon name="settings" size={16} />
          <span>Settings</span>
        </button>
        <a className="icon-button" href={REPOSITORY_URL} target="_blank" rel="noreferrer" aria-label="Zenpad on GitHub" title="Zenpad on GitHub">
          <GitHubIcon size={17} />
        </a>
      </div>
    </aside>
  )
}

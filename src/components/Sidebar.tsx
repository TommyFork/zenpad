import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { isSameDocument, type DocumentRef } from '../app/documents'
import { MOD_LABEL } from '../app/keys'
import { useNow } from '../app/useNow'
import type { Note, Snippet } from '../lib/db'
import { notePreview, noteTitle } from '../lib/notes'
import type { SidebarSection } from '../lib/settings'
import { buildSnippetTree, snippetAncestors, type SnippetNode, type SnippetSort } from '../lib/snippets'
import { formatRelativeTime } from '../lib/time'
import { GitHubIcon, Icon } from './Icon'

const RELATIVE_TIME_REFRESH_MS = 30_000
const REPOSITORY_URL = 'https://github.com/TommyFork/zenpad'

const SNIPPET_SORTS: { id: SnippetSort; label: string; description: string }[] = [
  { id: 'name', label: 'A–Z', description: 'by name' },
  { id: 'references', label: 'Most used', description: 'by most referenced' },
  { id: 'edited', label: 'Recent', description: 'by last edited' },
]

function usageLabel(count: number): string {
  if (count === 0) return 'unused'
  return count === 1 ? '1 use' : `${count} uses`
}

interface SidebarProps {
  notes: Note[]
  snippets: Snippet[]
  openDoc: DocumentRef | null
  collapsedSections: SidebarSection[]
  onToggleSection: (section: SidebarSection) => void
  referenceCounts: ReadonlyMap<string, number>
  snippetParents: ReadonlyMap<string, string>
  snippetSort: SnippetSort
  onSnippetSortChange: (sort: SnippetSort) => void
  expandedSnippets: string[]
  onToggleSnippet: (id: string) => void
  onOpen: (doc: DocumentRef) => void
  onDelete: (doc: DocumentRef) => void
  onNewNote: () => void
  onNewSnippet: () => void
  onShowMap: () => void
  onSearch: () => void
  onSettings: () => void
  // byPointer is true when the header button was clicked, which leaves the pointer over the show-sidebar button.
  onClose: (byPointer?: boolean) => void
  // Set when the sidebar is hidden and slides in over the page while the pointer rests on it.
  peek?: {
    open: boolean
    onPin: () => void
    onPointerEnter: () => void
    onPointerLeave: () => void
  }
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
  referenceCounts,
  snippetParents,
  snippetSort,
  onSnippetSortChange,
  expandedSnippets,
  onToggleSnippet,
  onOpen,
  onDelete,
  onNewNote,
  onNewSnippet,
  onShowMap,
  onSearch,
  onSettings,
  onClose,
  peek,
}: SidebarProps) {
  const now = useNow(RELATIVE_TIME_REFRESH_MS)
  const favorites = notes.filter((note) => note.favorite)
  const otherNotes = notes.filter((note) => !note.favorite)
  const isCollapsed = (section: SidebarSection) => collapsedSections.includes(section)
  const snippetTree = useMemo(
    () => buildSnippetTree(snippets, snippetParents, snippetSort, referenceCounts),
    [snippets, snippetParents, snippetSort, referenceCounts],
  )
  // The open snippet's parents stay expanded so it is always visible in the list.
  const openSnippetName = snippets.find((snippet) => snippet.id === openDoc?.id)?.name
  const revealed = new Set(openSnippetName ? snippetAncestors(openSnippetName, snippetParents) : [])
  const sortIndex = Math.max(0, SNIPPET_SORTS.findIndex((sort) => sort.id === snippetSort))
  const currentSort = SNIPPET_SORTS[sortIndex]
  const nextSort = SNIPPET_SORTS[(sortIndex + 1) % SNIPPET_SORTS.length]

  function deleteButton(doc: DocumentRef, label: string) {
    return (
      <button className="doc-delete" onClick={() => onDelete(doc)} aria-label={`Delete ${label}`} title="Delete">
        <Icon name="trash" size={15} />
      </button>
    )
  }

  function noteList(list: Note[]) {
    return (
      <ul className="doc-list">
        {list.map((note) => {
          const doc: DocumentRef = { kind: 'note', id: note.id }
          const preview = notePreview(note.body)
          return (
            <li key={note.id} className="doc-row">
              <div className="doc-entry">
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
                {deleteButton(doc, `note “${noteTitle(note.body)}”`)}
              </div>
            </li>
          )
        })}
      </ul>
    )
  }

  function snippetItem({ snippet, children }: SnippetNode<Snippet>, depth: number) {
    const doc: DocumentRef = { kind: 'snippet', id: snippet.id }
    const uses = referenceCounts.get(snippet.name) ?? 0
    const expanded = children.length > 0 && (expandedSnippets.includes(snippet.id) || revealed.has(snippet.name))
    const childrenId = `snippet-children-${snippet.id}`
    return (
      <li key={snippet.id} className="doc-row snippet-node" style={{ '--depth': depth } as CSSProperties}>
        {children.length > 0 && (
          <button
            className="snippet-twisty"
            aria-expanded={expanded}
            aria-controls={childrenId}
            aria-label={`${expanded ? 'Hide' : 'Show'} snippets inside @${snippet.name}`}
            title={`${children.length} ${children.length === 1 ? 'snippet' : 'snippets'} inside`}
            onClick={() => onToggleSnippet(snippet.id)}
          >
            <Icon name="chevron" size={12} />
          </button>
        )}
        <div className="doc-entry">
          <button
            className="doc-item snippet-item"
            aria-current={isSameDocument(openDoc, doc) ? 'page' : undefined}
            onClick={() => onOpen(doc)}
          >
            <span className="doc-item-row">
              <span className="snippet-name">@{snippet.name}</span>
              {snippetSort === 'references' && <span className="doc-time">{usageLabel(uses)}</span>}
              {snippetSort === 'edited' && <time className="doc-time">{formatRelativeTime(snippet.updatedAt, now)}</time>}
            </span>
          </button>
          {deleteButton(doc, `snippet @${snippet.name}`)}
        </div>
        {expanded && (
          <ul id={childrenId} className="doc-list">
            {children.map((child) => snippetItem(child, depth + 1))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <aside
      className={peek ? `sidebar is-peek${peek.open ? ' is-open' : ''}` : 'sidebar'}
      aria-label="Library"
      inert={peek && !peek.open}
      onPointerEnter={peek?.onPointerEnter}
      onPointerLeave={peek?.onPointerLeave}
    >
      {/* The toggle sits where the top bar's show-sidebar button does, so opening and closing is one spot. */}
      <div className="sidebar-head">
        {peek ? (
          <button className="icon-button" onClick={peek.onPin} aria-label="Keep sidebar open" title={`Keep sidebar open  ${MOD_LABEL} \\`}>
            <Icon name="sidebar" />
          </button>
        ) : (
          <button className="icon-button" onClick={(event) => onClose(event.detail > 0)} aria-label="Hide sidebar" title={`Hide sidebar  ${MOD_LABEL} \\`}>
            <Icon name="sidebar" />
          </button>
        )}
        <button className="icon-button" onClick={onNewNote} aria-label="New note" title={`New note  ${MOD_LABEL} ⌥ N`}>
          <Icon name="compose" />
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
            <div className="section-actions">
              {snippets.length > 1 && (
                <button
                  className="sort-button"
                  onClick={() => onSnippetSortChange(nextSort.id)}
                  aria-label={`Sorted ${currentSort.description}. Sort ${nextSort.description}`}
                  title={`Sort ${nextSort.description}`}
                >
                  {currentSort.label}
                </button>
              )}
              {snippets.length > 0 && (
                <button className="icon-button small" onClick={onShowMap} aria-label="Snippet map" title="Snippet map">
                  <Icon name="map" size={16} />
                </button>
              )}
              <button className="icon-button small" onClick={onNewSnippet} aria-label="New snippet" title="New snippet">
                <Icon name="plus" size={16} />
              </button>
            </div>
          }
        >
          {snippets.length === 0 ? (
            <p className="section-empty">
              Save text you reuse, then type <span className="inline-chip">@name</span> in any note to drop it in.
            </p>
          ) : (
            <ul className="doc-list">{snippetTree.map((node) => snippetItem(node, 0))}</ul>
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

      {/* The right-hand border doubles as a hide control. Keyboard users have the button in the header. */}
      <div className="sidebar-edge" onClick={() => onClose()} title="Hide sidebar" aria-hidden="true" />
    </aside>
  )
}

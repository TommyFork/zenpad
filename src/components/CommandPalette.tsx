import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useEscape } from '../app/useEscape'
import { queryTerms, rankItems } from '../lib/search'
import { Icon, type IconName } from './Icon'

export type PaletteGroup = 'Notes' | 'Snippets' | 'Commands'

export interface PaletteItem {
  id: string
  group: PaletteGroup
  label: string
  detail?: string
  shortcut?: string
  icon: IconName
  searchText: string
  run: () => void
}

const GROUP_ORDER: PaletteGroup[] = ['Notes', 'Snippets', 'Commands']
const IDLE_LIMIT_PER_GROUP = 5
const RESULT_LIMIT = 60

interface PaletteRow {
  item: PaletteItem
  highlights: number[]
}

const GROUP_KIND: Record<PaletteGroup, string> = { Notes: 'Note', Snippets: 'Snippet', Commands: 'Command' }

function visibleRows(items: PaletteItem[], query: string): PaletteRow[] {
  if (queryTerms(query).length === 0) {
    return GROUP_ORDER.flatMap((group) => {
      const inGroup = items.filter((item) => item.group === group)
      return group === 'Commands' ? inGroup : inGroup.slice(0, IDLE_LIMIT_PER_GROUP)
    }).map((item) => ({ item, highlights: [] }))
  }
  return rankItems(items, query, (item) => ({ label: item.label, text: item.searchText }))
    .slice(0, RESULT_LIMIT)
    .map(({ item, match }) => ({ item, highlights: match.highlights }))
}

function HighlightedLabel({ label, highlights }: { label: string; highlights: number[] }) {
  if (highlights.length === 0) return label
  const marked = new Set(highlights)
  const parts: { text: string; mark: boolean }[] = []
  for (let index = 0; index < label.length; index++) {
    const mark = marked.has(index)
    const last = parts[parts.length - 1]
    if (last && last.mark === mark) last.text += label[index]
    else parts.push({ text: label[index], mark })
  }
  return parts.map((part, index) => (part.mark ? <mark key={index}>{part.text}</mark> : part.text))
}

interface CommandPaletteProps {
  items: PaletteItem[]
  placeholder?: string
  onClose: () => void
}

export function CommandPalette({ items, placeholder = 'Search notes, snippets, and commands', onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const rows = useMemo(() => visibleRows(items, query), [items, query])
  const results = rows.map((row) => row.item)
  // Search results are ranked across types, so group headings only make sense when idle.
  const searching = queryTerms(query).length > 0

  useEffect(() => inputRef.current?.focus(), [])

  useEscape(onClose)

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function choose(item: PaletteItem | undefined) {
    if (!item) return
    onClose()
    item.run()
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      // Wrap from the last row to the first
      setActiveIndex((index) => (index < results.length - 1 ? index + 1 : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      // Wrap from the first row to the last
      setActiveIndex((index) => (index > 0 ? index - 1 : Math.max(results.length - 1, 0)))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(results[activeIndex])
    }
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search and commands"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="palette-input">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            placeholder={placeholder}
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={results[activeIndex] ? `palette-${results[activeIndex].id}` : undefined}
            spellCheck={false}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-results" id="palette-results" role="listbox" ref={listRef}>
          {results.length === 0 && <p className="palette-empty">Nothing matches “{query}”.</p>}
          {rows.map(({ item, highlights }, index) => (
            <div key={item.id} role="presentation">
              {!searching && (index === 0 || results[index - 1].group !== item.group) && <div className="palette-group">{item.group}</div>}
              <div
                id={`palette-${item.id}`}
                role="option"
                aria-selected={index === activeIndex}
                className="palette-item"
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => choose(item)}
              >
                <Icon name={item.icon} size={16} />
                <span className="palette-label">
                  <HighlightedLabel label={item.label} highlights={highlights} />
                </span>
                {item.detail && <span className="palette-detail">{item.detail}</span>}
                {searching && <span className="palette-kind">{GROUP_KIND[item.group]}</span>}
                {item.shortcut && <kbd>{item.shortcut}</kbd>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

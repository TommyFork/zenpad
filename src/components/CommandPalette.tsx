import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useEscape } from '../app/useEscape'
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

function score(item: PaletteItem, terms: string[]): number {
  const label = item.label.toLowerCase()
  const text = item.searchText.toLowerCase()
  let total = 0
  for (const term of terms) {
    if (label.startsWith(term)) total += 3
    else if (label.includes(term)) total += 2
    else if (text.includes(term)) total += 1
    else return 0
  }
  return total
}

function visibleItems(items: PaletteItem[], query: string): PaletteItem[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) {
    return GROUP_ORDER.flatMap((group) => {
      const inGroup = items.filter((item) => item.group === group)
      return group === 'Commands' ? inGroup : inGroup.slice(0, IDLE_LIMIT_PER_GROUP)
    })
  }
  const ranked = items
    .map((item) => ({ item, score: score(item, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item)
  return GROUP_ORDER.flatMap((group) => ranked.filter((item) => item.group === group)).slice(0, RESULT_LIMIT)
}

interface CommandPaletteProps {
  items: PaletteItem[]
  onClose: () => void
}

export function CommandPalette({ items, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => visibleItems(items, query), [items, query])

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
      setActiveIndex((index) => Math.min(index + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
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
            placeholder="Search notes, snippets, and commands"
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
          {results.map((item, index) => (
            <div key={item.id} role="presentation">
              {(index === 0 || results[index - 1].group !== item.group) && <div className="palette-group">{item.group}</div>}
              <div
                id={`palette-${item.id}`}
                role="option"
                aria-selected={index === activeIndex}
                className="palette-item"
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => choose(item)}
              >
                <Icon name={item.icon} size={16} />
                <span className="palette-label">{item.label}</span>
                {item.detail && <span className="palette-detail">{item.detail}</span>}
                {item.shortcut && <kbd>{item.shortcut}</kbd>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

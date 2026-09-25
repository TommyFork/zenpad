import { useEffect, useRef, useState } from 'react'

interface SnippetNameFieldProps {
  name: string
  autoFocus: boolean
  onRename: (name: string) => Promise<string>
  onDone: () => void
}

function allowedCharacters(input: string): string {
  return input.toLowerCase().replace(/\s/g, '-').replace(/[^a-z0-9_-]/g, '')
}

export function SnippetNameField({ name, autoFocus, onRename, onDone }: SnippetNameFieldProps) {
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)
  const discardOnBlur = useRef(false)

  useEffect(() => {
    if (!autoFocus) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [autoFocus])

  async function commit() {
    if (discardOnBlur.current) {
      discardOnBlur.current = false
      setDraft(name)
      return
    }
    setDraft(await onRename(draft))
  }

  return (
    <label className="snippet-name-field" title="Rename snippet. References in your notes update too.">
      <span aria-hidden="true">@</span>
      <input
        ref={inputRef}
        value={draft}
        spellCheck={false}
        autoComplete="off"
        aria-label="Snippet name"
        onChange={(event) => setDraft(allowedCharacters(event.target.value))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') discardOnBlur.current = true
          if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault()
            onDone()
          }
        }}
      />
    </label>
  )
}

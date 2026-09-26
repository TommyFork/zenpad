import { useState, type FormEvent } from 'react'
import { useEscape } from '../app/useEscape'
import { typedSnippetName } from '../lib/snippets'

const PREVIEW_LENGTH = 160

interface ExtractDialogProps {
  text: string
  suggestedName: string
  // Resolves to an error to show, or null once the snippet exists.
  onConfirm: (name: string) => Promise<string | null>
  onCancel: () => void
}

export function ExtractDialog({ text, suggestedName, onConfirm, onCancel }: ExtractDialogProps) {
  const [name, setName] = useState(suggestedName)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEscape(onCancel)

  const trimmed = text.trim()
  const preview = trimmed.length > PREVIEW_LENGTH ? `${trimmed.slice(0, PREVIEW_LENGTH)}…` : trimmed

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    const problem = await onConfirm(name)
    setSaving(false)
    setError(problem)
  }

  return (
    <div className="overlay overlay-centered" onMouseDown={onCancel}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="extract-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="extract-dialog-title">Make a snippet</h2>
        <p>The selected text moves into a new snippet, and a reference to it takes its place.</p>
        <blockquote className="extract-preview">{preview}</blockquote>
        <label className="dialog-field">
          <span aria-hidden="true">@</span>
          <input
            value={name}
            spellCheck={false}
            autoComplete="off"
            autoFocus
            onFocus={(event) => event.target.select()}
            aria-label="Snippet name"
            aria-invalid={error !== null}
            aria-describedby={error ? 'extract-dialog-error' : undefined}
            onChange={(event) => {
              setName(typedSnippetName(event.target.value))
              setError(null)
            }}
          />
        </label>
        {error && (
          <p id="extract-dialog-error" className="dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="soft-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving || name === ''}>
            Make snippet
          </button>
        </div>
      </form>
    </div>
  )
}

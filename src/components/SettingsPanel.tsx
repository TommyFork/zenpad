import type { EditorFont, Settings, Theme } from '../lib/settings'
import { useEscape } from '../app/useEscape'
import { Icon } from './Icon'

interface Choice<T extends string> {
  value: T
  label: string
}

const THEMES: Choice<Theme>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const FONTS: Choice<EditorFont>[] = [
  { value: 'serif', label: 'Serif' },
  { value: 'sans', label: 'Sans' },
  { value: 'mono', label: 'Mono' },
]

function Segmented<T extends string>({ label, choices, value, onChange }: { label: string; choices: Choice<T>[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {choices.map((choice) => (
          <button
            key={choice.value}
            role="radio"
            aria-checked={choice.value === value}
            className={`font-${choice.value}`}
            onClick={() => onChange(choice.value)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  )
}

interface SettingsPanelProps {
  settings: Settings
  storagePersisted: boolean | null
  noteCount: number
  snippetCount: number
  onChange: (changes: Partial<Settings>) => void
  onExport: () => void
  onImport: () => void
  onClose: () => void
}

export function SettingsPanel({ settings, storagePersisted, noteCount, snippetCount, onChange, onExport, onImport, onClose }: SettingsPanelProps) {
  useEscape(onClose)

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="settings" role="dialog" aria-modal="true" aria-label="Settings" onMouseDown={(event) => event.stopPropagation()}>
        <div className="settings-head">
          <h2>Settings</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close settings" autoFocus>
            <Icon name="close" />
          </button>
        </div>

        <Segmented label="Theme" choices={THEMES} value={settings.theme} onChange={(theme) => onChange({ theme })} />
        <Segmented label="Writing font" choices={FONTS} value={settings.font} onChange={(font) => onChange({ font })} />

        <div className="settings-section">
          <h3>Your library</h3>
          <p className="settings-note">
            {noteCount} {noteCount === 1 ? 'note' : 'notes'} and {snippetCount} {snippetCount === 1 ? 'snippet' : 'snippets'}, stored only in this browser. Zenpad has
            no server and never sends your writing anywhere.
          </p>
          <p className="settings-note">
            {storagePersisted
              ? 'This browser has agreed to keep your library safe from automatic cleanup.'
              : 'This browser may clear site data when space runs low. Export a backup now and then to be safe.'}
          </p>
          <div className="settings-actions">
            <button className="soft-button" onClick={onExport}>
              <Icon name="download" size={16} />
              Export backup
            </button>
            <button className="soft-button" onClick={onImport}>
              <Icon name="upload" size={16} />
              Import backup
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

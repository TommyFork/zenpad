import { useEscape } from '../app/useEscape'

interface DeleteDialogProps {
  title: string
  detail: string
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteDialog({ title, detail, onConfirm, onCancel }: DeleteDialogProps) {
  useEscape(onCancel)

  return (
    <div className="overlay overlay-centered" onMouseDown={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-detail"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="delete-dialog-title">{title}</h2>
        <p id="delete-dialog-detail">{detail}</p>
        <div className="dialog-actions">
          <button className="soft-button" onClick={onCancel}>
            Cancel
          </button>
          <button className="danger-button" onClick={onConfirm} autoFocus>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

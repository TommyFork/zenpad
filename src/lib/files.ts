export function downloadJson(filename: string, value: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// Resolves with null if the picker is dismissed without choosing a file.
export function pickFile(accept: string): Promise<File | null> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  return new Promise((resolve) => {
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null))
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

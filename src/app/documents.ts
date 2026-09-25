export type DocumentKind = 'note' | 'snippet'

export interface DocumentRef {
  kind: DocumentKind
  id: string
}

export function documentKey(doc: DocumentRef): string {
  return `${doc.kind}:${doc.id}`
}

export function parseDocumentKey(key: string): DocumentRef | null {
  const [kind, id] = key.split(':')
  if ((kind !== 'note' && kind !== 'snippet') || !id) return null
  return { kind, id }
}

export function isSameDocument(a: DocumentRef | null, b: DocumentRef | null): boolean {
  return a !== null && b !== null && a.kind === b.kind && a.id === b.id
}

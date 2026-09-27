import { noteTitle } from './notes'
import { referencedSnippetNames } from './snippets'

export interface GraphNode {
  kind: 'note' | 'snippet'
  id: string
  label: string
  // How many documents use this node. Always 0 for notes.
  uses: number
}

// Points from a document to a snippet it uses, as indexes into the node list.
export interface GraphEdge {
  source: number
  target: number
}

export interface SnippetGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// Every snippet, plus the notes that use at least one of them, joined by their @references.
// References to snippets that don't exist, and snippets that mention themselves, are left out.
export function buildSnippetGraph(
  notes: readonly { id: string; body: string }[],
  snippets: readonly { id: string; name: string; body: string }[],
  { includeNotes = true }: { includeNotes?: boolean } = {},
): SnippetGraph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const indexByName = new Map<string, number>()
  for (const snippet of snippets) {
    indexByName.set(snippet.name, nodes.length)
    nodes.push({ kind: 'snippet', id: snippet.id, label: snippet.name, uses: 0 })
  }

  const link = (source: number, names: string[]) => {
    for (const name of names) {
      const target = indexByName.get(name)
      if (target === undefined || target === source) continue
      edges.push({ source, target })
      nodes[target].uses++
    }
  }

  snippets.forEach((snippet, index) => link(index, referencedSnippetNames(snippet.body)))
  if (includeNotes) {
    for (const note of notes) {
      const names = referencedSnippetNames(note.body).filter((name) => indexByName.has(name))
      if (names.length === 0) continue
      const source = nodes.length
      nodes.push({ kind: 'note', id: note.id, label: noteTitle(note.body), uses: 0 })
      link(source, names)
    }
  }
  return { nodes, edges }
}

// Each node's direct neighbors, in either direction.
export function graphNeighbors(graph: SnippetGraph): Set<number>[] {
  const neighbors = graph.nodes.map(() => new Set<number>())
  for (const { source, target } of graph.edges) {
    neighbors[source].add(target)
    neighbors[target].add(source)
  }
  return neighbors
}

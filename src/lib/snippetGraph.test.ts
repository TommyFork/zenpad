import { describe, expect, it } from 'vitest'
import { buildSnippetGraph, graphNeighbors } from './snippetGraph'

const notes = [
  { id: 'n1', body: 'Plan\n@tone @context @missing' },
  { id: 'n2', body: 'No snippets here' },
]
const snippets = [
  { id: 's1', name: 'tone', body: 'Be concise. @tone' },
  { id: 's2', name: 'context', body: 'Repo. @tone' },
  { id: 's3', name: 'lonely', body: '' },
]

describe('buildSnippetGraph', () => {
  it('links notes and snippets to the snippets they use', () => {
    const graph = buildSnippetGraph(notes, snippets)
    expect(graph.nodes.map((node) => `${node.kind}:${node.label}`)).toEqual([
      'snippet:tone',
      'snippet:context',
      'snippet:lonely',
      'note:Plan',
    ])
    expect(graph.edges).toEqual([
      { source: 1, target: 0 },
      { source: 3, target: 0 },
      { source: 3, target: 1 },
    ])
  })

  it('counts how many documents use each snippet', () => {
    const graph = buildSnippetGraph(notes, snippets)
    expect(graph.nodes.map((node) => node.uses)).toEqual([2, 1, 0, 0])
  })

  it('can leave notes out', () => {
    const graph = buildSnippetGraph(notes, snippets, { includeNotes: false })
    expect(graph.nodes.every((node) => node.kind === 'snippet')).toBe(true)
    expect(graph.edges).toEqual([{ source: 1, target: 0 }])
  })
})

describe('graphNeighbors', () => {
  it('lists neighbors in both directions', () => {
    const neighbors = graphNeighbors(buildSnippetGraph(notes, snippets))
    expect([...neighbors[0]].sort()).toEqual([1, 3])
    expect([...neighbors[2]]).toEqual([])
  })
})

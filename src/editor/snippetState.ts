import { StateEffect, StateField } from '@codemirror/state'

export type SnippetBodies = ReadonlyMap<string, string>

export const setSnippetBodies = StateEffect.define<SnippetBodies>()

export const snippetBodiesField = StateField.define<SnippetBodies>({
  create: () => new Map(),
  update(bodies, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setSnippetBodies)) return effect.value
    }
    return bodies
  },
})

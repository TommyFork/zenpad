import { describe, expect, it } from 'vitest'
import { layoutBounds, seedLayout, settleLayout, stepLayout } from './graphLayout'

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

describe('graph layout', () => {
  it('starts in the same place every time', () => {
    expect(seedLayout(5)).toEqual(seedLayout(5))
  })

  it('settles linked nodes a comfortable distance apart', () => {
    const points = seedLayout(2)
    settleLayout(points, [{ source: 0, target: 1 }])
    for (const point of points) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
    }
    expect(distance(points[0], points[1])).toBeGreaterThan(40)
    expect(distance(points[0], points[1])).toBeLessThan(120)
  })

  it('keeps nodes apart and near the middle', () => {
    const count = 30
    const edges = Array.from({ length: count - 1 }, (_, index) => ({ source: index + 1, target: Math.floor(index / 3) }))
    const points = seedLayout(count)
    settleLayout(points, edges)
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) expect(distance(points[i], points[j])).toBeGreaterThan(20)
    }
    const bounds = layoutBounds(points)
    expect(bounds.maxX - bounds.minX).toBeLessThan(1000)
  })

  it('leaves pinned nodes where they are', () => {
    const points = seedLayout(3)
    points[0] = { x: 40, y: 40, vx: 0, vy: 0, pinned: true }
    stepLayout(points, [{ source: 0, target: 1 }], 1)
    expect(points[0]).toMatchObject({ x: 40, y: 40 })
  })

  it('separates nodes that start on the same spot', () => {
    const points = [
      { x: 0, y: 0, vx: 0, vy: 0 },
      { x: 0, y: 0, vx: 0, vy: 0 },
    ]
    settleLayout(points, [])
    expect(distance(points[0], points[1])).toBeGreaterThan(10)
  })
})

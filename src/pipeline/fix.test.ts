import { describe, expect, it } from 'vitest'
import { LIMITS } from '../rules/bana'
import { measure, type DiagramState, type Measurement } from '../rules/check'
import { createBitmap, stampDisc, stampLine, type Bitmap } from './bitmap'
import { labelComponents } from './components'
import { autoFix, layoutDashes } from './fix'
import { findDashChains, findPoints, indexInk } from './measure'

const PX = 8
const mm = (value: number) => value * PX

function state(ink: Bitmap): DiagramState {
  return {
    index: indexInk(ink, PX),
    labels: [],
    key: [],
    bounds: { x: 0, y: 0, w: ink.width / PX, h: ink.height / PX },
    leftGapMm: 0,
    resized: false,
    changes: [],
  }
}

function rule(ink: Bitmap, id: Measurement['rule']): Measurement {
  return measure(state(ink)).find((m) => m.rule === id)!
}

/** A canvas of 60 by 40 mm with one long heavy line near the top. */
function canvas(): Bitmap {
  const ink = createBitmap(mm(60), mm(40))
  stampLine(ink, mm(5), mm(5), mm(55), mm(5), mm(1))
  return ink
}

describe('line weight (Appendix F)', () => {
  it('flags a 0.25 mm line and passes it after the fix', () => {
    const ink = canvas()
    stampLine(ink, mm(5), mm(20), mm(55), mm(20), mm(0.25))
    expect(rule(ink, 'line-weight').ok).toBe(false)

    const fixed = autoFix(ink, PX)
    expect(rule(fixed.ink, 'line-weight').ok).toBe(true)
    expect(fixed.changes.map((c) => c.rule)).toContain('line-weight')
  })

  it('makes the thin line at least 2.0 pt wide, measured across the stroke', () => {
    const ink = createBitmap(mm(60), mm(40))
    stampLine(ink, mm(5), mm(20), mm(55), mm(20), mm(0.25))
    const fixed = autoFix(ink, PX).ink
    let across = 0
    for (let y = 0; y < fixed.height; y++) across += fixed.data[y * fixed.width + mm(30)]
    expect(across / PX).toBeGreaterThanOrEqual(LIMITS.minLineWidthMm)
    expect(across / PX).toBeLessThan(1.2)
  })

  it('thickens a slanted line as evenly as a level one', () => {
    for (const widthMm of [0.3, 0.5, 0.6, 0.7]) {
      const ink = createBitmap(mm(80), mm(60))
      stampLine(ink, mm(10), mm(50), mm(70), mm(12), mm(widthMm))
      const fixed = autoFix(ink, PX).ink
      expect(rule(fixed, 'line-weight').ok, `${widthMm} mm`).toBe(true)
      // Ink in a column, times the cosine of the slope, is the width across the stroke.
      const cosine = 60 / Math.hypot(60, 38)
      for (const x of [20, 33, 47, 60]) {
        let column = 0
        for (let y = 0; y < fixed.height; y++) column += fixed.data[y * fixed.width + mm(x)]
        expect((column * cosine) / PX, `${widthMm} mm at x ${x}`).toBeGreaterThanOrEqual(0.7)
      }
    }
  })

  it('leaves a line that is already heavy alone', () => {
    const ink = canvas()
    expect(rule(ink, 'line-weight').ok).toBe(true)
    const fixed = autoFix(ink, PX)
    expect(fixed.ink.data).toEqual(ink.data)
    expect(fixed.changes).toEqual([])
  })
})

describe('spacing (2.11, 3.4.3.11)', () => {
  it('flags a short mark 1 mm from a line and passes after the mark is dropped', () => {
    const ink = canvas()
    stampLine(ink, mm(20), mm(7), mm(26), mm(7), mm(1))
    const before = rule(ink, 'spacing')
    expect(before.ok).toBe(false)
    // Centres 2 mm apart and strokes 1 mm wide leave about 1 mm of paper.
    expect(before.findings[0].message).toMatch(/(0\.[89]|1\.[01]) mm apart/)

    const fixed = autoFix(ink, PX)
    expect(rule(fixed.ink, 'spacing').ok).toBe(true)
    expect(fixed.elements.filter((e) => e.removedBy === 'too-close')).toHaveLength(1)
    expect(labelComponents(fixed.ink.data, fixed.ink.width, fixed.ink.height).components).toHaveLength(1)
  })

  it('keeps two long lines that are too close and leaves the rule flagged', () => {
    const ink = canvas()
    stampLine(ink, mm(5), mm(7), mm(55), mm(7), mm(1))
    const fixed = autoFix(ink, PX)
    expect(rule(fixed.ink, 'spacing').ok).toBe(false)
    expect(labelComponents(fixed.ink.data, fixed.ink.width, fixed.ink.height).components).toHaveLength(2)
  })

  it('passes two lines 4 mm apart', () => {
    const ink = canvas()
    stampLine(ink, mm(5), mm(10), mm(55), mm(10), mm(1))
    expect(rule(ink, 'spacing').ok).toBe(true)
  })

  it('does not drop a mark the teacher restored', () => {
    const ink = canvas()
    stampLine(ink, mm(20), mm(7), mm(26), mm(7), mm(1))
    const dropped = autoFix(ink, PX).elements.find((e) => e.removedBy === 'too-close')!
    const kept = autoFix(ink, PX, { keep: new Set([dropped.id]) })
    expect(kept.elements.every((e) => e.removedBy === null)).toBe(true)
  })
})

describe('removing parts', () => {
  it('removes a frame around the drawing but not a box that carries ink inside', () => {
    const ink = createBitmap(mm(80), mm(60))
    const frame = (target: Bitmap) => {
      stampLine(target, mm(4), mm(4), mm(76), mm(4), mm(1))
      stampLine(target, mm(76), mm(4), mm(76), mm(56), mm(1))
      stampLine(target, mm(76), mm(56), mm(4), mm(56), mm(1))
      stampLine(target, mm(4), mm(56), mm(4), mm(4), mm(1))
    }
    frame(ink)
    stampLine(ink, mm(20), mm(20), mm(60), mm(20), mm(1))
    stampLine(ink, mm(20), mm(40), mm(60), mm(40), mm(1))
    expect(rule(ink, 'frame').ok).toBe(false)
    const fixed = autoFix(ink, PX)
    expect(rule(fixed.ink, 'frame').ok).toBe(true)
    expect(fixed.elements.find((e) => e.removedBy === 'frame')).toBeDefined()

    const table = createBitmap(mm(80), mm(60))
    frame(table)
    stampLine(table, mm(40), mm(4), mm(40), mm(56), mm(1))
    stampLine(table, mm(20), mm(20), mm(30), mm(20), mm(1))
    stampLine(table, mm(50), mm(40), mm(65), mm(40), mm(1))
    expect(rule(table, 'frame').ok).toBe(true)
  })

  it('removes the element the teacher picked and reports it', () => {
    const ink = canvas()
    stampLine(ink, mm(5), mm(30), mm(55), mm(30), mm(1))
    const all = autoFix(ink, PX)
    expect(all.elements).toHaveLength(2)
    const target = all.elements.find((e) => e.box.y > 20)!
    const fixed = autoFix(ink, PX, { remove: new Set([target.id]) })
    expect(fixed.elements.find((e) => e.id === target.id)!.removedBy).toBe('you')
    expect(labelComponents(fixed.ink.data, fixed.ink.width, fixed.ink.height).components).toHaveLength(1)
  })

  it('rubs out only the area the teacher marked and keeps the ids of the parts', () => {
    const ink = canvas()
    const plain = autoFix(ink, PX)
    const fixed = autoFix(ink, PX, { erase: [{ x: 20, y: 3, w: 10, h: 4 }] })
    expect(fixed.ink.data[mm(5) * ink.width + mm(25)]).toBe(0)
    expect(fixed.ink.data[mm(5) * ink.width + mm(15)]).toBe(1)
    expect(fixed.ink.data[mm(5) * ink.width + mm(40)]).toBe(1)
    expect(fixed.elements.map((e) => e.id)).toEqual(plain.elements.map((e) => e.id))
  })

  it('drops a speck of 0.4 mm and keeps a dot of 2 mm', () => {
    const ink = canvas()
    stampDisc(ink, mm(30), mm(25), mm(0.2), 1)
    stampDisc(ink, mm(45), mm(25), mm(1), 1)
    const fixed = autoFix(ink, PX)
    expect(fixed.changes.find((c) => c.rule === 'despeckle')?.message).toMatch(/^1 speck/)
    expect(fixed.ink.data[mm(25) * ink.width + mm(30)]).toBe(0)
    expect(fixed.ink.data[mm(25) * ink.width + mm(45)]).toBe(1)
  })
})

describe('dashed lines (3.4.3.3)', () => {
  function dashed(dashMm: number, gapMm: number): Bitmap {
    const ink = createBitmap(mm(100), mm(30))
    for (let x = 5; x + dashMm <= 95; x += dashMm + gapMm) {
      stampLine(ink, mm(x), mm(15), mm(x + dashMm), mm(15), mm(0.5))
    }
    return ink
  }

  it('flags 2 mm dashes and passes after they are drawn again', () => {
    const ink = dashed(2, 1.5)
    expect(findDashChains(indexInk(ink, PX))).toHaveLength(1)
    expect(rule(ink, 'dashes').ok).toBe(false)

    const fixed = autoFix(ink, PX).ink
    const chains = findDashChains(indexInk(fixed, PX))
    expect(chains).toHaveLength(1)
    for (const length of chains[0].dashLengths) {
      expect(length / PX).toBeGreaterThanOrEqual(LIMITS.dashMinMm - 0.5)
      expect(length / PX).toBeLessThanOrEqual(LIMITS.dashMaxMm + 0.5)
    }
    expect(rule(fixed, 'dashes').ok).toBe(true)
    expect(rule(fixed, 'spacing').ok).toBe(true)
    expect(rule(fixed, 'line-weight').ok).toBe(true)
  })

  it('keeps the line where it was', () => {
    const ink = dashed(2, 1.5)
    const before = findDashChains(indexInk(ink, PX))[0]
    const after = findDashChains(indexInk(autoFix(ink, PX).ink, PX))[0]
    expect(Math.abs(after.x1 - before.x1)).toBeLessThan(mm(1))
    expect(Math.abs(after.x2 - before.x2)).toBeLessThan(mm(1))
    expect(Math.abs(after.y1 - before.y1)).toBeLessThan(mm(0.5))
  })

  it('lays out dashes of 6 to 10 mm that fill the length exactly', () => {
    for (const length of [15, 22, 40, 77.5, 190]) {
      const layout = layoutDashes(length)!
      expect(layout.dashMm).toBeGreaterThanOrEqual(LIMITS.dashMinMm)
      expect(layout.dashMm).toBeLessThanOrEqual(LIMITS.dashMaxMm)
      expect(layout.count * layout.dashMm + (layout.count - 1) * layout.gapMm).toBeCloseTo(length, 6)
    }
    expect(layoutDashes(9)).toBeNull()
  })
})

describe('points (6.11.1.4)', () => {
  /** A line with a dot of the given diameter on it. */
  function plotted(diameterMm: number): Bitmap {
    const ink = createBitmap(mm(60), mm(40))
    stampLine(ink, mm(5), mm(20), mm(55), mm(20), mm(0.5))
    stampDisc(ink, mm(30), mm(20), mm(diameterMm / 2), 1)
    return ink
  }

  it('finds a dot on a line and ignores a plain crossing', () => {
    const points = findPoints(indexInk(plotted(2), PX))
    expect(points).toHaveLength(1)
    expect(points[0].isolated).toBe(false)
    expect(Math.abs(points[0].cx - mm(30))).toBeLessThanOrEqual(2)

    const cross = createBitmap(mm(60), mm(40))
    stampLine(cross, mm(5), mm(20), mm(55), mm(20), mm(0.5))
    stampLine(cross, mm(30), mm(5), mm(30), mm(35), mm(0.5))
    expect(findPoints(indexInk(cross, PX))).toHaveLength(0)
  })

  it('flags a 2 mm dot that touches its line, then enlarges it and clears a ring', () => {
    const ink = plotted(2)
    expect(rule(ink, 'point-size').ok).toBe(false)
    expect(rule(ink, 'point-clearance').ok).toBe(false)

    const fixed = autoFix(ink, PX)
    expect(rule(fixed.ink, 'point-size').ok).toBe(true)
    expect(rule(fixed.ink, 'point-clearance').ok).toBe(true)
    // The line is cut 3 mm from the edge of the dot, and the dot is still there.
    expect(fixed.ink.data[mm(20) * ink.width + mm(30)]).toBe(1)
    expect(fixed.ink.data[mm(20) * ink.width + mm(33)]).toBe(0)
    expect(fixed.ink.data[mm(20) * ink.width + mm(40)]).toBe(1)
  })

  it('does not touch a dot that is already 4 mm wide and clear', () => {
    const ink = createBitmap(mm(60), mm(40))
    stampLine(ink, mm(5), mm(5), mm(55), mm(5), mm(1))
    stampDisc(ink, mm(30), mm(25), mm(2), 1)
    expect(rule(ink, 'point-size').ok).toBe(true)
    expect(rule(ink, 'point-clearance').ok).toBe(true)
    expect(autoFix(ink, PX).changes).toEqual([])
  })
})

describe('line length (3.4.3.2)', () => {
  it('flags a lone 6 mm line and passes a 13 mm line', () => {
    const short = canvas()
    stampLine(short, mm(20), mm(25), mm(26), mm(25), mm(1))
    expect(rule(short, 'line-length').ok).toBe(false)
    // Nothing can lengthen it safely, so the fix must leave it flagged.
    expect(rule(autoFix(short, PX).ink, 'line-length').ok).toBe(false)

    const long = canvas()
    stampLine(long, mm(20), mm(25), mm(33), mm(25), mm(1))
    expect(rule(long, 'line-length').ok).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { binarize } from './binarize'
import { countInk, createBitmap, stampLine } from './bitmap'
import { detectText } from './detectText'
import { distanceField } from './distance'
import { labelComponents } from './components'

/** A 100 by 100 grey picture filled with `paper`, with a 4 pixel wide bar of `stroke` across it. */
function picture(paper: number, stroke: number): Uint8Array {
  const gray = new Uint8Array(100 * 100).fill(paper)
  for (let y = 48; y < 52; y++) for (let x = 10; x < 90; x++) gray[y * 100 + x] = stroke
  return gray
}

describe('binarize', () => {
  it('keeps a dark stroke on white paper as ink', () => {
    const ink = binarize(picture(255, 20), 100, 100)
    expect(countInk(ink)).toBe(4 * 80)
    expect(ink.data[50 * 100 + 50]).toBe(1)
  })

  it('treats a pale colour fill as paper, not as ink', () => {
    const gray = picture(255, 30)
    // A pale fill covers 40 percent of the picture, as in a coloured cell diagram.
    for (let y = 0; y < 40; y++) for (let x = 0; x < 100; x++) gray[y * 100 + x] = 215
    const ink = binarize(gray, 100, 100)
    expect(countInk(ink)).toBe(4 * 80)
  })

  it('inverts white lines on a black ground', () => {
    const ink = binarize(picture(10, 245), 100, 100)
    expect(countInk(ink)).toBe(4 * 80)
    expect(ink.data[0]).toBe(0)
  })

  it('keeps a mid-grey stroke that is still much darker than the paper', () => {
    const ink = binarize(picture(250, 110), 100, 100)
    expect(ink.data[50 * 100 + 50]).toBe(1)
    expect(ink.data[10 * 100 + 10]).toBe(0)
  })
})

describe('distance field', () => {
  it('measures the straight distance to the nearest seed and remembers which one', () => {
    const mask = new Uint8Array(50 * 50)
    mask[10 * 50 + 10] = 1
    mask[40 * 50 + 40] = 1
    const field = distanceField(mask, 50, 50, 1)
    expect(field.dist[10 * 50 + 10]).toBe(0)
    expect(field.dist[10 * 50 + 14]).toBe(4)
    expect(field.dist[13 * 50 + 14]).toBeCloseTo(5, 5)
    expect(field.seed[13 * 50 + 14]).toBe(10 * 50 + 10)
    expect(field.seed[38 * 50 + 35]).toBe(40 * 50 + 40)
  })

  it('returns no seed when the mask is empty', () => {
    const field = distanceField(new Uint8Array(16), 4, 4, 1)
    expect(field.seed[5]).toBe(-1)
    expect(field.dist[5]).toBe(Infinity)
  })
})

describe('connected shapes', () => {
  it('joins pixels that touch at a corner and separates ones that do not', () => {
    const mask = new Uint8Array(6 * 6)
    mask[0] = 1
    mask[7] = 1
    mask[35] = 1
    const eight = labelComponents(mask, 6, 6)
    expect(eight.components.map((c) => c.area)).toEqual([2, 1])
    expect(labelComponents(mask, 6, 6, 1, 4).components).toHaveLength(3)
  })
})

describe('finding printed words in a raster', () => {
  const PX = 8
  /** Draws a row of hollow boxes, each about the size of a printed letter. */
  function letters(count: number, sizeMm: number) {
    const ink = createBitmap(80 * PX, 40 * PX)
    stampLine(ink, 5 * PX, 30 * PX, 75 * PX, 30 * PX, 4)
    const s = sizeMm * PX
    for (let i = 0; i < count; i++) {
      const x = 10 * PX + i * (s + 4)
      const y = 10 * PX
      stampLine(ink, x, y, x + s, y, 2)
      stampLine(ink, x + s, y, x + s, y + s, 2)
      stampLine(ink, x + s, y + s, x, y + s, 2)
      stampLine(ink, x, y + s, x, y, 2)
    }
    return ink
  }

  it('finds a word of five letters, erases it, and leaves the drawing alone', () => {
    const ink = letters(5, 3)
    const regions = detectText(ink, PX)
    expect(regions).toHaveLength(1)
    expect(regions[0].box.x).toBeCloseTo(10, 0)
    expect(regions[0].box.h).toBeCloseTo(3, 0)
    expect(labelComponents(ink.data, ink.width, ink.height).components).toHaveLength(1)
    expect(ink.data[30 * PX * ink.width + 40 * PX]).toBe(1)
  })

  it('does not take a row of solid dashes for a word', () => {
    const ink = createBitmap(80 * PX, 40 * PX)
    for (let i = 0; i < 6; i++) stampLine(ink, (10 + i * 4) * PX, 10 * PX, (12 + i * 4) * PX, 10 * PX, 6)
    expect(detectText(ink, PX)).toHaveLength(0)
    expect(labelComponents(ink.data, ink.width, ink.height).components).toHaveLength(6)
  })

  it('does not take one lone letter-sized shape for a word', () => {
    expect(detectText(letters(1, 3), PX)).toHaveLength(0)
  })
})

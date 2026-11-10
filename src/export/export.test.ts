import { describe, expect, it } from 'vitest'
import { BRAILLE } from '../braille/cells'
import { dotNumbers, toBraille } from '../braille/ueb'
import { createBitmap, type Bitmap } from '../pipeline/bitmap'
import type { KeyEntry } from '../pipeline/labels'
import {
  outlinesToPath,
  roundCorners,
  simplifyLoop,
  traceOutlines,
  type Outline,
} from '../pipeline/trace'
import { MARGIN_MM, PAGES, cellsPerLine, graphicSheet, keyPageLines, keySheet } from './page'
import { sheetsToPdf } from './pdf'
import { sheetToSvg } from './svg'

function fillRect(ink: Bitmap, x0: number, y0: number, x1: number, y1: number, value: 0 | 1) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) ink.data[y * ink.width + x] = value
}

/** Signed area of a closed outline (shoelace formula). */
function area(outline: Outline): number {
  let sum = 0
  for (let i = 0; i < outline.length; i += 2) {
    const j = (i + 2) % outline.length
    sum += outline[i] * outline[j + 1] - outline[j] * outline[i + 1]
  }
  return sum / 2
}

const letter = PAGES[0]
const key = (k: string, text: string): KeyEntry => ({
  key: k,
  keyBraille: toBraille(k).cells,
  text,
  braille: toBraille(text).cells,
  numeric: false,
})

describe('outline tracing', () => {
  it('traces a 10 by 5 mm rectangle as four corners with the right area', () => {
    const ink = createBitmap(200, 100)
    fillRect(ink, 40, 24, 120, 64, 1)
    const outlines = traceOutlines(ink, 8)
    expect(outlines).toHaveLength(1)
    expect(outlines[0]).toHaveLength(8)
    expect(Math.abs(area(outlines[0]))).toBeCloseTo(50, 6)
    expect(Math.min(...outlines[0].filter((_, i) => i % 2 === 0))).toBe(5)
  })

  it('traces a hole as a second loop wound the other way', () => {
    const ink = createBitmap(200, 100)
    fillRect(ink, 40, 24, 120, 64, 1)
    fillRect(ink, 56, 32, 104, 56, 0)
    const outlines = traceOutlines(ink, 8)
    expect(outlines).toHaveLength(2)
    expect(Math.sign(area(outlines[0]))).toBe(-Math.sign(area(outlines[1])))
    expect(Math.abs(area(outlines[0]) + area(outlines[1]))).toBeCloseTo(50 - 18, 6)
  })

  it('removes the stairs of a diagonal edge but keeps a real corner', () => {
    const stairs: number[] = []
    for (let i = 0; i < 20; i++) stairs.push(i, i, i + 1, i)
    stairs.push(20, 20, 0, 20)
    const simple = simplifyLoop(stairs, 0.75)
    expect(simple.length / 2).toBeLessThanOrEqual(4)
    expect(simple).toContain(20)

    const square = [0, 0, 10, 0, 10, 10, 0, 10]
    expect(simplifyLoop(square, 0.75)).toEqual(square)
  })

  it('writes path data that closes every loop', () => {
    expect(outlinesToPath([[0, 0, 10, 0, 10, 5]], 1, 2, 0)).toBe('M1.00 2.00L11.00 2.00L11.00 7.00Z')
  })

  it('rounds a corner by a quarter millimetre and keeps the rest of a long edge straight', () => {
    const corners = roundCorners([0, 0, 10, 0, 10, 10, 0, 10], 0.25)
    expect(corners[1]).toEqual({ ax: 9.75, ay: 0, vx: 10, vy: 0, bx: 10, by: 0.25 })
    const path = outlinesToPath([[0, 0, 10, 0, 10, 10, 0, 10]])
    expect(path).toContain('L9.75 0.00Q10.00 0.00 10.00 0.25')
  })

  it('rounds a short edge only up to its midpoint, so neighbouring curves meet and do not cross', () => {
    const corners = roundCorners([0, 0, 0.2, 0, 0.2, 5, 0, 5], 0.25)
    expect(corners[0].bx).toBeCloseTo(0.1)
    expect(corners[1].ax).toBeCloseTo(0.1)
  })
})

describe('key page (5.8.4)', () => {
  it('starts with the note indicator and "Key:" in cell 7, then a blank line', () => {
    const lines = keyPageLines([key('nu', 'Nucleus')], 30)
    expect(dotNumbers(lines[0])).toBe('0 0 0 0 0 0 4 46 126 6 13 15 13456 25')
    expect(lines[1]).toBe('')
  })

  it('puts the key in cell 1, the words from cell 4, and closes the note after the last entry', () => {
    const lines = keyPageLines([key('nu', 'Nucleus'), key('va', 'Vacuole')], 30)
    expect(dotNumbers(lines[2])).toBe('1345 136 0 6 1345 136 14 123 15 136 234')
    expect(dotNumbers(lines[3]).endsWith('4 46 345')).toBe(true)
    expect(dotNumbers(lines[2]).endsWith('4 46 345')).toBe(false)
  })

  it('wraps a long explanation at a word and starts the runover in cell 3', () => {
    const lines = keyPageLines([key('rr', 'rough endoplasmic reticulum')], 20)
    expect(lines.length).toBeGreaterThan(3)
    for (const line of lines) expect([...line].length).toBeLessThanOrEqual(20)
    // "rr rough endoplasmic" fills 20 cells, so "reticulum" runs over to cell 3.
    expect(dotNumbers(lines[3]).startsWith('0 0 1235 15')).toBe(true)
  })

  it('makes no page when nothing is keyed', () => {
    expect(keyPageLines([], 30)).toEqual([])
    expect(keySheet(letter, [], 'Cell').dots).toEqual([])
  })

  it('fits 30 cells between the margins of a Letter page', () => {
    expect(cellsPerLine(letter)).toBe(30)
  })
})

describe('export files', () => {
  const outlines = [[2, 2, 52, 2, 52, 3, 2, 3]]
  const sheet = graphicSheet(letter, outlines, [], { x: -2, y: -2 }, 'Triangle <1>')

  it('moves the graphic to the left and top margins', () => {
    expect(sheet.outlines[0].slice(0, 2)).toEqual([MARGIN_MM, MARGIN_MM])
  })

  it('writes an SVG in millimetres with only black and white', () => {
    const svg = sheetToSvg(sheet)
    expect(svg).toContain('width="215.9mm" height="279.4mm" viewBox="0 0 215.9 279.4"')
    expect(svg).toContain('<title>Triangle &lt;1&gt;</title>')
    const colours = [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1])
    expect(new Set(colours)).toEqual(new Set(['#fff', '#000']))
    expect(svg).not.toContain('<text')
  })

  it('draws braille dots at the standard diameter', () => {
    const withKey = sheetToSvg(keySheet(letter, [key('nu', 'Nucleus')], 'Cell'))
    expect(withKey).toContain(`r="${(BRAILLE.dotDiameterMm / 2).toFixed(2)}"`)
  })

  it('writes a PDF whose page is exactly Letter size, with a valid cross-reference table', () => {
    const bytes = sheetsToPdf([sheet, keySheet(letter, [key('nu', 'Nucleus')], 'Cell')], 'Triangle')
    const text = new TextDecoder().decode(bytes)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('/MediaBox [0 0 612.000 792.000]')
    expect(text).toContain('/Count 2')
    const xref = Number(/startxref\n(\d+)/.exec(text)![1])
    expect(text.slice(xref, xref + 4)).toBe('xref')
    const firstObject = Number(/\n(\d{10}) 00000 n /.exec(text)![1])
    expect(text.slice(firstObject, firstObject + 7)).toBe('1 0 obj')
    expect(text).not.toMatch(/\/Font/)
  })
})

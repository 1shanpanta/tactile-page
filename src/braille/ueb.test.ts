import { describe, expect, it } from 'vitest'
import { BRAILLE, brailleDots, brailleWidthMm } from './cells'
import { dotNumbers, keyLetterCells, toBraille } from './ueb'

const dots = (text: string, isLabel = false) => dotNumbers(toBraille(text, isLabel).cells)

describe('uncontracted UEB', () => {
  it('spells a word letter by letter with a capital indicator', () => {
    expect(dots('Nucleus')).toBe('6 1345 136 14 123 15 136 234')
  })

  it('keeps a space between words as an empty cell', () => {
    expect(dots('cell wall')).toBe('14 15 123 123 0 2456 1 123 123')
  })

  it('writes numbers with one numeric indicator and the letters a to j', () => {
    expect(dots('90')).toBe('3456 24 245')
    expect(dots('3.5')).toBe('3456 14 256 15')
    expect(dots('1/2')).toBe('3456 1 34 12')
  })

  it('adds a grade 1 indicator when a to j follows a number, and not for k to z', () => {
    expect(dots('3a')).toBe('3456 14 56 1')
    expect(dots('3k')).toBe('3456 14 13')
  })

  it('uses the capitals word indicator for a run of capitals and ends it before lower case', () => {
    expect(dots('AB')).toBe('6 6 1 12')
    expect(dots('ABc')).toBe('6 6 1 12 6 3 14')
    expect(dots('NaCl')).toBe('6 1345 1 6 14 123')
    expect(dots('kW')).toBe('13 6 2456')
  })

  it('writes the degree sign, brackets and the equals sign as two cells each', () => {
    expect(dots('30°')).toBe('3456 14 245 45 245')
    expect(dots('(2, 3)')).toBe('5 126 3456 12 2 0 3456 14 5 345')
    expect(dots('y = 2x')).toBe('56 13456 0 5 2356 0 3456 12 1346')
  })

  it('follows BANA 5.10.4 for a label of one letter', () => {
    expect(dots('x', true)).toBe('56 1346')
    expect(dots('a', true)).toBe('56 1')
    expect(dots('A', true)).toBe('6 1')
  })

  it('reports characters that are not in the table and leaves them out', () => {
    const result = toBraille('5 Ω')
    expect(result.unsupported).toEqual(['Ω'])
    expect(dotNumbers(result.cells)).toBe('3456 15 0')
    expect(toBraille('Cell wall').unsupported).toEqual([])
  })

  it('writes key letters with no indicator', () => {
    expect(dotNumbers(keyLetterCells('nu'))).toBe('1345 136')
  })
})

describe('braille geometry', () => {
  it('places the six dots of a full cell on a 2.34 mm grid', () => {
    const full = brailleDots('⠿', 10, 20)
    expect(full).toHaveLength(6)
    const xs = [...new Set(full.map((d) => d.cx))].sort((a, b) => a - b)
    const ys = [...new Set(full.map((d) => d.cy))].sort((a, b) => a - b)
    expect(xs[1] - xs[0]).toBeCloseTo(BRAILLE.dotPitchMm)
    expect(ys[2] - ys[0]).toBeCloseTo(2 * BRAILLE.dotPitchMm)
    expect(xs[0]).toBeCloseTo(10 + BRAILLE.dotDiameterMm / 2)
  })

  it('steps 6.2 mm from one cell to the next', () => {
    const [first, second] = brailleDots('⠁⠁', 0, 0)
    expect(second.cx - first.cx).toBeCloseTo(BRAILLE.cellPitchMm)
    expect(brailleWidthMm(2)).toBeCloseTo(6.2 + 2.34 + 1.44)
    expect(brailleWidthMm(0)).toBe(0)
  })

  it('draws dot 4 in the right column and dot 3 in the bottom row', () => {
    const [dot4] = brailleDots('⠈', 0, 0)
    const [dot3] = brailleDots('⠄', 0, 0)
    expect(dot4.cx).toBeGreaterThan(dot3.cx)
    expect(dot3.cy).toBeGreaterThan(dot4.cy)
  })
})

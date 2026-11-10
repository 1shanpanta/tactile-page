import { describe, expect, it } from 'vitest'
import { BRAILLE_HEIGHT_MM, brailleWidthMm } from '../braille/cells'
import { toBraille } from '../braille/ueb'
import { createBitmap, stampLine, type Bitmap } from '../pipeline/bitmap'
import {
  buildKey,
  isValidLetterKey,
  makeLetterKey,
  naiveLabels,
  placeLabels,
  type KeyEntry,
  type PlacedLabel,
  type SourceLabel,
} from '../pipeline/labels'
import { indexInk } from '../pipeline/measure'
import { RULES } from './bana'
import { compare, measure, summarize, type DiagramState, type Measurement } from './check'

const PX = 8
const mm = (value: number) => value * PX

/** A 120 by 80 mm sheet with one horizontal line at y = 40 mm. */
function sheet(): Bitmap {
  const ink = createBitmap(mm(120), mm(80))
  stampLine(ink, mm(10), mm(40), mm(110), mm(40), mm(1))
  return ink
}

function state(ink: Bitmap, labels: PlacedLabel[] = [], key: KeyEntry[] = []): DiagramState {
  return {
    index: indexInk(ink, PX),
    labels,
    key,
    bounds: { x: 0, y: 0, w: ink.width / PX, h: ink.height / PX },
    leftGapMm: 0,
    resized: false,
    changes: [],
  }
}

function find(measurements: Measurement[], id: Measurement['rule']): Measurement {
  return measurements.find((m) => m.rule === id)!
}

function word(text: string, x: number, y: number): PlacedLabel {
  const cells = toBraille(text, true).cells
  return {
    id: text,
    text,
    mode: 'word',
    key: null,
    braille: cells,
    wordBraille: cells,
    box: { x, y, w: brailleWidthMm([...cells].length), h: BRAILLE_HEIGHT_MM },
    rotationDeg: 0,
    unsupported: [],
    pinned: false,
  }
}

function entry(key: string, text = 'Nucleus', numeric = false): KeyEntry {
  return { key, keyBraille: toBraille(key).cells, text, braille: toBraille(text).cells, numeric }
}

describe('label distance (3.4.3.12, 5.10.5)', () => {
  it('flags a label 1 mm from a line, passes one 4 mm away, flags one 15 mm away', () => {
    const lineBottom = 40.5
    const at = (gap: number) => find(measure(state(sheet(), [word('base', 50, lineBottom + gap)])), 'label-distance')
    expect(at(1).ok).toBe(false)
    expect(at(1).findings[0].message).toContain('from another part')
    expect(at(4).ok).toBe(true)
    expect(at(15).ok).toBe(false)
    expect(at(15).findings[0].message).toContain('lead line')
  })

  it('flags a label that lies on the line', () => {
    const result = find(measure(state(sheet(), [word('base', 50, 37)])), 'label-distance')
    expect(result.findings[0].message).toContain('overlaps')
  })

  it('flags two labels 1 mm from each other', () => {
    const a = word('ab', 20, 45)
    const b = word('cd', 20 + a.box.w + 1, 45)
    expect(find(measure(state(sheet(), [a, b])), 'label-distance').ok).toBe(false)
    const c = word('cd', 20 + a.box.w + 4, 45)
    expect(find(measure(state(sheet(), [a, c])), 'label-distance').ok).toBe(true)
  })

  it('accepts a label deep inside a closed area, where 6 mm cannot apply', () => {
    const ink = createBitmap(mm(120), mm(80))
    stampLine(ink, mm(10), mm(10), mm(110), mm(10), mm(1))
    stampLine(ink, mm(110), mm(10), mm(110), mm(70), mm(1))
    stampLine(ink, mm(110), mm(70), mm(10), mm(70), mm(1))
    stampLine(ink, mm(10), mm(70), mm(10), mm(10), mm(1))
    expect(find(measure(state(ink, [word('area', 50, 36)])), 'label-distance').ok).toBe(true)
  })
})

describe('automatic label placement', () => {
  const print = (text: string, x: number, y: number, w: number): SourceLabel => ({
    id: text,
    text,
    box: { x, y, w, h: 4 },
    rotationDeg: 0,
  })

  it('moves a label that sat on the line to between 3 and 6 mm from it', () => {
    const ink = sheet()
    const source = [print('base', 50, 38, 12)]
    const before = find(measure(state(ink, naiveLabels(source))), 'label-distance')
    expect(before.ok).toBe(false)

    const layout = placeLabels(indexInk(ink, PX), source, new Map(), { x: 0, y: 0, w: 120, h: 80 })
    const after = measure(state(ink, layout.labels, layout.key))
    expect(find(after, 'label-distance').ok).toBe(true)
    expect(layout.labels[0].mode).toBe('word')
    expect(compare(measure(state(ink, naiveLabels(source))), after).find((r) => r.rule.id === 'label-distance')!.status).toBe('fixed')
  })

  it('uses a key when the word cannot fit, and lists it on the key page', () => {
    // Lines 16 mm apart leave room for one row of braille, but not for 13 cells in a 50 mm bay.
    const ink = createBitmap(mm(60), mm(60))
    for (const y of [10, 26, 42]) stampLine(ink, mm(5), mm(y), mm(55), mm(y), mm(1))
    stampLine(ink, mm(5), mm(10), mm(5), mm(42), mm(1))
    stampLine(ink, mm(55), mm(10), mm(55), mm(42), mm(1))
    const source = [print('Cell membrane', 20, 16, 20)]
    const layout = placeLabels(indexInk(ink, PX), source, new Map(), { x: 0, y: 0, w: 60, h: 60 })
    expect(layout.labels[0].mode).toBe('key')
    expect(layout.labels[0].key).toBe('cm')
    expect(layout.key).toEqual([entry('cm', 'Cell membrane')])
    const after = measure(state(ink, layout.labels, layout.key))
    expect(find(after, 'word-before-key').ok).toBe(true)
    expect(find(after, 'key-format').ok).toBe(true)
  })

  it('flags a key the teacher forced where the word would fit', () => {
    const ink = sheet()
    const source = [print('base', 50, 46, 12)]
    const edits = new Map([['base', { mode: 'key' as const }]])
    const layout = placeLabels(indexInk(ink, PX), source, edits, { x: 0, y: 0, w: 120, h: 80 })
    expect(layout.labels[0].mode).toBe('key')
    expect(find(measure(state(ink, layout.labels, layout.key)), 'word-before-key').ok).toBe(false)
  })

  it('leaves out a deleted label and keeps a pinned one where the teacher put it', () => {
    const ink = sheet()
    const source = [print('base', 50, 46, 12), print('top', 50, 20, 9)]
    const edits = new Map([
      ['base', { deleted: true }],
      ['top', { x: 70, y: 60 }],
    ])
    const layout = placeLabels(indexInk(ink, PX), source, edits, { x: 0, y: 0, w: 120, h: 80 })
    expect(layout.labels.map((l) => l.id)).toEqual(['top'])
    expect(layout.labels[0].box.x).toBe(70)
    expect(layout.labels[0].box.y).toBe(60)
  })
})

describe('keys (5.8.1, 5.7.3)', () => {
  it('accepts keys with dot 3 or 6 and rejects the ones BANA warns about', () => {
    expect(isValidLetterKey('nu')).toBe(true)
    expect(isValidLetterKey('cw')).toBe(true)
    // a, b, c and d have no dot 3 or 6.
    expect(isValidLetterKey('ab')).toBe(false)
    expect(isValidLetterKey('ca')).toBe(false)
    expect(isValidLetterKey('n')).toBe(false)
    expect(isValidLetterKey('Nu')).toBe(false)
    expect(isValidLetterKey('nucl')).toBe(false)
  })

  it('builds a key from the first letter and never repeats one', () => {
    const taken = new Set<string>()
    const first = makeLetterKey('Cell wall', taken)!
    expect(first).toBe('cw')
    taken.add(first)
    expect(makeLetterKey('Chloroplast', taken)).toBe('cl')
    expect(makeLetterKey('Cell wall', taken)).not.toBe('cw')
    // "bad" has no letter with dot 3 or 6, so a letter is borrowed.
    expect(makeLetterKey('bad', taken)).toBe('bk')
    expect(makeLetterKey('30°', taken)).toBeNull()
  })

  it('flags a malformed key, a repeated key and a wrong order', () => {
    const bad = find(measure(state(sheet(), [], [entry('ab')])), 'key-format')
    expect(bad.ok).toBe(false)
    const twice = find(measure(state(sheet(), [], [entry('nu'), entry('nu', 'Nucleolus')])), 'key-format')
    expect(twice.findings[0].message).toContain('two different labels')
    expect(find(measure(state(sheet(), [], [entry('nu'), entry('va')])), 'key-format').ok).toBe(true)

    expect(find(measure(state(sheet(), [], [entry('va'), entry('nu')])), 'key-order').ok).toBe(false)
    expect(find(measure(state(sheet(), [], [entry('1', 'x', true), entry('nu')])), 'key-order').ok).toBe(false)
    expect(find(measure(state(sheet(), [], [entry('nu'), entry('va'), entry('2', 'x', true)])), 'key-order').ok).toBe(true)
  })

  it('sorts the key page: letters in alphabetical order, then numbers', () => {
    const keyed = (text: string, key: string): PlacedLabel => ({ ...word(text, 0, 0), mode: 'key', key })
    const key = buildKey([keyed('Vacuole', 'va'), keyed('30', '2'), keyed('Nucleus', 'nu'), keyed('12', '1')])
    expect(key.map((e) => e.key)).toEqual(['nu', 'va', '1', '2'])
  })
})

describe('single letters (5.10.4) and rotation (5.10.1)', () => {
  it('flags a lower-case letter with no indicator and a capital that has one', () => {
    const good = [word('x', 20, 45), word('A', 60, 45)]
    expect(find(measure(state(sheet(), good)), 'single-letter').ok).toBe(true)

    const bare = { ...word('x', 20, 45), braille: toBraille('xx').cells.slice(0, 1) }
    expect(find(measure(state(sheet(), [bare])), 'single-letter').ok).toBe(false)
    const extra = { ...word('A', 20, 45), braille: toBraille('a', true).cells }
    expect(find(measure(state(sheet(), [extra])), 'single-letter').ok).toBe(false)
  })

  it('flags a rotated label', () => {
    const rotated = { ...word('time', 20, 45), rotationDeg: -90 }
    expect(find(measure(state(sheet(), [rotated])), 'label-horizontal').ok).toBe(false)
    expect(find(measure(state(sheet(), [word('time', 20, 45)])), 'label-horizontal').ok).toBe(true)
  })
})

describe('page rules', () => {
  it('flags a graphic that starts 30 mm from the left margin', () => {
    expect(find(measure({ ...state(sheet()), leftGapMm: 30 }), 'left-margin').ok).toBe(false)
    expect(find(measure({ ...state(sheet()), leftGapMm: 0.2 }), 'left-margin').ok).toBe(true)
  })

  it('always sends a resized graphic and a list of changes to the teacher', () => {
    const resized = measure({ ...state(sheet()), resized: true, changes: ['1 label is replaced by a key.'] })
    expect(find(resized, 'enlargement').ok).toBe(false)
    expect(find(resized, 'transcriber-note').findings).toHaveLength(1)
    expect(find(measure(state(sheet())), 'transcriber-note').ok).toBe(true)
  })
})

describe('compare', () => {
  const all = (ok: boolean): Measurement[] =>
    RULES.map((rule) => ({ rule: rule.id, ok, summary: '', findings: [] }))

  it('calls a rule fixed only when the input failed and the output passes', () => {
    expect(compare(all(false), all(true)).every((r) => r.status === 'fixed')).toBe(true)
    expect(compare(all(true), all(true)).every((r) => r.status === 'pass')).toBe(true)
  })

  it('never hides a rule the output still breaks', () => {
    expect(compare(all(false), all(false)).every((r) => r.status === 'flagged')).toBe(true)
    expect(compare(all(true), all(false)).every((r) => r.status === 'flagged')).toBe(true)
  })

  it('sums up with counts and never with the word compliant', () => {
    const mixed = compare(all(true), [...all(true).slice(0, 15), ...all(false).slice(15)])
    const sentence = summarize(mixed)
    expect(sentence).toBe('Checked against 17 BANA rules: 15 pass, 0 fixed automatically, 2 need your review.')
    expect(summarize(compare(all(false), all(true)))).toContain('17 fixed automatically')
    expect(sentence.toLowerCase()).not.toMatch(/compl|certif|meets/)
  })

  it('reports every rule exactly once', () => {
    const results = compare(measure(state(sheet())), measure(state(sheet())))
    expect(results.map((r) => r.rule.id)).toEqual(RULES.map((r) => r.id))
  })
})

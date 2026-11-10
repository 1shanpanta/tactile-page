import { BRAILLE_HEIGHT_MM, brailleWidthMm } from '../braille/cells'
import { INDICATORS, isUpperCellLetter, keyLetterCells, toBraille } from '../braille/ueb'
import { LIMITS } from '../rules/bana'
import type { Box } from './bitmap'
import { boxClearanceMm, isEnclosed, type InkIndex } from './measure'

export interface SourceLabel {
  id: string
  text: string
  /** Where the print label sits, in millimetres. */
  box: Box
  rotationDeg: number
}

export interface LabelEdit {
  text?: string
  /** Top left corner chosen by the teacher. */
  x?: number
  y?: number
  mode?: 'word' | 'key'
  key?: string
  deleted?: boolean
}

export interface PlacedLabel {
  id: string
  text: string
  mode: 'word' | 'key'
  key: string | null
  /** Cells drawn on the graphic: the word, or the key. */
  braille: string
  /** Cells of the full word, also when a key is drawn. */
  wordBraille: string
  box: Box
  rotationDeg: number
  unsupported: string[]
  /** True when the teacher set the position. */
  pinned: boolean
}

export interface KeyEntry {
  key: string
  keyBraille: string
  text: string
  braille: string
  numeric: boolean
}

export interface LabelLayout {
  labels: PlacedLabel[]
  key: KeyEntry[]
}

/** 5.8.1.2: these pairs use only the top of the cell and feel like part of a texture. */
const AVOIDED_KEYS = ['aa', 'ac', 'cc', 'ca']

export function isValidLetterKey(key: string): boolean {
  if (!/^[a-z]{2,3}$/.test(key)) return false
  if (AVOIDED_KEYS.includes(key)) return false
  return [...key].some((letter) => !isUpperCellLetter(letter))
}

export function isValidNumberKey(key: string): boolean {
  return /^[1-9][0-9]*$/.test(key)
}

/**
 * Picks a two letter key that starts with the first letter of the label
 * (5.8.1.1). Returns null when the label has no usable letters.
 */
export function makeLetterKey(text: string, taken: ReadonlySet<string>): string | null {
  const words: string[] = text.toLowerCase().match(/[a-z]+/g) ?? []
  if (words.length === 0) return null
  const first = words[0][0]
  const candidates: string[] = []
  if (words.length > 1) candidates.push(first + words[1][0])
  for (const letter of words.join('').slice(1)) candidates.push(first + letter)
  for (const letter of 'klmnopqrstuvwxyz') candidates.push(first + letter)
  return candidates.find((key) => isValidLetterKey(key) && !taken.has(key)) ?? null
}

export function keyBraille(key: string): string {
  return isValidNumberKey(key) ? toBraille(key).cells : keyLetterCells(key)
}

export function boxDistanceMm(a: Box, b: Box): number {
  const dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w))
  const dy = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h))
  return Math.hypot(dx, dy)
}

function sizeOf(cells: string): { w: number; h: number } {
  return { w: brailleWidthMm([...cells].length), h: BRAILLE_HEIGHT_MM }
}

const NEAR_MM = 12
const FAR_MM = 30
/** Every millimetre close to the print position, then every 2 mm farther out, nearest first. */
const OFFSETS: readonly (readonly [number, number])[] = (() => {
  const offsets: [number, number][] = []
  for (let dy = -FAR_MM; dy <= FAR_MM; dy++) {
    for (let dx = -FAR_MM; dx <= FAR_MM; dx++) {
      const near = Math.abs(dx) <= NEAR_MM && Math.abs(dy) <= NEAR_MM
      if (near || (dx % 2 === 0 && dy % 2 === 0)) offsets.push([dx, dy])
    }
  }
  return offsets.sort((p, q) => Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1]))
})()

/** Placement keeps a little more than the minimum so rounding cannot break the rule. */
const PLACE_MIN_MM = LIMITS.labelMinGapMm + 0.25
const PLACE_MAX_MM = LIMITS.labelMaxGapMm - 0.25

function clearance(index: InkIndex, box: Box, others: readonly Box[]): number {
  let nearest = boxClearanceMm(index, box)
  for (const other of others) nearest = Math.min(nearest, boxDistanceMm(box, other))
  return nearest
}

function inside(box: Box, bounds: Box): boolean {
  return (
    box.x >= bounds.x &&
    box.y >= bounds.y &&
    box.x + box.w <= bounds.x + bounds.w &&
    box.y + box.h <= bounds.y + bounds.h
  )
}

/**
 * Finds the spot nearest to `start` that keeps the label 3 mm clear. Outside
 * a closed area it also prefers to stay within 6 mm of the nearest part.
 */
function findSpot(
  index: InkIndex,
  start: Box,
  others: readonly Box[],
  bounds: Box,
): Box | null {
  let fallback: Box | null = null
  for (const [dx, dy] of OFFSETS) {
    const box = { ...start, x: start.x + dx, y: start.y + dy }
    if (!inside(box, bounds)) continue
    const gap = clearance(index, box, others)
    if (gap < PLACE_MIN_MM) continue
    if (gap <= PLACE_MAX_MM || isEnclosed(index, box.x + box.w / 2, box.y + box.h / 2)) return box
    fallback ??= box
  }
  return fallback
}

/** Keeps the braille on the same side of its part as the print label was. */
function anchor(index: InkIndex, print: Box, size: { w: number; h: number }): Box {
  const { ink, pxPerMm, toInk } = index
  const cx = Math.min(ink.width - 1, Math.max(0, Math.round((print.x + print.w / 2) * pxPerMm)))
  const cy = Math.min(ink.height - 1, Math.max(0, Math.round((print.y + print.h / 2) * pxPerMm)))
  const seed = toInk.seed[cy * ink.width + cx]
  let x = print.x + print.w / 2 - size.w / 2
  let y = print.y + print.h / 2 - size.h / 2
  if (seed !== -1) {
    const sx = (seed % ink.width) / pxPerMm
    const sy = Math.floor(seed / ink.width) / pxPerMm
    if (sx < print.x) x = print.x
    else if (sx > print.x + print.w) x = print.x + print.w - size.w
    if (sy < print.y) y = print.y
    else if (sy > print.y + print.h) y = print.y + print.h - size.h
  }
  return { x, y, ...size }
}

/** The state before any fix: every word in braille, centred on its print label. */
export function naiveLabels(labels: readonly SourceLabel[]): PlacedLabel[] {
  return labels.map((label) => {
    const word = toBraille(label.text, true)
    const size = sizeOf(word.cells)
    return {
      id: label.id,
      text: label.text,
      mode: 'word',
      key: null,
      braille: word.cells,
      wordBraille: word.cells,
      box: {
        x: label.box.x + label.box.w / 2 - size.w / 2,
        y: label.box.y + label.box.h / 2 - size.h / 2,
        ...size,
      },
      rotationDeg: label.rotationDeg,
      unsupported: word.unsupported,
      pinned: false,
    }
  })
}

/** True when the full word, centred where the label is, keeps the minimum clearance. */
export function wordFitsAt(
  index: InkIndex,
  label: PlacedLabel,
  others: readonly Box[],
  bounds: Box,
): boolean {
  const size = sizeOf(label.wordBraille)
  const box = {
    x: label.box.x + label.box.w / 2 - size.w / 2,
    y: label.box.y + label.box.h / 2 - size.h / 2,
    ...size,
  }
  return inside(box, bounds) && clearance(index, box, others) >= PLACE_MIN_MM
}

export function placeLabels(
  index: InkIndex,
  source: readonly SourceLabel[],
  edits: ReadonlyMap<string, LabelEdit>,
  bounds: Box,
): LabelLayout {
  const ordered = source
    .filter((label) => edits.get(label.id)?.deleted !== true)
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
  const placed: PlacedLabel[] = []
  const taken = new Set<string>()
  for (const edit of edits.values()) if (edit.key && !edit.deleted) taken.add(edit.key)
  let nextNumber = 1
  const keyByText = new Map<string, string>()

  for (const label of ordered) {
    const edit = edits.get(label.id) ?? {}
    const text = (edit.text ?? label.text).trim()
    const word = toBraille(text, true)
    const others = placed.map((other) => other.box)
    const pinned = edit.x !== undefined && edit.y !== undefined
    const cellCount = [...word.cells].length
    const keySize = sizeOf(INDICATORS.space.repeat(2))

    let mode = edit.mode
    let box: Box | null = null
    if (pinned) {
      mode ??= 'word'
      box = { x: edit.x!, y: edit.y!, ...(mode === 'word' ? sizeOf(word.cells) : keySize) }
    } else {
      // A key saves no room for a label of one or two cells.
      const wordSpot =
        mode === 'key' ? null : findSpot(index, anchor(index, label.box, sizeOf(word.cells)), others, bounds)
      if (wordSpot || mode === 'word' || cellCount <= 2) {
        mode = 'word'
        box = wordSpot ?? anchor(index, label.box, sizeOf(word.cells))
      } else {
        mode = 'key'
        const start = anchor(index, label.box, keySize)
        box = findSpot(index, start, others, bounds) ?? start
      }
    }

    let key: string | null = null
    if (mode === 'key') {
      // 5.8.2.5: two items that are identical share one key.
      key = edit.key ?? keyByText.get(text) ?? makeLetterKey(text, taken)
      if (key === null) {
        while (taken.has(String(nextNumber))) nextNumber++
        key = String(nextNumber)
      }
      taken.add(key)
      keyByText.set(text, key)
    }
    placed.push({
      id: label.id,
      text,
      mode,
      key,
      braille: key === null ? word.cells : keyBraille(key),
      wordBraille: word.cells,
      box,
      rotationDeg: 0,
      unsupported: word.unsupported,
      pinned,
    })
  }

  return { labels: placed, key: buildKey(placed) }
}

/** 5.8.4: letter keys in alphabetical order, then number keys in numeric order. */
export function buildKey(labels: readonly PlacedLabel[]): KeyEntry[] {
  const entries = labels
    .filter(
      (label, i) =>
        label.key !== null &&
        labels.findIndex((other) => other.key === label.key && other.text === label.text) === i,
    )
    .map((label) => ({
      key: label.key!,
      keyBraille: label.braille,
      text: label.text,
      braille: toBraille(label.text).cells,
      numeric: isValidNumberKey(label.key!),
    }))
  const letters = entries.filter((e) => !e.numeric).sort((a, b) => a.key.localeCompare(b.key))
  const numbers = entries.filter((e) => e.numeric).sort((a, b) => Number(a.key) - Number(b.key))
  return [...letters, ...numbers]
}

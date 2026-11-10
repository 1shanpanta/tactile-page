import { BRAILLE, brailleDots, type Dot } from '../braille/cells'
import { INDICATORS, toBraille } from '../braille/ueb'
import type { KeyEntry, PlacedLabel } from '../pipeline/labels'
import type { Outline } from '../pipeline/trace'

export interface PageSpec {
  id: 'letter' | 'a4'
  name: string
  widthMm: number
  heightMm: number
}

export const PAGES: readonly PageSpec[] = [
  { id: 'letter', name: 'US Letter', widthMm: 215.9, heightMm: 279.4 },
  { id: 'a4', name: 'A4', widthMm: 210, heightMm: 297 },
]

/** Half an inch. Our choice for desktop printers. BANA gives no figure for swell paper. */
export const MARGIN_MM = 12.7

/** Working resolution. One pixel is 0.125 mm, finer than a fingertip can tell. */
export const PX_PER_MM = 8

/** Everything on one sheet, in millimetres from the top left corner of the paper. */
export interface Sheet {
  page: PageSpec
  title: string
  description: string
  outlines: Outline[]
  dots: Dot[]
}

export function graphicSheet(
  page: PageSpec,
  outlines: readonly Outline[],
  labels: readonly PlacedLabel[],
  shift: { x: number; y: number },
  title: string,
): Sheet {
  const dx = MARGIN_MM + shift.x
  const dy = MARGIN_MM + shift.y
  return {
    page,
    title,
    description: labels
      .map((label) => (label.key === null ? label.text : `${label.key}: ${label.text}`))
      .join('; '),
    outlines: outlines.map((outline) => outline.map((v, i) => v + (i % 2 === 0 ? dx : dy))),
    dots: labels.flatMap((label) => brailleDots(label.braille, label.box.x + dx, label.box.y + dy)),
  }
}

/** Number of braille cells that fit between the margins. */
export function cellsPerLine(page: PageSpec): number {
  return Math.floor((page.widthMm - 2 * MARGIN_MM) / BRAILLE.cellPitchMm)
}

/** Fills lines with whole words. `head` opens the first line, runovers start in cell 3. */
function entryLines(head: string, words: readonly string[], width: number): string[] {
  const lines: string[] = []
  let line = head
  let atStart = true
  for (const word of words) {
    const needed = [...line].length + (atStart ? 0 : 1) + [...word].length
    if (!atStart && needed > width) {
      lines.push(line)
      line = INDICATORS.space.repeat(2) + word
    } else {
      line += (atStart ? '' : INDICATORS.space) + word
    }
    atStart = false
  }
  lines.push(line)
  return lines
}

/**
 * Lays out the key page as braille lines, following BANA 5.8.4: "Key:" with
 * the transcriber's note indicator in cell 7, a blank line, each key in cell
 * 1, its explanation one blank cell later, runovers in cell 3.
 */
export function keyPageLines(key: readonly KeyEntry[], width: number): string[] {
  if (key.length === 0) return []
  const lines = [
    INDICATORS.space.repeat(6) + INDICATORS.transcriberNoteOpen + toBraille('Key:').cells,
    '',
  ]
  key.forEach((entry, i) => {
    const words = entry.braille.split(INDICATORS.space)
    if (i === key.length - 1) words[words.length - 1] += INDICATORS.transcriberNoteClose
    lines.push(...entryLines(entry.keyBraille + INDICATORS.space, words, width))
  })
  return lines
}

export function keySheet(page: PageSpec, key: readonly KeyEntry[], title: string): Sheet {
  const lines = keyPageLines(key, cellsPerLine(page))
  return {
    page,
    title: `${title}, key`,
    description: key.map((entry) => `${entry.key}: ${entry.text}`).join('; '),
    outlines: [],
    dots: lines.flatMap((line, i) =>
      brailleDots(line, MARGIN_MM, MARGIN_MM + i * BRAILLE.linePitchMm),
    ),
  }
}

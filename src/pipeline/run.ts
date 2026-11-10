import {
  compare,
  measureInk,
  measureLayout,
  type Measurement,
  type RuleResult,
} from '../rules/check'
import { binarize } from './binarize'
import type { Bitmap, Box } from './bitmap'
import { detectText } from './detectText'
import { autoFix, type Change, type DiagramElement } from './fix'
import {
  naiveLabels,
  placeLabels,
  type KeyEntry,
  type LabelEdit,
  type PlacedLabel,
  type SourceLabel,
} from './labels'
import { indexInk, type InkIndex } from './measure'
import { traceOutlines, type Outline } from './trace'

export interface PipelineInput {
  /** Greyscale picture, already scaled to `pxPerMm`. 0 is black, 255 is white. */
  gray: Uint8Array
  width: number
  height: number
  pxPerMm: number
  /** Labels read from the source. Empty for a raster picture. */
  labels: SourceLabel[]
  /** True for a raster picture, where words must be found in the pixels. */
  findText: boolean
  /** Width of the area between the page margins, in millimetres. */
  drawableWidthMm: number
}

export interface Edits {
  remove: ReadonlySet<number>
  keep: ReadonlySet<number>
  /** Areas rubbed out by hand, in millimetres. */
  erase: readonly Box[]
  labels: ReadonlyMap<string, LabelEdit>
  /** Labels the teacher added by hand. */
  added: readonly SourceLabel[]
}

export type StepId = 'binarize' | 'simplify' | 'labels' | 'check' | 'trace'

export interface Step {
  id: StepId
  title: string
  detail: string
}

export interface PipelineOutput {
  ink: Bitmap
  index: InkIndex
  pxPerMm: number
  bounds: Box
  labels: PlacedLabel[]
  /** Ids of labels found in the pixels that nobody has typed a word for yet. */
  unread: string[]
  key: KeyEntry[]
  elements: DiagramElement[]
  changes: Change[]
  results: RuleResult[]
  /** Draft transcriber's note that lists every change. */
  note: string
  outlines: Outline[]
  /** How far the content is moved so it starts at the left and top margins. */
  shift: { x: number; y: number }
  steps: Step[]
  /** Id of the element whose ink is within reach of this spot, or null. */
  elementAt: (xMm: number, yMm: number) => number | null
}

/** How near a click has to be to a line to pick it. */
const PICK_RADIUS_MM = 1.5

/** Raster work that depends only on the picture and on removed elements. */
export interface RasterStage {
  raw: Bitmap
  sourceLabels: SourceLabel[]
  unreadIds: string[]
  fixedIndex: InkIndex
  beforeIndex: InkIndex
  elements: DiagramElement[]
  changes: Change[]
  outlines: Outline[]
  inkCount: number
  /** Rule results that depend only on the drawing, before and after the fixes. */
  beforeInk: Measurement[]
  afterInk: Measurement[]
}

function leftEdgeMm(index: InkIndex, labels: readonly PlacedLabel[]): number {
  let left = Infinity
  for (const shape of index.shapes.components) left = Math.min(left, shape.minX / index.pxPerMm)
  for (const label of labels) left = Math.min(left, label.box.x)
  return left === Infinity ? 0 : left
}

function topEdgeMm(index: InkIndex, labels: readonly PlacedLabel[]): number {
  let top = Infinity
  for (const shape of index.shapes.components) top = Math.min(top, shape.minY / index.pxPerMm)
  for (const label of labels) top = Math.min(top, label.box.y)
  return top === Infinity ? 0 : top
}

function rightEdgeMm(index: InkIndex, labels: readonly PlacedLabel[]): number {
  let right = 0
  for (const shape of index.shapes.components) {
    right = Math.max(right, (shape.maxX + 1) / index.pxPerMm)
  }
  for (const label of labels) right = Math.max(right, label.box.x + label.box.w)
  return right
}

export function rasterStage(
  input: PipelineInput,
  remove: ReadonlySet<number>,
  keep: ReadonlySet<number>,
  erase: readonly Box[] = [],
): RasterStage {
  const raw = binarize(input.gray, input.width, input.height)
  let sourceLabels = input.labels
  let unreadIds: string[] = []
  if (input.findText) {
    sourceLabels = detectText(raw, input.pxPerMm).map((region, i) => ({
      id: `found-${i + 1}`,
      text: '?',
      box: region.box,
      rotationDeg: 0,
    }))
    unreadIds = sourceLabels.map((label) => label.id)
  }
  const beforeIndex = indexInk(raw, input.pxPerMm)
  const fixed = autoFix(raw, input.pxPerMm, { remove, keep, erase })
  const fixedIndex = indexInk(fixed.ink, input.pxPerMm)
  return {
    raw,
    sourceLabels,
    unreadIds,
    fixedIndex,
    beforeIndex,
    elements: fixed.elements,
    changes: fixed.changes,
    outlines: traceOutlines(fixed.ink, input.pxPerMm),
    inkCount: beforeIndex.shapes.components.length,
    beforeInk: measureInk(beforeIndex),
    afterInk: measureInk(fixedIndex),
  }
}

/** Label placement and the rule check. Cheap enough to run on every label edit. */
export function finish(input: PipelineInput, stage: RasterStage, edits: Edits): PipelineOutput {
  const { fixedIndex, beforeIndex } = stage
  const bounds: Box = {
    x: 0,
    y: 0,
    w: input.width / input.pxPerMm,
    h: input.height / input.pxPerMm,
  }
  const allLabels = [...stage.sourceLabels, ...edits.added]
  const layout = placeLabels(fixedIndex, allLabels, edits.labels, bounds)
  const before = naiveLabels(stage.sourceLabels)

  const keyed = layout.labels.filter((label) => label.mode === 'key').length
  const deleted = allLabels.length - layout.labels.length
  // Heavier lines and lost specks change nothing a reader needs to be told about.
  const changes = stage.changes
    .filter((c) => c.rule !== 'line-weight' && c.rule !== 'despeckle')
    .map((c) => c.message)
  if (keyed > 0) changes.push(`${keyed === 1 ? '1 label is' : `${keyed} labels are`} replaced by a key.`)
  if (deleted > 0) changes.push(`${deleted === 1 ? '1 label was' : `${deleted} labels were`} left out.`)
  const byHand = stage.elements.filter((element) => element.removedBy === 'you').length
  if (byHand > 0) changes.push(`${byHand === 1 ? '1 part was' : `${byHand} parts were`} left out.`)
  if (edits.erase.length > 0) {
    changes.push(`${edits.erase.length === 1 ? '1 area was' : `${edits.erase.length} areas were`} erased.`)
  }

  // In print the picture sits in the middle of the line. That is the state before any fix.
  const beforeWidth = rightEdgeMm(beforeIndex, before) - leftEdgeMm(beforeIndex, before)
  const beforeState = {
    index: beforeIndex,
    labels: before,
    key: [],
    bounds,
    leftGapMm: Math.max(0, (input.drawableWidthMm - beforeWidth) / 2),
    resized: false,
    changes: [],
  }
  const shift = {
    x: -leftEdgeMm(fixedIndex, layout.labels),
    y: -topEdgeMm(fixedIndex, layout.labels),
  }
  const afterState = {
    index: fixedIndex,
    labels: layout.labels,
    key: layout.key,
    bounds,
    leftGapMm: leftEdgeMm(fixedIndex, layout.labels) + shift.x,
    resized: true,
    changes,
  }
  const results = compare(
    [...stage.beforeInk, ...measureLayout(beforeState)],
    [...stage.afterInk, ...measureLayout(afterState)],
  )

  const pass = results.filter((r) => r.status === 'pass').length
  const fixedCount = results.filter((r) => r.status === 'fixed').length
  const flagged = results.filter((r) => r.status === 'flagged').length
  const steps: Step[] = [
    {
      id: 'binarize',
      title: 'Black and white',
      detail: `Separate shapes found: ${stage.inkCount}.${
        input.findText ? ` Printed words set aside: ${stage.sourceLabels.length}.` : ''
      }`,
    },
    {
      id: 'simplify',
      title: 'Simplify and thicken',
      detail:
        stage.changes.length === 0
          ? 'Nothing needed to change.'
          : stage.changes.map((c) => c.message).join(' '),
    },
    {
      id: 'labels',
      title: 'Braille labels',
      detail:
        layout.labels.length === 0
          ? 'No labels.'
          : `Labels set as words: ${layout.labels.length - keyed}. Labels set as keys: ${keyed}.`,
    },
    {
      id: 'check',
      title: 'Rule check',
      detail: `${pass} pass, ${fixedCount} fixed, ${flagged} need your review.`,
    },
    {
      id: 'trace',
      title: 'Vector outline',
      detail: `Closed outlines drawn at true size: ${stage.outlines.length}.`,
    },
  ]

  return {
    ink: fixedIndex.ink,
    index: fixedIndex,
    pxPerMm: input.pxPerMm,
    bounds,
    labels: layout.labels,
    unread: stage.unreadIds.filter((id) => {
      const edit = edits.labels.get(id)
      return edit?.deleted !== true && edit?.text === undefined
    }),
    key: layout.key,
    elements: stage.elements,
    changes: stage.changes,
    results,
    note: changes.length === 0 ? '' : `In this graphic: ${changes.join(' ')}`,
    outlines: stage.outlines,
    shift,
    steps,
    elementAt: (xMm, yMm) => {
      const { ink, pxPerMm, toInk, shapes } = beforeIndex
      const x = Math.round(xMm * pxPerMm)
      const y = Math.round(yMm * pxPerMm)
      if (x < 0 || y < 0 || x >= ink.width || y >= ink.height) return null
      const i = y * ink.width + x
      if (toInk.seed[i] === -1 || toInk.dist[i] > PICK_RADIUS_MM * pxPerMm) return null
      return shapes.labels[toInk.seed[i]]
    },
  }
}

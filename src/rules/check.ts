import { INDICATORS } from '../braille/ueb'
import type { Box } from '../pipeline/bitmap'
import { extentPx, type Component } from '../pipeline/components'
import {
  boxDistanceMm,
  isValidLetterKey,
  isValidNumberKey,
  wordFitsAt,
  type KeyEntry,
  type PlacedLabel,
} from '../pipeline/labels'
import {
  boxClearanceMm,
  findCloseGaps,
  findDashChains,
  findFrame,
  findPoints,
  findThinStrokes,
  isEnclosed,
  type InkIndex,
} from '../pipeline/measure'
import { LIMITS, RULES, type RuleDefinition, type RuleId } from './bana'

/** Slack for measuring on a pixel grid. One pixel at 8 px per mm is 0.125 mm. */
const TOLERANCE_MM = 0.25

export interface Finding {
  message: string
  /** Where on the graphic, in millimetres. Absent when the finding has no place. */
  at?: Box
}

export interface Measurement {
  rule: RuleId
  ok: boolean
  /** One sentence that says what was measured. */
  summary: string
  findings: Finding[]
}

export interface DiagramState {
  index: InkIndex
  labels: readonly PlacedLabel[]
  key: readonly KeyEntry[]
  /** The area labels may use, in millimetres. */
  bounds: Box
  /** Distance from the left margin to the leftmost ink or label. */
  leftGapMm: number
  /** True when the graphic is not at its print size. */
  resized: boolean
  /** Changes a transcriber's note has to explain. */
  changes: readonly string[]
}

function shapeBox(shape: Component, pxPerMm: number): Box {
  return {
    x: shape.minX / pxPerMm,
    y: shape.minY / pxPerMm,
    w: (shape.maxX - shape.minX + 1) / pxPerMm,
    h: (shape.maxY - shape.minY + 1) / pxPerMm,
  }
}

function mm(value: number): string {
  return `${value.toFixed(1)} mm`
}

type Add = (rule: RuleId, findings: Finding[], pass: string, fail: string) => void

function collector(): { out: Measurement[]; add: Add } {
  const out: Measurement[] = []
  return {
    out,
    add: (rule, findings, pass, fail) => {
      const ok = findings.length === 0
      out.push({ rule, ok, summary: ok ? pass : fail, findings })
    },
  }
}

/** Measures one diagram against every rule. It changes nothing. */
export function measure(state: DiagramState): Measurement[] {
  return [...measureInk(state.index), ...measureLayout(state)]
}

/** The rules that depend only on the drawing. Slow, so callers may cache the result. */
export function measureInk(index: InkIndex): Measurement[] {
  const { pxPerMm, shapes } = index
  const chains = findDashChains(index)
  const dashIds = new Set(chains.flatMap((chain) => chain.members))
  const dashEnds = new Set(
    chains.flatMap((chain) => [chain.members[0], chain.members[chain.members.length - 1]]),
  )
  const chainOf = new Map<number, number>()
  chains.forEach((chain, i) => chain.members.forEach((id) => chainOf.set(id, i)))
  const points = findPoints(index, dashIds)
  const pointIds = new Set(points.filter((p) => p.isolated).map((p) => p.shapeId))
  const { out, add } = collector()

  const thin = findThinStrokes(index, LIMITS.minLineWidthMm)
  add(
    'line-weight',
    thin.regions.map((region) => ({
      message: `A line is thinner than ${LIMITS.minLineWidthMm.toFixed(2)} mm.`,
      at: shapeBox(region, pxPerMm),
    })),
    `Every line is at least ${LIMITS.minLineWidthMm.toFixed(2)} mm wide.`,
    `Line parts thinner than ${LIMITS.minLineWidthMm.toFixed(2)} mm: ${thin.regions.length}.`,
  )

  const gaps = findCloseGaps(index, LIMITS.minGapMm - TOLERANCE_MM).filter((gap) => {
    if (pointIds.has(gap.a) || pointIds.has(gap.b)) return false
    const sameChain = chainOf.has(gap.a) && chainOf.get(gap.a) === chainOf.get(gap.b)
    // A dashed line may end on another line, so its two end dashes are not counted.
    return !sameChain && !dashEnds.has(gap.a) && !dashEnds.has(gap.b)
  })
  add(
    'spacing',
    gaps.map((gap) => ({
      message: `Two parts are ${mm(gap.gapMm)} apart.`,
      at: { x: gap.x / pxPerMm - 2, y: gap.y / pxPerMm - 2, w: 4, h: 4 },
    })),
    `Separate parts are at least ${LIMITS.minGapMm} mm apart.`,
    `Pairs of parts closer than ${LIMITS.minGapMm} mm: ${gaps.length}.`,
  )

  const short = shapes.components.filter(
    (shape) =>
      !dashIds.has(shape.id) &&
      !pointIds.has(shape.id) &&
      extentPx(shape) / pxPerMm < LIMITS.minLineLengthMm - TOLERANCE_MM,
  )
  add(
    'line-length',
    short.map((shape) => ({
      message: `A part is ${mm(extentPx(shape) / pxPerMm)} long. Lengthen it or remove it.`,
      at: shapeBox(shape, pxPerMm),
    })),
    `Every line is at least ${LIMITS.minLineLengthMm} mm long.`,
    `Parts shorter than ${LIMITS.minLineLengthMm} mm: ${short.length}.`,
  )

  const badDashes: Finding[] = []
  for (const chain of chains) {
    const dashes = chain.dashLengths.map((length) => length / pxPerMm)
    const mean = dashes.reduce((sum, length) => sum + length, 0) / dashes.length
    const lengthOk = dashes.every(
      (length) => length >= LIMITS.dashMinMm - 0.5 && length <= LIMITS.dashMaxMm + 0.5,
    )
    const gapOk = chain.gapLengths.every((gap) => {
      const ratio = gap / pxPerMm / mean
      return ratio >= 0.35 && ratio <= 0.65
    })
    if (lengthOk && gapOk) continue
    const x = Math.min(chain.x1, chain.x2) / pxPerMm
    const y = Math.min(chain.y1, chain.y2) / pxPerMm
    badDashes.push({
      message: `A dashed line has dashes of about ${mm(mean)}.`,
      at: {
        x: x - 1,
        y: y - 1,
        w: Math.abs(chain.x2 - chain.x1) / pxPerMm + 2,
        h: Math.abs(chain.y2 - chain.y1) / pxPerMm + 2,
      },
    })
  }
  add(
    'dashes',
    badDashes,
    chains.length === 0
      ? 'The graphic has no dashed lines.'
      : `Dashes are ${LIMITS.dashMinMm} to ${LIMITS.dashMaxMm} mm long with spaces half as long.`,
    `Dashed lines without standard dashes: ${badDashes.length}.`,
  )

  const smallPoints = points.filter(
    (point) => (point.radius * 2) / pxPerMm < LIMITS.minPointDiameterMm - TOLERANCE_MM,
  )
  const pointBox = (cx: number, cy: number, radius: number): Box => ({
    x: (cx - radius) / pxPerMm - 1.5,
    y: (cy - radius) / pxPerMm - 1.5,
    w: (radius * 2) / pxPerMm + 3,
    h: (radius * 2) / pxPerMm + 3,
  })
  add(
    'point-size',
    smallPoints.map((point) => ({
      message: `A point is ${mm((point.radius * 2) / pxPerMm)} wide.`,
      at: pointBox(point.cx, point.cy, point.radius),
    })),
    points.length === 0
      ? 'The graphic has no point symbols.'
      : `Every point is at least ${LIMITS.minPointDiameterMm} mm wide.`,
    `Points smaller than ${LIMITS.minPointDiameterMm} mm: ${smallPoints.length}.`,
  )

  const crowded = points.filter((point) => {
    const inner = point.radius + 1.5
    const outer = point.radius + (LIMITS.minGapMm - TOLERANCE_MM) * pxPerMm
    const { width, height, data } = index.ink
    for (let y = Math.max(0, Math.floor(point.cy - outer)); y <= Math.min(height - 1, point.cy + outer); y++) {
      for (let x = Math.max(0, Math.floor(point.cx - outer)); x <= Math.min(width - 1, point.cx + outer); x++) {
        const d = Math.hypot(x - point.cx, y - point.cy)
        if (d > inner && d <= outer && data[y * width + x] === 1) return true
      }
    }
    return false
  })
  add(
    'point-clearance',
    crowded.map((point) => ({
      message: `A point has ink within ${LIMITS.minGapMm} mm.`,
      at: pointBox(point.cx, point.cy, point.radius),
    })),
    points.length === 0
      ? 'The graphic has no point symbols.'
      : `Every point has ${LIMITS.minGapMm} mm of clear space around it.`,
    `Points that touch or crowd other ink: ${crowded.length}.`,
  )

  const frame = findFrame(index)
  add(
    'frame',
    frame ? [{ message: 'An outline frames the whole graphic.', at: shapeBox(frame, pxPerMm) }] : [],
    'No frame surrounds the graphic.',
    'A frame surrounds the graphic.',
  )

  const lineStyles = (shapes.components.length > dashIds.size ? 1 : 0) + (chains.length > 0 ? 1 : 0)
  const pointStyles = points.length > 0 ? 1 : 0
  add(
    'variety',
    lineStyles > LIMITS.maxStyles ? [{ message: `${lineStyles} line styles are used.` }] : [],
    `Line styles: ${lineStyles}. Point symbols: ${pointStyles}. Area textures: 0.`,
    'Too many line styles are used.',
  )
  return out
}

/** The rules about labels, the key and the page. Fast enough to run on every edit. */
export function measureLayout(state: DiagramState): Measurement[] {
  const { index, labels, key } = state
  const { out, add } = collector()

  add(
    'left-margin',
    state.leftGapMm > 1
      ? [{ message: `The graphic starts ${mm(state.leftGapMm)} from the left margin.` }]
      : [],
    'The graphic starts at the left margin.',
    'The graphic is not at the left margin.',
  )

  const distanceFindings: Finding[] = []
  for (const label of labels) {
    const others = labels.filter((other) => other.id !== label.id)
    const toInk = boxClearanceMm(index, label.box)
    const toLabel = Math.min(Infinity, ...others.map((other) => boxDistanceMm(label.box, other.box)))
    const gap = Math.min(toInk, toLabel)
    const enclosed = isEnclosed(index, label.box.x + label.box.w / 2, label.box.y + label.box.h / 2)
    if (gap < LIMITS.labelMinGapMm - TOLERANCE_MM) {
      distanceFindings.push({
        message:
          gap === 0
            ? `"${label.text}" overlaps another part.`
            : `"${label.text}" is ${mm(gap)} from another part.`,
        at: label.box,
      })
    } else if (gap > LIMITS.labelMaxGapMm + TOLERANCE_MM && !enclosed) {
      distanceFindings.push({
        message: `"${label.text}" is ${mm(gap)} from the nearest part. Move it closer or add a lead line of ${LIMITS.leadLineMinMm} mm.`,
        at: label.box,
      })
    }
  }
  add(
    'label-distance',
    distanceFindings,
    labels.length === 0
      ? 'The graphic has no labels.'
      : `Every label is ${LIMITS.labelMinGapMm} to ${LIMITS.labelMaxGapMm} mm from its part.`,
    `Labels too close or too far: ${distanceFindings.length}.`,
  )

  const rotated = labels.filter((label) => Math.abs(label.rotationDeg) > 1)
  add(
    'label-horizontal',
    rotated.map((label) => ({ message: `"${label.text}" is rotated.`, at: label.box })),
    'Every label is horizontal.',
    `Rotated labels: ${rotated.length}.`,
  )

  const needlessKeys = labels.filter((label) => {
    if (label.mode !== 'key') return false
    const others = labels.filter((other) => other.id !== label.id).map((other) => other.box)
    return wordFitsAt(index, label, others, state.bounds)
  })
  const keyed = labels.filter((label) => label.mode === 'key').length
  add(
    'word-before-key',
    needlessKeys.map((label) => ({
      message: `The word "${label.text}" may fit here in place of its key.`,
      at: label.box,
    })),
    keyed === 0
      ? 'Every label is a full word.'
      : `Labels that use a key because the word does not fit: ${keyed}.`,
    `Keyed labels that may fit as words: ${needlessKeys.length}.`,
  )

  const keyFindings: Finding[] = []
  key.forEach((entry, i) => {
    const valid = entry.numeric ? isValidNumberKey(entry.key) : isValidLetterKey(entry.key)
    if (!valid) {
      keyFindings.push({
        message: `Key "${entry.key}" needs two or three lower-case letters, one of them with dot 3 or dot 6.`,
      })
    }
    if (key.findIndex((other) => other.key === entry.key) !== i) {
      keyFindings.push({ message: `Key "${entry.key}" is used for two different labels.` })
    }
    if (entry.numeric && !entry.keyBraille.startsWith(INDICATORS.numeric)) {
      keyFindings.push({ message: `Number key "${entry.key}" has no numeric indicator.` })
    }
  })
  add(
    'key-format',
    keyFindings,
    key.length === 0 ? 'The graphic needs no key.' : `Well-formed keys: ${key.length}.`,
    `Problems in the keys: ${keyFindings.length}.`,
  )

  const orderFindings: Finding[] = []
  for (let i = 1; i < key.length; i++) {
    const prev = key[i - 1]
    const next = key[i]
    const ordered =
      prev.numeric === next.numeric
        ? prev.numeric
          ? Number(prev.key) <= Number(next.key)
          : prev.key.localeCompare(next.key) <= 0
        : next.numeric
    if (!ordered) orderFindings.push({ message: `Key "${next.key}" is listed after "${prev.key}".` })
  }
  add(
    'key-order',
    orderFindings,
    key.length === 0 ? 'The graphic needs no key.' : 'Letter keys are alphabetical, then number keys.',
    'The key page is out of order.',
  )

  const letterFindings: Finding[] = []
  for (const label of labels) {
    if (label.mode !== 'word' || !/^[A-Za-z]$/.test(label.text)) continue
    const lower = label.text === label.text.toLowerCase()
    const hasIndicator = label.braille.startsWith(INDICATORS.grade1)
    if (lower !== hasIndicator) {
      letterFindings.push({
        message: lower
          ? `Lower-case "${label.text}" needs a grade 1 indicator.`
          : `Capital "${label.text}" must not have a grade 1 indicator.`,
        at: label.box,
      })
    }
  }
  add(
    'single-letter',
    letterFindings,
    'Single-letter labels use the right indicator.',
    `Single-letter labels with the wrong indicator: ${letterFindings.length}.`,
  )

  add(
    'enlargement',
    state.resized
      ? [
          {
            message:
              'The graphic was resized to fit the page. If the student must measure it, produce it at print size or state the change in a transcriber’s note.',
          },
        ]
      : [],
    'The graphic is at its print size.',
    'The graphic is not at its print size.',
  )

  add(
    'transcriber-note',
    state.changes.map((change) => ({ message: change })),
    'Nothing was changed that needs a note.',
    `Changes that need a transcriber’s note: ${state.changes.length}. Review the draft.`,
  )

  return out
}

export type RuleStatus = 'pass' | 'fixed' | 'flagged'

export interface RuleResult {
  rule: RuleDefinition
  status: RuleStatus
  summary: string
  findings: Finding[]
}

/** The one sentence the app is allowed to say about the standard. It never says "compliant". */
export function summarize(results: readonly RuleResult[]): string {
  const count = (status: RuleStatus) => results.filter((r) => r.status === status).length
  return `Checked against ${results.length} BANA rules: ${count('pass')} pass, ${count('fixed')} fixed automatically, ${count('flagged')} need your review.`
}

/**
 * A rule is "fixed" only when the input broke it and the output does not.
 * A rule the output still breaks is always "flagged", whatever the input did.
 */
export function compare(before: readonly Measurement[], after: readonly Measurement[]): RuleResult[] {
  return RULES.map((rule) => {
    const was = before.find((m) => m.rule === rule.id)
    const now = after.find((m) => m.rule === rule.id)
    if (!was || !now) throw new Error(`Rule ${rule.id} was not measured`)
    const status: RuleStatus = !now.ok ? 'flagged' : was.ok ? 'pass' : 'fixed'
    return {
      rule,
      status,
      summary: status === 'fixed' ? `${rule.autoFix ?? 'Fixed.'} ${now.summary}` : now.summary,
      findings: now.findings,
    }
  })
}

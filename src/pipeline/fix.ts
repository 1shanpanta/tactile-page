import { LIMITS, type RuleId } from '../rules/bana'
import { cloneBitmap, stampDisc, stampLine, type Bitmap, type Box } from './bitmap'
import { extentPx, labelComponents, type Component } from './components'
import {
  findCloseGaps,
  findDashChains,
  findFrame,
  findPoints,
  findThinStrokes,
  indexInk,
  type DashChain,
} from './measure'

/** Marks smaller than this cannot be felt on swell paper. Our choice, not a BANA figure. */
export const SPECK_MM = 0.75

export type RemovalReason = 'you' | 'speck' | 'frame' | 'too-close'

export interface DiagramElement {
  /** Shape id in the untouched input. It stays the same across edits. */
  id: number
  /** Bounding box in millimetres. */
  box: Box
  removedBy: RemovalReason | null
}

export interface Change {
  rule: RuleId | 'despeckle'
  message: string
}

export interface FixOptions {
  /** Elements the teacher removed. */
  remove?: ReadonlySet<number>
  /** Elements the teacher restored, which no automatic step may remove. */
  keep?: ReadonlySet<number>
  /** Areas the teacher rubbed out, in millimetres. */
  erase?: readonly Box[]
}

export interface FixResult {
  ink: Bitmap
  changes: Change[]
  elements: DiagramElement[]
}

function boxOf(shape: Component, pxPerMm: number): Box {
  return {
    x: shape.minX / pxPerMm,
    y: shape.minY / pxPerMm,
    w: (shape.maxX - shape.minX + 1) / pxPerMm,
    h: (shape.maxY - shape.minY + 1) / pxPerMm,
  }
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`
}

/** Lays out dashes that fill the line exactly, with spaces half as long as a dash. */
export function layoutDashes(lengthMm: number): { dashMm: number; gapMm: number; count: number } | null {
  const ratio = LIMITS.dashGapRatio
  const count = Math.ceil((lengthMm / LIMITS.dashMaxMm + ratio) / (1 + ratio))
  const dashMm = lengthMm / (count * (1 + ratio) - ratio)
  if (count < 2 || dashMm < LIMITS.dashMinMm) return null
  return { dashMm, gapMm: dashMm * ratio, count }
}

function drawDashes(target: Bitmap, chain: DashChain, pxPerMm: number, widthPx: number): boolean {
  const lengthPx = Math.hypot(chain.x2 - chain.x1, chain.y2 - chain.y1)
  const layout = layoutDashes(lengthPx / pxPerMm)
  if (!layout) return false
  const ux = (chain.x2 - chain.x1) / lengthPx
  const uy = (chain.y2 - chain.y1) / lengthPx
  const dash = layout.dashMm * pxPerMm
  const pitch = (layout.dashMm + layout.gapMm) * pxPerMm
  // Round ends add half a width at each end, so the stroke is drawn that much shorter.
  const cap = widthPx / 2
  for (let i = 0; i < layout.count; i++) {
    const from = i * pitch + cap
    const to = i * pitch + dash - cap
    stampLine(
      target,
      chain.x1 + ux * from,
      chain.y1 + uy * from,
      chain.x1 + ux * to,
      chain.y1 + uy * to,
      widthPx,
    )
  }
  return true
}

/**
 * Applies every automatic fix to a binarized drawing. Whole shapes are removed
 * first, so the ids the teacher sees always refer to the untouched input.
 */
export function autoFix(input: Bitmap, pxPerMm: number, options: FixOptions = {}): FixResult {
  const remove = options.remove ?? new Set<number>()
  const keep = options.keep ?? new Set<number>()
  const { width, height } = input
  const raw = labelComponents(input.data, width, height)
  const removedBy = new Map<number, RemovalReason>()
  const changes: Change[] = []
  const work = cloneBitmap(input)

  const erase = (ids: ReadonlySet<number>, labels: Int32Array) => {
    for (let i = 0; i < work.data.length; i++) {
      if (ids.has(labels[i])) work.data[i] = 0
    }
  }

  for (const shape of raw.components) {
    if (remove.has(shape.id)) removedBy.set(shape.id, 'you')
    else if (extentPx(shape) < SPECK_MM * pxPerMm && !keep.has(shape.id)) {
      removedBy.set(shape.id, 'speck')
    }
  }
  erase(new Set(removedBy.keys()), raw.labels)
  // Rubbing out happens after the shapes are numbered, so the ids the teacher sees stay stable.
  for (const box of options.erase ?? []) {
    const x0 = Math.max(0, Math.floor(box.x * pxPerMm))
    const y0 = Math.max(0, Math.floor(box.y * pxPerMm))
    const x1 = Math.min(width, Math.ceil((box.x + box.w) * pxPerMm))
    const y1 = Math.min(height, Math.ceil((box.y + box.h) * pxPerMm))
    for (let y = y0; y < y1; y++) work.data.fill(0, y * width + x0, y * width + x1)
  }
  const specks = [...removedBy.values()].filter((reason) => reason === 'speck').length
  if (specks > 0) {
    changes.push({
      rule: 'despeckle',
      message: `${plural(specks, 'speck', 'specks')} smaller than ${SPECK_MM} mm removed.`,
    })
  }

  let index = indexInk(work, pxPerMm)
  const rawIdAt = (shape: Component): number => {
    for (let y = shape.minY; y <= shape.maxY; y++) {
      for (let x = shape.minX; x <= shape.maxX; x++) {
        const i = y * width + x
        if (index.shapes.labels[i] === shape.id && raw.labels[i] !== 0) return raw.labels[i]
      }
    }
    return 0
  }

  const frame = findFrame(index)
  if (frame) {
    const rawId = rawIdAt(frame)
    if (!keep.has(rawId)) {
      removedBy.set(rawId, 'frame')
      erase(new Set([frame.id]), index.shapes.labels)
      changes.push({ rule: 'frame', message: 'The frame around the graphic was removed.' })
      index = indexInk(work, pxPerMm)
    }
  }

  const chains = findDashChains(index)
  const redrawn = chains.filter(
    (chain) =>
      layoutDashes(Math.hypot(chain.x2 - chain.x1, chain.y2 - chain.y1) / pxPerMm) !== null,
  )
  const dashIds = new Set(chains.flatMap((chain) => chain.members))
  const points = findPoints(index, dashIds)
  erase(new Set(redrawn.flatMap((chain) => chain.members)), index.shapes.labels)

  // Lines are brought to one pixel over the minimum, and anything under that target is
  // treated as thin, so a line that sits right on the limit cannot pass in one place and fail in the next.
  const targetPx = LIMITS.minLineWidthMm * pxPerMm + 1
  const thin = findThinStrokes(index, targetPx / pxPerMm)
  let thickened = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      if (thin.mask[i] === 0 || work.data[i] === 0) continue
      const d = index.toPaper.dist[i]
      let ridge = true
      for (let oy = -1; oy <= 1 && ridge; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          // Half a pixel of slack keeps the centre line unbroken on a slanted stroke,
          // where the distance values wobble from one pixel to the next.
          if (index.toPaper.dist[i + oy * width + ox] > d + 0.5) {
            ridge = false
            break
          }
        }
      }
      if (!ridge) continue
      stampDisc(work, x, y, targetPx / 2, 1)
      thickened++
    }
  }
  if (thickened > 0) {
    changes.push({
      rule: 'line-weight',
      message: `Thin lines were thickened to ${(targetPx / pxPerMm).toFixed(2)} mm.`,
    })
  }

  const thick = indexInk(work, pxPerMm)
  const pointShapes = new Set<number>()
  for (const point of points) {
    const id = thick.shapes.labels[Math.round(point.cy) * width + Math.round(point.cx)]
    if (point.isolated && id !== 0) pointShapes.add(id)
  }
  const byId = new Map(thick.shapes.components.map((shape) => [shape.id, shape]))
  const dropped = new Set<number>()
  for (const gap of findCloseGaps(thick, LIMITS.minGapMm)) {
    if (dropped.has(gap.a) || dropped.has(gap.b)) continue
    // Each part of the pair that is too short to be a line is a detail, and goes.
    for (const small of [byId.get(gap.a)!, byId.get(gap.b)!]) {
      if (extentPx(small) >= LIMITS.minLineLengthMm * pxPerMm || pointShapes.has(small.id)) continue
      let rawId = 0
      for (let y = small.minY; y <= small.maxY && rawId === 0; y++) {
        for (let x = small.minX; x <= small.maxX; x++) {
          const i = y * width + x
          if (thick.shapes.labels[i] === small.id && raw.labels[i] !== 0) {
            rawId = raw.labels[i]
            break
          }
        }
      }
      if (keep.has(rawId)) continue
      dropped.add(small.id)
      removedBy.set(rawId, 'too-close')
    }
  }
  if (dropped.size > 0) {
    erase(dropped, thick.shapes.labels)
    changes.push({
      rule: 'spacing',
      message: `${plural(dropped.size, 'small detail', 'small details')} closer than ${LIMITS.minGapMm} mm to another part removed.`,
    })
  }

  const minRadius = (LIMITS.minPointDiameterMm * pxPerMm) / 2 + 0.5
  const clear = LIMITS.minGapMm * pxPerMm + 1
  // A dashed line that runs into a point stops at the clear ring, so no dash is cut short.
  const outsideRings = (x: number, y: number, ux: number, uy: number): [number, number] => {
    for (const point of points) {
      const ring = Math.max(point.radius, minRadius) + clear + 1
      for (let step = 0; step < ring * 2 && Math.hypot(x - point.cx, y - point.cy) < ring; step++) {
        x += ux
        y += uy
      }
    }
    return [x, y]
  }
  const dashWidthPx = Math.max(targetPx, LIMITS.dashedLineWidthMm * pxPerMm)
  for (const chain of redrawn) {
    const length = Math.hypot(chain.x2 - chain.x1, chain.y2 - chain.y1)
    const ux = (chain.x2 - chain.x1) / length
    const uy = (chain.y2 - chain.y1) / length
    const [x1, y1] = outsideRings(chain.x1, chain.y1, ux, uy)
    const [x2, y2] = outsideRings(chain.x2, chain.y2, -ux, -uy)
    drawDashes(work, { ...chain, x1, y1, x2, y2 }, pxPerMm, dashWidthPx)
  }
  if (redrawn.length > 0) {
    changes.push({
      rule: 'dashes',
      message: `${plural(redrawn.length, 'dashed line', 'dashed lines')} drawn again with standard dashes.`,
    })
  }

  const enlarged = points.filter((point) => point.radius < minRadius - 1).length
  const ringHasInk = (cx: number, cy: number, inner: number, outer: number): boolean => {
    for (let y = Math.max(0, Math.floor(cy - outer)); y <= Math.min(height - 1, cy + outer); y++) {
      for (let x = Math.max(0, Math.floor(cx - outer)); x <= Math.min(width - 1, cx + outer); x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2
        if (d2 > inner * inner && d2 <= outer * outer && work.data[y * width + x] === 1) return true
      }
    }
    return false
  }
  const rings = points.map((point) => {
    const disc = Math.max(point.radius, minRadius)
    return { point, outer: disc + clear, crowded: ringHasInk(point.cx, point.cy, disc + 1, disc + clear) }
  })
  const cleared = rings.filter((ring) => ring.crowded).length
  // All rings are cleared before any disc is drawn, so two near points keep both discs.
  for (const ring of rings) stampDisc(work, ring.point.cx, ring.point.cy, ring.outer, 0)
  for (const point of points) {
    stampDisc(work, point.cx, point.cy, Math.max(point.radius, minRadius), 1)
  }
  if (enlarged > 0) {
    changes.push({
      rule: 'point-size',
      message: `${plural(enlarged, 'point', 'points')} enlarged to ${LIMITS.minPointDiameterMm} mm.`,
    })
  }
  if (cleared > 0) {
    changes.push({
      rule: 'point-clearance',
      message: `A ${LIMITS.minGapMm} mm ring was cleared around ${plural(cleared, 'point', 'points')}.`,
    })
  }

  const elements = raw.components
    .filter((shape) => extentPx(shape) >= SPECK_MM * pxPerMm || removedBy.get(shape.id) === 'you')
    .map((shape) => ({
      id: shape.id,
      box: boxOf(shape, pxPerMm),
      removedBy: removedBy.get(shape.id) ?? null,
    }))
  return { ink: work, changes, elements }
}

import type { Bitmap } from './bitmap'
import { extentPx, fillRatio, labelComponents, type Component, type Labelling } from './components'
import { distanceField, type DistanceField } from './distance'

/** Everything the detectors need about one bitmap, computed once. */
export interface InkIndex {
  ink: Bitmap
  pxPerMm: number
  /** For ink pixels: distance to the nearest paper pixel. */
  toPaper: DistanceField
  /** For paper pixels: distance to the nearest ink pixel, and which one. */
  toInk: DistanceField
  shapes: Labelling
  /** Connected paper regions. Region 1 is the open paper around the drawing. */
  paper: Labelling
}

export function indexInk(ink: Bitmap, pxPerMm: number): InkIndex {
  return {
    ink,
    pxPerMm,
    toPaper: distanceField(ink.data, ink.width, ink.height, 0),
    toInk: distanceField(ink.data, ink.width, ink.height, 1),
    shapes: labelComponents(ink.data, ink.width, ink.height),
    paper: labelComponents(ink.data, ink.width, ink.height, 0, 4),
  }
}

/** True when the point lies in paper that ink closes off from the page edge. */
export function isEnclosed(index: InkIndex, xMm: number, yMm: number): boolean {
  const { ink, pxPerMm, paper } = index
  const x = Math.round(xMm * pxPerMm)
  const y = Math.round(yMm * pxPerMm)
  if (x < 0 || y < 0 || x >= ink.width || y >= ink.height) return false
  const region = paper.labels[y * ink.width + x]
  return region !== 0 && region !== paper.labels[0]
}

/** A thin stretch shorter than this is a corner or a line end, not a thin line. */
const THIN_MIN_LENGTH_MM = 1.5

export interface ThinStrokes {
  /** 1 where an ink pixel belongs to a stroke thinner than the minimum. */
  mask: Uint8Array
  regions: Component[]
}

/**
 * A stroke is thick enough when a disc of the minimum width fits inside it.
 * Ink that no such disc can reach is thin. Tiny leftovers at sharp corners are
 * ignored, because every corner of every shape has one.
 */
export function findThinStrokes(index: InkIndex, minWidthMm: number): ThinStrokes {
  const { ink, pxPerMm, toPaper } = index
  // Distances run between pixel centres, so the centre of a stroke w pixels wide is about
  // w / 2 + 0.5 from paper. The margin is a little under that, to allow for the grid.
  const half = (minWidthMm * pxPerMm) / 2 + 0.4
  const core = new Uint8Array(ink.data.length)
  for (let i = 0; i < core.length; i++) {
    if (ink.data[i] === 1 && toPaper.dist[i] >= half) core[i] = 1
  }
  const toCore = distanceField(core, ink.width, ink.height, 1)
  const thin = new Uint8Array(ink.data.length)
  for (let i = 0; i < thin.length; i++) {
    if (ink.data[i] === 1 && toCore.dist[i] > half) thin[i] = 1
  }
  const labelled = labelComponents(thin, ink.width, ink.height)
  // The square end of a cut line leaves a sliver as wide as the line itself.
  const minExtent = THIN_MIN_LENGTH_MM * pxPerMm
  const regions = labelled.components.filter((region) => extentPx(region) >= minExtent)
  const keep = new Set(regions.map((region) => region.id))
  const mask = new Uint8Array(thin.length)
  for (let i = 0; i < mask.length; i++) {
    if (keep.has(labelled.labels[i])) mask[i] = 1
  }
  return { mask, regions }
}

export interface PointSymbol {
  /** Centre and radius in pixels. */
  cx: number
  cy: number
  radius: number
  /** Shape id in the index the point was found in. */
  shapeId: number
  /** True when the point is its own shape, false when it sits on a line. */
  isolated: boolean
}

const POINT_MAX_DIAMETER_MM = 8
const POINT_MIN_DIAMETER_MM = 0.8

function isRoundBlob(shape: Component, pxPerMm: number): boolean {
  const w = shape.maxX - shape.minX + 1
  const h = shape.maxY - shape.minY + 1
  const aspect = w / h
  const extent = extentPx(shape) / pxPerMm
  return (
    extent >= POINT_MIN_DIAMETER_MM &&
    extent <= POINT_MAX_DIAMETER_MM &&
    aspect >= 0.7 &&
    aspect <= 1.43 &&
    fillRatio(shape) >= 0.65
  )
}

/**
 * Finds filled dots: small round shapes, and round swellings on a line that
 * are clearly wider than the line. `skip` holds shape ids to leave alone.
 */
export function findPoints(index: InkIndex, skip: ReadonlySet<number> = new Set()): PointSymbol[] {
  const { ink, pxPerMm, toPaper, shapes } = index
  const { width, height } = ink
  const points: PointSymbol[] = []
  const onLine = new Set<number>()

  for (const shape of shapes.components) {
    if (skip.has(shape.id)) continue
    if (isRoundBlob(shape, pxPerMm)) {
      points.push({
        cx: shape.cx,
        cy: shape.cy,
        radius: extentPx(shape) / 2,
        shapeId: shape.id,
        isolated: true,
      })
    } else {
      onLine.add(shape.id)
    }
  }

  // The usual stroke half width of each shape is the median distance to paper.
  const BUCKETS = 64
  const histogram = new Uint32Array((shapes.components.length + 1) * BUCKETS)
  for (let i = 0; i < ink.data.length; i++) {
    const id = shapes.labels[i]
    if (id === 0 || !onLine.has(id)) continue
    const bucket = Math.min(BUCKETS - 1, Math.round(toPaper.dist[i] * 2))
    histogram[id * BUCKETS + bucket]++
  }
  const threshold = new Float32Array(shapes.components.length + 1).fill(Infinity)
  for (const shape of shapes.components) {
    if (!onLine.has(shape.id)) continue
    let seen = 0
    let median = 0
    for (let bucket = 0; bucket < BUCKETS; bucket++) {
      seen += histogram[shape.id * BUCKETS + bucket]
      if (seen * 2 >= shape.area) {
        median = bucket / 2
        break
      }
    }
    threshold[shape.id] = Math.max(2.5 * median + 1.5, (POINT_MIN_DIAMETER_MM * pxPerMm) / 2)
  }

  const core = new Uint8Array(ink.data.length)
  for (let i = 0; i < core.length; i++) {
    const id = shapes.labels[i]
    if (id !== 0 && toPaper.dist[i] >= threshold[id]) core[i] = 1
  }
  const cores = labelComponents(core, width, height)
  const peak = new Float32Array(cores.components.length + 1)
  const peakAt = new Int32Array(cores.components.length + 1)
  for (let i = 0; i < core.length; i++) {
    const id = cores.labels[i]
    if (id !== 0 && toPaper.dist[i] > peak[id]) {
      peak[id] = toPaper.dist[i]
      peakAt[id] = i
    }
  }

  for (const blob of cores.components) {
    const radius = peak[blob.id] - 0.5
    if (radius * 2 > POINT_MAX_DIAMETER_MM * pxPerMm) continue
    const bw = blob.maxX - blob.minX + 1
    const bh = blob.maxY - blob.minY + 1
    if (bw / bh < 0.6 || bw / bh > 1.67) continue
    const cx = peakAt[blob.id] % width
    const cy = (peakAt[blob.id] / width) | 0
    // A disc has little ink just outside itself. An arrowhead has a lot.
    const inner = radius + 1.5
    const outer = Math.max(inner + 2, radius * 1.6)
    let ring = 0
    let ringInk = 0
    for (let y = Math.max(0, Math.floor(cy - outer)); y <= Math.min(height - 1, cy + outer); y++) {
      for (let x = Math.max(0, Math.floor(cx - outer)); x <= Math.min(width - 1, cx + outer); x++) {
        const d = Math.hypot(x - cx, y - cy)
        if (d < inner || d > outer) continue
        ring++
        ringInk += ink.data[y * width + x]
      }
    }
    if (ring > 0 && ringInk / ring > 0.3) continue
    points.push({ cx, cy, radius, shapeId: shapes.labels[peakAt[blob.id]], isolated: false })
  }
  return points
}

export interface DashChain {
  /** Shape ids of the dashes, in order along the line. */
  members: number[]
  x1: number
  y1: number
  x2: number
  y2: number
  /** Length of each dash and of each space between dashes, in pixels. */
  dashLengths: number[]
  gapLengths: number[]
}

const DASH_MAX_EXTENT_MM = 12
/** Above this many small shapes the picture is noise or texture, and pairing them all is too slow. */
const DASH_MAX_CANDIDATES = 800
const DASH_STRAIGHTNESS_MM = 0.8

/** Finds straight rows of three or more short, similar, evenly spaced shapes. */
export function findDashChains(index: InkIndex): DashChain[] {
  const { pxPerMm, shapes } = index
  const candidates = shapes.components.filter(
    (shape) => extentPx(shape) <= DASH_MAX_EXTENT_MM * pxPerMm,
  )
  if (candidates.length > DASH_MAX_CANDIDATES) return []
  const similar = (a: Component, b: Component): boolean => {
    const ea = extentPx(a)
    const eb = extentPx(b)
    return Math.max(ea, eb) / Math.min(ea, eb) <= 2.5
  }
  const pairs: { a: Component; b: Component; distance: number }[] = []
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]
      const b = candidates[j]
      const distance = Math.hypot(a.cx - b.cx, a.cy - b.cy)
      if (similar(a, b) && distance <= 2.6 * Math.max(extentPx(a), extentPx(b)) + 2) {
        pairs.push({ a, b, distance })
      }
    }
  }
  pairs.sort((p, q) => p.distance - q.distance)

  // A chain grows from its two nearest dashes by repeating the same step. A corner
  // changes the step, so two dashed lines that meet stay two chains.
  const used = new Set<number>()
  const groups: Component[][] = []
  const grow = (group: Component[], from: Component, to: Component, atEnd: boolean) => {
    let prev = from
    let last = to
    for (;;) {
      const px = 2 * last.cx - prev.cx
      const py = 2 * last.cy - prev.cy
      const reach = 0.35 * Math.hypot(last.cx - prev.cx, last.cy - prev.cy)
      const next = candidates.find(
        (c) =>
          !used.has(c.id) &&
          !group.includes(c) &&
          similar(c, last) &&
          Math.hypot(c.cx - px, c.cy - py) <= reach,
      )
      if (!next) return
      if (atEnd) group.push(next)
      else group.unshift(next)
      prev = last
      last = next
    }
  }
  for (const { a, b } of pairs) {
    if (used.has(a.id) || used.has(b.id)) continue
    const group = [a, b]
    grow(group, a, b, true)
    grow(group, b, a, false)
    if (group.length < 3) continue
    for (const member of group) used.add(member.id)
    groups.push(group)
  }

  const chains: DashChain[] = []
  for (const group of groups) {
    const mx = group.reduce((sum, s) => sum + s.cx, 0) / group.length
    const my = group.reduce((sum, s) => sum + s.cy, 0) / group.length
    let sxx = 0
    let sxy = 0
    let syy = 0
    for (const s of group) {
      sxx += (s.cx - mx) ** 2
      sxy += (s.cx - mx) * (s.cy - my)
      syy += (s.cy - my) ** 2
    }
    const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy)
    const ax = Math.cos(angle)
    const ay = Math.sin(angle)
    const offLine = Math.max(...group.map((s) => Math.abs(-(s.cx - mx) * ay + (s.cy - my) * ax)))
    if (offLine > DASH_STRAIGHTNESS_MM * pxPerMm) continue

    const spans = group
      .map((s) => {
        const corners = [
          [s.minX, s.minY],
          [s.maxX + 1, s.minY],
          [s.minX, s.maxY + 1],
          [s.maxX + 1, s.maxY + 1],
        ]
        const along = corners.map(([x, y]) => (x - mx) * ax + (y - my) * ay)
        const across = corners.map(([x, y]) => -(x - mx) * ay + (y - my) * ax)
        return {
          id: s.id,
          from: Math.min(...along),
          to: Math.max(...along),
          wide: Math.max(...across) - Math.min(...across),
        }
      })
      .sort((p, q) => p.from - q.from)
    // Short parallel lines stacked side by side are hatching, not a dashed line.
    if (spans.some((span) => span.wide > 1.5 * (span.to - span.from) + 2)) continue
    const first = spans[0]
    const last = spans[spans.length - 1]
    chains.push({
      members: spans.map((span) => span.id),
      x1: mx + ax * first.from,
      y1: my + ay * first.from,
      x2: mx + ax * last.to,
      y2: my + ay * last.to,
      dashLengths: spans.map((span) => span.to - span.from),
      gapLengths: spans.slice(1).map((span, i) => span.from - spans[i].to),
    })
  }
  return chains
}

export interface Gap {
  /** Shape ids of the two parts. */
  a: number
  b: number
  gapMm: number
  /** Where the two parts are closest, in pixels. */
  x: number
  y: number
}

/**
 * Lists every pair of separate shapes closer than `limitMm`. Two neighbouring
 * pixels whose nearest ink belongs to different shapes sit on the border
 * between those shapes, and their two seeds span the gap.
 */
export function findCloseGaps(index: InkIndex, limitMm: number): Gap[] {
  const { ink, pxPerMm, toInk, shapes } = index
  const { width, height } = ink
  const best = new Map<number, Gap>()
  const count = shapes.components.length + 1
  const consider = (i: number, j: number) => {
    const si = toInk.seed[i]
    const sj = toInk.seed[j]
    if (si === -1 || sj === -1) return
    const a = shapes.labels[si]
    const b = shapes.labels[sj]
    if (a === b) return
    const ax = si % width
    const ay = (si / width) | 0
    const bx = sj % width
    const by = (sj / width) | 0
    const gapMm = Math.max(0, Math.hypot(ax - bx, ay - by) - 1) / pxPerMm
    if (gapMm >= limitMm) return
    const key = Math.min(a, b) * count + Math.max(a, b)
    const known = best.get(key)
    if (!known || gapMm < known.gapMm) {
      best.set(key, {
        a: Math.min(a, b),
        b: Math.max(a, b),
        gapMm,
        x: (ax + bx) / 2,
        y: (ay + by) / 2,
      })
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (x < width - 1) consider(i, i + 1)
      if (y < height - 1) consider(i, i + width)
    }
  }
  return [...best.values()].sort((p, q) => p.gapMm - q.gapMm)
}

const FRAME_BAND_MM = 2

/**
 * A frame is a shape that spans the whole drawing, has all its ink near its
 * own bounding box, and holds other shapes. Axes or a cell wall fail the
 * second test because they carry ink in the middle.
 */
export function findFrame(index: InkIndex): Component | null {
  const { ink, pxPerMm, shapes } = index
  if (shapes.components.length < 3) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of shapes.components) {
    minX = Math.min(minX, s.minX)
    minY = Math.min(minY, s.minY)
    maxX = Math.max(maxX, s.maxX)
    maxY = Math.max(maxY, s.maxY)
  }
  const band = FRAME_BAND_MM * pxPerMm
  for (const s of shapes.components) {
    const w = s.maxX - s.minX
    const h = s.maxY - s.minY
    if (w < 0.97 * (maxX - minX) || h < 0.97 * (maxY - minY)) continue
    if (w < band * 4 || h < band * 4) continue
    let near = 0
    for (let y = s.minY; y <= s.maxY; y++) {
      for (let x = s.minX; x <= s.maxX; x++) {
        if (shapes.labels[y * ink.width + x] !== s.id) continue
        const edge = Math.min(x - s.minX, s.maxX - x, y - s.minY, s.maxY - y)
        if (edge <= band) near++
      }
    }
    if (near / s.area >= 0.98) return s
  }
  return null
}

/** Smallest distance in millimetres from a box to any ink. Zero when it holds ink. */
export function boxClearanceMm(
  index: InkIndex,
  box: { x: number; y: number; w: number; h: number },
): number {
  const { ink, pxPerMm, toInk } = index
  const x0 = Math.round(box.x * pxPerMm)
  const y0 = Math.round(box.y * pxPerMm)
  const x1 = Math.round((box.x + box.w) * pxPerMm)
  const y1 = Math.round((box.y + box.h) * pxPerMm)
  let nearest = Infinity
  const STEP = 2
  for (let y = y0; y <= y1; y += STEP) {
    for (let x = x0; x <= x1; x += STEP) {
      // Outside the bitmap there is no ink, but ink near the edge still counts.
      const cx = Math.min(ink.width - 1, Math.max(0, x))
      const cy = Math.min(ink.height - 1, Math.max(0, y))
      const d = toInk.dist[cy * ink.width + cx] + Math.hypot(x - cx, y - cy)
      if (d < nearest) nearest = d
    }
  }
  return nearest / pxPerMm
}

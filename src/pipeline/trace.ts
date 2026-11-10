import type { Bitmap } from './bitmap'

/** A closed outline as a flat list of x, y pairs in millimetres. */
export type Outline = number[]

const RIGHT = 0
const DOWN = 1
const LEFT = 2
const UP = 3
const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]

function pointLineDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const length2 = dx * dx + dy * dy
  if (length2 === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2))
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

/** Ramer-Douglas-Peucker on an open run of points. Keeps both ends. */
function simplifyRun(points: number[], tolerance: number): number[] {
  const count = points.length / 2
  if (count <= 2) return points
  const keep = new Uint8Array(count)
  keep[0] = 1
  keep[count - 1] = 1
  const stack: [number, number][] = [[0, count - 1]]
  while (stack.length > 0) {
    const [from, to] = stack.pop()!
    let worst = 0
    let worstAt = -1
    for (let i = from + 1; i < to; i++) {
      const d = pointLineDistance(
        points[i * 2],
        points[i * 2 + 1],
        points[from * 2],
        points[from * 2 + 1],
        points[to * 2],
        points[to * 2 + 1],
      )
      if (d > worst) {
        worst = d
        worstAt = i
      }
    }
    if (worst > tolerance) {
      keep[worstAt] = 1
      stack.push([from, worstAt], [worstAt, to])
    }
  }
  const out: number[] = []
  for (let i = 0; i < count; i++) if (keep[i]) out.push(points[i * 2], points[i * 2 + 1])
  return out
}

/** Simplifies a closed loop by cutting it at its two most distant corners. */
export function simplifyLoop(loop: number[], tolerance: number): number[] {
  const count = loop.length / 2
  if (count <= 4) return loop
  let far = 0
  let farDistance = -1
  for (let i = 1; i < count; i++) {
    const d = Math.hypot(loop[i * 2] - loop[0], loop[i * 2 + 1] - loop[1])
    if (d > farDistance) {
      farDistance = d
      far = i
    }
  }
  const first = simplifyRun(loop.slice(0, far * 2 + 2), tolerance)
  const second = simplifyRun([...loop.slice(far * 2), loop[0], loop[1]], tolerance)
  return [...first.slice(0, -2), ...second.slice(0, -2)]
}

/**
 * Traces every ink boundary as a closed polygon along pixel edges, then
 * simplifies it. Holes come out as their own loops, so the result must be
 * filled with the even-odd rule.
 */
export function traceOutlines(ink: Bitmap, pxPerMm: number, tolerancePx = 0.75): Outline[] {
  const { width, height, data } = ink
  const stride = width + 1
  // One bit per direction for each grid corner: an unused boundary edge leaves it.
  const edges = new Uint8Array(stride * (height + 1))
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : data[y * width + x]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] === 0) continue
      if (at(x, y - 1) === 0) edges[y * stride + x] |= 1 << RIGHT
      if (at(x + 1, y) === 0) edges[y * stride + x + 1] |= 1 << DOWN
      if (at(x, y + 1) === 0) edges[(y + 1) * stride + x + 1] |= 1 << LEFT
      if (at(x - 1, y) === 0) edges[(y + 1) * stride + x] |= 1 << UP
    }
  }

  const outlines: Outline[] = []
  for (let start = 0; start < edges.length; start++) {
    while (edges[start] !== 0) {
      const loop: number[] = []
      let vertex = start
      let direction = [RIGHT, DOWN, LEFT, UP].find((d) => edges[start] & (1 << d))!
      let previous = -1
      // Every corner has as many edges in as out, so the walk can only stop back at its start.
      for (;;) {
        edges[vertex] &= ~(1 << direction)
        if (direction !== previous) loop.push(vertex % stride, Math.floor(vertex / stride))
        previous = direction
        vertex += DX[direction] + DY[direction] * stride
        // Where two loops share a corner, turning right keeps each loop simple.
        const turns = [(direction + 1) % 4, direction, (direction + 3) % 4]
        const next = turns.find((d) => edges[vertex] & (1 << d))
        if (next === undefined) break
        direction = next
      }
      const simple = simplifyLoop(loop, tolerancePx)
      if (simple.length >= 6) outlines.push(simple.map((value) => value / pxPerMm))
    }
  }
  return outlines
}

/** Corners are rounded by at most this much. A fingertip cannot feel a quarter of a millimetre. */
export const CORNER_MM = 0.25

export interface Corner {
  /** Where the curve leaves the edge before the vertex. */
  ax: number
  ay: number
  /** The vertex, used as the control point of a quadratic curve. */
  vx: number
  vy: number
  /** Where the curve joins the edge after the vertex. */
  bx: number
  by: number
}

/**
 * Turns each vertex of a polygon into a short curve. Short edges, as on a
 * traced circle, are rounded up to their midpoints, so a dot comes out round
 * instead of as a polygon. Long edges keep all but `cornerMm` of their length.
 */
export function roundCorners(outline: Outline, cornerMm: number): Corner[] {
  const count = outline.length / 2
  const corners: Corner[] = []
  for (let i = 0; i < count; i++) {
    const p = ((i + count - 1) % count) * 2
    const n = ((i + 1) % count) * 2
    const vx = outline[i * 2]
    const vy = outline[i * 2 + 1]
    const toPrev = Math.hypot(outline[p] - vx, outline[p + 1] - vy)
    const toNext = Math.hypot(outline[n] - vx, outline[n + 1] - vy)
    const back = toPrev === 0 ? 0 : Math.min(0.5, cornerMm / toPrev)
    const ahead = toNext === 0 ? 0 : Math.min(0.5, cornerMm / toNext)
    corners.push({
      ax: vx + (outline[p] - vx) * back,
      ay: vy + (outline[p + 1] - vy) * back,
      vx,
      vy,
      bx: vx + (outline[n] - vx) * ahead,
      by: vy + (outline[n + 1] - vy) * ahead,
    })
  }
  return corners
}

/** SVG path data for a set of outlines, moved by (dx, dy) millimetres. */
export function outlinesToPath(
  outlines: readonly Outline[],
  dx = 0,
  dy = 0,
  cornerMm = CORNER_MM,
): string {
  const at = (x: number, y: number) => `${(x + dx).toFixed(2)} ${(y + dy).toFixed(2)}`
  const parts: string[] = []
  for (const outline of outlines) {
    roundCorners(outline, cornerMm).forEach((c, i) => {
      parts.push(`${i === 0 ? 'M' : 'L'}${at(c.ax, c.ay)}`)
      if (cornerMm > 0) parts.push(`Q${at(c.vx, c.vy)} ${at(c.bx, c.by)}`)
    })
    parts.push('Z')
  }
  return parts.join('')
}

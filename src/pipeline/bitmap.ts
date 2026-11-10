/** A binary raster. `data[y * width + x]` is 1 for ink and 0 for paper. */
export interface Bitmap {
  width: number
  height: number
  data: Uint8Array
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export function createBitmap(width: number, height: number): Bitmap {
  return { width, height, data: new Uint8Array(width * height) }
}

export function cloneBitmap(source: Bitmap): Bitmap {
  return { width: source.width, height: source.height, data: source.data.slice() }
}

/** Sets every pixel inside the disc. Pixels outside the bitmap are skipped. */
export function stampDisc(target: Bitmap, cx: number, cy: number, radius: number, value: 0 | 1): void {
  const r2 = radius * radius
  const y0 = Math.max(0, Math.ceil(cy - radius))
  const y1 = Math.min(target.height - 1, Math.floor(cy + radius))
  const x0 = Math.max(0, Math.ceil(cx - radius))
  const x1 = Math.min(target.width - 1, Math.floor(cx + radius))
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx
      if (dx * dx + dy * dy <= r2) target.data[y * target.width + x] = value
    }
  }
}

/** Draws a straight stroke with round ends, as a row of overlapping discs. */
export function stampLine(
  target: Bitmap,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
): void {
  const length = Math.hypot(x2 - x1, y2 - y1)
  const steps = Math.max(1, Math.ceil(length * 2))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    stampDisc(target, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, width / 2, 1)
  }
}

export function countInk(bitmap: Bitmap): number {
  let total = 0
  for (let i = 0; i < bitmap.data.length; i++) total += bitmap.data[i]
  return total
}

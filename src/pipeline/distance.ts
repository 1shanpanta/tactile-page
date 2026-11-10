export interface DistanceField {
  /** Distance in pixels from each pixel to its nearest seed pixel. */
  dist: Float32Array
  /** Index of that nearest seed pixel, or -1 when the mask has no seed. */
  seed: Int32Array
}

/**
 * Sequential Euclidean distance map (the 8SSEDT method) that also keeps which seed
 * is nearest. The seed index is what lets one pass answer "how far apart are
 * two different shapes", which a plain distance map cannot.
 */
export function distanceField(
  mask: Uint8Array,
  width: number,
  height: number,
  seedValue: 0 | 1,
): DistanceField {
  const size = width * height
  const seed = new Int32Array(size).fill(-1)
  const d2 = new Float64Array(size).fill(Infinity)
  for (let i = 0; i < size; i++) {
    if (mask[i] === seedValue) {
      seed[i] = i
      d2[i] = 0
    }
  }

  const take = (i: number, x: number, y: number, neighbour: number) => {
    const s = seed[neighbour]
    if (s === -1) return
    const dx = (s % width) - x
    const dy = ((s / width) | 0) - y
    const candidate = dx * dx + dy * dy
    if (candidate < d2[i]) {
      d2[i] = candidate
      seed[i] = s
    }
  }

  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const i = row + x
      if (d2[i] === 0) continue
      if (x > 0) take(i, x, y, i - 1)
      if (y > 0) {
        take(i, x, y, i - width)
        if (x > 0) take(i, x, y, i - width - 1)
        if (x < width - 1) take(i, x, y, i - width + 1)
      }
    }
    for (let x = width - 2; x >= 0; x--) {
      const i = row + x
      if (d2[i] !== 0) take(i, x, y, i + 1)
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    const row = y * width
    for (let x = width - 1; x >= 0; x--) {
      const i = row + x
      if (d2[i] === 0) continue
      if (x < width - 1) take(i, x, y, i + 1)
      if (y < height - 1) {
        take(i, x, y, i + width)
        if (x < width - 1) take(i, x, y, i + width + 1)
        if (x > 0) take(i, x, y, i + width - 1)
      }
    }
    for (let x = 1; x < width; x++) {
      const i = row + x
      if (d2[i] !== 0) take(i, x, y, i - 1)
    }
  }

  const dist = new Float32Array(size)
  for (let i = 0; i < size; i++) dist[i] = Math.sqrt(d2[i])
  return { dist, seed }
}

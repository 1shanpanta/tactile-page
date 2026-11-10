import type { Bitmap, Box } from './bitmap'
import { fillRatio, labelComponents, type Component } from './components'

export interface TextRegion {
  /** Bounding box of the whole word or line, in millimetres. */
  box: Box
}

const GLYPH_MIN_MM = 0.8
const GLYPH_MAX_MM = 7

/**
 * Finds printed words in a raster picture without reading them: rows of two
 * or more small, letter-sized shapes. It erases them from `ink` and returns
 * where they were. Single letters and vertical text are not found.
 */
export function detectText(ink: Bitmap, pxPerMm: number): TextRegion[] {
  const { width, height } = ink
  const { labels, components } = labelComponents(ink.data, width, height)
  const glyphs = components.filter((shape) => {
    const w = (shape.maxX - shape.minX + 1) / pxPerMm
    const h = (shape.maxY - shape.minY + 1) / pxPerMm
    return Math.max(w, h) >= GLYPH_MIN_MM && Math.max(w, h) <= GLYPH_MAX_MM && w / h <= 3
  })

  const parent = glyphs.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const heightOf = (shape: Component) => shape.maxY - shape.minY + 1
  for (let a = 0; a < glyphs.length; a++) {
    for (let b = a + 1; b < glyphs.length; b++) {
      const p = glyphs[a]
      const q = glyphs[b]
      const tall = Math.max(heightOf(p), heightOf(q))
      const gapX = Math.max(p.minX - q.maxX, q.minX - p.maxX)
      const gapY = Math.max(p.minY - q.maxY, q.minY - p.maxY)
      const sameLine = gapY < 0 && Math.abs(p.cy - q.cy) <= 0.6 * tall && gapX <= 0.9 * tall
      // The dot of an i or j sits just above its stem.
      const stacked = gapX < 0 && gapY >= 0 && gapY <= 0.4 * tall
      if (sameLine || stacked) parent[find(a)] = find(b)
    }
  }
  const groups = new Map<number, Component[]>()
  glyphs.forEach((glyph, i) => {
    const root = find(i)
    groups.set(root, [...(groups.get(root) ?? []), glyph])
  })

  const regions: TextRegion[] = []
  const erased = new Set<number>()
  for (const group of groups.values()) {
    // A row of solid marks is a dotted or dashed line, not a word.
    if (group.length < 2 || group.every((glyph) => fillRatio(glyph) >= 0.7)) continue
    const minX = Math.min(...group.map((g) => g.minX))
    const minY = Math.min(...group.map((g) => g.minY))
    const maxX = Math.max(...group.map((g) => g.maxX))
    const maxY = Math.max(...group.map((g) => g.maxY))
    regions.push({
      box: {
        x: minX / pxPerMm,
        y: minY / pxPerMm,
        w: (maxX - minX + 1) / pxPerMm,
        h: (maxY - minY + 1) / pxPerMm,
      },
    })
    for (const glyph of group) erased.add(glyph.id)
  }
  for (let i = 0; i < ink.data.length; i++) {
    if (erased.has(labels[i])) ink.data[i] = 0
  }
  return regions.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
}

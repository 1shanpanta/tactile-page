import type { Bitmap } from './bitmap'

/** Otsu's threshold over the grey levels 0 to `ceiling`: the level that best splits them in two. */
export function otsuThreshold(histogram: ArrayLike<number>, ceiling = 255): number {
  let count = 0
  let total = 0
  for (let level = 0; level <= ceiling; level++) {
    count += histogram[level]
    total += level * histogram[level]
  }
  let below = 0
  let belowSum = 0
  let best = 0
  let threshold = Math.floor(ceiling / 2)
  for (let level = 0; level <= ceiling; level++) {
    below += histogram[level]
    if (below === 0) continue
    const above = count - below
    if (above === 0) break
    belowSum += level * histogram[level]
    const gap = belowSum / below - (total - belowSum) / above
    const variance = below * above * gap * gap
    if (variance > best) {
      best = variance
      threshold = level
    }
  }
  return threshold
}

/** Line art has little ink. More than this share of dark pixels means the split is wrong. */
const MAX_INK_SHARE = 0.25
/** A dark group lighter than this on average is a pale fill, not ink and not a dark page. */
const PALE_MEAN = 150

/**
 * Turns a greyscale picture into ink and paper. A pale colour fill would
 * otherwise count as ink, so the dark group is split again until only the
 * strokes are left. A picture with a truly dark ground is inverted.
 */
export function binarize(gray: Uint8Array, width: number, height: number): Bitmap {
  const histogram = new Float64Array(256)
  for (let i = 0; i < gray.length; i++) histogram[gray[i]]++

  const darkGroup = (threshold: number) => {
    let count = 0
    let sum = 0
    for (let level = 0; level <= threshold; level++) {
      count += histogram[level]
      sum += level * histogram[level]
    }
    return { share: count / gray.length, mean: count === 0 ? 0 : sum / count }
  }

  let threshold = otsuThreshold(histogram)
  let dark = darkGroup(threshold)
  const inverted = dark.share > 0.5 && dark.mean < PALE_MEAN
  if (inverted) {
    histogram.reverse()
    threshold = otsuThreshold(histogram)
    dark = darkGroup(threshold)
  }
  for (let round = 0; round < 3 && dark.share > MAX_INK_SHARE && dark.mean >= 60; round++) {
    threshold = otsuThreshold(histogram, threshold)
    dark = darkGroup(threshold)
  }

  const data = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i++) {
    const level = inverted ? 255 - gray[i] : gray[i]
    if (level <= threshold) data[i] = 1
  }
  return { width, height, data }
}

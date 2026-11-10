export interface Component {
  /** 1-based id, equal to the value stored in the label map. */
  id: number
  area: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  /** Centroid in pixels. */
  cx: number
  cy: number
}

export interface Labelling {
  /** 0 for pixels outside the mask, otherwise the component id. */
  labels: Int32Array
  components: Component[]
}

/**
 * Labels 8-connected regions of `mask === value`. Ink uses 8-connectivity so a
 * one pixel diagonal line stays one shape.
 */
export function labelComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  value: 0 | 1 = 1,
  connectivity: 4 | 8 = 8,
): Labelling {
  const labels = new Int32Array(width * height)
  const components: Component[] = []
  const stack: number[] = []

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== value || labels[start] !== 0) continue
    const id = components.length + 1
    const component: Component = {
      id,
      area: 0,
      minX: width,
      minY: height,
      maxX: -1,
      maxY: -1,
      cx: 0,
      cy: 0,
    }
    labels[start] = id
    stack.push(start)
    while (stack.length > 0) {
      const i = stack.pop()!
      const x = i % width
      const y = (i / width) | 0
      component.area++
      component.cx += x
      component.cy += y
      if (x < component.minX) component.minX = x
      if (x > component.maxX) component.maxX = x
      if (y < component.minY) component.minY = y
      if (y > component.maxY) component.maxY = y
      for (let oy = -1; oy <= 1; oy++) {
        const ny = y + oy
        if (ny < 0 || ny >= height) continue
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue
          if (connectivity === 4 && ox !== 0 && oy !== 0) continue
          const nx = x + ox
          if (nx < 0 || nx >= width) continue
          const n = ny * width + nx
          if (mask[n] === value && labels[n] === 0) {
            labels[n] = id
            stack.push(n)
          }
        }
      }
    }
    component.cx /= component.area
    component.cy /= component.area
    components.push(component)
  }
  return { labels, components }
}

export function extentPx(component: Component): number {
  return Math.max(component.maxX - component.minX, component.maxY - component.minY) + 1
}

export function fillRatio(component: Component): number {
  const boxArea =
    (component.maxX - component.minX + 1) * (component.maxY - component.minY + 1)
  return component.area / boxArea
}

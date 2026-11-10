import { MARGIN_MM, PX_PER_MM, type PageSpec } from '../export/page'
import { binarize } from '../pipeline/binarize'
import type { Box } from '../pipeline/bitmap'
import type { SourceLabel } from '../pipeline/labels'
import type { PipelineInput } from '../pipeline/run'

export interface LoadedSource {
  name: string
  kind: 'svg' | 'raster'
  /** The untouched picture, for the "before" side. */
  originalUrl: string
  /** Where that picture lies on the working sheet, in millimetres. */
  frame: Box
  input: PipelineInput
}

export type LoadError = 'type' | 'size' | 'unreadable' | 'empty'

export class SourceError extends Error {
  readonly code: LoadError
  constructor(code: LoadError) {
    super(code)
    this.code = code
  }
}

const MAX_BYTES = 15 * 1024 * 1024
const RASTER_TYPES = ['image/png', 'image/jpeg']
/** Space kept clear inside the margins so a thickened line at the edge is not cut. */
const INSET_MM = 2
/** Room below the picture for labels that move down. */
const SPARE_MM = 12
const PROBE_PX = 640

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new SourceError('unreadable'))
    image.src = url
  })
}

function toGray(image: HTMLImageElement, width: number, height: number, draw: Box): Uint8Array {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new SourceError('unreadable')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, draw.x, draw.y, draw.w, draw.h)
  const rgba = context.getImageData(0, 0, width, height).data
  const gray = new Uint8Array(width * height)
  for (let i = 0; i < gray.length; i++) {
    gray[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2])
  }
  return gray
}

/** Bounding box of the ink, as fractions of the picture. Null for a blank picture. */
function inkBounds(image: HTMLImageElement, aspect: number): Box | null {
  const width = PROBE_PX
  const height = Math.max(1, Math.round(PROBE_PX / aspect))
  const gray = toGray(image, width, height, { x: 0, y: 0, w: width, h: height })
  const ink = binarize(gray, width, height)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (ink.data[y * width + x] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return {
    x: minX / width,
    y: minY / height,
    w: (maxX - minX + 1) / width,
    h: (maxY - minY + 1) / height,
  }
}

interface Picture {
  /** Draws the picture without its text. */
  image: HTMLImageElement
  /** Size in the picture's own units. */
  width: number
  height: number
  /** Labels in the picture's own units. */
  labels: SourceLabel[]
}

function fitToPage(picture: Picture, page: PageSpec, findText: boolean): { input: PipelineInput; frame: Box } {
  const bounds = inkBounds(picture.image, picture.width / picture.height)
  let minX = bounds ? bounds.x * picture.width : Infinity
  let minY = bounds ? bounds.y * picture.height : Infinity
  let maxX = bounds ? (bounds.x + bounds.w) * picture.width : -Infinity
  let maxY = bounds ? (bounds.y + bounds.h) * picture.height : -Infinity
  for (const label of picture.labels) {
    minX = Math.min(minX, label.box.x)
    minY = Math.min(minY, label.box.y)
    maxX = Math.max(maxX, label.box.x + label.box.w)
    maxY = Math.max(maxY, label.box.y + label.box.h)
  }
  if (maxX <= minX || maxY <= minY) throw new SourceError('empty')

  const drawableW = page.widthMm - 2 * MARGIN_MM
  const drawableH = page.heightMm - 2 * MARGIN_MM
  const scale = Math.min(
    (drawableW - 2 * INSET_MM) / (maxX - minX),
    (drawableH - 2 * INSET_MM) / (maxY - minY),
  )
  const sheetH = Math.min(drawableH, (maxY - minY) * scale + 2 * INSET_MM + SPARE_MM)
  const width = Math.round(drawableW * PX_PER_MM)
  const height = Math.round(sheetH * PX_PER_MM)
  const frame: Box = {
    x: INSET_MM - minX * scale,
    y: INSET_MM - minY * scale,
    w: picture.width * scale,
    h: picture.height * scale,
  }
  const gray = toGray(picture.image, width, height, {
    x: frame.x * PX_PER_MM,
    y: frame.y * PX_PER_MM,
    w: frame.w * PX_PER_MM,
    h: frame.h * PX_PER_MM,
  })
  const labels = picture.labels.map((label) => ({
    ...label,
    box: {
      x: frame.x + label.box.x * scale,
      y: frame.y + label.box.y * scale,
      w: label.box.w * scale,
      h: label.box.h * scale,
    },
  }))
  return {
    frame,
    input: { gray, width, height, pxPerMm: PX_PER_MM, labels, findText, drawableWidthMm: drawableW },
  }
}

/** Removes everything in an SVG that could run code, before it touches the page. */
function sanitize(root: Element): void {
  for (const element of [...root.querySelectorAll('script, foreignObject, iframe, object, embed')]) {
    element.remove()
  }
  for (const element of [root, ...root.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim().toLowerCase()
      if (name.startsWith('on') || value.startsWith('javascript:')) {
        element.removeAttribute(attribute.name)
      }
    }
  }
}

function viewBoxOf(svg: SVGSVGElement): { width: number; height: number } {
  const parts = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
  if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) return { width: parts[2], height: parts[3] }
  const width = parseFloat(svg.getAttribute('width') ?? '') || 300
  const height = parseFloat(svg.getAttribute('height') ?? '') || 150
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  return { width, height }
}

function svgUrl(svg: SVGSVGElement): string {
  const text = new XMLSerializer().serializeToString(svg)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`
}

/**
 * Reads the text elements of an SVG with their real positions. The browser
 * has to lay the text out to know its size, so the SVG is mounted off screen
 * for a moment at one pixel per user unit.
 */
function readLabels(svg: SVGSVGElement, width: number, height: number): SourceLabel[] {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none'
  const copy = svg.cloneNode(true) as SVGSVGElement
  copy.setAttribute('width', String(width))
  copy.setAttribute('height', String(height))
  host.append(copy)
  document.body.append(host)
  try {
    const origin = copy.getBoundingClientRect()
    const labels: SourceLabel[] = []
    copy.querySelectorAll('text').forEach((element, i) => {
      const text = (element.textContent ?? '').trim().replace(/\s+/g, ' ')
      const matrix = element.getScreenCTM()
      if (text === '' || !matrix) return
      const box = element.getBBox()
      const corners = [
        [box.x, box.y],
        [box.x + box.width, box.y],
        [box.x, box.y + box.height],
        [box.x + box.width, box.y + box.height],
      ].map(([x, y]) => ({
        x: matrix.a * x + matrix.c * y + matrix.e - origin.left,
        y: matrix.b * x + matrix.d * y + matrix.f - origin.top,
      }))
      const xs = corners.map((c) => c.x)
      const ys = corners.map((c) => c.y)
      labels.push({
        id: `label-${i + 1}`,
        text,
        box: {
          x: Math.min(...xs),
          y: Math.min(...ys),
          w: Math.max(...xs) - Math.min(...xs),
          h: Math.max(...ys) - Math.min(...ys),
        },
        rotationDeg: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI,
      })
    })
    return labels
  } finally {
    host.remove()
  }
}

export async function loadSvg(svgText: string, name: string, page: PageSpec): Promise<LoadedSource> {
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const root = parsed.documentElement
  if (root.nodeName.toLowerCase() !== 'svg' || parsed.querySelector('parsererror')) {
    throw new SourceError('unreadable')
  }
  const svg = root as unknown as SVGSVGElement
  sanitize(svg)
  const { width, height } = viewBoxOf(svg)
  const originalUrl = svgUrl(svg)
  const labels = readLabels(svg, width, height)

  for (const text of [...svg.querySelectorAll('text')]) text.remove()
  // A large pixel size makes the browser rasterize the vector sharply when it is drawn.
  const sharp = (page.widthMm * PX_PER_MM) / width
  svg.setAttribute('width', String(Math.round(width * sharp)))
  svg.setAttribute('height', String(Math.round(height * sharp)))
  const image = await loadImage(svgUrl(svg))
  const fitted = fitToPage({ image, width, height, labels }, page, false)
  return { name, kind: 'svg', originalUrl, ...fitted }
}

export async function loadFile(file: File, page: PageSpec): Promise<LoadedSource> {
  if (file.size > MAX_BYTES) throw new SourceError('size')
  const name = file.name.replace(/\.[^.]+$/, '')
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    return loadSvg(await file.text(), name, page)
  }
  if (!RASTER_TYPES.includes(file.type)) throw new SourceError('type')
  const originalUrl = URL.createObjectURL(file)
  const image = await loadImage(originalUrl)
  if (image.naturalWidth === 0 || image.naturalHeight === 0) throw new SourceError('unreadable')
  const fitted = fitToPage(
    { image, width: image.naturalWidth, height: image.naturalHeight, labels: [] },
    page,
    true,
  )
  return { name, kind: 'raster', originalUrl, ...fitted }
}
